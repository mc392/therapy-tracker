import Foundation
import UIKit
import UniformTypeIdentifiers

/// A folder the counsellor picks — typically inside their own iCloud Drive — that GroundWork
/// writes its records into on every save.
///
/// This is the same shape as GroundWork Notes' `VaultBookmark` + `FileSystemVaultStore`, and
/// deliberately so: the notes app has always kept the counsellor's records in a folder she owns
/// rather than inside its own sandbox, and the thing people notice about it is that there is
/// nothing to remember to back up. A folder in iCloud Drive survives a lost phone, restores
/// itself onto a new one, and is visible in the Files app without the app being involved.
///
/// The one thing this file must never do is *become* the store. GroundWork's state is a single
/// object read synchronously from IndexedDB on every render; the folder holds the durable copy
/// of it, written after each save and read back when this device does not have the newest one.
/// See `docs/ios-native.md` § Records folder.
///
/// Nothing here needs an iCloud entitlement or a container. The user picks a folder in the
/// document picker; the sandbox grants access to exactly that folder, and a security-scoped
/// bookmark is that grant made durable across launches.
enum RecordsFolder {

    // MARK: - Remembering the folder

    private static let bookmarkKey = "records.folder.bookmark"
    private static let nameKey = "records.folder.name"

    static var isSet: Bool { UserDefaults.standard.data(forKey: bookmarkKey) != nil }
    static var storedName: String? { UserDefaults.standard.string(forKey: nameKey) }

