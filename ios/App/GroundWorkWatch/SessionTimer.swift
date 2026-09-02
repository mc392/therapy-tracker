import Foundation
import UserNotifications
import WatchKit

/// The one piece of state this app has: when the session ends.
///
/// Everything here is shaped by a single fact — **watchOS suspends the app the moment the
/// wrist drops**, which happens a second or two after the therapist stops looking at it and
/// then lasts for the next forty-nine minutes. Two consequences, and between them they are
/// the whole design:
///
/// 1. **The end date is the state. Nothing counts down.** Every number on screen is derived
///    from `Date()` against `endsAt`, so a timer that was started, suspended, and relaunched
///    fifty minutes later is still right to the second. A decrementing counter would simply
///    have stopped along with the app, and would have looked fine while doing it.
/// 2. **The taps are scheduled with the system, not fired by us.** A `Timer` in a suspended
///    app does not fire, and the tap at ten-minutes-left is the entire reason this app
///    exists — it cannot be the part that quietly does not happen. Both cues are local
///    notifications, handed to `UNUserNotificationCenter` when Start is pressed and
///    withdrawn on Stop.
///
/// The `Timer`s that do exist here (`armFlips`) are cosmetic only: they flip the screen from
/// counting down to counting up. If they never fire because the app was asleep, the next
/// `refresh()` puts it right, and nothing the therapist relies on was riding on them.
@MainActor
final class SessionTimer: ObservableObject {

    /// Session lengths worth offering. Fifty minutes is the therapeutic hour and the
    /// default; the rest are the ones that actually come up — a short assessment, a double.
    static let lengths = [30, 45, 50, 60, 80, 90]

    /// How long before the end to tap. `0` is no warning tap at all, for someone who only
    /// wants to know when time is up.
    static let warnings = [0, 5, 10, 15]

    /// A timer left running overnight should not greet you in the morning with "over by
    /// 14:22:31". Past this much overrun a restored session is treated as abandoned.
    private static let staleOverrun: TimeInterval = 2 * 60 * 60

    private enum Key {
        static let startedAt = "gw.timer.startedAt"
        static let endsAt = "gw.timer.endsAt"
        static let length = "gw.timer.lengthMins"
        static let warn = "gw.timer.warnMins"
    }
    private enum Cue {
        static let warn = "gw.cue.warn"
        static let end = "gw.cue.end"
    }

    @Published private(set) var startedAt: Date?
    @Published private(set) var endsAt: Date?

    /// True once the warning point has passed, and once the end has. Cosmetic — see the
    /// note on `armFlips()`.
    @Published private(set) var isWarning = false
    @Published private(set) var isOverrun = false

    /// Set when notification permission has been asked for and refused. The timer still
    /// runs, but the taps are the feature, so the screen has to say so rather than letting
    /// someone trust a cue that will never come.
    @Published private(set) var cuesBlocked = false

    @Published var lengthMins: Int { didSet { store.set(lengthMins, forKey: Key.length) } }
    @Published var warnMins: Int { didSet { store.set(warnMins, forKey: Key.warn) } }

    private let store = UserDefaults.standard
    private var flips: [Timer] = []

    var isRunning: Bool { endsAt != nil }

    init() {
        let savedLength = store.integer(forKey: Key.length)
        lengthMins = Self.lengths.contains(savedLength) ? savedLength : 50
        warnMins = store.object(forKey: Key.warn) as? Int ?? 10
        restore()
    }

    // MARK: - Running a session

    func start() {
        let now = Date()
        let ends = now.addingTimeInterval(TimeInterval(lengthMins * 60))
        startedAt = now
        endsAt = ends
        store.set(now, forKey: Key.startedAt)
        store.set(ends, forKey: Key.endsAt)
        armFlips()
        scheduleCues()
        WKInterfaceDevice.current().play(.start)
    }

    func stop() {
        clear()
        WKInterfaceDevice.current().play(.stop)
    }

    /// Re-reads the clock. Called when the app comes back to the foreground, which is the
    /// moment the cosmetic flips are most likely to have been missed.
    func refresh() {
        restore()
        armFlips()
        refreshBlockedFlag()
    }

    private func clear() {
        startedAt = nil
        endsAt = nil
        isWarning = false
        isOverrun = false
        store.removeObject(forKey: Key.startedAt)
        store.removeObject(forKey: Key.endsAt)
        flips.forEach { $0.invalidate() }
        flips = []
        let centre = UNUserNotificationCenter.current()
        centre.removePendingNotificationRequests(withIdentifiers: [Cue.warn, Cue.end])
        centre.removeDeliveredNotifications(withIdentifiers: [Cue.warn, Cue.end])
    }

