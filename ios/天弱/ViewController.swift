import UIKit
import WebKit

/// 天弱 iOS 壳：WKWebView 加载远端前端；离线时回退到 App 内置的 www/index.html。
/// 服务器地址规则与原 Android App 完全一致（见 public/js/config.js）：
///   - 首次启动弹框让用户填；之后存 UserDefaults；
///   - 原生容器里若前端与 WebView 同源则无需填（直接 http://localhost:3000）。
final class ViewController: UIViewController, WKNavigationDelegate, WKScriptMessageHandler {

    private var webView: WKWebView!
    private var serverURL: String {
        get { UserDefaults.standard.string(forKey: "tianruo_server") ?? "" }
        set { UserDefaults.standard.set(newValue.trimmingCharacters(in: .whitespaces), forKey: "tianruo_server") }
    }
    private let activity = UIActivityIndicatorView(style: .large)

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.10, green: 0.07, blue: 0.16, alpha: 1)

        let cfg = WKWebViewConfiguration()
        cfg.preferences.javaScriptEnabled = true
        cfg.allowsInlineMediaPlayback = true
        cfg.mediaTypesRequiringUserActionForPlayback = []
        if #available(iOS 15.0, *) {
            cfg.preferences.isElementFullscreenEnabled = true
        }
        // 原生桥：前端可通过 window.webkit.messageHandlers.tianruo.postMessage(...)
        cfg.userContentController.add(self, name: "tianruo")
        // 注入 UA 标记，与 Android 的 TianRuoAndroid 对称（config.js 据此识别原生环境）
        cfg.applicationNameForUserAgent = " TianRuoiOS/10.0.0"

        webView = WKWebView(frame: view.bounds, configuration: cfg)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.navigationDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        view.addSubview(webView)

        activity.center = view.center
        activity.color = .white
        view.addSubview(activity)
        activity.startAnimating()

        loadInitial()
    }

    // MARK: - 加载策略

    private func loadInitial() {
        if let url = bundledIndexURL(), serverURL.isEmpty {
            // 离线包存在且未配置服务器 → 直接加载本地（纯单机模式）
            webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
            return
        }
        if !serverURL.isEmpty {
            loadRemote(serverURL)
            return
        }
        promptServer { [weak self] url in
            self?.serverURL = url
            self?.loadRemote(url)
        }
    }

    private func loadRemote(_ raw: String) {
        var s = raw.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: "/+$", with: "")
        if !s.isEmpty, !s.hasPrefix("http") { s = "http://" + s }
        guard let url = URL(string: s) else { promptServer { self.loadRemote($0) }; return; }
        var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 15)
        req.setValue("TianRuoiOS/10.0.0", forHTTPHeaderField: "User-Agent")
        webView.load(req)
    }

    /// 远端加载失败 → 回退离线包
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if let url = bundledIndexURL() {
            webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        }
        activity.stopAnimating()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        activity.stopAnimating()
    }

    // MARK: - 原生桥

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        // 预留桥：前端可调 native.share / native.pickImage 等
        guard message.name == "tianruo", let body = message.body as? [String: Any] else { return }
        switch body["action"] as? String {
        case "share":
            share(body["text"] as? String)
        default:
            break
        }
    }

    private func share(_ text: String?) {
        guard let text = text else { return }
        let vc = UIActivityViewController(activityItems: [text], applicationActivities: nil)
        present(vc, animated: true)
    }

    // MARK: - 设置服务器

    private func promptServer(completion: @escaping (String) -> Void) {
        let alert = UIAlertController(title: "天弱 · 设置服务器",
                                      message: "请输入后端地址，例如 http://your-server:3000",
                                      preferredStyle: .alert)
        alert.addTextField { $0.placeholder = "http://localhost:3000"; $0.text = "http://localhost:3000" }
        alert.addAction(UIAlertAction(title: "确定", style: .default) { _ in
            completion(alert.textFields?.first?.text ?? "")
        })
        alert.addAction(UIAlertAction(title: "离线模式", style: .cancel) { _ in
            completion("")
        })
        present(alert, animated: true)
    }

    // MARK: - 离线包

    /// 若构建时已把 public/ 拷进 App（见 build-ipa.sh），则返回其 index.html
    private func bundledIndexURL() -> URL? {
        Bundle.main.url(forResource: "www/index", withExtension: "html")
    }
}
