package gobridge

// SAFBridge is implemented in Kotlin and passed to Go via SetSAFBridge().
// Gomobile generates the corresponding Java/Kotlin interface automatically.
// All parameter and return types are gomobile-compatible primitives.
type SAFBridge interface {
	// StatJSON returns JSON: {"name","size","modTimeMs","isDir","exists"}
	// relativePath is relative to the tree URI root; "" means the root itself.
	StatJSON(treeURI string, relativePath string) (string, error)

	// ListChildrenJSON returns a JSON array of stat entries for immediate children.
	ListChildrenJSON(treeURI string, relativePath string) (string, error)

	// OpenFd returns a native file descriptor for read and/or write.
	// mode: "r", "w", "rw", "wt" (write+truncate)
	OpenFd(treeURI string, relativePath string, mode string) (int, error)

	// CreateFile creates a new file under parentRelPath with the given name.
	// mimeType is an Android MIME type (e.g. "application/octet-stream").
	// Returns the relative path of the created file.
	CreateFile(treeURI string, parentRelPath string, name string, mimeType string) (string, error)

	// CreateDir creates a directory under parentRelPath.
	// Returns the relative path of the created directory.
	CreateDir(treeURI string, parentRelPath string, name string) (string, error)

	// Delete removes a file or directory (recursively).
	Delete(treeURI string, relativePath string) error

	// Rename moves/renames a document within the same tree.
	Rename(treeURI string, oldRelPath string, newRelPath string) error

	// SetLastModified sets the modification time (milliseconds since epoch).
	// Best-effort: many SAF providers ignore this.
	SetLastModified(treeURI string, relativePath string, mtimeMs int64) error

	// UsageJSON returns JSON: {"free","total"} in bytes.
	UsageJSON(treeURI string) (string, error)

	// WalkJSON returns a JSON array of all entries recursively under relativePath.
	// Each entry: {"name","size","modTimeMs","isDir"}
	// name is the full relative path from the tree root.
	WalkJSON(treeURI string, relativePath string) (string, error)

	// GetDisplayName returns a user-friendly name for the tree URI
	// (e.g. "SD Card" or "Internal storage / Documents").
	GetDisplayName(treeURI string) (string, error)

	// RegisterWatch starts monitoring a tree URI for changes via
	// Android's ContentObserver. Returns a watch ID.
	RegisterWatch(treeURI string) (int64, error)

	// UnregisterWatch stops monitoring the given watch.
	UnregisterWatch(watchID int64) error

	// PollWatchEventsJSON blocks up to timeoutMs milliseconds and returns
	// a JSON array of change events: [{"type":"nonremove"|"remove","path":"..."}].
	// Returns "[]" if no events within the timeout.
	PollWatchEventsJSON(watchID int64, timeoutMs int64) (string, error)

	// StatBatchJSON accepts a JSON array of relative paths and returns
	// a JSON array of stat results (same shape as StatJSON), one per path.
	// More efficient than calling StatJSON in a loop due to fewer JNI crossings.
	StatBatchJSON(treeURI string, pathsJSON string) (string, error)

	// ValidatePermission checks whether the app still holds read+write
	// access for the given tree URI. Returns true if valid.
	ValidatePermission(treeURI string) bool
}
