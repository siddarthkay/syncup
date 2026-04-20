GO ?= go
GOPATH ?= $(shell $(GO) env GOPATH)
GOROOT ?= $(shell $(GO) env GOROOT)
GOMOBILE ?= $(GOPATH)/bin/gomobile
GOBIND ?= $(GOPATH)/bin/gobind

ANDROID_OUTPUT = ../mobile-app/android/app/libs/gobridge.aar
IOS_OUTPUT = ../mobile-app/ios/Frameworks/Gobridge.xcframework

# Map ABI names to gomobile targets:
#   arm64-v8a  → android/arm64
#   x86_64     → android/amd64
#   armeabi-v7a→ android/arm
#   x86        → android/386
# Default: arm64 only (covers CI and local dev).
# Release builds pass both: ANDROID_TARGETS=android/arm64,android/amd64
ANDROID_TARGETS ?= android/arm64
ANDROID_API = 23

.PHONY: all setup android ios clean check-go install-gomobile

all: android

setup: check-go install-gomobile
	@echo "Setup complete!"

check-go:
	@echo "Checking Go installation..."
	@if ! command -v $(GO) > /dev/null 2>&1; then \
		echo "Error: Go not found. Please install Go 1.25+"; \
		echo "Visit: https://golang.org/dl/"; \
		exit 1; \
	fi
	@echo "Go found: $(shell $(GO) version)"
	@echo "GOROOT: $(GOROOT)"
	@echo "GOPATH: $(GOPATH)"

install-gomobile:
	@echo "Installing gomobile and gobind..."
	@$(GO) install golang.org/x/mobile/cmd/gomobile@latest
	@$(GO) install golang.org/x/mobile/cmd/gobind@latest
	@echo "Gomobile installed at: $(GOMOBILE)"
	@echo "Gobind installed at: $(GOBIND)"

android: setup
	@echo "Building Android AAR..."
	@mkdir -p $(dir $(ANDROID_OUTPUT))
	@$(GO) get golang.org/x/mobile/bind
	@GOPATH=$(GOPATH) PATH=$(GOPATH)/bin:$(GOROOT)/bin:$$PATH GOFLAGS=-trimpath $(GOMOBILE) bind \
		-trimpath \
		-target=$(ANDROID_TARGETS) \
		-androidapi $(ANDROID_API) \
		-tags noassets \
		-ldflags=-checklinkname=0 \
		-o $(ANDROID_OUTPUT) \
		./
	@echo "✓ Android AAR built successfully at $(ANDROID_OUTPUT)"

ios: setup
	@echo "Building iOS XCFramework..."
	@mkdir -p $(dir $(IOS_OUTPUT))
	@$(GO) get golang.org/x/mobile/bind
	@GOPATH=$(GOPATH) PATH=$(GOPATH)/bin:$(GOROOT)/bin:$$PATH $(GOMOBILE) bind \
		-target=ios \
		-tags noassets \
		-ldflags=-checklinkname=0 \
		-o $(IOS_OUTPUT) \
		./
	@echo "✓ iOS XCFramework built successfully at $(IOS_OUTPUT)"

clean:
	@echo "Cleaning build artifacts..."
	@rm -f $(ANDROID_OUTPUT)
	@rm -rf $(IOS_OUTPUT)
	@echo "✓ Clean complete"

clean-all: clean
	@echo "Cleaning all dependencies and cache..."
	@$(GO) clean -modcache
	@echo "✓ Full clean complete"

test:
	@echo "Running tests..."
	@$(GO) test -tags noassets -v ./...

fmt:
	@echo "Formatting code..."
	@$(GO) fmt ./...

vet:
	@echo "Running go vet..."
	@$(GO) vet -tags noassets ./...

help:
	@echo "Available targets:"
	@echo "  make setup        - Install gomobile toolchain"
	@echo "  make android      - Build Android AAR"
	@echo "  make ios          - Build iOS XCFramework"
	@echo "  make clean        - Remove build artifacts"
	@echo "  make clean-all    - Remove build artifacts and module cache"
	@echo "  make test         - Run Go tests"
	@echo "  make fmt          - Format Go code"
	@echo "  make vet          - Run go vet"
