package gobridge

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/syncthing/syncthing/lib/fs"
)

// mockSAFBridge is an in-memory implementation of SAFBridge for testing.
type mockSAFBridge struct {
	files map[string]mockFile // key: "treeURI\nrelPath"
}

type mockFile struct {
	name      string
	size      int64
	modTimeMs int64
	isDir     bool
	data      []byte
}

func newMockBridge() *mockSAFBridge {
	return &mockSAFBridge{files: make(map[string]mockFile)}
}

func (m *mockSAFBridge) key(treeURI, relPath string) string {
	return treeURI + "\n" + relPath
}

func (m *mockSAFBridge) addFile(treeURI, relPath string, data []byte, modMs int64) {
	m.files[m.key(treeURI, relPath)] = mockFile{
		name:      filepath.Base(relPath),
		size:      int64(len(data)),
		modTimeMs: modMs,
		isDir:     false,
		data:      data,
	}
}

func (m *mockSAFBridge) addDir(treeURI, relPath string) {
	name := filepath.Base(relPath)
	if relPath == "" {
		name = "."
	}
	m.files[m.key(treeURI, relPath)] = mockFile{
		name:      name,
		modTimeMs: 1000,
		isDir:     true,
	}
}

func (m *mockSAFBridge) StatJSON(treeURI, relativePath string) (string, error) {
	f, ok := m.files[m.key(treeURI, relativePath)]
	if !ok {
		return `{"exists":false}`, nil
	}
	b, _ := json.Marshal(map[string]interface{}{
		"name":      f.name,
		"size":      f.size,
		"modTimeMs": f.modTimeMs,
		"isDir":     f.isDir,
		"exists":    true,
	})
	return string(b), nil
}

func (m *mockSAFBridge) ListChildrenJSON(treeURI, relativePath string) (string, error) {
	prefix := relativePath
	if prefix != "" {
		prefix += "/"
	}
	var entries []map[string]interface{}
	for k, f := range m.files {
		parts := strings.SplitN(k, "\n", 2)
		if parts[0] != treeURI {
			continue
		}
		relPath := parts[1]
		if relPath == relativePath {
			continue // skip self
		}
		if !strings.HasPrefix(relPath, prefix) {
			continue
		}
		// only immediate children
		rest := relPath[len(prefix):]
		if strings.Contains(rest, "/") {
			continue
		}
		entries = append(entries, map[string]interface{}{
			"name":      f.name,
			"size":      f.size,
			"modTimeMs": f.modTimeMs,
			"isDir":     f.isDir,
		})
	}
	b, _ := json.Marshal(entries)
	return string(b), nil
}

func (m *mockSAFBridge) OpenFd(treeURI, relativePath, mode string) (int, error) {
	f, ok := m.files[m.key(treeURI, relativePath)]
	if !ok {
		return 0, fmt.Errorf("not found: %s", relativePath)
	}

	// Create a temp file and write the content
	tmp, err := os.CreateTemp("", "saf-test-*")
	if err != nil {
		return 0, err
	}
	if f.data != nil {
		if _, err := tmp.Write(f.data); err != nil {
			tmp.Close()
			return 0, err
		}
		if _, err := tmp.Seek(0, 0); err != nil {
			tmp.Close()
			return 0, err
		}
	}
	// We return the fd but keep a reference so Go's os.NewFile can use it.
	// The caller (safFile) will close it.
	fd := int(tmp.Fd())
	// Don't close tmp here - the fd is now owned by the caller
	return fd, nil
}

func (m *mockSAFBridge) CreateFile(treeURI, parentRelPath, name, mimeType string) (string, error) {
	relPath := name
	if parentRelPath != "" {
		relPath = parentRelPath + "/" + name
	}
	m.files[m.key(treeURI, relPath)] = mockFile{
		name:      name,
		modTimeMs: time.Now().UnixMilli(),
		isDir:     false,
	}
	return relPath, nil
}

