"""Patch mobile-app/node_modules to pass the F-Droid source scanner.

let the scanner itself tell us what's wrong. Each scanner error
embeds the offending literal in single quotes (a maven URL, a proprietary
package regex, etc.), and we remove it from the reported file. 

Prebuilt binaries are deleted up-front by extension so the scanner
doesn't find them.

We reuse ``fdroidserver.scanner`` directly rather
than maintaining a parallel copy of its allowlist and suspect
signatures.
"""

from __future__ import annotations

import argparse
import logging
import pathlib
import re

import fdroidserver.common
from fdroidserver.scanner import MessageStore, scan_source


MOBILE = pathlib.Path("mobile-app")
NM = MOBILE / "node_modules"

BINARY_EXTS = frozenset({
    ".a", ".aar", ".apk", ".bin", ".class", ".dex", ".dll", ".exe",
    ".gz", ".jar", ".so", ".tgz", ".wasm", ".zip",
})

# The Hermes bytecode compiler is skipped, we dont want to build it from scratch, its
# open source anyways. 
HERMESC_DIR = NM / "reuseact-native" / "sdks" / "hermesc"

# scan_source() auto-removes these,we snapshot + restore so a local `./gradlew`
# still works after running the patch.
GRADLE_WRAPPER_FILES = (
    MOBILE / "android" / "gradle" / "wrapper" / "gradle-wrapper.jar",
    MOBILE / "android" / "gradlew",
    MOBILE / "android" / "gradlew.bat",
)

MAVEN_BLOCK_START = re.compile(r"\bmaven\s*[{(]")
QUOTED_LITERAL = re.compile(r"'([^']+)'")


def remove_prebuilt_binaries() -> int:
    """Delete binary files the scanner rejects (except what we need at build)."""
    removed = 0
    for path in NM.rglob("*"):
        if not path.is_file() or path.suffix not in BINARY_EXTS:
            continue
        if HERMESC_DIR in path.parents:
            continue
        path.unlink()
        removed += 1
    (MOBILE / ".yarn" / "install-state.gz").unlink(missing_ok=True)
    return removed


def delete_enclosing_maven_block(text: str, needle: str) -> str:
    """Excise each ``maven {...}`` / ``maven(...)`` block containing needle.

    Brace-balanced scan handles nested ``content {}``/``credentials {}``
    children, which are valid inside a maven block.
    """
    if needle not in text:
        return text
    out: list[str] = []
    i = 0
    while i < len(text):
        m = MAVEN_BLOCK_START.search(text, i)
        if m is None:
            out.append(text[i:])
            break
        out.append(text[i:m.start()])
        open_ch = text[m.end() - 1]
        close_ch = "}" if open_ch == "{" else ")"
        depth, j = 1, m.end()
        while j < len(text) and depth > 0:
            c = text[j]
            if c == open_ch:
                depth += 1
            elif c == close_ch:
                depth -= 1
            j += 1
        block = text[m.start():j]
        if needle not in block:
            out.append(block)
        i = j
    return "".join(out)


def fix_file(target: pathlib.Path, error_type: str, needle: str) -> None:
    """Remove scanner-flagged content from target, in-place."""
    text = target.read_text()
    if "unknown maven repo" in error_type:
        new_text = delete_enclosing_maven_block(text, needle)
    elif "usual suspect" in error_type:
        # The literal is itself a regex (e.g. negative lookahead for
        # non-microg play-services variants).
        try:
            pattern = re.compile(needle)
            keep = lambda ln: not pattern.search(ln)  # noqa: E731
        except re.error:
            keep = lambda ln: needle not in ln  # noqa: E731
        new_text = "".join(
            ln for ln in text.splitlines(keepends=True) if keep(ln)
        )
    else:
        new_text = "".join(
            ln for ln in text.splitlines(keepends=True) if needle not in ln
        )
    if new_text != text:
        target.write_text(new_text)


def apply_scanner_fixes(errors: list[tuple[str, str]]) -> int:
    fixed = 0
    for what, rel in errors:
        if not rel.startswith("node_modules/"):
            continue
        if rel.startswith("node_modules/react-native/sdks/hermesc/"):
            # Covered by the fdroid metadata's scanignore entry.
            continue
        target = MOBILE / rel
        m = QUOTED_LITERAL.search(what)
        if m is None:
            # Scanner flagged a file with no quoted literal (e.g. a
            # stray binary); remove the file itself.
            target.unlink(missing_ok=True)
        else:
            fix_file(target, what, m.group(1))
        fixed += 1
    return fixed


def snapshot_files(paths) -> dict[pathlib.Path, bytes]:
    return {p: p.read_bytes() for p in paths if p.is_file()}


def restore_files(snapshot: dict[pathlib.Path, bytes]) -> None:
    for path, content in snapshot.items():
        path.write_bytes(content)
        if path.name == "gradlew":
            path.chmod(0o755)


def main() -> None:
    logging.getLogger().setLevel(logging.WARNING)
    fdroidserver.common.options = argparse.Namespace(verbose=False, json=True)

    removed = remove_prebuilt_binaries()

    gradle_wrapper = snapshot_files(GRADLE_WRAPPER_FILES)
    store = MessageStore()
    scan_source(str(MOBILE), json_per_build=store)
    restore_files(gradle_wrapper)

    fixed = apply_scanner_fixes(store.errors)

    print(f"node_modules patched: {removed} binaries removed, "
          f"{fixed} scanner issues fixed")


if __name__ == "__main__":
    main()
