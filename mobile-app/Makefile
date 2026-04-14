YARN ?= yarn
GRADLEW = android/gradlew
ANDROID_APK = android/app/build/outputs/apk/release/app-release.apk

XCODE_WORKSPACE = ios/syncthingapp.xcworkspace
XCODE_SCHEME = syncthingapp
XCODE_DERIVEDDATA = ios/build

.PHONY: install pod-install build-ios build-android run-ios run-android clean-ios clean-android clean help

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
		ONLY_ACTIVE_ARCH=YES
	@echo "✓ iOS app built at $(XCODE_DERIVEDDATA)/Build/Products/Release-iphonesimulator/syncthingapp.app"

build-android: install
	@echo "Building Android Release APK..."
	@chmod +x $(GRADLEW)
	@cd android && ./gradlew assembleRelease --no-daemon
	@echo "✓ Android APK built at $(ANDROID_APK)"

run-ios:
	@npx expo run:ios

run-android:
	@npx expo run:android

clean-ios:
	@echo "Cleaning iOS build..."
	@rm -rf $(XCODE_DERIVEDDATA)
	@echo "✓ iOS clean complete"

clean-android:
	@echo "Cleaning Android build..."
	@cd android && ./gradlew clean --no-daemon 2>/dev/null || true
	@echo "✓ Android clean complete"

clean: clean-ios clean-android

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
