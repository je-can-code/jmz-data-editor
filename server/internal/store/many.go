package store

import (
	"errors"
	"os"
	"path/filepath"
)

// FileWrite is one file's whole new content, for WriteFilesAtomic.
type FileWrite struct {
	Path    string
	Content []byte
}

// WithEveryWriteLock runs work while holding both locks every write takes: the one writes in MZ's layout take, then the
// one writes of the editor's own files take, always in that order, so nothing else writing any project file can land
// while work reads files and writes them back. work must not call the functions here that take either lock themselves.
func WithEveryWriteLock(work func() error) error {
	mzWriteLock.Lock()
	defer mzWriteLock.Unlock()
	fileUpdateLock.Lock()
	defer fileUpdateLock.Unlock()

	return work()
}

// stagedFile is one file's new content waiting beside it under a temporary name.
type stagedFile struct {
	target string
	temp   string
}

// pushFolder makes the renames in a folder durable once every file of an act has taken its name; a variable so a test can
// see that nothing is pushed before the last rename.
var pushFolder = syncFolder

// WriteFilesAtomic replaces several files as near to one act as files allow: every new content is written to a temporary
// file beside its target and pushed to the disk first, and only once all of them are there does each take its target's
// name, one rename straight after another with nothing between them, and only then is each folder pushed to the disk,
// once, so a crash can find the files parted for no longer than the renames take. A failure before the renames leaves
// every file exactly as it was, and none of the temporary files behind; the renames themselves cannot fail for want of
// space, since the bytes are already on the disk. A file whose folder does not exist yet gets it. A replaced file keeps
// its permissions, a new one gets 0644.
func WriteFilesAtomic(files []FileWrite) error {
	staged := []stagedFile{}
	discard := func() {
		for _, file := range staged {
			_ = os.Remove(file.temp)
		}
	}

	for _, file := range files {
		temp, err := stage(file)
		if err != nil {
			discard()
			return err
		}
		staged = append(staged, stagedFile{target: file.Path, temp: temp})
	}

	// every new content is on the disk, so the files change one rename straight after another.
	var renameErr error
	for index, file := range staged {
		if err := os.Rename(file.temp, file.target); err != nil {
			renameErr = errors.Join(renameErr, err)
			for _, left := range staged[index+1:] {
				_ = os.Remove(left.temp)
			}
			break
		}
	}

	// only then is each folder pushed to the disk, once, since a push between two renames would hold them apart.
	pushed := map[string]bool{}
	for _, file := range staged {
		folder := filepath.Dir(file.target)
		if pushed[folder] == false {
			pushed[folder] = true
			pushFolder(folder)
		}
	}

	return renameErr
}

// stage writes one file's new content to a temporary file beside it and pushes it to the disk, with the permissions the
// file it replaces has, its folder made first when it has none.
func stage(file FileWrite) (string, error) {
	mode := newFileMode
	if info, err := os.Stat(file.Path); err == nil {
		mode = info.Mode().Perm()
	}

	folder := filepath.Dir(file.Path)
	if err := os.MkdirAll(folder, 0755); err != nil {
		return "", err
	}
	temp, err := os.CreateTemp(folder, "."+filepath.Base(file.Path)+".*.tmp")
	if err != nil {
		return "", err
	}

	written := false
	defer func() {
		if written == false {
			_ = os.Remove(temp.Name())
		}
	}()
	if _, err := temp.Write(file.Content); err != nil {
		_ = temp.Close()
		return "", err
	}
	if err := temp.Sync(); err != nil {
		_ = temp.Close()
		return "", err
	}
	if err := temp.Close(); err != nil {
		return "", err
	}
	if err := os.Chmod(temp.Name(), mode); err != nil {
		return "", err
	}

	written = true
	return temp.Name(), nil
}
