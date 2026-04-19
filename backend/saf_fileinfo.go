package gobridge

import (
	"encoding/json"
	"time"

	"github.com/syncthing/syncthing/lib/fs"
)

// safStatJSON is the JSON shape returned by SAFBridge.StatJSON / WalkJSON.
type safStatJSON struct {
	Name      string `json:"name"`
	Size      int64  `json:"size"`
	ModTimeMs int64  `json:"modTimeMs"`
	IsDir     bool   `json:"isDir"`
	Exists    bool   `json:"exists"`
}

func parseStat(jsonStr string) (safStatJSON, error) {
	var s safStatJSON
	err := json.Unmarshal([]byte(jsonStr), &s)
	return s, err
}

func parseStatList(jsonStr string) ([]safStatJSON, error) {
	var list []safStatJSON
	err := json.Unmarshal([]byte(jsonStr), &list)
	return list, err
}

// safFileInfo implements fs.FileInfo for SAF documents.
type safFileInfo struct {
	name    string
	size    int64
	modTime time.Time
	isDir   bool
}

func newSAFFileInfo(s safStatJSON) *safFileInfo {
	return &safFileInfo{
		name:    s.Name,
		size:    s.Size,
		modTime: time.UnixMilli(s.ModTimeMs),
		isDir:   s.IsDir,
	}
}

func (fi *safFileInfo) Name() string        { return fi.name }
func (fi *safFileInfo) Size() int64         { return fi.size }
func (fi *safFileInfo) ModTime() time.Time  { return fi.modTime }
func (fi *safFileInfo) IsDir() bool         { return fi.isDir }
func (fi *safFileInfo) IsRegular() bool     { return !fi.isDir }
func (fi *safFileInfo) IsSymlink() bool     { return false }
func (fi *safFileInfo) Owner() int          { return 0 }
func (fi *safFileInfo) Group() int          { return 0 }
func (fi *safFileInfo) Sys() interface{}    { return nil }
func (fi *safFileInfo) InodeChangeTime() time.Time { return time.Time{} }

func (fi *safFileInfo) Mode() fs.FileMode {
	if fi.isDir {
		return fs.FileMode(0o755) | fs.FileMode(0o40000) // drwxr-xr-x
	}
	return fs.FileMode(0o644) // -rw-r--r--
}
