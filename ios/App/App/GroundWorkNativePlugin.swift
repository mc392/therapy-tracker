import Foundation
import Capacitor
import LocalAuthentication
import StoreKit
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
///  * **GroundWork Plus (StoreKit 2)** — the auto-renewing subscription, plus restore and
///    Apple's own offer-code redemption sheet, which is how comps and gifts are granted on
///    iOS (see `docs/monetisation.md` §6.2). The web layer caches the result in `tt_plus`
///    and never asks StoreKit on a render path.
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
        CAPPluginMethod(name: "sharePDF", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "plusProduct", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "plusStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "plusPurchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "plusRestore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "plusRedeem", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "plusManage", returnType: CAPPluginReturnPromise)
    ]

    // MARK: - GroundWork Plus (StoreKit 2)

    /// The single auto-renewable subscription. Must match the product ID created in
    /// App Store Connect; nothing else in the app hardcodes a price or a period.
    static let plusProductID = "uk.co.charlottebloortherapy.groundwork.plus.annual"

    /// Price and period as the *store* formats them, for the paywall. Never build this
    /// string in JS: it is per-storefront, it changes without a release, and App Review
    /// checks the paywall against the real product.
    @objc func plusProduct(_ call: CAPPluginCall) {
        Task {
            do {
                let products = try await Product.products(for: [Self.plusProductID])
                guard let p = products.first else {
                    call.resolve(["found": false]); return
                }
                var period = ""
                if let sub = p.subscription {
                    let unit: String
                    switch sub.subscriptionPeriod.unit {
                    case .day: unit = "day"; case .week: unit = "week"
                    case .month: unit = "month"; case .year: unit = "year"
                    @unknown default: unit = ""
                    }
                    let n = sub.subscriptionPeriod.value
                    period = n == 1 ? unit : "\(n) \(unit)s"
                }
                call.resolve(["found": true, "price": p.displayPrice,
                              "period": period, "title": p.displayName])
            } catch {
                call.resolve(["found": false, "error": error.localizedDescription])
            }
        }
    }

    /// What StoreKit currently believes. `expiresAt` is the paid-through date, which is what
    /// the web layer caches — it keeps working offline until that date passes, so a flight or
    /// a bad signal never locks someone out of their own tax figures.
    @objc func plusStatus(_ call: CAPPluginCall) {
        Task { call.resolve(await Self.currentStatus()) }
    }

    private static func currentStatus() async -> [String: Any] {
        for await result in Transaction.currentEntitlements {
            guard case .verified(let t) = result else { continue }   // unverified: ignore, don't trust
            guard t.productID == plusProductID else { continue }
            if let revoked = t.revocationDate, revoked <= Date() { continue }
            var out: [String: Any] = ["active": true, "source": "storekit"]
            if let exp = t.expirationDate {
                out["expiresAt"] = ISO8601DateFormatter().string(from: exp)
            }
            return out
        }
        return ["active": false, "source": "storekit"]
    }

    @objc func plusPurchase(_ call: CAPPluginCall) {
        Task {
            do {
                let products = try await Product.products(for: [Self.plusProductID])
                guard let product = products.first else {
                    call.reject("Subscription not available"); return
                }
                let result = try await product.purchase()
                switch result {
                case .success(let verification):
                    // Always finish, or StoreKit replays the transaction on every launch.
                    if case .verified(let t) = verification { await t.finish() }
                    call.resolve(await Self.currentStatus())
                case .userCancelled:
                    call.resolve(["active": false, "cancelled": true])
                case .pending:
                    // Ask to Buy / SCA: not a failure, just not finished yet.
                    call.resolve(["active": false, "pending": true])
                @unknown default:
                    call.resolve(["active": false])
                }
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    /// App Review rejects a non-consumable or subscription paywall with no way back to a
    /// purchase already made, so this is not optional.
    @objc func plusRestore(_ call: CAPPluginCall) {
        Task {
            do { try await AppStore.sync() } catch { /* cancelled or offline — still report below */ }
            call.resolve(await Self.currentStatus())
        }
    }

    /// Apple's own offer-code sheet. This is how a gift, a comp or a founding-member grant is
    /// delivered on iOS — Apple's mechanism rather than a home-grown key, so there is no
    /// payment-route argument to have at review and the subscription lands in the recipient's
    /// own Apple ID subscriptions where they expect to manage it.
    @objc func plusRedeem(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let scene = self?.bridge?.viewController?.view.window?.windowScene else {
                call.reject("No scene to present from"); return
            }
            SKPaymentQueue.default().presentCodeRedemptionSheet()
            _ = scene
            call.resolve()
        }
    }

    /// Apple's native subscription-management sheet, scoped to whichever App Store
    /// environment this build is running under — sandbox for TestFlight and Xcode builds,
    /// production once live. The `itms-apps://apps.apple.com/account/subscriptions` link the
    /// web layer used before only ever opens the production list, where a TestFlight
    /// subscription can never appear.
    @objc func plusManage(_ call: CAPPluginCall) {
        Task { @MainActor [weak self] in
            guard let scene = self?.bridge?.viewController?.view.window?.windowScene else {
                call.reject("No scene to present from"); return
            }
            do {
                try await AppStore.showManageSubscriptions(in: scene)
                call.resolve()
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

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