func (m *mockSAFBridge) CreateDir(treeURI, parentRelPath, name string) (string, error) {
	relPath := name
	if parentRelPath != "" {
		relPath = parentRelPath + "/" + name
	}
	m.files[m.key(treeURI, relPath)] = mockFile{
		name:      name,
		modTimeMs: time.Now().UnixMilli(),
		isDir:     true,
	}
	return relPath, nil
}

func (m *mockSAFBridge) Delete(treeURI, relativePath string) error {
	key := m.key(treeURI, relativePath)
	if _, ok := m.files[key]; !ok {
		return fmt.Errorf("not found: %s", relativePath)
	}
	delete(m.files, key)
	// delete children
	prefix := m.key(treeURI, relativePath+"/")
	for k := range m.files {
		if strings.HasPrefix(k, prefix) {
			delete(m.files, k)
		}
	}
	return nil
}

func (m *mockSAFBridge) Rename(treeURI, oldRelPath, newRelPath string) error {
	oldKey := m.key(treeURI, oldRelPath)
	f, ok := m.files[oldKey]
	if !ok {
		return fmt.Errorf("not found: %s", oldRelPath)
	}
	f.name = filepath.Base(newRelPath)
	m.files[m.key(treeURI, newRelPath)] = f
	delete(m.files, oldKey)
	return nil
}

func (m *mockSAFBridge) SetLastModified(treeURI, relativePath string, mtimeMs int64) error {
	key := m.key(treeURI, relativePath)
	f, ok := m.files[key]
	if !ok {
		return fmt.Errorf("not found: %s", relativePath)
	}
	f.modTimeMs = mtimeMs
	m.files[key] = f
	return nil
}

func (m *mockSAFBridge) UsageJSON(treeURI string) (string, error) {
	return `{"Free":1073741824,"Total":2147483648}`, nil
}

func (m *mockSAFBridge) WalkJSON(treeURI, relativePath string) (string, error) {
	prefix := relativePath
	if prefix != "" {
		prefix += "/"
	}
	var entries []map[string]interface{}
	for k, f := range m.files {
		parts := strings.SplitN(k, "\n", 2)
		if parts[0] != treeURI {
			continue
		}
		relPath := parts[1]
		if relPath == relativePath {
			continue
		}
		if relativePath != "" && !strings.HasPrefix(relPath, prefix) {
			continue
		}
		entries = append(entries, map[string]interface{}{
			"name":      relPath,
			"size":      f.size,
			"modTimeMs": f.modTimeMs,
			"isDir":     f.isDir,
		})
	}
	b, _ := json.Marshal(entries)
	return string(b), nil
}

func (m *mockSAFBridge) GetDisplayName(treeURI string) (string, error) {
	return "Mock Storage", nil
}

func (m *mockSAFBridge) RegisterWatch(treeURI string) (int64, error) {
	return 1, nil
}

func (m *mockSAFBridge) UnregisterWatch(watchID int64) error {
	return nil
}

func (m *mockSAFBridge) PollWatchEventsJSON(watchID int64, timeoutMs int64) (string, error) {
	return "[]", nil
}

func (m *mockSAFBridge) StatBatchJSON(treeURI string, pathsJSON string) (string, error) {
	var paths []string
	if err := json.Unmarshal([]byte(pathsJSON), &paths); err != nil {
		return "", err
	}
	var results []json.RawMessage
	for _, p := range paths {
		stat, err := m.StatJSON(treeURI, p)
		if err != nil {
			return "", err
		}
		results = append(results, json.RawMessage(stat))
	}
	b, _ := json.Marshal(results)
	return string(b), nil
}

func (m *mockSAFBridge) ValidatePermission(treeURI string) bool {
	return true
}

// --- Tests ---

const testTreeURI = "content://com.example/tree/root"

