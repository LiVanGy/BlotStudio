// An isolated component test host for the app's actual WKWebView renderer.
// It does not attach to, automate, or read any user's app/browser session.
import Cocoa
import WebKit

final class RendererTestHost: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
    var view: WKWebView!
    var window: NSWindow?
    var snapshotPath: String?
    private var idleGeneration = 0
    private var lastProgress = "loading document"
    private let idleSeconds = Double(ProcessInfo.processInfo.environment["BLOTSTUDIO_WEBKIT_IDLE_SECONDS"] ?? "90") ?? 90
    private let totalSeconds = Double(ProcessInfo.processInfo.environment["BLOTSTUDIO_WEBKIT_TOTAL_SECONDS"] ?? "300") ?? 300
    private func refreshIdleDeadline() {
        idleGeneration += 1
        let generation = idleGeneration
        DispatchQueue.main.asyncAfter(deadline:.now()+idleSeconds) { [weak self] in
            guard let self, self.idleGeneration == generation else { return }
            fputs("Renderer idle timeout after \(self.idleSeconds)s; last progress: \(self.lastProgress)\n",stderr)
            exit(3)
        }
    }
    func start(_ path: String, width: Double = 1000, height: Double = 800, snapshotPath: String? = nil) throws {
        guard idleSeconds.isFinite, totalSeconds.isFinite, idleSeconds > 0, totalSeconds > 0, idleSeconds <= totalSeconds, totalSeconds <= 600 else {
            fputs("Invalid renderer deadline settings\n",stderr);exit(2)
        }
        refreshIdleDeadline()
        DispatchQueue.main.asyncAfter(deadline:.now()+totalSeconds) { [weak self] in
            guard let self else { return }
            fputs("Renderer total timeout after \(self.totalSeconds)s; last progress: \(self.lastProgress)\n",stderr)
            exit(3)
        }
        self.snapshotPath = snapshotPath
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.userContentController.add(self, name: "qaResult")
        let frame = NSRect(x:0,y:0,width:width,height:height)
        view = WKWebView(frame: frame, configuration:config)
        // SVG filters and their pre-click layout flush need a live compositing
        // surface on CI as well as during screenshots. A detached WKWebView can
        // suspend that work even while its script timers keep running.
        // This owned, non-interactive window never becomes key and does not
        // attach to any existing app session.
        window = NSWindow(contentRect:frame,styleMask:.borderless,backing:.buffered,defer:false)
        window?.contentView = view
        window?.orderBack(nil)
        view.navigationDelegate = self
        view.loadHTMLString(try String(contentsOfFile:path,encoding:.utf8), baseURL:nil)
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "qaResult", message.frameInfo.isMainFrame else { return }
        if let body = message.body as? [String:Any], let progress = body["progress"] {
            lastProgress = String(describing:progress)
            refreshIdleDeadline()
            fputs("[webkit progress] \(String(describing:progress))\n",stderr)
            return
        }
        if let path = snapshotPath {
            let config = WKSnapshotConfiguration()
            config.rect = view.bounds
            if let body = message.body as? [String:Any],
               let requested = body["snapshotRect"] as? [String:Double],
               let x = requested["x"], let y = requested["y"],
               let width = requested["w"], let height = requested["h"],
               [x,y,width,height].allSatisfy({ $0.isFinite }),
               x >= 0, y >= 0, width > 0, height > 0,
               x+width <= view.bounds.width, y+height <= view.bounds.height {
                config.rect = NSRect(x:x,y:y,width:width,height:height)
            }
            config.afterScreenUpdates = true
            view.takeSnapshot(with:config) { image, error in
                guard error == nil, let image, let tiff = image.tiffRepresentation,
                      let bitmap = NSBitmapImageRep(data:tiff), let png = bitmap.representation(using:.png,properties:[:]) else {
                    fputs("Snapshot failed: \(String(describing:error))\n",stderr);exit(4)
                }
                do { try png.write(to:URL(fileURLWithPath:path)); self.finish(message.body) }
                catch { fputs("Snapshot write failed: \(error)\n",stderr);exit(4) }
            }
        } else { finish(message.body) }
    }
    private func finish(_ body: Any) {
        idleGeneration += 1
        do {
            let data = try JSONSerialization.data(withJSONObject:body,options:[.sortedKeys])
            FileHandle.standardOutput.write(data)
            FileHandle.standardOutput.write(Data("\n".utf8));exit(0)
        } catch { fputs("Result encoding failed\n",stderr);exit(2) }
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        fputs("Renderer load failed: \(error)\n",stderr);exit(2)
    }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        fputs("Renderer content process terminated\n",stderr);exit(5)
    }
}
let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
let host = RendererTestHost()
guard CommandLine.arguments.count == 2 || CommandLine.arguments.count == 5,
      CommandLine.arguments.count == 2 || (Double(CommandLine.arguments[2]) != nil && Double(CommandLine.arguments[3]) != nil) else { exit(2) }
if CommandLine.arguments.count == 5 {
    let width = Double(CommandLine.arguments[2])!, height = Double(CommandLine.arguments[3])!
    guard width >= 320, width <= 3000, height >= 320, height <= 3000 else { exit(2) }
    try host.start(CommandLine.arguments[1],width:width,height:height,snapshotPath:CommandLine.arguments[4])
} else { try host.start(CommandLine.arguments[1]) }
app.run()
