{
  description = "SyncUp dev environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/566acc07c54dc807f91625bb286cb9b321b5f42a";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        # overlay to match mobile-app/android/gradle-wrapper.properties
        gradleOverlay = final: prev: {
          gradle = final.stdenv.mkDerivation rec {
            pname = "gradle";
            version = "9.0";
            src = final.fetchurl {
              url = "https://services.gradle.org/distributions/gradle-${version}-bin.zip";
              sha256 = "0aq78sx4bgwkknyk5y85q1ykdyf72xk02a9x7w8ii9bc55w3vbcg";
            };
            nativeBuildInputs = [ final.unzip final.makeWrapper ];
            dontBuild = true;
            installPhase = ''
              mkdir -p $out/libexec/gradle
              cp -r . $out/libexec/gradle/
              mkdir -p $out/bin
              makeWrapper $out/libexec/gradle/bin/gradle $out/bin/gradle \
                --set JAVA_HOME ${final.jdk17.home}
            '';
          };
        };

        pkgs = import nixpkgs {
          inherit system;
          config.allowUnfree = true;
          overlays = [ gradleOverlay ];
        };
      in
      {
        devShells.default = pkgs.mkShellNoCC {
          buildInputs = with pkgs; [
            go_1_25
            gotools

            # Node
            nodejs_20
            corepack

            # Java (Android builds)
            jdk17
            gradle

            # Utilities
            git
            gnumake
            watchman
          ] ++ pkgs.lib.optionals pkgs.stdenv.isDarwin [
            # iOS (darwin-only)
            cocoapods
            xcbeautify
          ] ++ pkgs.lib.optionals pkgs.stdenv.isLinux [
            # macOS provides clang via Xcode; on Linux we need a C
            # compiler for cgo (gomobile, etc.)
            gcc
          ];

          shellHook = ''
            export GOPATH="$HOME/gopath"
            export PATH="$GOPATH/bin:$PATH"

            # Corepack writes shims; point it somewhere writable (nix store is read-only)
            export COREPACK_HOME="''${COREPACK_HOME:-$HOME/.cache/corepack}"
            mkdir -p "$COREPACK_HOME/bin"
            corepack enable --install-directory "$COREPACK_HOME/bin" 2>/dev/null || true
            export PATH="$COREPACK_HOME/bin:$PATH"

            # macOS system tools must come first on PATH. Nix pulls in GNU
            # coreutils as a transitive dep, and its cp/realpath/etc. break
            # Xcode script phases that expect BSD variants (same class of bug
            # as facebook/react-native#42112).
            export PATH="/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

            # Expose Xcode toolchain so gomobile / xcodebuild can find SDKs.
            if [ -d /Applications/Xcode.app ]; then
              export DEVELOPER_DIR="/Applications/Xcode.app/Contents/Developer"
            fi

            echo ""
            echo "SyncUp dev shell"
            echo "  go:   $(go version | cut -d' ' -f3)"
            echo "  node: $(node --version)"
            echo "  java: $(java -version 2>&1 | head -1)"
            echo ""
            echo "Notes:"
            echo "  - Xcode must be installed via the App Store (not available in Nix)"
            echo "  - Android SDK/NDK: install via Android Studio or sdkmanager"
            echo "  - Run 'make setup' to install gomobile"
            echo ""
          '';
        };
      });
}