func setupTestFS(t *testing.T) (*safFilesystem, *mockSAFBridge) {
	t.Helper()
	bridge := newMockBridge()
	bridge.addDir(testTreeURI, "")
	bridge.addDir(testTreeURI, "docs")
	bridge.addFile(testTreeURI, "docs/hello.txt", []byte("hello world"), 1700000000000)
	bridge.addFile(testTreeURI, "readme.md", []byte("# README"), 1700000001000)

	oldBridge := globalSAFBridge
	globalSAFBridge = bridge
	t.Cleanup(func() { globalSAFBridge = oldBridge })

	raw, err := newSAFFilesystem(testTreeURI)
	if err != nil {
		t.Fatal(err)
	}
	return raw.(*safFilesystem), bridge
}

func TestSAFStat(t *testing.T) {
	sfs, _ := setupTestFS(t)

	fi, err := sfs.Stat("docs/hello.txt")
	if err != nil {
		t.Fatal(err)
	}
	if fi.Name() != "hello.txt" {
		t.Errorf("expected name 'hello.txt', got %q", fi.Name())
	}
	if fi.Size() != 11 {
		t.Errorf("expected size 11, got %d", fi.Size())
	}
	if fi.IsDir() {
		t.Error("expected file, got dir")
	}
}

func TestSAFStatNotExist(t *testing.T) {
	sfs, _ := setupTestFS(t)

	_, err := sfs.Stat("nonexistent")
	if err == nil {
		t.Fatal("expected error for nonexistent file")
	}
	if !fs.IsNotExist(err) {
		t.Errorf("expected ErrNotExist, got %v", err)
	}
}

func TestSAFStatDir(t *testing.T) {
	sfs, _ := setupTestFS(t)

	fi, err := sfs.Stat("docs")
	if err != nil {
		t.Fatal(err)
	}
	if !fi.IsDir() {
		t.Error("expected dir")
	}
}

func TestSAFDirNames(t *testing.T) {
	sfs, _ := setupTestFS(t)

	names, err := sfs.DirNames("")
	if err != nil {
		t.Fatal(err)
	}
	// should have "docs" and "readme.md" as root children
	found := map[string]bool{}
	for _, n := range names {
		found[n] = true
	}
	if !found["docs"] {
		t.Error("expected 'docs' in root listing")
	}
	if !found["readme.md"] {
		t.Error("expected 'readme.md' in root listing")
	}
}

func TestSAFMkdir(t *testing.T) {
	sfs, bridge := setupTestFS(t)

	err := sfs.Mkdir("photos", 0o755)
	if err != nil {
		t.Fatal(err)
	}
	_, ok := bridge.files[bridge.key(testTreeURI, "photos")]
	if !ok {
		t.Error("directory not created in bridge")
	}
}

func TestSAFMkdirAll(t *testing.T) {
	sfs, bridge := setupTestFS(t)

	err := sfs.MkdirAll("a/b/c", 0o755)
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range []string{"a", "a/b", "a/b/c"} {
		if _, ok := bridge.files[bridge.key(testTreeURI, p)]; !ok {
			t.Errorf("expected directory %q to exist", p)
		}
	}
}

func TestSAFRemove(t *testing.T) {
	sfs, bridge := setupTestFS(t)

	err := sfs.Remove("readme.md")
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := bridge.files[bridge.key(testTreeURI, "readme.md")]; ok {
		t.Error("file should have been deleted")
	}
}

func TestSAFRename(t *testing.T) {
	sfs, bridge := setupTestFS(t)

	err := sfs.Rename("readme.md", "README.md")
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := bridge.files[bridge.key(testTreeURI, "readme.md")]; ok {
		t.Error("old file should not exist")
	}
	if _, ok := bridge.files[bridge.key(testTreeURI, "README.md")]; !ok {
		t.Error("new file should exist")
	}
}

