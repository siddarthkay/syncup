package gobridge

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/syncthing/syncthing/lib/fs"
	"github.com/syncthing/syncthing/lib/protocol"
)

const FilesystemTypeSAF fs.FilesystemType = "saf"

func init() {
	fs.RegisterFilesystemType(FilesystemTypeSAF, newSAFFilesystem)
}

// safFilesystem implements fs.Filesystem backed by Android's Storage Access
// Framework. Metadata operations delegate to SAFBridge (JNI); data I/O uses
// file descriptors for zero-copy throughput.
type safFilesystem struct {
	treeURI    string
	bridge     SAFBridge
	options    []fs.Option
	cacheReady bool // set after first Walk warms the Kotlin-side doc ID cache
}

func newSAFFilesystem(uri string, opts ...fs.Option) (fs.Filesystem, error) {
	if globalSAFBridge == nil {
		return nil, errors.New("SAF bridge not initialised")
	}
	return &safFilesystem{
		treeURI: uri,
		bridge:  globalSAFBridge,
		options: opts,
	}, nil
}

func (f *safFilesystem) Type() fs.FilesystemType { return FilesystemTypeSAF }
func (f *safFilesystem) URI() string             { return f.treeURI }
func (f *safFilesystem) Options() []fs.Option    { return f.options }

// --- Stat / Lstat ---

func (f *safFilesystem) stat(name string) (safStatJSON, error) {
	name = cleanRel(name)
	raw, err := f.bridge.StatJSON(f.treeURI, name)
	if err != nil {
		return safStatJSON{}, err
	}
	s, err := parseStat(raw)
	if err != nil {
		return safStatJSON{}, err
	}
	if !s.Exists {
		return safStatJSON{}, fs.ErrNotExist
	}
	// ensure the Name field matches what the caller expects
	if name == "" || name == "." {
		s.Name = "."
	} else {
		s.Name = filepath.Base(name)
	}
	return s, nil
}

func (f *safFilesystem) Stat(name string) (fs.FileInfo, error) {
	s, err := f.stat(name)
	if err != nil {
		return nil, err
	}
	return newSAFFileInfo(s), nil
}

func (f *safFilesystem) Lstat(name string) (fs.FileInfo, error) {
	// SAF has no symlinks
	return f.Stat(name)
}

// --- Open / Create ---

func (f *safFilesystem) Open(name string) (fs.File, error) {
	return f.openFile(name, "r")
}

func (f *safFilesystem) OpenFile(name string, flags int, _ fs.FileMode) (fs.File, error) {
	mode := flagsToSAFMode(flags)
	if flags&os.O_CREATE != 0 {
		// ensure file exists first
		name = cleanRel(name)
		_, statErr := f.stat(name)
		if errors.Is(statErr, fs.ErrNotExist) {
			dir := filepath.Dir(name)
			if dir == "." {
				dir = ""
			}
			base := filepath.Base(name)
			_, err := f.bridge.CreateFile(f.treeURI, dir, base, "application/octet-stream")
			if err != nil {
				return nil, err
			}
		}
	}
	return f.openFile(name, mode)
}

func (f *safFilesystem) Create(name string) (fs.File, error) {
	name = cleanRel(name)
	dir := filepath.Dir(name)
	if dir == "." {
		dir = ""
	}
	base := filepath.Base(name)
	// delete existing file if present (Create = truncate)
	if _, err := f.stat(name); err == nil {
		_ = f.bridge.Delete(f.treeURI, name)
	}
	_, err := f.bridge.CreateFile(f.treeURI, dir, base, "application/octet-stream")
	if err != nil {
		return nil, err
	}
	return f.openFile(name, "rw")
}

func (f *safFilesystem) openFile(name, mode string) (fs.File, error) {
	name = cleanRel(name)
	fd, err := f.bridge.OpenFd(f.treeURI, name, mode)
	if err != nil {
		return nil, wrapNotFound(err)
	}
	return newSAFFile(fd, name, f.treeURI, f.bridge), nil
}

// --- Directory operations ---

func (f *safFilesystem) Mkdir(name string, _ fs.FileMode) error {
	name = cleanRel(name)
	dir := filepath.Dir(name)
	if dir == "." {
		dir = ""
	}
	base := filepath.Base(name)
	_, err := f.bridge.CreateDir(f.treeURI, dir, base)
	return err
}

