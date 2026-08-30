import Foundation
import Capacitor
import LocalAuthentication
import UIKit
import WebKit

/// Native capabilities that the web app cannot express in a browser tab, exposed to
/// `index.html` as `Capacitor.Plugins.GroundWorkNative`.
///
/// Two jobs, both of which replace a web fallback that is either weaker or outright
/// broken inside a WKWebView:
///
///  * **Face ID / Touch ID** — the PWA has no app lock at all. Client records are
///    special-category data under UK GDPR, and the device passcode is the only thing
///    standing in front of them today.
///  * **HTML → PDF → share sheet** — `window.print()` is a no-op in WKWebView, so the
///    hidden-iframe receipt flow in `printReceipt()` silently does nothing on iOS.
///    Rendering the same markup to a real PDF and handing it to `UIActivityViewController`
///    gives back printing (via AirPrint) *and* adds Files, Mail and Messages.
///
/// The web app feature-detects this plugin and keeps its browser paths untouched when it
/// is absent, so nothing here changes how the PWA behaves. See `docs/ios-native.md`.
@objc(GroundWorkNativePlugin)
public class GroundWorkNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GroundWorkNativePlugin"
    public let jsName = "GroundWorkNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "biometricAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sharePDF", returnType: CAPPluginReturnPromise)
    ]

    // MARK: - Biometrics

    /// Reports what this device can actually do, so the web layer can hide the lock
    /// toggle rather than offering a switch that would fail on tap.
    @objc func biometricAvailable(_ call: CAPPluginCall) {
        let ctx = LAContext()
        var error: NSError?
        // .deviceOwnerAuthentication, not ...WithBiometrics: it falls back to the passcode
        // when Face ID is unenrolled or locked out after too many failures, so the user is
        // never shut out of their own records by a failed face match.
        let ok = ctx.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error)

        var kind = "none"
        if ok {
            switch ctx.biometryType {
            case .faceID: kind = "faceId"
            case .touchID: kind = "touchId"
            case .opticID: kind = "opticId"
            default: kind = "passcode"   // no biometry enrolled, but a passcode is set
            }
        }
        call.resolve(["available": ok, "biometry": kind])
    }

    @objc func authenticate(_ call: CAPPluginCall) {
        let reason = call.getString("reason") ?? "Unlock your practice records"
        let ctx = LAContext()
        ctx.localizedFallbackTitle = "Use passcode"

        var error: NSError?
        guard ctx.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else {
            call.resolve(["success": false, "reason": "unavailable"])
            return
        }

        ctx.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) { success, err in
            DispatchQueue.main.async {
                if success {
                    call.resolve(["success": true])
                } else {
                    // A cancel is a normal outcome (the user backgrounded the app, or chose
                    // to stay locked), so it resolves rather than rejecting — the web layer
                    // simply keeps the lock screen up instead of showing an error.
                    let code = (err as? LAError)?.code
                    let why: String
                    switch code {
                    case .userCancel, .appCancel, .systemCancel: why = "cancelled"
                    case .userFallback: why = "fallback"
                    case .biometryLockout: why = "lockout"
                    default: why = "failed"
                    }
                    call.resolve(["success": false, "reason": why])
                }
            }
        }
    }

    // MARK: - HTML → PDF → share sheet

    /// Held for the lifetime of one render. A WKWebView that goes out of scope mid-load
    /// never calls its delegate back, and the JS promise would hang forever.
    private var pdfWebView: WKWebView?
    private var pdfDelegate: PDFRenderDelegate?

    @objc func sharePDF(_ call: CAPPluginCall) {
        guard let html = call.getString("html") else {
            call.reject("html is required")
            return
        }
        let name = sanitise(call.getString("filename") ?? "GroundWork.pdf")

        DispatchQueue.main.async { [weak self] in
            guard let self = self, let vc = self.bridge?.viewController else {
                call.reject("No view controller to present from")
                return
            }

            // Lay the receipt out in a real web view first.
            //
            // The obvious route — UIMarkupTextPrintFormatter straight into a
            // UIPrintPageRenderer — deadlocks the main thread on modern iOS: the formatter
            // has to render the HTML, that render wants the main run loop, and the app
            // freezes with no error and no callback. Rendering in a WKWebView and taking
            // `viewPrintFormatter()` only once `didFinish` has fired means the layout is
            // already done by the time the renderer asks for a page count.
            let wv = WKWebView(frame: CGRect(x: 0, y: 0, width: Self.pageWidth, height: Self.pageHeight))
            wv.isHidden = true
            vc.view.addSubview(wv)          // in the hierarchy, or layout never runs
            self.pdfWebView = wv

            let delegate = PDFRenderDelegate { [weak self] webView in
                guard let self = self else { return }
                defer {
                    webView.removeFromSuperview()
                    self.pdfWebView = nil
                    self.pdfDelegate = nil
                }
                do {
                    let url = try self.renderPDF(from: webView, filename: name)
                    self.present(url: url, from: vc, call: call)
                } catch {
                    call.reject("Could not build the PDF: \(error.localizedDescription)")
                }
            }
            self.pdfDelegate = delegate
            wv.navigationDelegate = delegate
            wv.loadHTMLString(html, baseURL: nil)
        }
    }

    private func present(url: URL, from vc: UIViewController, call: CAPPluginCall) {
        let av = UIActivityViewController(activityItems: [url], applicationActivities: nil)

        // iPad presents this as a popover and hard-crashes without an anchor.
        if let pop = av.popoverPresentationController {
            pop.sourceView = vc.view
            pop.sourceRect = CGRect(x: vc.view.bounds.midX, y: vc.view.bounds.maxY - 40,
                                    width: 1, height: 1)
            pop.permittedArrowDirections = []
        }
        av.completionWithItemsHandler = { _, completed, _, _ in
            call.resolve(["shared": completed])
        }
        vc.present(av, animated: true)
    }

    /// A4 at 72dpi with a half-inch margin — the same page the web print stylesheet targets,
    /// so a receipt shared from the phone matches one printed from a desktop browser.
    private static let pageWidth: CGFloat = 595.2
    private static let pageHeight: CGFloat = 841.8

    private func renderPDF(from webView: WKWebView, filename: String) throws -> URL {
        let page = CGRect(x: 0, y: 0, width: Self.pageWidth, height: Self.pageHeight)
        let margin: CGFloat = 36
        let printable = page.insetBy(dx: margin, dy: margin)

        let renderer = UIPrintPageRenderer()
        renderer.addPrintFormatter(webView.viewPrintFormatter(), startingAtPageAt: 0)
        renderer.setValue(NSValue(cgRect: page), forKey: "paperRect")
        renderer.setValue(NSValue(cgRect: printable), forKey: "printableRect")

        let data = NSMutableData()
        UIGraphicsBeginPDFContextToData(data, page, nil)
        let pages = max(renderer.numberOfPages, 1)
        for i in 0..<pages {
            UIGraphicsBeginPDFPage()
            renderer.drawPage(at: i, in: UIGraphicsGetPDFContextBounds())
        }
        UIGraphicsEndPDFContext()

        // Caches, not Documents: a receipt is a hand-off to another app, not a record the
        // app keeps. Documents is also user-visible in Files and would accumulate clutter.
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
        try data.write(to: url, options: .atomic)
        return url
    }

    /// Client initials and practice names reach this from user input, so anything that
    /// could climb out of the temp directory or break the filesystem is stripped.
    private func sanitise(_ name: String) -> String {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: " -_."))
        var cleaned = String(name.unicodeScalars.filter { allowed.contains($0) })
        cleaned = cleaned.replacingOccurrences(of: "..", with: "")
            .trimmingCharacters(in: .whitespaces)
        if cleaned.isEmpty { cleaned = "GroundWork" }
        if !cleaned.lowercased().hasSuffix(".pdf") { cleaned += ".pdf" }
        return cleaned
    }
}

/// Fires once the receipt has finished laying out. Separate from the plugin so the plugin
/// does not have to be its own navigation delegate for a view it only borrows briefly.
private final class PDFRenderDelegate: NSObject, WKNavigationDelegate {
    private let onReady: (WKWebView) -> Void
    private var fired = false

    init(onReady: @escaping (WKWebView) -> Void) {
        self.onReady = onReady
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // A run-loop hop: didFinish means parsing is done, not that the first layout pass
        // has happened, and asking for a page count too early yields a blank page.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { [weak self] in
            guard let self = self, !self.fired else { return }
            self.fired = true
            self.onReady(webView)
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        guard !fired else { return }
        fired = true
        onReady(webView)   // render whatever laid out rather than leaving the promise hanging
    }
}
