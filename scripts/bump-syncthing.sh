#!/usr/bin/env bash
# Pins the embedded syncthing Go module to a specific version or commit.
#
# Usage:
#   scripts/bump-syncthing.sh v1.30.0
#   scripts/bump-syncthing.sh v1.30.0-rc.1
#   scripts/bump-syncthing.sh 2cfb76559b7b          # short commit SHA
#   scripts/bump-syncthing.sh --dry-run v1.30.0     # show what would change
#
# After bumping, rebuild: make ios && make android
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"
MODULE="github.com/syncthing/syncthing"

usage() {
    cat <<EOF
Usage: $(basename "$0") [--dry-run] <tag-or-sha>

Updates backend/go.mod to pin ${MODULE} to the given version, then runs
go mod tidy to refresh backend/go.sum and any transitive deps.

Arguments:
  <tag-or-sha>   A syncthing release tag (e.g. v1.30.0), a pre-release tag
                 (e.g. v1.30.0-rc.1), or a commit SHA (short or long).

Options:
  --dry-run      Print the proposed changes without modifying go.mod or go.sum.
  -h, --help     Show this message.
EOF
}

DRY_RUN=0
VERSION=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        -h|--help)
            usage
            exit 0
            ;;
        --dry-run)
            DRY_RUN=1
            shift
            ;;
        -*)
            echo "unknown flag: $1" >&2
            usage >&2
            exit 2
            ;;
        *)
            if [[ -n "$VERSION" ]]; then
                echo "more than one version given" >&2
                exit 2
            fi
            VERSION="$1"
            shift
            ;;
    esac
done

if [[ -z "$VERSION" ]]; then
    usage >&2
    exit 2
fi

if [[ ! -f "$BACKEND_DIR/go.mod" ]]; then
    echo "could not find $BACKEND_DIR/go.mod" >&2
    exit 1
fi

if ! command -v go >/dev/null 2>&1; then
    echo "go not found in PATH" >&2
    exit 1
fi

echo "==> repo:     $REPO_ROOT"
echo "==> backend:  $BACKEND_DIR"
echo "==> module:   $MODULE"
echo "==> target:   $VERSION"
echo "==> dry run:  $DRY_RUN"

CURRENT=$(cd "$BACKEND_DIR" && go list -m -f '{{.Version}}' "$MODULE" 2>/dev/null || true)
if [[ -n "$CURRENT" ]]; then
    echo "==> current:  $CURRENT"
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "==> would run: go get $MODULE@$VERSION && go mod tidy"
    exit 0
fi

pushd "$BACKEND_DIR" >/dev/null

echo "==> go get $MODULE@$VERSION"
go get "$MODULE@$VERSION"

echo "==> go mod tidy"
go mod tidy

popd >/dev/null

NEW=$(cd "$BACKEND_DIR" && go list -m -f '{{.Version}}' "$MODULE" 2>/dev/null || true)

echo ""
echo "==> done. $MODULE pinned to: $NEW"
echo ""
echo "Next steps:"
echo "  1. git diff backend/go.mod backend/go.sum"
echo "  2. make ios && make android        # rebuild frameworks"
echo "  3. make sim-ios && make sim-android # sanity check"
echo "  4. git add backend/go.mod backend/go.sum && git commit"