func (f *safFilesystem) MkdirAll(name string, perm fs.FileMode) error {
	name = cleanRel(name)
	parts := strings.Split(name, "/")
	cur := ""
	for _, p := range parts {
		if p == "" || p == "." {
			continue
		}
		if cur == "" {
			cur = p
		} else {
			cur = cur + "/" + p
		}
		if _, err := f.stat(cur); err != nil {
			if err := f.Mkdir(cur, perm); err != nil {
				return err
			}
		}
	}
	return nil
}

func (f *safFilesystem) DirNames(name string) ([]string, error) {
	name = cleanRel(name)
	raw, err := f.bridge.ListChildrenJSON(f.treeURI, name)
	if err != nil {
		return nil, err
	}
	entries, err := parseStatList(raw)
	if err != nil {
		return nil, err
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		names = append(names, e.Name)
	}
	sort.Strings(names)
	return names, nil
}

// --- Remove ---

func (f *safFilesystem) Remove(name string) error {
	return wrapNotFound(f.bridge.Delete(f.treeURI, cleanRel(name)))
}

func (f *safFilesystem) RemoveAll(name string) error {
	// SAF Delete is recursive for directories
	return wrapNotFound(f.bridge.Delete(f.treeURI, cleanRel(name)))
}

// --- Rename ---

func (f *safFilesystem) Rename(oldname, newname string) error {
	return wrapNotFound(f.bridge.Rename(f.treeURI, cleanRel(oldname), cleanRel(newname)))
}

// --- Times / Permissions ---

func (f *safFilesystem) Chmod(_ string, _ fs.FileMode) error { return nil }

func (f *safFilesystem) Lchown(_ string, _, _ string) error { return nil }

func (f *safFilesystem) Chtimes(name string, _ time.Time, mtime time.Time) error {
	return f.bridge.SetLastModified(f.treeURI, cleanRel(name), mtime.UnixMilli())
}

// --- Symlinks (unsupported) ---

func (f *safFilesystem) SymlinksSupported() bool                  { return false }
func (f *safFilesystem) CreateSymlink(_, _ string) error          { return fs.ErrNotExist }
func (f *safFilesystem) ReadSymlink(_ string) (string, error)     { return "", fs.ErrNotExist }

// --- Walk ---

func (f *safFilesystem) Walk(name string, walkFn fs.WalkFunc) error {
	name = cleanRel(name)
	// WalkJSON populates the Kotlin-side doc ID cache as a side effect.
	// Mark cache as ready after the first walk so subsequent stat/open
	// calls hit the warm cache instead of walking the tree per-path.
	raw, err := f.bridge.WalkJSON(f.treeURI, name)
	if err != nil {
		return err
	}
	f.cacheReady = true
	entries, err := parseStatList(raw)
	if err != nil {
		return err
	}
	// sort to get deterministic walk order (parent before children)
	sort.Slice(entries, func(i, j int) bool {
		return entries[i].Name < entries[j].Name
	})
	for _, e := range entries {
		fi := newSAFFileInfo(e)
		if err := walkFn(e.Name, fi, nil); err != nil {
			if err == fs.SkipDir {
				// skip this subtree
				continue
			}
			return err
		}
	}
	return nil
}

// --- Watch ---

func (f *safFilesystem) Watch(_ string, _ fs.Matcher, ctx context.Context, _ bool) (<-chan fs.Event, <-chan error, error) {
	if ctx == nil {
		return nil, nil, fs.ErrWatchNotSupported
	}
	watchID, err := f.bridge.RegisterWatch(f.treeURI)
	if err != nil {
		return nil, nil, fs.ErrWatchNotSupported
	}

	outChan := make(chan fs.Event)
	errChan := make(chan error, 1)

	go func() {
		defer close(outChan)
		defer close(errChan)
		defer func() { _ = f.bridge.UnregisterWatch(watchID) }()

		for {
			select {
			case <-ctx.Done():
				return
			default:
			}

			raw, pollErr := f.bridge.PollWatchEventsJSON(watchID, 2000)
			if pollErr != nil {
				errChan <- pollErr
				return
			}

			var events []safWatchEvent
			if err := json.Unmarshal([]byte(raw), &events); err != nil {
				continue
			}

			for _, ev := range events {
				var evType fs.EventType
				switch ev.Type {
				case "remove":
					evType = fs.Remove
				default:
					evType = fs.NonRemove
				}
				select {
				case outChan <- fs.Event{Name: ev.Path, Type: evType}:
				case <-ctx.Done():
					return
				}
			}
		}
	}()

	return outChan, errChan, nil
}

type safWatchEvent struct {
	Type string `json:"type"`
	Path string `json:"path"`
}

