// An isolated component test host for the app's actual WKWebView renderer.
// It does not attach to, automate, or read any user's app/browser session.
import Cocoa
import WebKit

final class RendererTestHost: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
    var view: WKWebView!
    func start(_ path: String) throws {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.userContentController.add(self, name: "qaResult")
        view = WKWebView(frame: NSRect(x:0,y:0,width:1000,height:800), configuration:config)
        view.navigationDelegate = self
        view.loadHTMLString(try String(contentsOfFile:path,encoding:.utf8), baseURL:nil)
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "qaResult", message.frameInfo.isMainFrame else { return }
        do {
            let data = try JSONSerialization.data(withJSONObject:message.body,options:[.sortedKeys])
            FileHandle.standardOutput.write(data)
            FileHandle.standardOutput.write(Data("\n".utf8))
            exit(0)
        } catch { fputs("Result encoding failed\n",stderr);exit(2) }
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        fputs("Renderer load failed: \(error)\n",stderr);exit(2)
    }
}
let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
let host = RendererTestHost()
guard CommandLine.arguments.count == 2 else { exit(2) }
try host.start(CommandLine.arguments[1])
DispatchQueue.main.asyncAfter(deadline:.now()+45) { fputs("Renderer test timeout\n",stderr);exit(3) }
app.run()