    /// The security scope has to be held while the bookmark is made. A URL from the document
    /// picker is unusable outside a balanced `startAccessingSecurityScopedResource()` pair, and
    /// `bookmarkData` is a use like any other — called outside one it fails with "the file
    /// couldn't be opened because it doesn't exist", which is the sandbox refusing rather than
    /// the folder being missing. GroundWork Notes learnt this the hard way; see the note on
    /// `RosterBookmark.store` there.
    static func remember(_ url: URL) throws {
        let accessed = url.startAccessingSecurityScopedResource()
        defer { if accessed { url.stopAccessingSecurityScopedResource() } }
        let data = try url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil)
        UserDefaults.standard.set(data, forKey: bookmarkKey)
        UserDefaults.standard.set(url.lastPathComponent, forKey: nameKey)
    }

    /// A *stale* bookmark is refreshed and re-saved rather than thrown away: the folder being
    /// renamed, or iCloud rebuilding its local copy, must not present to the user as "your
    /// records are gone".
    static func resolve() throws -> URL? {
        guard let data = UserDefaults.standard.data(forKey: bookmarkKey) else { return nil }
        var stale = false
        let url = try URL(resolvingBookmarkData: data, options: [], relativeTo: nil, bookmarkDataIsStale: &stale)
        if stale { try? remember(url) }
        return url
    }

    static func forget() {
        UserDefaults.standard.removeObject(forKey: bookmarkKey)
        UserDefaults.standard.removeObject(forKey: nameKey)
    }

    // MARK: - Errors

    enum FolderError: LocalizedError {
        case notChosen
        case unreachable(String)

        var errorDescription: String? {
            switch self {
            case .notChosen:
                return "No folder has been chosen yet."
            case .unreachable(let why):
                return why
            }
        }
    }

    /// Runs `body` with the folder open and the security scope held. Every read and write goes
    /// through here, so there is exactly one place that can forget to balance the pair.
    private static func withFolder<T>(_ body: (URL) throws -> T) throws -> T {
        guard isSet else { throw FolderError.notChosen }
        guard let url = reopen() else {
            throw FolderError.unreachable("That folder could not be reopened — choose it again.")
        }
        let accessed = url.startAccessingSecurityScopedResource()
        defer { if accessed { url.stopAccessingSecurityScopedResource() } }
        return try body(url)
    }

    /// `resolve()` without the throwing: nil covers both "never chosen" and "chosen but gone",
    /// which is the same answer to every caller here.
    private static func reopen() -> URL? {
        do { return try resolve() } catch { return nil }
    }

    /// Resolves a relative path such as `Previous versions/GroundWork 2026-09-08.json` against
    /// the folder, refusing anything that would climb out of it. The names come from the web
    /// layer rather than from user input, but a path that escapes the granted folder would fail
    /// at the sandbox anyway and it is cheaper to be sure here.
    private static func child(_ folder: URL, _ path: String) throws -> URL {
        let parts = path.split(separator: "/").map(String.init)
        guard !parts.isEmpty, !parts.contains(".."), !parts.contains(".") else {
            throw FolderError.unreachable("\(path) is not a name this app can write.")
        }
        return parts.reduce(folder) { $0.appendingPathComponent($1) }
    }

    // MARK: - Writing

    /// Writes UTF-8 `text` to `path` inside the folder, creating intermediate directories.
    ///
    /// Coordinated, because the folder is very likely a file-provider folder (iCloud Drive,
    /// Dropbox, Working Copy) with another process watching it: an uncoordinated write can be
    /// uploaded half-finished. `.forReplacing` plus an atomic write means a reader never sees a
    /// truncated file, which for a whole-state record is the difference between a backup and a
    /// brick.
    @discardableResult
    static func write(_ path: String, text: String) throws -> Date {
        try withFolder { folder in
            let target = try child(folder, path)
            let parent = target.deletingLastPathComponent()
            if parent.path != folder.path {
                try FileManager.default.createDirectory(at: parent, withIntermediateDirectories: true)
            }
            var writeError: Error?
            var coordError: NSError?
            NSFileCoordinator().coordinate(writingItemAt: target, options: .forReplacing, error: &coordError) { url in
                do { try Data(text.utf8).write(to: url, options: .atomic) }
                catch { writeError = error }
            }
            if let coordError { throw coordError }
            if let writeError { throw writeError }
            return (try? target.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? Date()
        }
    }

    // MARK: - Reading

    struct FileInfo {
        var exists: Bool
        var modifiedAt: Date?
        var size: Int
    }

    /// What is at `path` right now, without reading it. This is what the launch check asks: a
    /// modification date the app did not write means another device has been in this folder.
    static func stat(_ path: String) throws -> FileInfo {
        try withFolder { folder in
            let target = try child(folder, path)
            _ = try? materialise(target, timeout: 0)          // ask iCloud, don't wait
            let values = try? target.resourceValues(forKeys: [.contentModificationDateKey, .fileSizeKey])
            guard FileManager.default.fileExists(atPath: target.path) else {
                return FileInfo(exists: false, modifiedAt: nil, size: 0)
            }
            return FileInfo(exists: true,
                            modifiedAt: values?.contentModificationDate,
                            size: values?.fileSize ?? 0)
        }
    }

    /// Reads `path` as UTF-8, waiting for iCloud to hand over a file that is still a placeholder.
    ///
    /// The download comes first and the "is it there?" check second, for the reason the notes app
    /// documents: an undownloaded file is not at the path the user picked, it is beside it as
    /// `.name.icloud`, so testing the path first calls every un-downloaded file gone.
    static func read(_ path: String, timeout: TimeInterval = 25) throws -> (text: String, modifiedAt: Date?) {
        try withFolder { folder in
            let target = try child(folder, path)
            try materialise(target, timeout: timeout)
            guard FileManager.default.fileExists(atPath: target.path) else {
                throw FolderError.unreachable("\(target.lastPathComponent) is not in that folder.")
            }
            var data: Data?
            var readError: Error?
            var coordError: NSError?
            NSFileCoordinator().coordinate(readingItemAt: target, options: [], error: &coordError) { url in
                do { data = try Data(contentsOf: url) }
                catch { readError = error }
            }
            if let coordError { throw coordError }
            if let readError { throw readError }
            guard let data, let text = String(data: data, encoding: .utf8) else {
                throw FolderError.unreachable("\(target.lastPathComponent) could not be read as text.")
            }
            let when = try? target.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate
            return (text: text, modifiedAt: when)
        }
    }

    // MARK: - Housekeeping

    /// Names of the files directly inside `path` (`""` for the folder itself). Directories and
    /// dot-files are left out — the caller is pruning dated copies, not browsing.
    static func list(_ path: String) throws -> [String] {
        try withFolder { folder in
            let dir = path.isEmpty ? folder : try child(folder, path)
            guard let items = try? FileManager.default.contentsOfDirectory(
                at: dir, includingPropertiesForKeys: [.isDirectoryKey], options: [.skipsHiddenFiles]
            ) else { return [] }
            return items
                .filter { (try? $0.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) != true }
                .map { $0.lastPathComponent }
                .sorted()
        }
    }

    /// Removes `path`. A file that is already gone is not an error — the caller is tidying up.
    static func delete(_ path: String) throws {
        try withFolder { folder in
            let target = try child(folder, path)
            guard FileManager.default.fileExists(atPath: target.path) else { return }
            var removeError: Error?
            var coordError: NSError?
            NSFileCoordinator().coordinate(writingItemAt: target, options: .forDeleting, error: &coordError) { url in
                do { try FileManager.default.removeItem(at: url) }
                catch { removeError = error }
            }
            if let coordError { throw coordError }
            if let removeError { throw removeError }
        }
    }

    // MARK: - Describing the folder

    /// Whether the chosen folder is in iCloud Drive.
    ///
    /// This is not decoration: it decides whether GroundWork keeps nagging about manual backups.
    /// A folder in iCloud Drive is off this phone, so the nag has nothing left to warn about; a
    /// folder under "On My iPhone" is not, and the reminder has to stay. When we cannot tell, the
    /// answer is no — a wrongly silenced backup reminder is the one failure this app must not
    /// have.
    static func isInICloud(_ url: URL) -> Bool {
        if let v = try? url.resourceValues(forKeys: [.isUbiquitousItemKey]), v.isUbiquitousItem == true { return true }
        // A folder is not itself always flagged ubiquitous; the container path is the fallback.
        return url.path.contains("/com~apple~CloudDocs") || url.path.contains("/Mobile Documents/")
    }

    /// Everything the settings screen and the launch check need, in one round trip.
    static func describe(livePath: String, altPath: String) -> [String: Any] {
        guard isSet else { return ["set": false] }
        guard let folder = reopen() else {
            return ["set": true, "name": storedName ?? "", "reachable": false,
                    "error": "That folder could not be reopened — choose it again."]
        }
        var out: [String: Any] = [
            "set": true,
            "name": folder.lastPathComponent,
            "path": prettyPath(folder),
            "icloud": isInICloud(folder),
            "reachable": true
        ]
        for (key, path) in [("live", livePath), ("alt", altPath)] {
            if let info = try? stat(path), info.exists {
                let entry: [String: Any] = ["exists": true,
                                            "modifiedAt": (info.modifiedAt?.timeIntervalSince1970 ?? 0) * 1000,
                                            "size": info.size]
                out[key] = entry
            } else {
                out[key] = ["exists": false] as [String: Any]
            }
        }
        return out
    }

    /// A path a human recognises: "iCloud Drive › GroundWork" rather than 60 characters of
    /// container UUID. Best effort — an unrecognised provider falls back to the last two
    /// components, which is still more use than the whole path.
    private static func prettyPath(_ url: URL) -> String {
        let parts = url.pathComponents.filter { $0 != "/" }
        if let i = parts.firstIndex(where: { $0 == "com~apple~CloudDocs" }) {
            return (["iCloud Drive"] + parts[(i + 1)...]).joined(separator: " › ")
        }
        return parts.suffix(2).joined(separator: " › ")
    }

    // MARK: - iCloud placeholders

    /// Where iCloud parks a file it has not downloaded: `.name.icloud`, beside the real one.
    private static func placeholderExists(for target: URL) -> Bool {
        let placeholder = target.deletingLastPathComponent()
            .appendingPathComponent(".\(target.lastPathComponent).icloud")
        return FileManager.default.fileExists(atPath: placeholder.path)
    }

    private static func isDownloaded(_ url: URL) -> Bool {
        let values = try? url.resourceValues(forKeys: [.isUbiquitousItemKey, .ubiquitousItemDownloadingStatusKey])
        if values?.isUbiquitousItem == true {
            return values?.ubiquitousItemDownloadingStatus == .current
        }
        return FileManager.default.fileExists(atPath: url.path) && !placeholderExists(for: url)
    }

    /// Asks iCloud for a file that is only a placeholder and — when given a timeout — waits for
    /// it. Blocking, so it is called on a background queue; pass `0` to ask and carry on.
    private static func materialise(_ url: URL, timeout: TimeInterval) throws {
        guard !isDownloaded(url) else { return }
        do { try FileManager.default.startDownloadingUbiquitousItem(at: url) }
        catch { return }        // not a ubiquitous item at all; the caller reports what it finds
        guard timeout > 0 else { return }
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if isDownloaded(url) { return }
            Thread.sleep(forTimeInterval: 0.25)
        }
        throw FolderError.unreachable("That file is still downloading from iCloud. Try again in a moment.")
    }
}

/// Presents the folder picker and hands back what was chosen.
///
/// Held by the plugin for the life of one presentation: a document picker whose delegate has been
/// released calls nothing back, and the JS promise would hang for ever.
final class RecordsFolderPicker: NSObject, UIDocumentPickerDelegate {
    private let done: (URL?) -> Void
    private var fired = false

    init(done: @escaping (URL?) -> Void) { self.done = done }

    func present(from vc: UIViewController) {
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [UTType.folder])
        picker.allowsMultipleSelection = false
        picker.delegate = self
        if let pop = picker.popoverPresentationController {
            pop.sourceView = vc.view
            pop.sourceRect = CGRect(x: vc.view.bounds.midX, y: vc.view.bounds.maxY - 40, width: 1, height: 1)
        }
        vc.present(picker, animated: true)
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        finish(urls.first)
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        finish(nil)
    }

    private func finish(_ url: URL?) {
        guard !fired else { return }
        fired = true
        done(url)
    }
}