// --- Hide / Unhide (no-ops on SAF) ---

func (f *safFilesystem) Hide(_ string) error   { return nil }
func (f *safFilesystem) Unhide(_ string) error  { return nil }

// --- Glob ---

func (f *safFilesystem) Glob(pattern string) ([]string, error) {
	dir := filepath.Dir(pattern)
	if dir == "." {
		dir = ""
	}
	names, err := f.DirNames(dir)
	if err != nil {
		return nil, err
	}
	var matches []string
	for _, name := range names {
		fullPath := name
		if dir != "" {
			fullPath = dir + "/" + name
		}
		matched, matchErr := filepath.Match(pattern, fullPath)
		if matchErr != nil {
			return nil, matchErr
		}
		if matched {
			matches = append(matches, fullPath)
		}
	}
	return matches, nil
}

// --- Roots ---

func (f *safFilesystem) Roots() ([]string, error) {
	return []string{f.treeURI}, nil
}

// --- Usage ---

func (f *safFilesystem) Usage(_ string) (fs.Usage, error) {
	raw, err := f.bridge.UsageJSON(f.treeURI)
	if err != nil {
		return fs.Usage{}, err
	}
	var u fs.Usage
	if err := json.Unmarshal([]byte(raw), &u); err != nil {
		return fs.Usage{}, err
	}
	return u, nil
}

// --- SameFile ---

func (f *safFilesystem) SameFile(fi1, fi2 fs.FileInfo) bool {
	return fi1.Name() == fi2.Name() &&
		fi1.Size() == fi2.Size() &&
		fi1.ModTime().Equal(fi2.ModTime()) &&
		fi1.IsDir() == fi2.IsDir()
}

// --- Platform / Xattr (unsupported) ---

func (f *safFilesystem) PlatformData(_ string, _, _ bool, _ fs.XattrFilter) (protocol.PlatformData, error) {
	return protocol.PlatformData{}, nil
}

func (f *safFilesystem) GetXattr(_ string, _ fs.XattrFilter) ([]protocol.Xattr, error) {
	return nil, fs.ErrXattrsNotSupported
}

func (f *safFilesystem) SetXattr(_ string, _ []protocol.Xattr, _ fs.XattrFilter) error {
	return fs.ErrXattrsNotSupported
}

// --- Batch Stat (performance) ---

// StatBatch stats multiple paths in a single JNI crossing.
// Returns results in the same order as the input paths.
func (f *safFilesystem) StatBatch(paths []string) ([]fs.FileInfo, error) {
	cleaned := make([]string, len(paths))
	for i, p := range paths {
		cleaned[i] = cleanRel(p)
	}
	pathsJSON, err := json.Marshal(cleaned)
	if err != nil {
		return nil, err
	}
	raw, err := f.bridge.StatBatchJSON(f.treeURI, string(pathsJSON))
	if err != nil {
		return nil, err
	}
	var stats []safStatJSON
	if err := json.Unmarshal([]byte(raw), &stats); err != nil {
		return nil, err
	}
	infos := make([]fs.FileInfo, len(stats))
	for i, s := range stats {
		if !s.Exists {
			infos[i] = nil
			continue
		}
		infos[i] = newSAFFileInfo(s)
	}
	return infos, nil
}

// --- helpers ---

// wrapNotFound converts bridge errors containing "not found" into fs.ErrNotExist
// so syncthing's error checks (errors.Is(err, fs.ErrNotExist)) work correctly.
func wrapNotFound(err error) error {
	if err == nil {
		return nil
	}
	msg := strings.ToLower(err.Error())
	if strings.Contains(msg, "not found") ||
		strings.Contains(msg, "no such file") ||
		strings.Contains(msg, "filenotfound") {
		return fmt.Errorf("%s: %w", err.Error(), fs.ErrNotExist)
	}
	return err
}

// cleanRel normalises a path to a clean relative form suitable for SAF.
// "" and "." both mean the tree root.
func cleanRel(name string) string {
	name = filepath.Clean(name)
	name = strings.TrimPrefix(name, "/")
	if name == "." {
		return ""
	}
	return name
}

func flagsToSAFMode(flags int) string {
	switch {
	case flags&os.O_RDWR != 0:
		if flags&os.O_TRUNC != 0 {
			return "wt"
		}
		return "rw"
	case flags&os.O_WRONLY != 0:
		if flags&os.O_TRUNC != 0 {
			return "wt"
		}
		return "w"
	default:
		return "r"
	}
}
