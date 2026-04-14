.PHONY: setup ios android test clean clean-all help

setup:
	@$(MAKE) -C backend setup
	@$(MAKE) -C mobile-app install

ios:
	@$(MAKE) -C backend ios
	@$(MAKE) -C mobile-app build-ios

android:
	@$(MAKE) -C backend android
	@$(MAKE) -C mobile-app build-android

test:
	@$(MAKE) -C backend test
	@$(MAKE) -C backend vet

clean:
	@$(MAKE) -C backend clean
	@$(MAKE) -C mobile-app clean

clean-all:
	@$(MAKE) -C backend clean-all
	@$(MAKE) -C mobile-app clean

help:
	@echo "Available targets:"
	@echo "  make setup      - Install Go toolchain and Node dependencies"
	@echo "  make ios        - Build Go backend + iOS app"
	@echo "  make android    - Build Go backend + Android app"
	@echo "  make test       - Run Go tests and vet"
	@echo "  make clean      - Clean all build artifacts"
	@echo "  make clean-all  - Clean everything including caches"
	@echo ""
	@echo "Sub-project targets:"
	@echo "  make -C backend help"
	@echo "  make -C mobile-app help"
