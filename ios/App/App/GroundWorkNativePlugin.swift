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
///  * **Face ID / Touch ID** - the PWA has no app lock at all. Client records are
///    special-category data under UK GDPR, and the device passcode is the only thing
///    standing in front of them today.
///  * **GroundWork Plus (StoreKit 2)** - the auto-renewing subscription, plus restore and
///    Apple's own offer-code redemption sheet, which is how comps and gifts are granted on
///    iOS (see `docs/monetisation.md` §6.2). The web layer caches the result in `tt_plus`
///    and never asks StoreKit on a render path.
///  * **HTML → PDF → share sheet** - `window.print()` is a no-op in WKWebView, so the
///    hidden-iframe receipt flow in `printReceipt()` silently does nothing on iOS.
///    Rendering the same markup to a real PDF and handing it to `UIActivityViewController`
///    gives back printing (via AirPrint) *and* adds Files, Mail and Messages.
///  * **The records folder** - a folder the user picks, normally in iCloud Drive, that every
///    save is written into. A browser cannot keep a durable grant to a folder on iOS at all;
///    a security-scoped bookmark can, which is what turns "remember to export a backup" into
///    "the records are already in your own Files". The mechanics live in
///    `GroundWorkRecordsFolder.swift`; the methods here are thin wrappers over them.
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
        CAPPluginMethod(name: "plusProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "plusStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "plusPurchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "taxPurchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "plusRestore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "plusRedeem", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "plusManage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "folderInfo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "folderPick", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "folderForget", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "folderWrite", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "folderRead", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "folderList", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "folderDelete", returnType: CAPPluginReturnPromise)
    ]

    // MARK: - The records folder

    /// File work never runs on the main thread: an iCloud file that is still a placeholder is
    /// downloaded and waited on, and a spinner that has frozen is worse than a slow one.
    private static let fileQueue = DispatchQueue(label: "uk.co.charlottebloortherapy.groundwork.records", qos: .utility)

    /// Held for the life of one presentation - see `RecordsFolderPicker`.
    private var folderPicker: RecordsFolderPicker?

    /// Where the app keeps its own copies inside the chosen folder. Passed in from the web layer
    /// rather than hardcoded here, so the names stay defined in exactly one place.
    private func paths(_ call: CAPPluginCall) -> (live: String, alt: String) {
        (call.getString("live") ?? "GroundWork records.json",
         call.getString("alt") ?? "GroundWork records.enc.json")
    }

    @objc func folderInfo(_ call: CAPPluginCall) {
        let (live, alt) = paths(call)
        Self.fileQueue.async { call.resolve(RecordsFolder.describe(livePath: live, altPath: alt)) }
    }

    /// Presents the folder picker. Resolves `{cancelled:true}` rather than rejecting when the
    /// sheet is dismissed - changing your mind is a normal outcome, not a failure.
    @objc func folderPick(_ call: CAPPluginCall) {
        let (live, alt) = paths(call)
        DispatchQueue.main.async { [weak self] in
            guard let self, let vc = self.bridge?.viewController else {
                call.reject("No view controller to present from"); return
            }
            let picker = RecordsFolderPicker { [weak self] url in
                self?.folderPicker = nil
                guard let url else { call.resolve(["picked": false, "cancelled": true]); return }
                Self.fileQueue.async {
                    do {
                        try RecordsFolder.remember(url)
                        var out = RecordsFolder.describe(livePath: live, altPath: alt)
                        out["picked"] = true
                        call.resolve(out)
                    } catch {
                        call.resolve(["picked": false, "error": error.localizedDescription])
                    }
                }
            }
            self.folderPicker = picker
            picker.present(from: vc)
        }
    }

    /// Forgets the folder. The files already in it are left exactly where they are: they are the
    /// user's records in the user's own folder, and this app has no business deleting them.
    @objc func folderForget(_ call: CAPPluginCall) {
        RecordsFolder.forget()
        call.resolve(["set": false])
    }

    @objc func folderWrite(_ call: CAPPluginCall) {
        guard let path = call.getString("path"), let data = call.getString("data") else {
            call.reject("path and data are required"); return
        }
        Self.fileQueue.async {
            do {
                let when = try RecordsFolder.write(path, text: data)
                call.resolve(["ok": true, "modifiedAt": when.timeIntervalSince1970 * 1000])
            } catch {
                call.resolve(["ok": false, "error": error.localizedDescription])
            }
        }
    }

    @objc func folderRead(_ call: CAPPluginCall) {
        guard let path = call.getString("path") else { call.reject("path is required"); return }
        Self.fileQueue.async {
            do {
                let r = try RecordsFolder.read(path)
                call.resolve(["found": true, "data": r.text,
                              "modifiedAt": (r.modifiedAt?.timeIntervalSince1970 ?? 0) * 1000])
            } catch {
                call.resolve(["found": false, "error": error.localizedDescription])
            }
        }
    }

    @objc func folderList(_ call: CAPPluginCall) {
        let path = call.getString("path") ?? ""
        Self.fileQueue.async {
            do { call.resolve(["files": try RecordsFolder.list(path)]) }
            catch { call.resolve(["files": [String](), "error": error.localizedDescription]) }
        }
    }

    @objc func folderDelete(_ call: CAPPluginCall) {
        guard let path = call.getString("path") else { call.reject("path is required"); return }
        Self.fileQueue.async {
            do { try RecordsFolder.delete(path); call.resolve(["ok": true]) }
            catch { call.resolve(["ok": false, "error": error.localizedDescription]) }
        }
    }

    // MARK: - GroundWork Pro + UK tax years (StoreKit 2)

    /// The auto-renewable subscriptions, keyed by the tier string the web layer speaks. BOTH map
    /// to `pro`, because there is only one thing to sell: the monthly product and the original
    /// annual one are the same subscription bought on two rhythms, and they must live in **one
    /// App Store Connect subscription group** so that moving between them is a change Apple
    /// prorates rather than two live subscriptions.
    ///
    /// THE LEGACY ID SAYS "plus" AND THAT IS DELIBERATE. It is the original product - the tier was
    /// called GroundWork Plus when it was the only one, and it has always entitled everything.
    /// A product ID can never be reused for something else, and re-pointing this one at anything
    /// smaller would silently take features off every existing subscriber, so it keeps its name
    /// and sells Pro. Rename it in App Store Connect (display name), not here.
    ///
    /// `insights.annual` - the middle "GroundWork Plus" tier - was never created in App Store
    /// Connect and the tier no longer exists, so it is simply gone. There is nothing to withdraw.
    static let subscriptionIDs: [String: String] = [
        "pro":         "uk.co.charlottebloortherapy.groundwork.pro.monthly",
        "pro.legacy":  "uk.co.charlottebloortherapy.groundwork.plus.annual"
    ]
    /// Back-compat alias: `productIDs` is what the drift check and older callers name.
    static let productIDs: [String: String] = subscriptionIDs
    /// Every subscription id entitles the one rung, so the rank table is a formality kept for the
    /// same reason the JS keeps plusHas(): a second rung must be a table change, never a rewrite.
    static let tierRank: [String: Int] = ["pro": 2]
    static func tier(forProductID id: String) -> String? {
        subscriptionIDs.first(where: { $0.value == id }) != nil ? "pro" : nil
    }

    /// UK TAX YEAR PACKAGES - non-consumables, one per tax year.
    ///
    /// Non-consumable rather than a subscription, and rather than consumable: a tax year is owned
    /// for good (a return can be amended years later), it has to come back on a new phone through
    /// Restore, and it must never expire. The id carries the START YEAR only - `...taxyear.2026`
    /// is the 2026-27 tax year - which is short, unambiguous, and cannot be mistaken for a display
    /// string. A new product is created in App Store Connect each April; create two or three ahead
    /// so it is never on the critical path in the week somebody is trying to file.
    ///
    /// BUYING A YEAR INCLUDES EVERY EARLIER YEAR, so what is reported to the web layer is a single
    /// watermark: the newest tax year owned. The web side only ever raises it.
    static let taxYearPrefix = "uk.co.charlottebloortherapy.groundwork.taxyear."
    /// The years offered for sale. Only ids that exist in App Store Connect belong here; one that
    /// does not is simply absent from `plusProducts` and the sheet says so for that year alone.
    static let taxYearsForSale: [String] = ["2026-27"]
    static func taxProductID(forYear ty: String) -> String? {
        guard ty.count == 7, let start = Int(ty.prefix(4)) else { return nil }
        return taxYearPrefix + String(start)
    }
    static func taxYear(forProductID id: String) -> String? {
        guard id.hasPrefix(taxYearPrefix) else { return nil }
        let tail = String(id.dropFirst(taxYearPrefix.count))
        guard tail.count == 4, let start = Int(tail) else { return nil }
        return "\(start)-" + String(format: "%02d", (start + 1) % 100)
    }
    /// The UK tax year a date falls in: 6 April to 5 April. The web layer has its own copy of this
    /// rule (taxYear()); this one exists only to turn a legacy subscriber's paid-through date into
    /// a watermark, and the two must agree about where April sits.
    static func taxYear(for date: Date) -> String {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "Europe/London") ?? .current
        let c = cal.dateComponents([.year, .month, .day], from: date)
        let y = c.year ?? 2026, m = c.month ?? 1, d = c.day ?? 1
        let start = (m < 4 || (m == 4 && d < 6)) ? y - 1 : y
        return "\(start)-" + String(format: "%02d", (start + 1) % 100)
    }

    /// Price and period as the *store* formats them, for both paywalls: `pro` for the
    /// subscription and `years` keyed by tax year. Never build these strings in JS - they are
    /// per-storefront, they change without a release, and App Review checks the paywall against
    /// the real product.
    ///
    /// A product the store cannot answer for is simply left out rather than failing the call. On
    /// the day a new tax year is created everything else must keep selling, and in the week before
    /// it exists the subscription must still sell; the sheet reports "Unavailable" for the one
    /// that is missing and only that one.
    @objc func plusProducts(_ call: CAPPluginCall) {
        Task {
            var out: [String: Any] = ["found": false]
            var years: [String: Any] = [:]
            let wanted = Array(Set(Self.subscriptionIDs.values))
                + Self.taxYearsForSale.compactMap { Self.taxProductID(forYear: $0) }
            do {
                let products = try await Product.products(for: wanted)
                for p in products {
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
                    let entry: [String: Any] = ["price": p.displayPrice, "period": period, "title": p.displayName]
                    if let ty = Self.taxYear(forProductID: p.id) {
                        years[ty] = entry
                    } else if Self.tier(forProductID: p.id) != nil {
                        /* The monthly product is the one on sale. The legacy annual is still
                           purchasable in App Store Connect for anyone already on it, but it is not
                           what a new reader is offered, so it never overwrites the price shown. */
                        if p.id == Self.subscriptionIDs["pro"] || out["pro"] == nil { out["pro"] = entry }
                    }
                    out["found"] = true
                }
                out["years"] = years
                call.resolve(out)
            } catch {
                out["error"] = error.localizedDescription
                out["years"] = years
                call.resolve(out)
            }
        }
    }

    /// What StoreKit currently believes, and WHICH TIER. `expiresAt` is the paid-through date,
    /// which is what the web layer caches - it keeps working offline until that date passes, so
    /// a flight or a bad signal never locks someone out of their own tax figures.
    @objc func plusStatus(_ call: CAPPluginCall) {
        Task { call.resolve(await Self.currentStatus()) }
    }

    /// ONE PASS, TWO ANSWERS. The subscription and the owned tax years come back together so the
    /// web layer can refresh both from one call and never leave one stale against the other.
    ///
    /// The BEST live subscription, not the first one found: a change of plan can leave two current
    /// for a moment. `taxThrough` is the NEWEST tax year owned, because buying a year includes
    /// every earlier one - the web side stores that single watermark and only ever raises it.
    ///
    /// `legacyTaxThrough` is the migration, and it is derived here rather than written once so it
    /// survives a restore onto a new phone. The original annual subscription entitled the whole tax
    /// engine, so anyone holding it is granted tax years through the year their paid-through date
    /// falls in. Without it, somebody who is paying today would open the app after updating and
    /// find their figures masked.
    private static func currentStatus() async -> [String: Any] {
        var best: (tier: String, expiresAt: Date?)? = nil
        var legacyExpiry: Date? = nil
        var taxThrough: String? = nil
        var taxIDs: [String] = []
        for await result in Transaction.currentEntitlements {
            guard case .verified(let t) = result else { continue }   // unverified: ignore, don't trust
            if let revoked = t.revocationDate, revoked <= Date() { continue }
            if let ty = taxYear(forProductID: t.productID) {
                taxIDs.append(t.productID)
                if taxThrough == nil || ty > taxThrough! { taxThrough = ty }
                continue
            }
            guard let tier = tier(forProductID: t.productID) else { continue }
            if t.productID == subscriptionIDs["pro.legacy"] {
                /* No expiry on a perpetual grant means "for as long as it runs"; an undated legacy
                   entitlement is treated as running to today, which still unlocks the year in
                   progress. */
                legacyExpiry = t.expirationDate ?? Date()
            }
            let rank = tierRank[tier] ?? 0
            if let b = best, (tierRank[b.tier] ?? 0) >= rank { continue }
            best = (tier, t.expirationDate)
        }
        var out: [String: Any] = ["source": "storekit"]
        if let through = taxThrough { out["taxThrough"] = through }
        if !taxIDs.isEmpty { out["taxIds"] = taxIDs }
        if let exp = legacyExpiry { out["legacyTaxThrough"] = taxYear(for: exp) }
        guard let b = best else { out["active"] = false; return out }
        out["active"] = true
        out["tier"] = b.tier
        if let exp = b.expiresAt {
            out["expiresAt"] = ISO8601DateFormatter().string(from: exp)
        }
        return out
    }

    /// `tier` names the rung to buy. There is one, and it defaults to it - which is also what a
    /// build older than this one meant by asking at all. It always buys the MONTHLY product: the
    /// legacy annual stays purchasable for anyone already on it, but nothing sells it any more.
    @objc func plusPurchase(_ call: CAPPluginCall) {
        Task {
            do {
                let tier = call.getString("tier") ?? "pro"
                guard let id = Self.subscriptionIDs[tier] else {
                    call.reject("Unknown subscription tier"); return
                }
                let products = try await Product.products(for: [id])
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

    /// Buy one UK tax year. A non-consumable, so there is no period, no expiry and nothing to
    /// downgrade - it either becomes owned or it does not, and `currentStatus()` reports the new
    /// watermark in the same shape every other call uses.
    ///
    /// IT DOES NOT CHECK FOR A SUBSCRIPTION. The web layer requires Pro before this button is
    /// enabled, and enforcing it a second time here would mean a purchase StoreKit had completed
    /// that this app then refused to honour - which is money taken for nothing. Somebody who
    /// reaches it without Pro owns the year and sees it the moment they subscribe.
    @objc func taxPurchase(_ call: CAPPluginCall) {
        Task {
            do {
                guard let ty = call.getString("year"), let id = Self.taxProductID(forYear: ty) else {
                    call.reject("Unknown tax year"); return
                }
                let products = try await Product.products(for: [id])
                guard let product = products.first else {
                    call.reject("That tax year is not available"); return
                }
                let result = try await product.purchase()
                switch result {
                case .success(let verification):
                    // Always finish, or StoreKit replays the transaction on every launch.
                    if case .verified(let t) = verification { await t.finish() }
                    call.resolve(await Self.currentStatus())
                case .userCancelled:
                    call.resolve(["cancelled": true, "active": false])
                case .pending:
                    call.resolve(["pending": true, "active": false])
                @unknown default:
                    call.resolve(["active": false])
                }
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    /// App Review rejects a non-consumable or subscription paywall with no way back to a
    /// purchase already made, so this is not optional. It covers the tax years too: AppStore.sync()
    /// re-reads every entitlement, and currentStatus() reports both.
    @objc func plusRestore(_ call: CAPPluginCall) {
        Task {
            do { try await AppStore.sync() } catch { /* cancelled or offline - still report below */ }
            call.resolve(await Self.currentStatus())
        }
    }

    /// Apple's own offer-code sheet. This is how a gift, a comp or a founding-member grant is
    /// delivered on iOS - Apple's mechanism rather than a home-grown key, so there is no
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
    /// environment this build is running under - sandbox for TestFlight and Xcode builds,
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
                    // to stay locked), so it resolves rather than rejecting - the web layer
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
            // The obvious route - UIMarkupTextPrintFormatter straight into a
            // UIPrintPageRenderer - deadlocks the main thread on modern iOS: the formatter
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

    /// A4 at 72dpi with a half-inch margin - the same page the web print stylesheet targets,
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
