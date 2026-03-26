import UIKit
import WebKit

class ViewController: UIViewController {

    private var webView: WKWebView!
    private let appURL = "https://animalhouseexperience.replit.app"

    override func loadView() {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        view = webView
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        loadApp()
    }

    private func loadApp() {
        guard let url = URL(string: appURL) else { return }
        var request = URLRequest(url: url)
        request.cachePolicy = .returnCacheDataElseLoad
        webView.load(request)
    }
}

extension ViewController: WKNavigationDelegate {

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        showOfflinePage()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        showOfflinePage()
    }

    private func showOfflinePage() {
        let html = """
        <html>
        <body style="background:#1a1a1a;color:#fff;font-family:-apple-system;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;text-align:center;">
        <h2 style="color:#f59e0b;">Animal House</h2>
        <p>No internet connection.<br>Please check your connection and try again.</p>
        <button onclick="location.reload()" style="background:#f59e0b;color:#000;border:none;padding:12px 24px;border-radius:8px;font-size:16px;margin-top:16px;">Retry</button>
        </body></html>
        """
        webView.loadHTMLString(html, baseURL: nil)
    }
}

extension ViewController: WKUIDelegate {

    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if navigationAction.targetFrame == nil {
            webView.load(navigationAction.request)
        }
        return nil
    }
}
