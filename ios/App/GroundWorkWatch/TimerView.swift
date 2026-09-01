import SwiftUI

/// The whole app: one screen that is either offering to start a session or counting one.
///
/// The numbers are drawn with `Text(timerInterval:)` and `ProgressView(timerInterval:)`
/// rather than from a published property, because those two keep counting on their own —
/// through the dimmed Always On state, and without the app being scheduled to redraw. It is
/// the same principle as `SessionTimer` keeping dates instead of a counter: on a watch, the
/// less that depends on this app running, the more of it survives the wrist going down.
struct TimerView: View {
    @EnvironmentObject private var timer: SessionTimer
    @Environment(\.scenePhase) private var scenePhase
    @State private var showingSettings = false

    var body: some View {
        NavigationStack {
            Group {
                if let started = timer.startedAt, let ends = timer.endsAt {
                    running(started: started, ends: ends)
                } else {
                    idle
                }
            }
            .padding(.horizontal, 4)
            .navigationTitle(timer.isRunning ? "" : "GroundWork")
            .sheet(isPresented: $showingSettings) {
                SettingsView().environmentObject(timer)
            }
        }
        .onChange(of: scenePhase) { phase in
            // Coming back from suspension is exactly when the cosmetic flips will have been
            // missed, so this is where the screen gets put right.
            if phase == .active { timer.refresh() }
        }
    }

    // MARK: - Not running

    private var idle: some View {
        VStack(spacing: 10) {
            Button {
                timer.start()
            } label: {
                Text("Start")
                    .font(.title3.weight(.semibold))
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)

            Button {
                showingSettings = true
            } label: {
                Text("\(timer.lengthMins) min" + (timer.warnMins > 0 ? " · tap at \(timer.warnMins)" : ""))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)

            if timer.cuesBlocked { blockedNote }
        }
    }

    // MARK: - Running

    private func running(started: Date, ends: Date) -> some View {
        VStack(spacing: 8) {
            if timer.isOverrun {
                Text("over by")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                // Counting up from the end. The range's far end is arbitrary and never
                // reached — SessionTimer treats anything past two hours as abandoned.
                Text(timerInterval: ends...ends.addingTimeInterval(4 * 60 * 60), countsDown: false)
                    .font(.system(size: 34, weight: .medium, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(.red)
            } else {
                Text(timerInterval: started...ends, countsDown: true)
                    .font(.system(size: 40, weight: .medium, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(timer.isWarning ? .orange : .primary)

                ProgressView(timerInterval: started...ends, countsDown: true) {
                    EmptyView()
                } currentValueLabel: {
                    EmptyView()
                }
                .tint(timer.isWarning ? .orange : Color.accentColor)
            }

            Button("Stop") { timer.stop() }
                .buttonStyle(.bordered)
                .tint(.red)

            if timer.cuesBlocked { blockedNote }
        }
    }

    /// The timer without its taps is a clock, and there is one of those on the watch face
    /// already — so a refusal has to be visible rather than discovered halfway through a
    /// session that ran twenty minutes long.
    private var blockedNote: some View {
        Text("Notifications are off, so there will be no tap. Turn them on for GroundWork in the Watch app.")
            .font(.caption2)
            .multilineTextAlignment(.center)
            .foregroundStyle(.secondary)
    }
}
