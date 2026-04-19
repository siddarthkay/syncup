package gobridge

import (
	"archive/zip"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type MobileAPI struct{}

func NewMobileAPI() *MobileAPI {
	return &MobileAPI{}
}

var (
	globalClient       *Client
	globalMu           sync.Mutex
	pendingFoldersRoot string
	globalSAFBridge    SAFBridge
)

// SetSAFBridge registers the Kotlin-side SAF implementation so the "saf"
// filesystem type can delegate file operations through JNI.
// Must be called before any SAF-backed folder is loaded.
func (m *MobileAPI) SetSAFBridge(bridge SAFBridge) {
	globalMu.Lock()
	defer globalMu.Unlock()
	globalSAFBridge = bridge
}

// ValidateSAFPermission checks whether the app still holds read+write access
// for the given tree URI. Returns true if valid, false if revoked.
func (m *MobileAPI) ValidateSAFPermission(treeURI string) bool {
	globalMu.Lock()
	bridge := globalSAFBridge
	globalMu.Unlock()
	if bridge == nil {
		return false
	}
	return bridge.ValidatePermission(treeURI)
}

func (m *MobileAPI) StartServer(dataDir string) int {
	globalMu.Lock()
	defer globalMu.Unlock()

	if globalClient != nil {
		return globalClient.Port()
	}

	c := &Client{}
	// must run before Load so cfg.Modify sees foldersRoot for the migration step
	if pendingFoldersRoot != "" {
		c.foldersRoot = pendingFoldersRoot
		pendingFoldersRoot = ""
	}
	if err := c.Load(dataDir, dataDir); err != nil {
		slog.Error("syncthing Load failed", "err", err, "dataDir", dataDir)
		return 0
	}
	if err := c.Start(); err != nil {
		slog.Error("syncthing Start failed", "err", err)
		return 0
	}
	globalClient = c
	return c.Port()
}

func (m *MobileAPI) StopServer() {
	globalMu.Lock()
	defer globalMu.Unlock()
	if globalClient == nil {
		return
	}
	globalClient.Stop()
	globalClient = nil
}

func (m *MobileAPI) GetServerPort() int {
	globalMu.Lock()
	defer globalMu.Unlock()
	if globalClient == nil {
		return 0
	}
	return globalClient.Port()
}

func (m *MobileAPI) GetAPIKey() string {
	globalMu.Lock()
	defer globalMu.Unlock()
	if globalClient == nil {
		return ""
	}
	return globalClient.APIKey()
}

func (m *MobileAPI) GetDeviceID() string {
	globalMu.Lock()
	defer globalMu.Unlock()
	if globalClient == nil {
		return ""
	}
	return globalClient.DeviceID()
}

func (m *MobileAPI) GetGUIAddress() string {
	globalMu.Lock()
	defer globalMu.Unlock()
	if globalClient == nil {
		return ""
	}
	return globalClient.GUIAddress()
}

func (m *MobileAPI) GetDataDir() string {
	globalMu.Lock()
	defer globalMu.Unlock()
	if globalClient == nil {
		return ""
	}
	return globalClient.DataDir()
}

func (m *MobileAPI) GetFoldersRoot() string {
	globalMu.Lock()
	defer globalMu.Unlock()
	if globalClient == nil {
		return ""
	}
	return globalClient.FoldersRoot()
}

// SetFoldersRoot sets the root for new folders, picker sandbox, and migration
// destination. Safe before or after StartServer: pre-start it's stashed for
// the next Load; post-start it applies live.
func (m *MobileAPI) SetFoldersRoot(path string) bool {
	globalMu.Lock()
	defer globalMu.Unlock()
	if globalClient != nil {
		if err := globalClient.SetFoldersRoot(path); err != nil {
			slog.Error("SetFoldersRoot live failed", "err", err, "path", path)
			return false
		}
		return true
	}
	pendingFoldersRoot = path
	return true
}

func (m *MobileAPI) SetSuspended(suspended bool) {
	globalMu.Lock()
	defer globalMu.Unlock()
	if globalClient == nil {
		return
	}
	if err := globalClient.SetSuspended(suspended); err != nil {
		slog.Error("SetSuspended failed", "err", err, "suspended", suspended)
	}
}

type dirEntryJSON struct {
	Name    string `json:"name"`
	IsDir   bool   `json:"isDir"`
	Size    int64  `json:"size"`
	ModTime string `json:"modTime"`
}

type fsResultJSON struct {
	Path    string         `json:"path,omitempty"`
	Entries []dirEntryJSON `json:"entries,omitempty"`
	Error   string         `json:"error,omitempty"`
}

func currentDataDir() string {
	globalMu.Lock()
	defer globalMu.Unlock()
	if globalClient == nil {
		return ""
	}
	return globalClient.DataDir()
}

func marshalErr(err error) string {
	b, _ := json.Marshal(fsResultJSON{Error: err.Error()})
	return string(b)
}

// inSandbox returns a cleaned absolute path iff p is under dataDir or
// foldersRoot. Blocks ".." escapes from the JS side.
func inSandbox(p string) (string, error) {
	dataDir := currentDataDir()
	if dataDir == "" {
		return "", errors.New("daemon not started")
	}
	roots := []string{dataDir}
	if r := currentFoldersRoot(); r != "" && r != dataDir {
		roots = append(roots, r)
	}
	return inSandboxAtRoots(roots, p)
}

// inSandboxAt is the single-root convenience for tests.
func inSandboxAt(dataDir, p string) (string, error) {
	return inSandboxAtRoots([]string{dataDir}, p)
}

// inSandboxAtRoots accepts a path equal to or separator-anchored under any
// of the roots. Pure so tests don't need a running daemon.
func inSandboxAtRoots(roots []string, p string) (string, error) {
	if len(roots) == 0 {
		return "", errors.New("no sandbox roots")
	}
	absP, err := filepath.Abs(p)
	if err != nil {
		return "", err
	}
	absP = filepath.Clean(absP)
	for _, root := range roots {
		if root == "" {
			continue
		}
		absRoot, err := filepath.Abs(root)
		if err != nil {
			continue
		}
		if absP == absRoot || strings.HasPrefix(absP, absRoot+string(os.PathSeparator)) {
			return absP, nil
		}
	}
	return "", errors.New("path outside sandbox")
}

func currentFoldersRoot() string {
	globalMu.Lock()
	defer globalMu.Unlock()
	if globalClient == nil {
		return ""
	}
	return globalClient.FoldersRoot()
}

// ListSubdirs returns JSON-encoded immediate children of path, sandboxed.
func (m *MobileAPI) ListSubdirs(path string) string {
	abs, err := inSandbox(path)
	if err != nil {
		return marshalErr(err)
	}
	if err := os.MkdirAll(abs, 0o700); err != nil {
		return marshalErr(err)
	}
	entries, err := os.ReadDir(abs)
	if err != nil {
		return marshalErr(err)
	}
	result := fsResultJSON{Path: abs, Entries: make([]dirEntryJSON, 0, len(entries))}
	for _, e := range entries {
		name := e.Name()
		// hides .stfolder and other dotfiles
		if strings.HasPrefix(name, ".") {
			continue
		}
		entry := dirEntryJSON{
			Name:  name,
			IsDir: e.IsDir(),
		}
		// best-effort; a broken symlink shouldn't tank the whole listing
		if info, err := e.Info(); err == nil {
			if !e.IsDir() {
				entry.Size = info.Size()
			}
			entry.ModTime = info.ModTime().UTC().Format(time.RFC3339)
		}
		result.Entries = append(result.Entries, entry)
	}
	b, _ := json.Marshal(result)
	return string(b)
}

// ZipDir creates a zip archive of the directory at srcDir and writes it
// to dstPath. Returns JSON with the output path or error.
func (m *MobileAPI) ZipDir(srcDir, dstPath string) string {
	srcAbs, err := filepath.Abs(srcDir)
	if err != nil {
		return marshalErr(err)
	}
	outFile, err := os.Create(dstPath)
	if err != nil {
		return marshalErr(err)
	}
	defer outFile.Close()

	w := zip.NewWriter(outFile)
	defer w.Close()

	err = filepath.Walk(srcAbs, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if info.IsDir() {
			return nil
		}
		// skip hidden files and .stfolder/.stignore
		base := filepath.Base(path)
		if strings.HasPrefix(base, ".st") || strings.HasPrefix(base, ".") {
			return nil
		}
		rel, err := filepath.Rel(srcAbs, path)
		if err != nil {
			return err
		}
		header, err := zip.FileInfoHeader(info)
		if err != nil {
			return err
		}
		header.Name = rel
		header.Method = zip.Deflate
		writer, err := w.CreateHeader(header)
		if err != nil {
			return err
		}
		f, err := os.Open(path)
		if err != nil {
			return err
		}
		defer f.Close()
		_, err = io.Copy(writer, f)
		return err
	})
	if err != nil {
		os.Remove(dstPath)
		return marshalErr(err)
	}
	b, _ := json.Marshal(fsResultJSON{Path: dstPath})
	return string(b)
}

