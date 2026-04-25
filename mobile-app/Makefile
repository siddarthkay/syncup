YARN ?= yarn
GRADLE ?= gradle
ANDROID_APK = android/app/build/outputs/apk/release/app-release.apk

XCODE_WORKSPACE = ios/syncup.xcworkspace
XCODE_SCHEME = syncup
XCODE_DERIVEDDATA = ios/build

.PHONY: install pod-install build-ios archive-ios build-android pr-android release-android run-ios run-android clean-ios clean-android clean help

install:
	@echo "Installing Node dependencies..."
	@$(YARN) install
	@echo "✓ Node dependencies installed"

pod-install:
	@echo "Installing CocoaPods dependencies..."
	@cd ios && pod install
	@echo "✓ CocoaPods installed"

build-ios: install pod-install
	@echo "Building iOS Simulator app..."
	@set -o pipefail && xcodebuild -workspace $(XCODE_WORKSPACE) \
		-scheme $(XCODE_SCHEME) \
		-sdk iphonesimulator \
		-configuration Release \
		-destination 'generic/platform=iOS Simulator' \
		-derivedDataPath $(XCODE_DERIVEDDATA) \
		CODE_SIGNING_ALLOWED=NO \
		ARCHS=arm64 \
		ONLY_ACTIVE_ARCH=YES \
		2>&1 | if command -v xcbeautify >/dev/null 2>&1; then xcbeautify; else cat; fi
	@echo "✓ iOS app built at $(XCODE_DERIVEDDATA)/Build/Products/Release-iphonesimulator/syncup.app"

# Archive + export an iOS .ipa using bare xcodebuild. Inputs (env or make vars):
#   BUNDLE_ID           - Product bundle identifier override
#   PROFILE_NAME        - Provisioning profile name (e.g. "match AdHoc com.x.y")
#   EXPORT_OPTIONS      - Path to an ExportOptions plist (relative to ios/)
#   OUTPUT_NAME         - Final IPA filename (defaults to syncup.ipa)
#   TEAM_ID             - Apple developer team ID
#   MARKETING_VERSION   - CFBundleShortVersionString
#   BUILD_NUMBER        - CFBundleVersion
# Match must have already installed the cert + profile before this runs.
ARCHIVE_PATH = $(XCODE_DERIVEDDATA)/syncup.xcarchive
IPA_DIR      = $(XCODE_DERIVEDDATA)/ipa
OUTPUT_NAME ?= syncup.ipa

