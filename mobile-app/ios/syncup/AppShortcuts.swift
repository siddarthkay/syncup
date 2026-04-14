import AppIntents
import Foundation

@available(iOS 16.0, *)
struct SyncthingShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        return [
            AppShortcut(
                intent: BackUpPhotosIntent(),
                phrases: ["Back up photos using \(.applicationName)"],
                shortTitle: "Back up photos",
                systemImageName: "photo.badge.arrow.down"
            ),
            AppShortcut(
                intent: RescanFolderIntent(),
                phrases: ["Rescan folder in \(.applicationName)"],
                shortTitle: "Rescan folder",
                systemImageName: "arrow.triangle.2.circlepath"
            ),
            AppShortcut(
                intent: RestartDaemonIntent(),
                phrases: ["Restart daemon in \(.applicationName)"],
                shortTitle: "Restart daemon",
                systemImageName: "arrow.clockwise"
            ),
        ]
    }
}

@available(iOS 16.0, *)
struct BackUpPhotosIntent: AppIntent {
    static let title: LocalizedStringResource = "Back up photos"
    static let description = IntentDescription("Open Syncthing and trigger a photo backup.")
    static let openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult & ProvidesDialog {
        _ = GoBridgeWrapper.startServer()
        return .result(dialog: "Opening Syncthing for photo backup.")
    }
}

@available(iOS 16.0, *)
struct RescanFolderIntent: AppIntent {
    static let title: LocalizedStringResource = "Rescan folder"
    static let description = IntentDescription("Tell Syncthing to rescan all folders for changes.")
    static let openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult & ProvidesDialog {
        _ = GoBridgeWrapper.startServer()

        guard let guiAddress = GoBridgeWrapper.getGuiAddress(), !guiAddress.isEmpty,
              let apiKey = GoBridgeWrapper.getApiKey(), !apiKey.isEmpty else {
            return .result(dialog: "Daemon not ready yet. Try again in a moment.")
        }

        guard let url = URL(string: "http://\(guiAddress)/rest/db/scan") else {
            return .result(dialog: "Could not build API URL.")
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue(apiKey, forHTTPHeaderField: "X-API-Key")
        request.timeoutInterval = 10

        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            if let http = response as? HTTPURLResponse, http.statusCode < 400 {
                return .result(dialog: "Rescan started.")
            }
            return .result(dialog: "Daemon returned an error.")
        } catch {
            return .result(dialog: "Could not reach daemon: \(error.localizedDescription)")
        }
    }
}

@available(iOS 16.0, *)
struct RestartDaemonIntent: AppIntent {
    static let title: LocalizedStringResource = "Restart daemon"
    static let description = IntentDescription("Restart the Syncthing daemon.")
    static let openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult & ProvidesDialog {
        _ = GoBridgeWrapper.startServer()

        guard let guiAddress = GoBridgeWrapper.getGuiAddress(), !guiAddress.isEmpty,
              let apiKey = GoBridgeWrapper.getApiKey(), !apiKey.isEmpty else {
            return .result(dialog: "Daemon not ready yet. Try again in a moment.")
        }

        guard let url = URL(string: "http://\(guiAddress)/rest/system/restart") else {
            return .result(dialog: "Could not build API URL.")
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue(apiKey, forHTTPHeaderField: "X-API-Key")
        request.timeoutInterval = 10

        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            if let http = response as? HTTPURLResponse, http.statusCode < 400 {
                return .result(dialog: "Daemon restarting.")
            }
            return .result(dialog: "Daemon returned an error.")
        } catch {
            return .result(dialog: "Could not reach daemon: \(error.localizedDescription)")
        }
    }
}
