#!/usr/bin/env bash
set -euo pipefail

GO="${GO:-go}"
SYNCTHING_FORK="${SYNCTHING_FORK:-syncthing-fork}"
GUI_ASSETS_EPOCH=1577836800

MODULE="github.com/syncthing/syncthing"
SYNCTHING_REPO="https://github.com/syncthing/syncthing.git"
SYNCTHING_API="https://api.github.com/repos/syncthing/syncthing"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"
PATCH_DIR="$BACKEND_DIR/patches"
WORK_TMP=""

log()     { echo "==> $*"; }
die()     { echo "$*" >&2; exit 1; }
cleanup() { [[ -z "$WORK_TMP" ]] || rm -rf "$WORK_TMP"; }

require_tools() {
    local tool
    for tool in "$GO" git curl awk patch; do
        command -v "$tool" >/dev/null 2>&1 || die "required tool not found: $tool"
    done
}

read_version() {
    awk -v m="$MODULE" \
        '$1==m && $2~/^v/ {print $2; exit} $2==m && $3~/^v/ {print $3; exit}' go.mod
}

module_dir() {
    local json
    json="$("$GO" mod download -json "$MODULE@$1")"
    [[ "$json" =~ \"Dir\":[[:space:]]*\"([^\"]+)\" ]] || die "cannot read module dir"
    echo "${BASH_REMATCH[1]}"
}

resolve_commit() {
    local short json
    short="${1##*-}"
    json="$(curl -fsSL -m30 "$SYNCTHING_API/commits/$short")"
    [[ "$json" =~ \"sha\":[[:space:]]*\"([0-9a-f]{40})\" ]] || die "cannot read commit sha"
    [[ "${BASH_REMATCH[1]}" == "$short"* ]] || die "commit ${BASH_REMATCH[1]} does not match pin $short"
    echo "${BASH_REMATCH[1]}"
}

mirror_module() {
    rm -rf "$SYNCTHING_FORK"
    cp -R "$1" "$SYNCTHING_FORK"
    chmod -R u+w "$SYNCTHING_FORK"
}

overlay_gui() {
    WORK_TMP="$(mktemp -d)"
    git -C "$WORK_TMP" init -q
    git -C "$WORK_TMP" remote add origin "$SYNCTHING_REPO"
    git -C "$WORK_TMP" fetch -q --depth 1 origin "$1"
    git -C "$WORK_TMP" checkout -q "$1" -- gui
    rm -rf "$SYNCTHING_FORK/gui"
    cp -R "$WORK_TMP/gui" "$SYNCTHING_FORK/gui"
    chmod -R u+w "$SYNCTHING_FORK/gui"
    [[ -f "$SYNCTHING_FORK/gui/default/vendor/angular/angular.js" ]] \
        || die "vendored GUI libs missing after fetch"
}

apply_patches() {
    local patch found=0
    for patch in "$PATCH_DIR"/*.patch; do
        [[ -f "$patch" ]] || continue
        found=$((found + 1))
        patch -p1 -d "$SYNCTHING_FORK" --forward --no-backup-if-mismatch < "$patch" \
            || die "failed to apply $(basename "$patch")"
        log "applied $(basename "$patch")"
    done
    [[ "$found" -gt 0 ]] || log "no patches in $PATCH_DIR"
}

generate_assets() {
    local out="$SYNCTHING_FORK/lib/api/auto/gui.files.go"
    SOURCE_DATE_EPOCH="$GUI_ASSETS_EPOCH" \
        "$GO" -C "$SYNCTHING_FORK" run script/genassets.go -o lib/api/auto/gui.files.go gui
    { printf '//go:build !noassets\n\n'; cat "$out"; } > "$out.tmp" && mv "$out.tmp" "$out"
}

trap cleanup EXIT
cd "$BACKEND_DIR"

require_tools
version="$(read_version)"
[[ -n "$version" ]] || die "could not find $MODULE in go.mod"
log "syncthing $version"
mirror_module "$(module_dir "$version")"
log "mirrored module"
overlay_gui "$(resolve_commit "$version")"
log "overlaid complete gui"
apply_patches
generate_assets
log "generated $SYNCTHING_FORK/lib/api/auto/gui.files.go"
