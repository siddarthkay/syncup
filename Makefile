# By default every target runs inside `nix develop` so you don't need
# to install Go, Node, JDK, etc. yourself. Pass SYSTEM=1 to skip nix
# and use whatever is on your PATH:
#
#   make sim-ios              # runs inside nix (default)
#   make sim-ios SYSTEM=1     # uses system-installed tools

_ALL_TARGETS := setup ios android release-android patch-node-modules sim-ios sim-android dev-ios dev-android test test-go test-android test-ios test-js clean clean-all help

.DEFAULT_GOAL := help

ifeq ($(SYSTEM)$(IN_NIX_SHELL),)
# ── Nix trampoline ──────────────────────────────────────────────────
# Re-exec the requested target inside nix develop. The inner make
# receives SYSTEM=1 so it falls into the else branch below.
.PHONY: $(_ALL_TARGETS)
$(_ALL_TARGETS):
	@nix develop --command $(MAKE) $@ SYSTEM=1
else
# ── Actual targets (inside nix or SYSTEM=1) ─────────────────────────

.PHONY: $(_ALL_TARGETS)

IOS_BUNDLE_ID = com.siddarthkay.syncup
IOS_APP = mobile-app/ios/build/Build/Products/Release-iphonesimulator/syncup.app

ANDROID_PACKAGE = com.siddarthkay.syncup
ANDROID_APK = mobile-app/android/app/build/outputs/apk/release/app-release.apk

setup:
	@$(MAKE) -C backend setup
	@$(MAKE) -C mobile-app install

ios:
	@$(MAKE) -C backend ios
	@$(MAKE) -C mobile-app build-ios

android:
	@$(MAKE) -C backend android $(if $(ANDROID_TARGETS),ANDROID_TARGETS=$(ANDROID_TARGETS))
	@$(MAKE) -C mobile-app build-android

patch-node-modules:
	@patch-node-modules

# Usage: make release-android ANDROID_TARGETS=android/arm64 ANDROID_ABI=arm64-v8a
release-android:
	@$(MAKE) -C backend android $(if $(ANDROID_TARGETS),ANDROID_TARGETS=$(ANDROID_TARGETS))
	@$(MAKE) -C mobile-app release-android \
		VERSION_NAME=$(shell cat VERSION 2>/dev/null | tr -d '[:space:]') \
		ANDROID_ABI=$(ANDROID_ABI)

sim-ios: ios
	@if ! xcrun simctl list devices booted | grep -q Booted; then \
		echo "==> No simulator booted - booting newest available iPhone..."; \
		udid=$$(xcrun simctl list devices available 2>/dev/null \
			| awk '/-- iOS/{v=$$3} /iPhone.*\(Shutdown\)/{print v, $$0}' \
			| sort -V | tail -1 \
			| sed -E 's/.*\(([-0-9A-F]+)\).*/\1/'); \
		if [ -z "$$udid" ]; then \
			echo "==> No iPhone simulators available. Install via Xcode > Settings > Platforms."; \
			exit 1; \
		fi; \
		echo "    booting $$udid"; \
		xcrun simctl boot "$$udid"; \
		open -a Simulator; \
		n=0; \
		while ! xcrun simctl list devices booted | grep -q Booted; do \
			sleep 1; n=$$((n+1)); \
			if [ $$n -gt 30 ]; then echo "Timed out waiting for simulator boot"; exit 1; fi; \
		done; \
	fi
	@echo "==> Installing $(IOS_APP)..."
	@xcrun simctl install booted $(IOS_APP)
	@echo "==> Launching $(IOS_BUNDLE_ID)..."
	@xcrun simctl launch booted $(IOS_BUNDLE_ID)
	@echo "✓ App launched on iOS simulator"

ANDROID_SDK ?= $(HOME)/Library/Android/sdk
EMULATOR = $(firstword $(wildcard $(ANDROID_SDK)/emulator/emulator) $(shell command -v emulator 2>/dev/null))

