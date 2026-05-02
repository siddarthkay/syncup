import Foundation
import QuickLook
import UIKit

/// Wraps QLPreviewController so JS can hand us a list of file paths and we
/// present the system preview UI on top of the React Native window. Sushitrain
/// uses the same QLPreviewController under the hood (FileView.swift:116) —
/// we get image zoom, video scrub, PDF paging, AirDrop, share sheet, and
/// AirPlay essentially for free.
@objc(QuickLookPresenter) final class QuickLookPresenter: NSObject {
    @objc static let shared = QuickLookPresenter()

    /// Strong refs to the data source so it survives across present/dismiss.
    /// Cleared in dataSource's onDismiss closure.
    private var liveDataSource: PreviewDataSource?

    private override init() { super.init() }

    /// Present QuickLook for the given absolute file paths. startIndex selects
    /// which item the carousel opens on. Designed to be callable from any
    /// thread; UIKit work hops to main internally.
    @objc func present(paths: [String], startIndex: Int) {
        // Filter to existing, readable files. QuickLook will spin forever on a
        // non-existent URL; better to fail fast on the JS-visible error path.
        let urls: [URL] = paths.compactMap { p in
            guard !p.isEmpty else { return nil }
            let url = URL(fileURLWithPath: p)
            return FileManager.default.fileExists(atPath: url.path) ? url : nil
        }
        guard !urls.isEmpty else {
            NSLog("QuickLookPresenter: no readable paths in %@", paths)
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            guard let presenter = self.topPresentingViewController() else {
                NSLog("QuickLookPresenter: no presenter VC")
                return
            }
            let controller = QLPreviewController()
            let ds = PreviewDataSource(urls: urls)
            ds.onDismiss = { [weak self] in
                self?.liveDataSource = nil
            }
            self.liveDataSource = ds
            controller.dataSource = ds
            controller.delegate = ds
            let safeIndex = max(0, min(startIndex, urls.count - 1))
            controller.currentPreviewItemIndex = safeIndex
            presenter.present(controller, animated: true, completion: nil)
        }
    }

    private func topPresentingViewController() -> UIViewController? {
        var window: UIWindow?
        if #available(iOS 13.0, *) {
            window = UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .flatMap { $0.windows }
                .first(where: { $0.isKeyWindow })
        }
        if window == nil {
            window = UIApplication.shared.windows.first(where: { $0.isKeyWindow })
                ?? UIApplication.shared.windows.first
        }
        var top = window?.rootViewController
        while let presented = top?.presentedViewController {
            top = presented
        }
        return top
    }
}

private final class PreviewDataSource: NSObject, QLPreviewControllerDataSource, QLPreviewControllerDelegate {
    private let urls: [URL]
    var onDismiss: (() -> Void)?

    init(urls: [URL]) {
        self.urls = urls
    }

    func numberOfPreviewItems(in controller: QLPreviewController) -> Int {
        return urls.count
    }

    func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
        return urls[index] as QLPreviewItem
    }

    func previewControllerDidDismiss(_ controller: QLPreviewController) {
        onDismiss?()
    }
}
