#!/usr/bin/env swift
//
// Run: swift mobile-app/ios/tests/NotificationDedupDecideTest.swift
// decide() mirrors the @synchronized block in GoBridgeWrapper.mm. keep in sync.
// Same algorithm as android/.../NotificationDedup.kt (JUnit covered there).

import Foundation

enum Decision: Equatable {
    case skip
    case reset
    case notify(Int)
}

/// Pure dedup decision. Mirror of NotificationDedup.kt and GoBridgeWrapper.mm.
func decide(lastCount: Int, currentCount: Int) -> Decision {
    if currentCount <= 0 {
        return lastCount != 0 ? .reset : .skip
    }
    if currentCount <= lastCount {
        return .skip
    }
    return .notify(currentCount)
}

// MARK: - Test harness

var failures = 0
var total = 0

func check(_ name: String, _ actual: Decision, _ expected: Decision) {
    total += 1
    if actual == expected {
        print("  ✓ \(name)")
    } else {
        print("  ✗ \(name)  expected=\(expected) actual=\(actual)")
        failures += 1
    }
}

print("NotificationDedup decide() tests (iOS):")

check(
    "fresh error on empty state notifies with new count",
    decide(lastCount: 0, currentCount: 3),
    .notify(3)
)
check(
    "single error notifies",
    decide(lastCount: 0, currentCount: 1),
    .notify(1)
)

check(
    "rising count notifies with new higher value",
    decide(lastCount: 3, currentCount: 5),
    .notify(5)
)

check(
    "same count skips so user is not spammed",
    decide(lastCount: 3, currentCount: 3),
    .skip
)
check(
    "falling but still-broken count skips",
    decide(lastCount: 5, currentCount: 2),
    .skip
)

check(
    "previously-broken folder going healthy resets dedup",
    decide(lastCount: 5, currentCount: 0),
    .reset
)
check(
    "never-broken folder staying healthy is a noop",
    decide(lastCount: 0, currentCount: 0),
    .skip
)

// REST API is untrusted, guard negative counts.
check(
    "negative current count with prior state resets",
    decide(lastCount: 3, currentCount: -1),
    .reset
)
check(
    "negative current count with no prior state skips",
    decide(lastCount: 0, currentCount: -2),
    .skip
)

// broken -> healthy -> broken again should re-notify
let step1 = decide(lastCount: 3, currentCount: 0)
check("round trip step 1: broken to healthy resets", step1, .reset)
check(
    "round trip step 2: same errors reappear and re-notify",
    decide(lastCount: 0, currentCount: 3),
    .notify(3)
)

print("")
if failures == 0 {
    print("\(total) tests passed")
    exit(0)
} else {
    print("\(failures) of \(total) tests failed")
    exit(1)
}
