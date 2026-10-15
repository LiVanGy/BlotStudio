import Foundation

// Pure helpers also run in the protocol tests without starting AppKit.
enum NativeProtocol {
    static func resultScript(id: String, status: String, message: String = "") throws -> String {
        let payload = try JSONSerialization.data(withJSONObject: [id, status, message])
        let json = String(decoding: payload, as: UTF8.self)
            .replacingOccurrences(of: "\u{2028}", with: "\\u2028")
            .replacingOccurrences(of: "\u{2029}", with: "\\u2029")
        return "if (globalThis.BS && typeof globalThis.BS.nativeSaveResult === 'function') { globalThis.BS.nativeSaveResult(..." + json + "); }"
    }

    static func allowsDocument(_ url: URL, expected: URL?) -> Bool {
        guard let expected, url.isFileURL, expected.isFileURL,
              var parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
              parts.query == nil else { return false }
        parts.fragment = nil
        guard let candidate = parts.url else { return false }
        return candidate.standardizedFileURL.resolvingSymlinksInPath() == expected.standardizedFileURL.resolvingSymlinksInPath()
    }
}

#if !NATIVE_PROTOCOL_TESTING
import Cocoa
import WebKit

@MainActor final class AppDelegate: NSObject, NSApplicationDelegate, WKUIDelegate, WKScriptMessageHandler, WKNavigationDelegate, NSWindowDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    private var documentURL: URL?
    private var activeSaveID: String?
    private var savePanel: NSSavePanel?
    private enum ShutdownRequest { case window, application }
    private var shutdownRequest: ShutdownRequest?
    private var shutdownToken: UUID?
    private var shutdownTimeout: Task<Void, Never>?
    private var allowWindowClose = false
    private var allowTermination = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        let menu = NSMenu()
        let appItem = NSMenuItem(); let appMenu = NSMenu()
        appMenu.addItem(withTitle: "关于 BlotStudio", action: #selector(about), keyEquivalent: "")
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "退出 BlotStudio", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu; menu.addItem(appItem)
        let edit = NSMenuItem(); let editMenu = NSMenu(title: "编辑")
        for (title, action, key) in [("剪切", "cut:", "x"), ("复制", "copy:", "c"), ("粘贴", "paste:", "v")] {editMenu.addItem(withTitle: title, action: Selector(action), keyEquivalent: key)}
        edit.title = "编辑"; edit.submenu = editMenu; menu.addItem(edit)
        let file = NSMenuItem(); let fileMenu = NSMenu(title: "文件")
        fileMenu.addItem(withTitle: "打印 / 保存 PDF…", action: #selector(printDocument), keyEquivalent: "p")
        file.title = "文件"; file.submenu = fileMenu; menu.addItem(file)
        NSApplication.shared.mainMenu = menu
        let screen = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 950)
        window = NSWindow(contentRect: NSRect(x:0,y:0,width:min(1440,screen.width-70),height:min(930,screen.height-65)), styleMask:[.titled,.closable,.miniaturizable,.resizable], backing:.buffered, defer:false)
        window.title = "BlotStudio · 免费 WB 工作台"; window.minSize = NSSize(width:800,height:600);window.delegate = self;window.center()
        let configuration = WKWebViewConfiguration()
        configuration.userContentController.add(self, name:"saveFile")
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        configuration.websiteDataStore = .default()
        webView = WKWebView(frame:window.contentView!.bounds,configuration:configuration)
        webView.uiDelegate = self;webView.navigationDelegate = self
        webView.autoresizingMask = [.width,.height];window.contentView = webView
        guard let url = Bundle.main.url(forResource:"BlotStudio",withExtension:"html") else {
            let alert = NSAlert(); alert.messageText = "找不到 BlotStudio 页面"; alert.informativeText = "应用包不完整，请重新解压下载的软件。"; alert.runModal()
            allowTermination = true; NSApplication.shared.terminate(nil); return
        }
        documentURL = url.standardizedFileURL.resolvingSymlinksInPath()
        webView.loadFileURL(url,allowingReadAccessTo:url)
        window.makeKeyAndOrderFront(nil);NSApplication.shared.activate(ignoringOtherApps:true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    private func replyToSave(_ id: String, status: String, message: String = "") {
        guard let script = try? NativeProtocol.resultScript(id:id, status:status, message:message) else { return }
        webView.evaluateJavaScript(script, completionHandler:nil)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "saveFile", message.frameInfo.isMainFrame,
              let frameURL = message.frameInfo.request.url,
              NativeProtocol.allowsDocument(frameURL, expected:documentURL),
              let body = message.body as? [String:Any], let id = body["id"] as? String,
              !id.isEmpty, id.utf8.count <= 200 else { return }
        guard let name = body["name"] as? String, !name.isEmpty,
              let encoded = body["data"] as? String, let data = Data(base64Encoded:encoded) else {
            replyToSave(id, status:"error", message:"导出数据不完整或无法解码。"); return
        }
        guard activeSaveID == nil, window.attachedSheet == nil, shutdownRequest == nil else {
            replyToSave(id, status:"error", message:"另一个对话框正在打开，请完成或关闭它后再保存。"); return
        }
        activeSaveID = id
        let panel = NSSavePanel(); savePanel = panel
        panel.nameFieldStringValue = URL(fileURLWithPath:name).lastPathComponent
        panel.canCreateDirectories = true
        panel.beginSheetModal(for:window) { [weak self] result in
            guard let self else { return }
            self.activeSaveID = nil; self.savePanel = nil
            guard result == .OK else { self.replyToSave(id, status:"cancelled"); return }
            guard let url = panel.url else { self.replyToSave(id, status:"error", message:"未取得保存位置。"); return }
            do {
                try data.write(to:url,options:.atomic)
                self.replyToSave(id, status:"saved")
            } catch {
                self.replyToSave(id, status:"error", message:error.localizedDescription)
            }
        }
    }

    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        guard frame.isMainFrame, let url = frame.request.url,
              NativeProtocol.allowsDocument(url, expected:documentURL),
              window.attachedSheet == nil, shutdownRequest == nil else { completionHandler(nil); return }
        let panel = NSOpenPanel();panel.allowsMultipleSelection = parameters.allowsMultipleSelection;panel.canChooseDirectories = false;panel.canChooseFiles = true
        panel.beginSheetModal(for:window) { result in completionHandler(result == .OK ? panel.urls : nil) }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard navigationAction.targetFrame?.isMainFrame == true,
              let url = navigationAction.request.url,
              NativeProtocol.allowsDocument(url, expected:documentURL) else { decisionHandler(.cancel); return }
        decisionHandler(.allow)
    }

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        if allowWindowClose { return true }
        guard shutdownRequest == nil, activeSaveID == nil, window.attachedSheet == nil else { NSSound.beep(); return false }
        beginShutdown(.window)
        return false
    }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if allowTermination { return .terminateNow }
        guard shutdownRequest == nil, activeSaveID == nil, window.attachedSheet == nil else { NSSound.beep(); return .terminateCancel }
        beginShutdown(.application)
        return .terminateLater
    }

    private func beginShutdown(_ request: ShutdownRequest) {
        shutdownRequest = request
        let token = UUID(); shutdownToken = token
        shutdownTimeout = Task { @MainActor [weak self] in
            do { try await Task.sleep(nanoseconds:12_000_000_000) } catch { return }
            self?.finishFlush(token:token, error:"等待本地保存超过 12 秒，尚未确认保存成功。")
        }
        // Stop new edits while the final snapshot is being written.
        let script = """
        const active = document.activeElement;
        if (active && typeof active.blur === 'function') { active.blur(); }
        document.body.inert = true;
        if (!globalThis.BS || typeof globalThis.BS.flushSave !== 'function') {
            throw new Error('本地保存接口尚未就绪。');
        }
        if (globalThis.BS.ready) { await globalThis.BS.ready; }
        const saved = await globalThis.BS.flushSave();
        if (saved !== true) { throw new Error('本地保存未成功，请先导出项目备份。'); }
        return true;
        """
        webView.callAsyncJavaScript(script, arguments:[:], in:nil, in:.page) { [weak self] result in
            Task { @MainActor in
                switch result {
                case .success(let value):
                    self?.finishFlush(token:token, error:(value as? Bool) == true ? nil : "本地保存未返回成功确认。")
                case .failure(let error):
                    self?.finishFlush(token:token, error:error.localizedDescription)
                }
            }
        }
    }

    private func finishFlush(token: UUID, error: String?) {
        guard shutdownToken == token, let request = shutdownRequest else { return }
        shutdownToken = nil; shutdownTimeout?.cancel(); shutdownTimeout = nil
        if let error {
            let alert = NSAlert(); alert.alertStyle = .warning
            alert.messageText = "本地自动保存未完成"
            alert.informativeText = "近期修改尚未确认写入本地。点“取消”返回软件，使用“保存项目”导出备份。\n\n" + error
            alert.addButton(withTitle:"取消")
            alert.addButton(withTitle:"仍然退出")
            alert.beginSheetModal(for:window) { [weak self] response in
                guard let self else { return }
                if response == .alertSecondButtonReturn { self.completeShutdown(request) }
                else {
                    self.shutdownRequest = nil
                    self.webView.evaluateJavaScript("document.body.inert = false;", completionHandler:nil)
                    if case .application = request { NSApplication.shared.reply(toApplicationShouldTerminate:false) }
                }
            }
        } else { completeShutdown(request) }
    }

    private func completeShutdown(_ request: ShutdownRequest) {
        shutdownRequest = nil; allowWindowClose = true; allowTermination = true
        switch request {
        case .window: window.performClose(nil)
        case .application: NSApplication.shared.reply(toApplicationShouldTerminate:true)
        }
    }

    @objc func about() {
        guard window.attachedSheet == nil, shutdownRequest == nil else { NSSound.beep(); return }
        let a = NSAlert();a.messageText = "BlotStudio " + (Bundle.main.object(forInfoDictionaryKey:"CFBundleShortVersionString") as? String ?? "");a.informativeText = "免费、离线、可编辑的 Western blot 工作台。\nMIT 开源许可。无账号、无订阅、无水印。";a.beginSheetModal(for:window)
    }

    @objc func printDocument() {
        guard window.attachedSheet == nil, shutdownRequest == nil else { NSSound.beep(); return }
        let op = webView.printOperation(with:NSPrintInfo.shared);op.showsPrintPanel = true;op.showsProgressPanel = true;op.runModal(for:window,delegate:nil,didRun:nil,contextInfo:nil)
    }
}

MainActor.assumeIsolated {
    let app = NSApplication.shared
    let delegate = AppDelegate()
    app.delegate = delegate
    app.setActivationPolicy(.regular)
    app.run()
}
#endif
