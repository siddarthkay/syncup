# Contributing to SyncUp

Thanks for your interest in contributing. This guide covers the dev
setup and workflow.

## Prerequisites

Every `make` target runs inside a Nix shell automatically, so the only
things you need installed are:

- **[Nix](https://nixos.org/download/)** (with flakes enabled)
- **Xcode 16+** (iOS, macOS only — not available through Nix)
- **Android SDK** with **NDK r26** (Android — install via Android Studio)

If you prefer managing all tools yourself, pass `SYSTEM=1` to any make
target to bypass Nix. See the [Build](README.md#build) section in the
README for details.

## Dev workflow

1. Fork the repo and clone your fork.
2. Create a feature branch off `master`.
3. Start a dev build with hot reload:

```bash
make dev-ios           # or: make dev-android
```

   JS/TS changes reload instantly. Go changes require restarting the
   dev target.

4. Run checks before pushing:

```bash
cd mobile-app
yarn lint
yarn typecheck
yarn test
```

```bash
cd backend
go vet -tags noassets ./...
go test -tags noassets ./...
```

5. Open a PR against `master`. CI will run lint, typecheck, go vet,
   and an iOS release build.

## Code style

- TypeScript: the repo uses ESLint + Prettier — `yarn lint:fix`
  auto-formats.
- Go: `gofmt` / `go fmt`.
- No special commit message format is enforced. Keep messages concise
  and describe _why_, not _what_.

## Architecture overview

See the [Architecture](README.md#architecture) section in the README.
The short version: React Native UI talks to an embedded Syncthing
daemon over its REST API at `127.0.0.1:8384`. A TurboModule
(Swift on iOS, Kotlin on Android) manages daemon lifecycle. The Go
side (`backend/wrapper.go`) wraps `syncthing/lib/syncthing` and is
bound via `gomobile`.

## Reporting issues

Use the [issue templates](https://github.com/siddarthkay/syncthing-app/issues/new/choose)
for bug reports and feature requests.
