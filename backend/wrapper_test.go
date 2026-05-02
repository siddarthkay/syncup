package gobridge

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestParsePort(t *testing.T) {
	cases := []struct {
		in   string
		want int
	}{
		{"127.0.0.1:8384", 8384},
		{"0.0.0.0:22000", 22000},
		{"[::1]:8384", 8384},
		{"localhost:1", 1},
		{"localhost:65535", 65535},
		{"", 0},
		{"not-a-host-port", 0},
		{"127.0.0.1", 0},
		{":", 0},
		{"127.0.0.1:abc", 0},
	}
	for _, tc := range cases {
		t.Run(tc.in, func(t *testing.T) {
			got := parsePort(tc.in)
			if got != tc.want {
				t.Errorf("parsePort(%q) = %d, want %d", tc.in, got, tc.want)
			}
		})
	}
}

func TestRandomAPIKey(t *testing.T) {
	const want = 32
	const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

	for i := 0; i < 10; i++ {
		k := randomAPIKey()
		if len(k) != want {
			t.Errorf("randomAPIKey() length = %d, want %d (got %q)", len(k), want, k)
		}
		for _, r := range k {
			if !strings.ContainsRune(charset, r) {
				t.Errorf("randomAPIKey() contains non-charset rune %q in %q", r, k)
			}
		}
	}

	// a collision here means the RNG path is broken
	seen := make(map[string]bool, 1000)
	for i := 0; i < 1000; i++ {
		k := randomAPIKey()
		if seen[k] {
			t.Fatalf("randomAPIKey() returned duplicate %q after %d calls", k, i)
		}
		seen[k] = true
	}
}

func TestInSandboxAt(t *testing.T) {
	dataDir, err := filepath.Abs("/tmp/syncthing-sandbox-test")
	if err != nil {
		t.Fatalf("filepath.Abs(%q) failed: %v", "/tmp/syncthing-sandbox-test", err)
	}

	cases := []struct {
		name     string
		path     string
		wantErr  bool
		wantPath string
	}{
		{
			name:     "exact dataDir",
			path:     dataDir,
			wantErr:  false,
			wantPath: dataDir,
		},
		{
			name:     "child of dataDir",
			path:     dataDir + "/folders",
			wantErr:  false,
			wantPath: dataDir + "/folders",
		},
		{
			name:     "deeper child",
			path:     dataDir + "/folders/photos/2024",
			wantErr:  false,
			wantPath: dataDir + "/folders/photos/2024",
		},
		{
			name:     "trailing slash gets cleaned",
			path:     dataDir + "/folders/",
			wantErr:  false,
			wantPath: dataDir + "/folders",
		},
		{
			name:    "parent of dataDir",
			path:    filepath.Dir(dataDir),
			wantErr: true,
		},
		{
			name:    "completely unrelated",
			path:    "/etc/passwd",
			wantErr: true,
		},
		{
			name:    "dot-dot escape attempt",
			path:    dataDir + "/folders/../../etc",
			wantErr: true,
		},
		{
			name:     "dot-dot resolves inside",
			path:     dataDir + "/folders/../folders/photos",
			wantErr:  false,
			wantPath: dataDir + "/folders/photos",
		},
		{
			name:    "name-prefix-collision is not allowed",
			path:    dataDir + "-other",
			wantErr: true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := inSandboxAt(dataDir, tc.path)
			if tc.wantErr {
				if err == nil {
					t.Errorf("inSandboxAt(%q, %q) = %q, nil; want error", dataDir, tc.path, got)
				}
				return
			}
			if err != nil {
				t.Errorf("inSandboxAt(%q, %q) returned unexpected error: %v", dataDir, tc.path, err)
				return
			}
			if got != tc.wantPath {
				t.Errorf("inSandboxAt(%q, %q) = %q, want %q", dataDir, tc.path, got, tc.wantPath)
			}
		})
	}
}

func TestInSandboxAtEmptyDataDir(t *testing.T) {
	if _, err := inSandboxAt("", "/anywhere"); err == nil {
		t.Error("inSandboxAt(\"\", ...) succeeded; expected error for empty dataDir")
	}
}

// On iOS, UIDocumentPicker hands back paths under /private/var/... but the
// Go runtime's filepath.Abs of paths the JS side derives can be /var/...
// (or vice-versa). canonicalize must collapse these so prefix-matching works.
func TestInSandboxAtRootsResolvesSymlinks(t *testing.T) {
	tmp := t.TempDir()
	realRoot := filepath.Join(tmp, "real")
	if err := os.MkdirAll(realRoot, 0o700); err != nil {
		t.Fatalf("mkdir realRoot: %v", err)
	}
	linkRoot := filepath.Join(tmp, "alias")
	if err := os.Symlink(realRoot, linkRoot); err != nil {
		t.Skipf("symlink unsupported on this filesystem: %v", err)
	}

	// Register the symlink form as the root; the input arrives in the
	// resolved form (mirrors iOS handing us a /private/var/... path while
	// we registered /var/...).
	child := filepath.Join(realRoot, "subdir")
	if err := os.MkdirAll(child, 0o700); err != nil {
		t.Fatalf("mkdir child: %v", err)
	}

	got, err := inSandboxAtRoots([]string{linkRoot}, child)
	if err != nil {
		t.Fatalf("inSandboxAtRoots(linkRoot, child) returned error: %v", err)
	}
	// The returned path is the input form (so call sites can use it
	// for downstream os.* operations without resolving themselves).
	if got != child {
		t.Errorf("returned path = %q, want %q", got, child)
	}

	// And the reverse: registered the real root, ask about a symlink path.
	gotRev, err := inSandboxAtRoots([]string{realRoot}, filepath.Join(linkRoot, "subdir"))
	if err != nil {
		t.Fatalf("inSandboxAtRoots(realRoot, linkRoot/subdir) returned error: %v", err)
	}
	if !strings.HasSuffix(gotRev, "subdir") {
		t.Errorf("returned path = %q, want suffix 'subdir'", gotRev)
	}
}

func TestRegisterExternalRootIdempotent(t *testing.T) {
	// Reset the package state so the test is hermetic.
	globalMu.Lock()
	saved := externalRoots
	externalRoots = nil
	globalMu.Unlock()
	t.Cleanup(func() {
		globalMu.Lock()
		externalRoots = saved
		globalMu.Unlock()
	})

	tmp := t.TempDir()
	api := NewMobileAPI()
	api.RegisterExternalRoot(tmp)
	api.RegisterExternalRoot(tmp)
	api.RegisterExternalRoot(tmp)

	globalMu.Lock()
	count := len(externalRoots)
	globalMu.Unlock()

	if count != 1 {
		t.Errorf("expected 1 external root after duplicate registers, got %d", count)
	}

	api.UnregisterExternalRoot(tmp)
	globalMu.Lock()
	count = len(externalRoots)
	globalMu.Unlock()
	if count != 0 {
		t.Errorf("expected 0 external roots after unregister, got %d", count)
	}
}
