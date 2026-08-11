# backend/patches

Changes we carry on top of upstream syncthing.

`backend/syncthing-fork/` is **generated**, not tracked: `scripts/gen-assets.sh`
deletes it and re-mirrors the pinned module from the Go module cache on every
`make -C backend ios` / `android`. Edits made directly in that tree are lost at
the next build — silently, since the build still succeeds.

Every `*.patch` in this directory is applied to the fresh mirror by
`apply_patches()` in `scripts/gen-assets.sh`, with `patch -p1`, and a patch that
fails to apply fails the build.

## Adding or refreshing a patch

1. Edit the files under `backend/syncthing-fork/` and get them building
   (`cd backend/syncthing-fork && go build ./... && go test ./<pkg>/...`).
2. Find the pristine copy of the pinned version:

   ```sh
   cd backend
   VERSION=$(awk '$2=="github.com/syncthing/syncthing"{print $3}' go.mod)
   MOD=$(go mod download -json "github.com/syncthing/syncthing@$VERSION" | python3 -c 'import json,sys;print(json.load(sys.stdin)["Dir"])')
   ```

3. Diff each touched file into the patch:

   ```sh
   for f in internal/slogutil/recorder.go lib/api/api.go; do
     diff -u --label "a/$f" --label "b/$f" "$MOD/$f" "syncthing-fork/$f"
   done > patches/0001-my-change.patch
   ```

4. Verify from a clean slate: `rm -rf backend/syncthing-fork && make -C backend gen-assets`.

Bumping the syncthing pin in `go.mod` means re-checking every patch here.

## Current patches

- `0001-bigger-log-buffer.patch` — raises the in-memory log recorder cap to
  50k lines (~10 MB) so the app's log export covers a whole debugging session,
  adds `?limit=N` to `/rest/system/log` so the live log view can ask for just
  the tail of that buffer, and includes the level in `/rest/system/log.txt`
  (the endpoint the app streams to a file when a user exports their log).
