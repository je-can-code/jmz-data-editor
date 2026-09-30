package store

import (
	"errors"
	"io/fs"
	"os"
	"sync"

	"jmz-data-editor/server/internal/mzjson"
)

// EditorDataFolder is the folder, relative to the project root, holding the editor's own documents:
// blueprints, "goes on top" tile marks, saved layouts, one JSON file per key. It sits beside data/
// rather than inside it so the game never loads it, and inside the project so it is versioned with
// the game it describes.
const EditorDataFolder = "jmz-editor"

// mzWriteLock serializes writes in MZ's layout, so reading the file being replaced for its key order
// and replacing it happen as one step even when two saves of the same file arrive together.
var mzWriteLock sync.Mutex

// SaveInMzLayout writes data to path the way MZ itself would write the file: laid out by layout,
// with strings and numbers written as JavaScript writes them, and with the key order of the file it
// replaces (see mzjson.Render). Saving a document that has not changed reproduces the file byte for
// byte. The write is atomic.
//
// beforeWrite, when given, is handed the exact bytes about to be written, just before the write, so a
// caller can announce them (the change stream credits a change to a save only when the file holds
// what the save wrote). It runs only when the document rendered, and the write can still fail after.
func SaveInMzLayout[T any](data T, path string, layout mzjson.Layout, beforeWrite func(content []byte)) error {
	mzWriteLock.Lock()
	defer mzWriteLock.Unlock()

	// the file being replaced lends its key order; a new file has none to lend.
	template, err := os.ReadFile(path)
	if err != nil && errors.Is(err, fs.ErrNotExist) == false {
		return err
	}

	rendered, err := mzjson.Render(data, template, layout)
	if err != nil {
		return err
	}

	if beforeWrite != nil {
		beforeWrite(rendered)
	}

	return WriteFileAtomic(path, rendered)
}

// RestoreFile brings back a file that was removed, exactly as it was: content is written byte for byte, with
// nothing re-rendered, but only where no file exists, answering fs.ErrExist otherwise. It shares the lock saves in
// MZ's layout take, so a restore and a save of the same file never interleave. The write is atomic, and
// beforeWrite, when given, is handed the bytes just before they land, as SaveInMzLayout does.
func RestoreFile(path string, content []byte, beforeWrite func(content []byte)) error {
	mzWriteLock.Lock()
	defer mzWriteLock.Unlock()

	// a file that is there is not a removed one; restoring over it would throw its content away.
	_, err := os.Stat(path)
	if err == nil {
		return fs.ErrExist
	}
	if errors.Is(err, fs.ErrNotExist) == false {
		return err
	}

	if beforeWrite != nil {
		beforeWrite(content)
	}

	return WriteFileAtomic(path, content)
}
