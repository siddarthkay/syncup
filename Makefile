# By default every target runs inside `nix develop` so you don't need
# to install Go, Node, JDK, etc. yourself. Pass SYSTEM=1 to skip nix
# and use whatever is on your PATH:
#
#   make sim-ios              # runs inside nix (default)
#   make sim-ios SYSTEM=1     # uses system-installed tools

_ALL_TARGETS := setup ios android release-android pr-android ios-certs ios-certs-init ios-pr ios-release appdrop-upload patch-node-modules sim-ios sim-android dev-ios dev-android test test-go test-android test-ios test-js clean clean-all help

# Auto-load fastlane secrets from .env.fastlane (gitignored) so local dev doesn't
# need to `export` each time. CI provides these via GitHub secrets; .env.fastlane
# won't exist there, so -include is a no-op. Must live outside the trampoline
# branch so vars propagate into `nix develop --command`.
-include .env.fastlane
export

.DEFAULT_GOAL := help

ifeq ($(SYSTEM)$(IN_NIX_SHELL),)
# ── Nix trampoline ──────────────────────────────────────────────────
# Re-exec the requested target inside nix develop. The inner make
# receives SYSTEM=1 so it falls into the else branch below.
# --no-print-directory suppresses GNU make 4.x's "Entering directory" /
# "Leaving directory" lines which would otherwise pollute stdout when
# callers capture it (e.g. `OUT=$(make appdrop-upload)` parsing JSON).
.PHONY: $(_ALL_TARGETS)
$(_ALL_TARGETS):
	@nix develop --command $(MAKE) --no-print-directory $@ SYSTEM=1
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

# PR Android build: .pr applicationId suffix, release-signed.
pr-android:
	@$(MAKE) -C backend android
	@$(MAKE) -C mobile-app pr-android \
		VERSION_NAME=$(shell cat VERSION 2>/dev/null | tr -d '[:space:]')

# One-shot: create + push certs/profiles to the match repo. Run this once,
# on your Mac, after filling in .env.fastlane. Idempotent.
ios-certs-init: _check-fastlane-env
	@fastlane init_certs

# Sync iOS certs + profiles from the match git repo. Read-only on CI, read/write locally.
ios-certs: _check-fastlane-env
	@fastlane sync_certs

# Sanity-check the fastlane env before invoking a lane. Points at the .env.fastlane
# template on miss so a fresh clone knows where to start.
_check-fastlane-env:
	@missing=""; \
	for v in APP_STORE_CONNECT_KEY_ID APP_STORE_CONNECT_ISSUER_ID APPLE_TEAM_ID MATCH_GIT_URL MATCH_PASSWORD; do \
		if [ -z "$$(eval echo \$$$$v)" ]; then missing="$$missing $$v"; fi; \
	done; \
	if [ -z "$$APP_STORE_CONNECT_KEY_P8" ] && [ -z "$$APP_STORE_CONNECT_KEY_P8_PATH" ]; then \
		missing="$$missing APP_STORE_CONNECT_KEY_P8_PATH (or APP_STORE_CONNECT_KEY_P8)"; \
	fi; \
	if [ -n "$$missing" ]; then \
		echo "==> Missing fastlane env vars:$$missing"; \
		echo "    Copy .env.fastlane.example to .env.fastlane and fill it in."; \
		echo "    (it's gitignored, and Makefile auto-loads it on every target)"; \
		exit 1; \
	fi

# Build signed .pr IPA for ad-hoc distribution (appdrop.sh).
# Pipeline: gomobile bind → yarn install → pod install → match (fastlane) →
#           xcodebuild archive → xcodebuild -exportArchive.
# Requires: fastlane env vars set (.env.fastlane locally or secrets in CI).
ios-pr:
	@$(MAKE) -C backend ios
	@$(MAKE) -C mobile-app install
	@$(MAKE) -C mobile-app pod-install
	@fastlane match_pr
	@$(MAKE) -C mobile-app archive-ios \
		BUNDLE_ID=com.siddarthkay.syncup.pr \
		PROFILE_NAME="match AdHoc com.siddarthkay.syncup.pr" \
		EXPORT_OPTIONS=ExportOptions-AdHoc.plist \
		OUTPUT_NAME=syncup-pr.ipa \
		TEAM_ID="$$APPLE_TEAM_ID" \
		MARKETING_VERSION=$(shell cat VERSION 2>/dev/null | tr -d '[:space:]') \
		BUILD_NUMBER=$${BUILD_NUMBER:-$$(date +%Y%m%d%H%M)}