    private func restore() {
        guard let ends = store.object(forKey: Key.endsAt) as? Date else {
            startedAt = nil
            endsAt = nil
            return
        }
        guard Date() < ends.addingTimeInterval(Self.staleOverrun) else {
            clear()
            return
        }
        endsAt = ends
        // The two keys are written together, so the fallback should never be needed — but a
        // start date equal to the end date would give the countdown a zero-width range to
        // draw, so it reconstructs one from the chosen length instead.
        startedAt = store.object(forKey: Key.startedAt) as? Date
            ?? ends.addingTimeInterval(TimeInterval(-lengthMins * 60))
    }

    // MARK: - The cues

    /// Both taps, scheduled in one go. Asking for permission here rather than at launch
    /// means the prompt arrives attached to the thing it is for — but it also means the
    /// very first session can lose its cues to a prompt still sitting on screen, which is
    /// why `cuesBlocked` exists and why the first Start is worth doing before a real client
    /// rather than during one.
    private func scheduleCues() {
        guard let startedAt, let endsAt else { return }
        // Read the settings once, here, rather than inside the Task below: the values that
        // get scheduled should be the ones in force when Start was pressed, not whatever
        // they happen to be by the time the permission prompt is answered.
        let mins = lengthMins
        let warn = warnMins
        let warnAt = endsAt.addingTimeInterval(TimeInterval(-warn * 60))
        let centre = UNUserNotificationCenter.current()
        centre.removePendingNotificationRequests(withIdentifiers: [Cue.warn, Cue.end])

        Task { @MainActor [weak self] in
            let granted = (try? await centre.requestAuthorization(options: [.alert, .sound])) ?? false
            guard let self else { return }
            self.cuesBlocked = !granted
            guard granted else { return }

            if warn > 0, warnAt > Date(), warnAt > startedAt {
                self.add(Cue.warn,
                         title: "\(warn) minutes left",
                         body: "Ends at \(Self.clock.string(from: endsAt)).",
                         at: warnAt)
            }
            self.add(Cue.end,
                     title: "Time",
                     body: "\(mins)-minute session complete.",
                     at: endsAt)
        }
    }

    private func add(_ id: String, title: String, body: String, at date: Date) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        // On watchOS this is what becomes the haptic tap. Without it the notification
        // arrives silently, which for this app is the same as not arriving.
        content.sound = .default

        // Time-interval rather than calendar: the schedule is "so many seconds from now",
        // and a calendar trigger would have to reason about the therapist crossing a
        // daylight-saving boundary mid-session. Floored at one second because a
        // non-positive interval is rejected outright.
        let trigger = UNTimeIntervalNotificationTrigger(
            timeInterval: max(1, date.timeIntervalSinceNow), repeats: false)
        UNUserNotificationCenter.current()
            .add(UNNotificationRequest(identifier: id, content: content, trigger: trigger))
    }

    private func refreshBlockedFlag() {
        Task { @MainActor [weak self] in
            let status = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
            self?.cuesBlocked = (status == .denied)
        }
    }

    // MARK: - Cosmetic state flips

    /// Schedules the two moments the *screen* changes at. Deliberately separate from the
    /// notifications above: these are allowed to be late or to never fire at all, because
    /// `refresh()` recomputes both from the dates whenever the app wakes.
    private func armFlips() {
        flips.forEach { $0.invalidate() }
        flips = []
        guard let endsAt else {
            isWarning = false
            isOverrun = false
            return
        }
        let now = Date()
        let warnAt = endsAt.addingTimeInterval(TimeInterval(-warnMins * 60))

        isOverrun = now >= endsAt
        isWarning = warnMins > 0 && now >= warnAt && now < endsAt

        if warnMins > 0, warnAt > now {
            flips.append(Timer.scheduledTimer(withTimeInterval: warnAt.timeIntervalSince(now),
                                              repeats: false) { [weak self] _ in
                Task { @MainActor in self?.isWarning = true }
            })
        }
        if endsAt > now {
            flips.append(Timer.scheduledTimer(withTimeInterval: endsAt.timeIntervalSince(now),
                                              repeats: false) { [weak self] _ in
                Task { @MainActor in
                    self?.isWarning = false
                    self?.isOverrun = true
                }
            })
        }
    }

    private static let clock: DateFormatter = {
        let f = DateFormatter()
        f.timeStyle = .short
        f.dateStyle = .none
        return f
    }()
}