func TestSAFOpenRead(t *testing.T) {
	sfs, _ := setupTestFS(t)

	f, err := sfs.Open("docs/hello.txt")
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()

	buf := make([]byte, 20)
	n, err := f.Read(buf)
	if err != nil {
		t.Fatal(err)
	}
	if string(buf[:n]) != "hello world" {
		t.Errorf("expected 'hello world', got %q", string(buf[:n]))
	}
}

func TestSAFCreate(t *testing.T) {
	sfs, bridge := setupTestFS(t)

	f, err := sfs.Create("newfile.txt")
	if err != nil {
		t.Fatal(err)
	}
	f.Close()

	if _, ok := bridge.files[bridge.key(testTreeURI, "newfile.txt")]; !ok {
		t.Error("created file should exist in bridge")
	}
}

func TestSAFUsage(t *testing.T) {
	sfs, _ := setupTestFS(t)

	u, err := sfs.Usage(".")
	if err != nil {
		t.Fatal(err)
	}
	if u.Free != 1073741824 {
		t.Errorf("expected Free=1073741824, got %d", u.Free)
	}
	if u.Total != 2147483648 {
		t.Errorf("expected Total=2147483648, got %d", u.Total)
	}
}

func TestSAFType(t *testing.T) {
	sfs, _ := setupTestFS(t)
	if sfs.Type() != FilesystemTypeSAF {
		t.Errorf("expected type %q, got %q", FilesystemTypeSAF, sfs.Type())
	}
}

func TestSAFURI(t *testing.T) {
	sfs, _ := setupTestFS(t)
	if sfs.URI() != testTreeURI {
		t.Errorf("expected URI %q, got %q", testTreeURI, sfs.URI())
	}
}

func TestSAFSymlinksNotSupported(t *testing.T) {
	sfs, _ := setupTestFS(t)
	if sfs.SymlinksSupported() {
		t.Error("SAF should not support symlinks")
	}
}

func TestSAFWatch(t *testing.T) {
	sfs, _ := setupTestFS(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	outCh, errCh, err := sfs.Watch(".", nil, ctx, false)
	if err != nil {
		t.Fatalf("Watch returned error: %v", err)
	}
	if outCh == nil || errCh == nil {
		t.Fatal("Watch channels should not be nil")
	}
	// cancel to stop the goroutine
	cancel()
}

func TestSAFChtimes(t *testing.T) {
	sfs, bridge := setupTestFS(t)

	mtime := time.Unix(1800000000, 0)
	err := sfs.Chtimes("docs/hello.txt", time.Time{}, mtime)
	if err != nil {
		t.Fatal(err)
	}
	f := bridge.files[bridge.key(testTreeURI, "docs/hello.txt")]
	if f.modTimeMs != mtime.UnixMilli() {
		t.Errorf("expected modTimeMs=%d, got %d", mtime.UnixMilli(), f.modTimeMs)
	}
}

func TestCleanRel(t *testing.T) {
	tests := []struct {
		in, want string
	}{
		{"", ""},
		{".", ""},
		{"/", ""},
		{"/foo/bar", "foo/bar"},
		{"foo/bar/", "foo/bar"},
		{"./foo", "foo"},
	}
	for _, tt := range tests {
		got := cleanRel(tt.in)
		if got != tt.want {
			t.Errorf("cleanRel(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}

func TestFlagsToSAFMode(t *testing.T) {
	tests := []struct {
		flags int
		want  string
	}{
		{os.O_RDONLY, "r"},
		{os.O_WRONLY, "w"},
		{os.O_RDWR, "rw"},
		{os.O_WRONLY | os.O_TRUNC, "wt"},
		{os.O_RDWR | os.O_TRUNC, "wt"},
	}
	for _, tt := range tests {
		got := flagsToSAFMode(tt.flags)
		if got != tt.want {
			t.Errorf("flagsToSAFMode(%d) = %q, want %q", tt.flags, got, tt.want)
		}
	}
}