// ResolvePath returns the absolute path as the daemon sees it. Needed
// because folder.path can be relative and the daemon resolves it from
// its own CWD, which differs from what JS-side path APIs expect.
func (m *MobileAPI) ResolvePath(path string) string {
	abs, err := filepath.Abs(path)
	if err != nil {
		b, _ := json.Marshal(fsResultJSON{Error: err.Error()})
		return string(b)
	}
	b, _ := json.Marshal(fsResultJSON{Path: abs})
	return string(b)
}

// CopyFile copies src to dst. dst must be inside the sandbox; src can be
// any readable path (needed for photo backup where the source is a
// system-managed media path outside the sandbox).
func (m *MobileAPI) CopyFile(src, dst string) string {
	absDst, err := inSandbox(dst)
	if err != nil {
		return marshalErr(err)
	}
	if err := os.MkdirAll(filepath.Dir(absDst), 0o755); err != nil {
		return marshalErr(err)
	}
	in, err := os.Open(src)
	if err != nil {
		return marshalErr(err)
	}
	defer in.Close()
	out, err := os.Create(absDst)
	if err != nil {
		return marshalErr(err)
	}
	defer out.Close()
	if _, err := io.Copy(out, in); err != nil {
		os.Remove(absDst)
		return marshalErr(err)
	}
	b, _ := json.Marshal(fsResultJSON{Path: absDst})
	return string(b)
}

