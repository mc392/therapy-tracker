import SwiftUI
import UserNotifications
import WatchKit

@main
struct GroundWorkWatchApp: App {
    @WKApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var timer = SessionTimer()

    var body: some Scene {
        WindowGroup {
            TimerView().environmentObject(timer)
        }
    }
}

/// Exists for one reason: to make the cue arrive when the app is the thing on screen.
///
/// watchOS does not present a local notification for the app that is currently frontmost
/// unless it is asked to — so without this, the therapist *looking at the timer* is the one
/// person who gets no tap at the ten-minute mark, which is precisely backwards.
///
/// `.sound` is deliberately left out of the presentation options and the haptic played
/// directly instead. Returning `.sound` would ask watchOS to map the notification sound onto
/// a haptic for us; playing it here is one fewer thing to be wrong about, and since the
/// option is withheld there is no second tap to collide with.
final class AppDelegate: NSObject, WKApplicationDelegate, UNUserNotificationCenterDelegate {

    func applicationDidFinishLaunching() {
        UNUserNotificationCenter.current().delegate = self
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        WKInterfaceDevice.current().play(.notification)
        return [.banner]
    }
}