archive-ios:
	@if [ -z "$(BUNDLE_ID)" ];        then echo "BUNDLE_ID is required";        exit 1; fi
	@if [ -z "$(PROFILE_NAME)" ];     then echo "PROFILE_NAME is required";     exit 1; fi
	@if [ -z "$(EXPORT_OPTIONS)" ];   then echo "EXPORT_OPTIONS is required";   exit 1; fi
	@if [ -z "$(TEAM_ID)" ];          then echo "TEAM_ID is required";          exit 1; fi
	@if [ -z "$(MARKETING_VERSION)" ];then echo "MARKETING_VERSION is required";exit 1; fi
	@if [ -z "$(BUILD_NUMBER)" ];     then echo "BUILD_NUMBER is required";     exit 1; fi
	@echo "Archiving iOS app ($(BUNDLE_ID))..."
	@# SWIFT_PRECOMPILE_BRIDGING_HEADER=NO sidesteps an Xcode 26 archive-only
	@# bug where the bridging-header PCH compilation fails to load pod
	@# modulemaps that the .pcm step already produced ("module 'X' in
	@# precompiled file ... is not defined in any loaded module map file").
	@# Simulator builds don't go through this PCH path, which is why
	@# `make ios` succeeds on the same runner where `make ios-pr` fails.
	@# Trade-off: bridging header is reparsed per Swift file. On a full
	@# archive (no incrementality) the cost is negligible.
	@set -o pipefail && xcodebuild \
		-workspace $(XCODE_WORKSPACE) \
		-scheme $(XCODE_SCHEME) \
		-configuration Release \
		-destination 'generic/platform=iOS' \
		-derivedDataPath $(XCODE_DERIVEDDATA) \
		-archivePath $(ARCHIVE_PATH) \
		PRODUCT_BUNDLE_IDENTIFIER=$(BUNDLE_ID) \
		MARKETING_VERSION=$(MARKETING_VERSION) \
		CURRENT_PROJECT_VERSION=$(BUILD_NUMBER) \
		CODE_SIGN_STYLE=Manual \
		DEVELOPMENT_TEAM=$(TEAM_ID) \
		PROVISIONING_PROFILE_SPECIFIER="$(PROFILE_NAME)" \
		CODE_SIGN_IDENTITY="Apple Distribution" \
		SWIFT_PRECOMPILE_BRIDGING_HEADER=NO \
		clean archive \
		2>&1 | if command -v xcbeautify >/dev/null 2>&1; then xcbeautify; else cat; fi
	@echo "Exporting IPA via $(EXPORT_OPTIONS)..."
	@mkdir -p $(IPA_DIR)
	@set -o pipefail && xcodebuild \
		-exportArchive \
		-archivePath $(ARCHIVE_PATH) \
		-exportPath $(IPA_DIR) \
		-exportOptionsPlist ios/$(EXPORT_OPTIONS) \
		2>&1 | if command -v xcbeautify >/dev/null 2>&1; then xcbeautify; else cat; fi
	@if [ -f "$(IPA_DIR)/syncup.ipa" ] && [ "$(OUTPUT_NAME)" != "syncup.ipa" ]; then \
		mv "$(IPA_DIR)/syncup.ipa" "$(IPA_DIR)/$(OUTPUT_NAME)"; \
	fi
	@echo "✓ IPA at $(IPA_DIR)/$(OUTPUT_NAME)"

VERSION_NAME ?= $(shell cat ../VERSION 2>/dev/null | tr -d '[:space:]')

build-android: install
	@echo "Building Android Release APK..."
	@cd android && $(GRADLE) assembleRelease --no-daemon \
		$(if $(VERSION_NAME),-PVERSION_NAME=$(VERSION_NAME))
	@echo "✓ Android APK built at $(ANDROID_APK)"

release-android: install
	@echo "Building Android Release APK ($(ANDROID_ABI))..."
	@cd android && $(GRADLE) assembleRelease --no-daemon \
		-PVERSION_NAME=$(VERSION_NAME) \
		-PreactNativeArchitectures=$(ANDROID_ABI)
	@echo "✓ Android release APK built"

# PR builds: release-signed APK with a .pr applicationId suffix so it sits
# alongside the production app on a tester's device.
pr-android: install
	@echo "Building Android PR APK (applicationId suffix .pr)..."
	@cd android && $(GRADLE) assembleRelease --no-daemon \
		-PVERSION_NAME=$(VERSION_NAME) \
		-PapplicationIdSuffix=.pr
	@echo "✓ Android PR APK built at $(ANDROID_APK)"

run-ios:
	@npx expo run:ios

run-android:
	@npx expo run:android

clean-ios:
	@echo "Cleaning iOS build..."
	@rm -rf $(XCODE_DERIVEDDATA) ios/Pods
	@echo "✓ iOS clean complete"

clean-android:
	@echo "Cleaning Android build..."
	@rm -rf android/app/build android/build android/.gradle
	@echo "✓ Android clean complete"

clean-node:
	@echo "Cleaning node_modules..."
	@rm -rf node_modules
	@echo "✓ node_modules clean complete"

clean: clean-ios clean-android clean-node

help:
	@echo "Available targets:"
	@echo "  make install        - Install Node dependencies"
	@echo "  make pod-install    - Install CocoaPods dependencies"
	@echo "  make build-ios      - Build iOS Simulator app"
	@echo "  make build-android  - Build Android Release APK"
	@echo "  make run-ios        - Start iOS dev build via Expo"
	@echo "  make run-android    - Start Android dev build via Expo"
	@echo "  make clean-ios      - Clean iOS build artifacts"
	@echo "  make clean-android  - Clean Android build artifacts"
	@echo "  make clean          - Clean all build artifacts"
