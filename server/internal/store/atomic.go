package store

import (
	"os"
	"path/filepath"
)

// newFileMode is the permission a file gets when the write creates it, matching Save.
const newFileMode os.FileMode = 0644

// WriteFileAtomic replaces the file at path with data so that no reader, and no crash, ever sees a
// half-written file: the bytes go to a temporary file beside it, reach the disk, and only then take
// the target's name in one rename. A replaced file keeps its permissions; a new one gets 0644.
//
// The temporary file is named `.<name>.<random>.tmp` in the same folder, both so the rename never
// crosses a filesystem and so a watcher can recognise it and stay quiet about it.
func WriteFileAtomic(path string, data []byte) error {
	// keep the permissions of the file being replaced, since CreateTemp would otherwise leave 0600.
	mode := newFileMode
	if info, err := os.Stat(path); err == nil {
		mode = info.Mode().Perm()
	}

	folder := filepath.Dir(path)
	temp, err := os.CreateTemp(folder, "."+filepath.Base(path)+".*.tmp")
	if err != nil {
		return err
	}
	tempPath := temp.Name()

	// remove the temporary file on every way out except success.
	renamed := false
	defer func() {
		if renamed == false {
			_ = os.Remove(tempPath)
		}
	}()

	// write it all and push it to the disk before it can take the real name.
	if _, err := temp.Write(data); err != nil {
		_ = temp.Close()
		return err
	}
	if err := temp.Sync(); err != nil {
		_ = temp.Close()
		return err
	}
	if err := temp.Close(); err != nil {
		return err
	}
	if err := os.Chmod(tempPath, mode); err != nil {
		return err
	}

	if err := os.Rename(tempPath, path); err != nil {
		return err
	}
	renamed = true

	// make the rename itself durable. Best effort: not every platform can sync a folder.
	syncFolder(folder)

	return nil
}

// syncFolder flushes a folder's entries to disk where the platform allows it.
func syncFolder(folder string) {
	handle, err := os.Open(folder)
	if err != nil {
		return
	}
	_ = handle.Sync()
	_ = handle.Close()
}
