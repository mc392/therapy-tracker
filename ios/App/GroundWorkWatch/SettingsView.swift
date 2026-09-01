import SwiftUI

/// Two settings, and no more than two. Anything else — which client, what they pay, whether
/// the room was settled — needs data this app deliberately does not have.
///
/// Changing either of these mid-session leaves the running timer alone: its end date is
/// already fixed and its cues are already scheduled with the system. The change applies to
/// the next Start, which is the only reading of "make sessions 60 minutes" that does not
/// silently move the end of the one currently in the room.
struct SettingsView: View {
    @EnvironmentObject private var timer: SessionTimer
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Picker("Session", selection: $timer.lengthMins) {
                    ForEach(SessionTimer.lengths, id: \.self) { Text("\($0) min").tag($0) }
                }
                Picker("Tap before", selection: $timer.warnMins) {
                    ForEach(SessionTimer.warnings, id: \.self) {
                        Text($0 == 0 ? "Off" : "\($0) min").tag($0)
                    }
                }
                Section {
                    Text("Theatre mode keeps the screen dark and the watch silent — the taps still come through. It is the setting to be in during a session.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Timer")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}
