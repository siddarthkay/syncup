package gobridge

import (
	"os"

	"github.com/syncthing/syncthing/lib/fs"
)

// safFile implements fs.File by wrapping an *os.File created from a file
// descriptor obtained via SAFBridge.OpenFd. Data I/O goes directly through
// the fd with zero JNI overhead; only Stat() crosses back to SAFBridge.
type safFile struct {
	osFile  *os.File
	name    string // relative path within the SAF tree
	bridge  SAFBridge
	treeURI string
}

func newSAFFile(fd int, name, treeURI string, bridge SAFBridge) *safFile {
	return &safFile{
		osFile:  os.NewFile(uintptr(fd), name),
		name:    name,
		bridge:  bridge,
		treeURI: treeURI,
	}
}

func (f *safFile) Read(b []byte) (int, error)            { return f.osFile.Read(b) }
func (f *safFile) ReadAt(b []byte, off int64) (int, error) { return f.osFile.ReadAt(b, off) }
func (f *safFile) Write(b []byte) (int, error)            { return f.osFile.Write(b) }
func (f *safFile) WriteAt(b []byte, off int64) (int, error) { return f.osFile.WriteAt(b, off) }
func (f *safFile) Seek(offset int64, whence int) (int64, error) { return f.osFile.Seek(offset, whence) }
func (f *safFile) Truncate(size int64) error              { return f.osFile.Truncate(size) }
func (f *safFile) Sync() error                            { return f.osFile.Sync() }
func (f *safFile) Close() error                           { return f.osFile.Close() }
func (f *safFile) Name() string                           { return f.name }

func (f *safFile) Stat() (fs.FileInfo, error) {
	raw, err := f.bridge.StatJSON(f.treeURI, f.name)
	if err != nil {
		return nil, err
	}
	s, err := parseStat(raw)
	if err != nil {
		return nil, err
	}
	if !s.Exists {
		return nil, fs.ErrNotExist
	}
	return newSAFFileInfo(s), nil
}
