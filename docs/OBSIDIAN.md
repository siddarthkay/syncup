# Syncing Obsidian vaults with SyncUp

SyncUp lets you sync an Obsidian vault between devices over Syncthing,
end-to-end encrypted, peer-to-peer, no third party in the path. If you
were considering Obsidian Sync ($96/yr) just for cross-device note
syncing, this is the free alternative.

This guide covers the setup that avoids the two failure modes Obsidian
users hit with naive Syncthing setups:

1. **Sync conflicts on `workspace.json`.** Obsidian rewrites this file
   on every pane focus change. Two devices editing it at once produce
   `.sync-conflict-*` files until you exclude it.
2. **Missed edits because the rescan interval is too long.** Syncthing's
   default rescan is once an hour. Notes get edited every few minutes.

SyncUp's "Obsidian vault" preset handles both.

---

## Quick start

### On the desktop holding your vault

1. Install Syncthing. Add the vault folder
   (e.g. `~/Documents/MyVault`).
2. Show the device ID (in the Syncthing web GUI: Actions → Show ID).

### On your phone

1. Install SyncUp.
2. **Devices tab → +** → either scan the desktop's QR code or paste its
   device ID.
3. **Folders tab → +**.
4. Pick a destination on your phone (or leave the default app-storage
   path).
5. Under **Folder kind**, tap **Obsidian vault**.
6. Under **Share with**, pick the desktop.
7. **Add**.

Back on the desktop, accept the incoming folder offer. SyncUp's "Obsidian
vault" preset has already configured:

- 30-second rescan interval (instead of one hour).
- File system watcher on (so changes propagate as you save them).
- An `.stignore` that excludes Obsidian's per-device workspace files
  and plugin caches.

### On iOS specifically

After the folder finishes syncing, open Obsidian on the phone and choose
**Open folder as vault**. Pick the SyncUp folder, it will be visible in
the Files app under "On My iPhone → SyncUp". Obsidian will treat it as a
vault and pick up all your notes.

### On Android specifically

If you used SAF (Storage Access Framework) to point at a folder outside
the app sandbox, that folder should already be visible to Obsidian's
"Open folder as vault" picker. If it isn't, point the SyncUp folder at
`Documents/Obsidian/<vault-name>` instead, Obsidian's Android picker is
narrower than its iOS one.

---

## Already have a folder synced? Apply the preset retroactively

If you set up the folder before the preset existed, or skipped it during
creation:

1. **Folders tab** → tap the folder.
2. If SyncUp detects an `.obsidian/` directory in the folder root, you'll
   see a banner: **"Obsidian vault detected"**. Tap **Apply**.
3. The preset is applied: rescan interval, watcher, and ignore lines
   and the banner disappears.

Existing custom ignore lines are kept; preset lines are appended.

---

## Ignore presets explained

Three levels are available in **Folder → Ignore patterns → Presets**:

### Minimal
Just the workspace state files Obsidian rewrites constantly:

```
.obsidian/workspace
.obsidian/workspace.json
.obsidian/workspace-mobile.json
.obsidian/cache
.obsidian/.metadata.json
.trash/
.DS_Store
Thumbs.db
```

Pick this if you want plugin settings and theme preferences to sync
across devices.

### Recommended *(default for the "Obsidian vault" folder kind)*
The minimal set + plugin caches and the community-plugins list:

```
.obsidian/plugins/*/data.json
.obsidian/plugins/*/.cache/
.obsidian/community-plugins.json
```

Theme stays in sync. Each device decides which community plugins to
install. This is the right tradeoff for most users.

### Strict
Excludes the entire `.obsidian/` directory. Each device has its own UI
prefs, plugins, and theme; only the notes themselves cross devices.

```
.obsidian/
.trash/
.DS_Store
Thumbs.db
```

Pick this if mobile and desktop have very different setups (different
theme on phone, fewer plugins, etc.) and you don't want them fighting.

---

## Resolving conflicts

If you edit the same note on two devices while they're offline, Syncthing
saves both versions. The losing version becomes
`<filename>.sync-conflict-<timestamp>-<deviceID>.md`.

In SyncUp:

1. Open the folder.
2. Tap **Conflicts** if any are detected.
3. Pick which copy to keep, or open both in Obsidian and merge by hand
   (the conflict file is a regular `.md`).

A markdown-aware 3-way merge is on the roadmap.

---

## Common gotchas

### "Notes from yesterday haven't synced"

iOS background sync is opportunistic, Apple decides when SyncUp gets to
run, not us. If your phone has been in your pocket all day, the app may
not have run at all. Open SyncUp once and it'll catch up.

If this happens often, run a desktop Syncthing node that stays online
24/7, your phone will reconcile against it whenever it wakes up,
instead of needing both phones online simultaneously.

### "I see `workspace.json.sync-conflict-*` files everywhere"

You're missing the preset. Apply it (see "Already have a folder synced?"
above) and then delete the existing conflict files. New conflicts will
stop appearing.

### "Obsidian on my phone says the vault is empty"

Wait for the initial sync to finish, SyncUp's status screen shows
progress. A vault of 1000 notes typically takes under a minute on local
WiFi. If it's stuck, check the Syncthing web GUI on the desktop: the
device should show as "connected" and the folder as "syncing" or "up to
date".

### "Plugins aren't loading on the phone"

Some Obsidian plugins are desktop-only. The plugin manifest will sync
but the plugin itself won't run on mobile. Check each plugin's "is this
mobile compatible?" flag in the Obsidian plugin store.

---

## Feedback

If a step in this guide didn't work for you, or you hit a setup gotcha
not listed here, please open an issue and I will help you to the best of my ability:
https://github.com/siddarthkay/syncthing-app/issues

Cheers!