sim-android: android
	@if ! adb devices | awk 'NR>1 && $$2=="device" {found=1} END {exit !found}'; then \
		if [ -z "$(EMULATOR)" ] || [ ! -x "$(EMULATOR)" ]; then \
			echo "==> No Android device connected and emulator binary not found."; \
			echo "    Set ANDROID_SDK or install the emulator from Android Studio."; \
			exit 1; \
		fi; \
		avd=$$("$(EMULATOR)" -list-avds 2>/dev/null | grep -v '^INFO' | head -1); \
		if [ -z "$$avd" ]; then \
			echo "==> No AVDs found. Create one in Android Studio > Device Manager."; \
			exit 1; \
		fi; \
		echo "==> No device connected - booting AVD '$$avd'..."; \
		nohup "$(EMULATOR)" -avd "$$avd" -no-snapshot-save >/tmp/emulator-$$avd.log 2>&1 & \
		echo "    (logs: /tmp/emulator-$$avd.log)"; \
		echo "==> Waiting for device..."; \
		adb wait-for-device; \
		echo "==> Waiting for boot completion..."; \
		n=0; \
		until [ "$$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do \
			sleep 2; n=$$((n+2)); \
			if [ $$n -gt 180 ]; then echo "Timed out waiting for emulator boot"; exit 1; fi; \
		done; \
		adb shell input keyevent 82 >/dev/null 2>&1 || true; \
	fi
	@echo "==> Installing $(ANDROID_APK)..."
	@adb install -r $(ANDROID_APK)
	@echo "==> Launching $(ANDROID_PACKAGE)..."
	@adb shell am start -n $(ANDROID_PACKAGE)/.MainActivity
	@echo "✓ App launched on Android device/emulator"

dev-ios:
	@$(MAKE) -C backend ios
	@$(MAKE) -C mobile-app install
	@$(MAKE) -C mobile-app pod-install
	@cd mobile-app && npx expo run:ios

dev-android:
	@$(MAKE) -C backend android
	@$(MAKE) -C mobile-app install
	@cd mobile-app && npx expo run:android

test: test-go test-android test-ios test-js

test-go:
	@echo "==> Running Go tests"
	@$(MAKE) -C backend test
	@$(MAKE) -C backend vet

test-android:
	@echo "==> Running Android unit tests"
	@cd mobile-app/android && ./gradlew :app:testReleaseUnitTest

test-ios:
	@echo "==> Running iOS dedup decide tests"
	@swift mobile-app/ios/tests/NotificationDedupDecideTest.swift

test-js:
	@echo "==> Running JS tests"
	@cd mobile-app && yarn test

clean:
	@$(MAKE) -C backend clean
	@$(MAKE) -C mobile-app clean

clean-all:
	@$(MAKE) -C backend clean-all
	@$(MAKE) -C mobile-app clean

help:
	@echo "Available targets:"
	@echo "  make setup        - Install Go toolchain and Node dependencies"
	@echo "  make ios          - Build Go backend + iOS app"
	@echo "  make android      - Build Go backend + Android app"
	@echo "  make sim-ios      - Build Go + iOS app, install + launch on booted simulator"
	@echo "  make sim-android  - Build Go + Android app, install + launch on running emulator"
	@echo "  make dev-ios      - Build Go backend + start Expo dev client (iOS, hot reload)"
	@echo "  make dev-android  - Build Go backend + start Expo dev client (Android, hot reload)"
	@echo "  make test         - Run Go tests and vet"
	@echo "  make clean        - Clean all build artifacts"
	@echo "  make clean-all    - Clean everything including caches"
	@echo ""
	@echo "All targets run inside 'nix develop' by default."
	@echo "Pass SYSTEM=1 to use system-installed tools instead."
	@echo ""
	@echo "Sub-project targets:"
	@echo "  make -C backend help"
	@echo "  make -C mobile-app help"

endif