// RemoveDir recursively deletes a sandboxed directory. Refuses the sandbox
// roots themselves so we can't wipe the whole folders dir.
func (m *MobileAPI) RemoveDir(path string) string {
	abs, err := inSandbox(path)
	if err != nil {
		return marshalErr(err)
	}
	dataDir := currentDataDir()
	foldersRoot := currentFoldersRoot()
	if abs == dataDir || abs == foldersRoot || abs == filepath.Join(dataDir, "folders") {
		return marshalErr(errors.New("refusing to remove sandbox root"))
	}
	if err := os.RemoveAll(abs); err != nil {
		return marshalErr(err)
	}
	b, _ := json.Marshal(fsResultJSON{Path: abs})
	return string(b)
}

// MkdirSubdir creates name under parent (must be sandboxed) and returns
// the new absolute path.
func (m *MobileAPI) MkdirSubdir(parent, name string) string {
	if strings.ContainsAny(name, "/\\") || name == "" || name == "." || name == ".." {
		return marshalErr(errors.New("invalid folder name"))
	}
	absParent, err := inSandbox(parent)
	if err != nil {
		return marshalErr(err)
	}
	newPath := filepath.Join(absParent, name)
	if err := os.MkdirAll(newPath, 0o700); err != nil {
		return marshalErr(err)
	}
	b, _ := json.Marshal(fsResultJSON{Path: newPath})
	return string(b)
}
