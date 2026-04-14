import BackgroundTasks
import UIKit

/// BGTaskScheduler wiring. short = BGAppRefresh (~30s), long = BGProcessing (~minutes, charger+wifi).
/// Continuous BG sync isn't a thing on iOS, these just buy opportunistic windows.
@objc final class BackgroundManager: NSObject {
    enum TaskKind: String {
        case short = "com.siddarthkay.syncup.short-background-sync"
        case long  = "com.siddarthkay.syncup.background-sync"
    }

    /// Reserve at end of BG budget for a clean drain before iOS force-expires.
    private static let backgroundTimeReserve: TimeInterval = 5.6

    @objc static let shared = BackgroundManager()

    private var expireTimer: Timer?
    private var currentTask: BGTask?

    private override init() {
        super.init()
    }

    /// Must run from didFinishLaunching, registering late means iOS rejects every task.
    @objc func register() {
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: TaskKind.short.rawValue,
            using: DispatchQueue.main
        ) { [weak self] task in
            self?.handle(task: task)
        }
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: TaskKind.long.rawValue,
            using: DispatchQueue.main
        ) { [weak self] task in
            self?.handle(task: task)
        }
        NSLog("BackgroundManager: registered %@ and %@",
              TaskKind.short.rawValue, TaskKind.long.rawValue)
    }

    /// earliestBeginDate is a hint, not a promise. iOS decides when (or if) to actually fire.
    @objc func scheduleNext() {
        do {
            let short = BGAppRefreshTaskRequest(identifier: TaskKind.short.rawValue)
            short.earliestBeginDate = Date(timeIntervalSinceNow: 30 * 60)
            try BGTaskScheduler.shared.submit(short)
            NSLog("BackgroundManager: scheduled short task (>=30m)")
        } catch {
            NSLog("BackgroundManager: failed to schedule short task: %@", "\(error)")
        }

        do {
            let long = BGProcessingTaskRequest(identifier: TaskKind.long.rawValue)
            long.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
            long.requiresExternalPower = true
            long.requiresNetworkConnectivity = true
            try BGTaskScheduler.shared.submit(long)
            NSLog("BackgroundManager: scheduled long task (>=15m, on charger + wifi)")
        } catch {
            NSLog("BackgroundManager: failed to schedule long task: %@", "\(error)")
        }
    }

    // MARK: - Task handling

    private func handle(task: BGTask) {
        NSLog("BackgroundManager: handler fired for %@, remaining=%.1f",
              task.identifier, UIApplication.shared.backgroundTimeRemaining)

        // re-submit immediately so a stall here doesn't drop us from the queue.
        scheduleNext()

        if currentTask != nil {
            NSLog("BackgroundManager: another task already in flight - declining")
            task.setTaskCompleted(success: false)
            return
        }

        // idempotent; covers the cold-wake case where the process is minimal.
        _ = GoBridgeWrapper.startServer()

        // warmup delay so REST server is bound and folder errors have populated.
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
            BackgroundErrorNotifier.check()
        }

        currentTask = task

        // fallback only. the watchdog timer below should've drained first.
        task.expirationHandler = { [weak self] in
            NSLog("BackgroundManager: expirationHandler fired, remaining=%.1f",
                  UIApplication.shared.backgroundTimeRemaining)
            self?.endCurrentTask(success: false)
        }

        // watchdog: voluntarily end while we still have time for a clean drain.
        expireTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            let remaining = UIApplication.shared.backgroundTimeRemaining
            if remaining <= BackgroundManager.backgroundTimeReserve {
                NSLog("BackgroundManager: within reserve (%.1fs) - ending task",
                      BackgroundManager.backgroundTimeReserve)
                self?.endCurrentTask(success: true)
            }
        }
    }

    private func endCurrentTask(success: Bool) {
        expireTimer?.invalidate()
        expireTimer = nil
        guard let task = currentTask else { return }
        currentTask = nil

        // Drain before setTaskCompleted. stopServer blocks until suture winds down and the
        // SQLite WAL is checkpointed. Skipping this leaks an unflushed WAL and leaves syncthing
        // state machines mid-write. Costs a few hundred ms on main; we're already backgrounded.
        NSLog("BackgroundManager: draining daemon before setTaskCompleted")
        _ = GoBridgeWrapper.stopServer()

        NSLog("BackgroundManager: setTaskCompleted(success: %@) for %@",
              success ? "true" : "false", task.identifier)
        task.setTaskCompleted(success: success)
    }
}
