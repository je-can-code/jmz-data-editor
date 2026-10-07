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

	return renderInMzLayout(data, path, template, layout, beforeWrite)
}

// UpdateInFileLayout changes the document in the file at path, as one step under the lock every write in MZ's layout
// takes: the file is read and decoded strictly into T, update makes the document to write from it, and that is
// written back atomically in the file's own key order, laid out the way the file already is (see mzjson.LayoutLike)
// rather than in one fixed layout. So whatever update carries over from the file is written back exactly as the file
// held it at that very moment, however old the caller's own copy of it is, and a file MZ keeps on one line stays on one
// line while one the data editor keeps indented stays indented: a save by either app never rewrites the whole file.
//
// A file that is not there, or that does not decode strictly, is an error, and nothing is written: what cannot be read
// cannot be carried over. beforeWrite is handed the exact bytes just before the write, as SaveInMzLayout hands them.
func UpdateInFileLayout[T any](path string, update func(current T) T, beforeWrite func(content []byte)) error {
	mzWriteLock.Lock()
	defer mzWriteLock.Unlock()

	// the file lends what update carries over, its layout and its key order.
	template, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	current, err := decodeStrictly[T](template, path)
	if err != nil {
		return err
	}

	return renderInMzLayout(update(current), path, template, mzjson.LayoutLike(template), beforeWrite)
}

// CreateInMzLayout writes data to path in MZ's layout, as SaveInMzLayout writes a new file, but only where no file
// exists, answering fs.ErrExist otherwise with nothing written. It takes the lock every write in MZ's layout takes,
// so no save or restore of the same file can land between the check and the write: a new map never lands on a file
// that arrived first, whoever wrote it.
func CreateInMzLayout[T any](data T, path string, layout mzjson.Layout, beforeWrite func(content []byte)) error {
	mzWriteLock.Lock()
	defer mzWriteLock.Unlock()

	// a file that is there is somebody's; writing a new map over it would throw its content away.
	_, err := os.Stat(path)
	if err == nil {
		return fs.ErrExist
	}
	if errors.Is(err, fs.ErrNotExist) == false {
		return err
	}

	// a new file has no key order to lend, so it is written in MZ's own.
	return renderInMzLayout(data, path, nil, layout, beforeWrite)
}

// renderInMzLayout renders data in MZ's layout, in the key order of template where it has one, announces the bytes
// and writes them atomically. The caller holds mzWriteLock.
func renderInMzLayout[T any](data T, path string, template []byte, layout mzjson.Layout, beforeWrite func(content []byte)) error {
	rendered, err := mzjson.Render(data, template, layout)
	if err != nil {
		return err
	}

	if beforeWrite != nil {
		beforeWrite(rendered)
	}

	return WriteFileAtomic(path, rendered)
}

// RemoveFile removes the file at path under the lock every write in MZ's layout takes, once allow has agreed
// to it, so whatever allow reads and the removal happen as one step: no save or restore can land between the
// check and the unlink. A refusal from allow comes back as it is, with nothing removed; a file that does not
// exist comes back as fs.ErrNotExist.
func RemoveFile(path string, allow func() error) error {
	mzWriteLock.Lock()
	defer mzWriteLock.Unlock()

	if err := allow(); err != nil {
		return err
	}

	return os.Remove(path)
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
