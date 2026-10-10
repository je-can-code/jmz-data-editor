package store

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"sync"
)

// fileUpdateLock serializes every write of the editor's own files, so reading a file for what a write
// keeps of it and replacing it happen as one step: two windows saving different parts of one file at
// the same moment each read the other's part and keep it, and neither writes over the other.
var fileUpdateLock sync.Mutex

// UpdateFile changes the file at path as one step under the lock every write of the editor's own files
// takes: the file is read, update works out what to write from what it holds, and that is written
// atomically. update is handed the file's bytes, or nil when there is no file, so a file holding
// nothing and a missing one are never mistaken for each other. An error from update leaves the file
// exactly as it was, and comes back as it is, and so does an update handing back nil, which has
// nothing to write: the file, or its absence, stays as it is, and nothing is announced.
//
// The folder appears with the first file written into it. beforeWrite, when given, is handed the
// exact bytes just before they land, as SaveInMzLayout hands them, so the change they cause can carry
// the name of the window that asked for it.
func UpdateFile(path string, update func(current []byte) ([]byte, error), beforeWrite func(content []byte)) error {
	fileUpdateLock.Lock()
	defer fileUpdateLock.Unlock()

	// a file that is not there yet is nil to update, never an empty file.
	current, err := os.ReadFile(path)
	if err != nil && errors.Is(err, fs.ErrNotExist) == false {
		return err
	}
	if err != nil {
		current = nil
	}

	content, err := update(current)
	if err != nil || content == nil {
		return err
	}

	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	if beforeWrite != nil {
		beforeWrite(content)
	}

	return WriteFileAtomic(path, content)
}
