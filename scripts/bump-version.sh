#!/usr/bin/env bash
# Bumps the user-facing app version on iOS and Android in lock-step.
#
# Touches:
#   mobile-app/ios/syncup/Info.plist
#     CFBundleShortVersionString  → semver string
#     CFBundleVersion             → monotonically incremented build number
#
#   mobile-app/android/app/build.gradle
#     versionName                 → semver string
#     versionCode                 → monotonically incremented build number
#
# Usage:
#   scripts/bump-version.sh patch        # 1.0.3 → 1.0.4
#   scripts/bump-version.sh minor        # 1.0.3 → 1.1.0
#   scripts/bump-version.sh major        # 1.0.3 → 2.0.0
#   scripts/bump-version.sh 1.2.3        # explicit
#   scripts/bump-version.sh --dry-run minor
#
# After bumping:
#   git diff
#   make ios && make android
#   git add ... && git commit -m "release: vX.Y.Z"
#   git tag vX.Y.Z
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INFO_PLIST="$REPO_ROOT/mobile-app/ios/syncup/Info.plist"
BUILD_GRADLE="$REPO_ROOT/mobile-app/android/app/build.gradle"

usage() {
    cat <<EOF
Usage: $(basename "$0") [--dry-run] (major|minor|patch|<x.y.z>)

Bumps the user-facing app version on iOS and Android in lock-step.

Arguments:
  major        bump the major version (1.2.3 → 2.0.0)
  minor        bump the minor version (1.2.3 → 1.3.0)
  patch        bump the patch version (1.2.3 → 1.2.4)
  <x.y.z>      set the version explicitly (must be a valid semver)

Options:
  --dry-run    print the proposed changes without writing files
  -h, --help   show this message
EOF
}

DRY_RUN=0
ACTION=""

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
            if [[ -n "$ACTION" ]]; then
                echo "more than one action given" >&2
                exit 2
            fi
            ACTION="$1"
            shift
            ;;
    esac
done

if [[ -z "$ACTION" ]]; then
    usage >&2
    exit 2
fi

if [[ ! -f "$INFO_PLIST" ]]; then
    echo "could not find $INFO_PLIST" >&2
    exit 1
fi
if [[ ! -f "$BUILD_GRADLE" ]]; then
    echo "could not find $BUILD_GRADLE" >&2
    exit 1
fi

# Read current values. Use sed's `n` (next line) to advance from the <key>
# line to the <string> value line, then capture. Portable across BSD + GNU sed.
current_ios=$(sed -n '/<key>CFBundleShortVersionString<\/key>/{n;s|.*<string>\(.*\)</string>.*|\1|p;}' "$INFO_PLIST" | head -1)
current_ios_build=$(sed -n '/<key>CFBundleVersion<\/key>/{n;s|.*<string>\(.*\)</string>.*|\1|p;}' "$INFO_PLIST" | head -1)

current_android=$(grep -oE 'versionName "[^"]+"' "$BUILD_GRADLE" | head -1 | sed -E 's/versionName "([^"]+)"/\1/')
current_android_code=$(grep -oE 'versionCode [0-9]+' "$BUILD_GRADLE" | head -1 | awk '{print $2}')

if [[ -z "$current_ios" || -z "$current_android" ]]; then
    echo "could not parse current version from one of the manifests" >&2
    echo "  ios:     '$current_ios'" >&2
    echo "  android: '$current_android'" >&2
    exit 1
fi

if [[ "$current_ios" != "$current_android" ]]; then
    echo "warning: iOS ($current_ios) and Android ($current_android) versions differ" >&2
    echo "         continuing - both will be set to the new version" >&2
fi

# Compute the new semver string.
case "$ACTION" in
    major|minor|patch)
        if ! [[ "$current_ios" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
            echo "current version $current_ios is not semver, can't bump" >&2
            exit 1
        fi
        major=${BASH_REMATCH[1]}
        minor=${BASH_REMATCH[2]}
        patch=${BASH_REMATCH[3]}
        case "$ACTION" in
            major) major=$((major + 1)); minor=0; patch=0 ;;
            minor) minor=$((minor + 1)); patch=0 ;;
            patch) patch=$((patch + 1)) ;;
        esac
        new_version="$major.$minor.$patch"
        ;;
    *)
        if ! [[ "$ACTION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
            echo "'$ACTION' is not 'major', 'minor', 'patch', or a valid x.y.z" >&2
            exit 2
        fi
        new_version="$ACTION"
        ;;
esac

# Build numbers always monotonically increment by 1.
new_ios_build=$((current_ios_build + 1))
new_android_code=$((current_android_code + 1))

echo "==> repo:     $REPO_ROOT"
echo "==> ios:      $current_ios (build $current_ios_build) → $new_version (build $new_ios_build)"
echo "==> android:  $current_android (code $current_android_code) → $new_version (code $new_android_code)"
echo "==> dry run:  $DRY_RUN"

if [[ "$DRY_RUN" -eq 1 ]]; then
    exit 0
fi

# Write iOS Info.plist. We use sed with a 1-off context anchor so we don't
# accidentally rewrite an unrelated <string> tag.
sed_inplace() {
    if [[ "$OSTYPE" == darwin* ]]; then
        sed -i '' "$@"
    else
        sed -i "$@"
    fi
}

# CFBundleShortVersionString
sed_inplace -E "/<key>CFBundleShortVersionString<\/key>/{N;s|<string>[^<]*</string>|<string>$new_version</string>|;}" "$INFO_PLIST"
# CFBundleVersion
sed_inplace -E "/<key>CFBundleVersion<\/key>/{N;s|<string>[^<]*</string>|<string>$new_ios_build</string>|;}" "$INFO_PLIST"

# Android build.gradle
sed_inplace -E "s|versionName \"[^\"]+\"|versionName \"$new_version\"|" "$BUILD_GRADLE"
sed_inplace -E "s|versionCode [0-9]+|versionCode $new_android_code|" "$BUILD_GRADLE"

echo ""
echo "==> done."
echo ""
echo "Next steps:"
echo "  1. git diff mobile-app/ios/syncup/Info.plist mobile-app/android/app/build.gradle"
echo "  2. make ios && make android"
echo "  3. git add ... && git commit -m \"release: v$new_version\""
echo "  4. git tag v$new_version"