# Upload an IPA or APK to appdrop.sh and print the install link to stdout.
# Inputs (env or make vars):
#   APPDROP_FILE     - required, path to the .ipa/.apk
#   APPDROP_PROJECT  - project bucket on appdrop (e.g. syncup-pr)
#   APPDROP_NAME     - human-readable build name
#   APPDROP_NOTES    - release notes shown on the install page
#   APPDROP_EXPIRY   - days until the link expires (default 14)
#   APPDROP_VERSION  - npm spec to install; defaults to "latest"
# Reads APPDROP_URL/APPDROP_TOKEN from env (CI provides them; locally export them).
APPDROP_VERSION ?= latest
# Resolve "latest" (or whatever spec) to a concrete version once, so the cache
# directory is keyed on the actual version. Bumping appdrop-cli on npm
# auto-invalidates the cache without needing a manual rm.
APPDROP_RESOLVED := $(shell npm view appdrop-cli@$(APPDROP_VERSION) version 2>/dev/null)
APPDROP_CACHE    := $(HOME)/.cache/appdrop-cli/$(APPDROP_RESOLVED)
APPDROP_BIN      := $(APPDROP_CACHE)/node_modules/.bin/appdrop
APPDROP_EXPIRY   ?= 14

appdrop-upload:
	@if [ -z "$(APPDROP_FILE)" ]; then echo "==> APPDROP_FILE is required" >&2; exit 1; fi
	@if [ ! -f "$(APPDROP_FILE)" ]; then echo "==> $(APPDROP_FILE) not found" >&2; exit 1; fi
	@if [ -z "$(APPDROP_RESOLVED)" ]; then echo "==> npm view appdrop-cli@$(APPDROP_VERSION) failed; check network/auth" >&2; exit 1; fi
	@if [ ! -x "$(APPDROP_BIN)" ]; then \
		echo "==> Installing appdrop-cli@$(APPDROP_RESOLVED) into $(APPDROP_CACHE)..." >&2; \
		mkdir -p "$(APPDROP_CACHE)"; \
		printf '{"name":"appdrop-cli-runner","private":true,"version":"0.0.0"}\n' > "$(APPDROP_CACHE)/package.json"; \
		npm install --prefix "$(APPDROP_CACHE)" --no-save --no-audit --no-fund --no-package-lock --loglevel=error appdrop-cli@$(APPDROP_RESOLVED) >&2; \
		if [ ! -x "$(APPDROP_BIN)" ]; then \
			echo "==> npm install completed but $(APPDROP_BIN) is missing." >&2; \
			echo "    Check ~/.npmrc for a prefix= override on this runner." >&2; \
			echo "    Listing $(APPDROP_CACHE):" >&2; ls -la "$(APPDROP_CACHE)" >&2 || true; \
			exit 1; \
		fi; \
	fi
	@# Connectivity probe: surface DNS/network failures with detail before the CLI's
	@# opaque "fetch failed". curl exits 6 on DNS, 7 on connect refused, 28 on timeout.
	@if [ -z "$$APPDROP_URL" ]; then echo "==> APPDROP_URL is not set" >&2; exit 1; fi
	@echo "==> Probing $$APPDROP_URL/healthz ..." >&2
	@if ! curl -sSfL --connect-timeout 5 --max-time 15 -o /dev/null -w "    HTTP %{http_code} in %{time_total}s\n" "$$APPDROP_URL/healthz" >&2; then \
		echo "==> Connectivity check failed. Verify APPDROP_URL secret is correct and the runner can reach it." >&2; \
		exit 1; \
	fi
	@"$(APPDROP_BIN)" upload "$(APPDROP_FILE)" \
		$(if $(APPDROP_PROJECT),--project "$(APPDROP_PROJECT)") \
		$(if $(APPDROP_NAME),--name "$(APPDROP_NAME)") \
		$(if $(APPDROP_NOTES),--notes "$(APPDROP_NOTES)") \
		--expiry $(APPDROP_EXPIRY) \
		--json

# Build App Store IPA and upload to TestFlight.
ios-release:
	@$(MAKE) -C backend ios
	@$(MAKE) -C mobile-app install
	@$(MAKE) -C mobile-app pod-install
	@fastlane match_release
	@$(MAKE) -C mobile-app archive-ios \
		BUNDLE_ID=com.siddarthkay.syncup \
		PROFILE_NAME="match AppStore com.siddarthkay.syncup" \
		EXPORT_OPTIONS=ExportOptions-AppStore.plist \
		OUTPUT_NAME=syncup.ipa \
		TEAM_ID="$$APPLE_TEAM_ID" \
		MARKETING_VERSION=$(shell cat VERSION 2>/dev/null | tr -d '[:space:]') \
		BUILD_NUMBER=$${BUILD_NUMBER:-$$(date +%Y%m%d%H%M)}
	@fastlane upload_release

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
	@echo "  make ios          - Build Go backend + iOS simulator app"
	@echo "  make ios-certs-init - One-shot: create + push match certs (run once per new bundle ID)"
	@echo "  make ios-certs    - Sync iOS certs/profiles via fastlane match"
	@echo "  make ios-pr       - Build signed .pr IPA for appdrop.sh distribution"
	@echo "  make ios-release  - Build App Store IPA and upload to TestFlight"
	@echo "  make android      - Build Go backend + Android app"
	@echo "  make pr-android   - Build Android APK with .pr applicationId suffix"
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
