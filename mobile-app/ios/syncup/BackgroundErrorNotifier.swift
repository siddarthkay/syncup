import Foundation
import UserNotifications

/// BG-path folder error scan. Polls /rest/folder/errors per folder and funnels results through
/// GoBridgeWrapper.maybeNotifyFolderErrors, same dedup store as the foreground JS path.
@objc final class BackgroundErrorNotifier: NSObject {

    private static let httpTimeout: TimeInterval = 5
    private static let semaphoreBudget: TimeInterval = 6

    /// Safe from main. HTTP work hops to a utility queue so the BG handler's budget watchdog keeps running.
    @objc static func check() {
        DispatchQueue.global(qos: .utility).async {
            performCheck()
        }
    }

    // MARK: - Core logic

    private struct FolderInfo {
        let id: String
        let label: String
    }

    private static func performCheck() {
        let apiKey = GoBridgeWrapper.getApiKey() ?? ""
        let guiAddress = GoBridgeWrapper.getGuiAddress() ?? ""
        guard !apiKey.isEmpty, !guiAddress.isEmpty else {
            NSLog("BackgroundErrorNotifier: daemon not ready (empty key/address) - skipping")
            return
        }

        guard let folders = fetchFolders(apiKey: apiKey, guiAddress: guiAddress) else {
            NSLog("BackgroundErrorNotifier: failed to list folders")
            return
        }

        for folder in folders {
            guard let result = fetchFolderErrors(apiKey: apiKey, guiAddress: guiAddress, folderId: folder.id) else {
                continue
            }
            _ = GoBridgeWrapper.maybeNotifyFolderErrors(
                withFolderId: folder.id,
                count: result.count,
                label: folder.label,
                sample: result.sample
            )
        }
    }

    // MARK: - HTTP

    private static func fetchFolders(apiKey: String, guiAddress: String) -> [FolderInfo]? {
        let urlStr = "http://\(guiAddress)/rest/config/folders"
        guard let data = httpGet(urlStr, apiKey: apiKey) else { return nil }
        guard let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            return nil
        }
        return arr.compactMap { dict in
            guard let id = dict["id"] as? String, !id.isEmpty else { return nil }
            let rawLabel = dict["label"] as? String ?? id
            let label = rawLabel.isEmpty ? id : rawLabel
            return FolderInfo(id: id, label: label)
        }
    }

    private struct ErrorsResult {
        let count: Int
        let sample: String
    }

    private static func fetchFolderErrors(apiKey: String, guiAddress: String, folderId: String) -> ErrorsResult? {
        let allowed = CharacterSet.urlQueryAllowed
        guard let encoded = folderId.addingPercentEncoding(withAllowedCharacters: allowed) else {
            return nil
        }
        let urlStr = "http://\(guiAddress)/rest/folder/errors?folder=\(encoded)"
        guard let data = httpGet(urlStr, apiKey: apiKey) else { return nil }
        guard let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return ErrorsResult(count: 0, sample: "")
        }
        guard let errors = obj["errors"] as? [[String: Any]] else {
            return ErrorsResult(count: 0, sample: "")
        }
        let count = errors.count
        // first failing path, used as notification preview
        let sample: String
        if let first = errors.first, let path = first["path"] as? String {
            sample = path
        } else {
            sample = ""
        }
        return ErrorsResult(count: count, sample: sample)
    }

    /// semaphore-blocking GET. fine because we're on a utility queue, not main.
    private static func httpGet(_ urlString: String, apiKey: String) -> Data? {
        guard let url = URL(string: urlString) else { return nil }
        var request = URLRequest(url: url)
        request.setValue(apiKey, forHTTPHeaderField: "X-API-Key")
        request.timeoutInterval = httpTimeout

        let semaphore = DispatchSemaphore(value: 0)
        var result: Data?
        let task = URLSession.shared.dataTask(with: request) { data, response, error in
            defer { semaphore.signal() }
            if let error = error {
                NSLog("BackgroundErrorNotifier: http error %@", "\(error)")
                return
            }
            if let http = response as? HTTPURLResponse, http.statusCode >= 400 {
                NSLog("BackgroundErrorNotifier: http status %d for %@", http.statusCode, urlString)
                return
            }
            result = data
        }
        task.resume()
        _ = semaphore.wait(timeout: .now() + semaphoreBudget)
        return result
    }
}
