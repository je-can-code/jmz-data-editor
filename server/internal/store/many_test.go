package store

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

// WriteFilesAtomic owes a change to a blueprint what WriteFileAtomic owes a save, across every file the change reaches:
// either every file takes its new bytes, or, when anything goes wrong before the renames, every file keeps its old ones,
// with no temporary file left behind anywhere, so the blueprint and its copies on disk never part. The renames follow one
// another with nothing between them, every folder pushed to the disk once only after the last, so a crash has as little
// time as files allow to find them parted. A folder the first file of its kind goes into is made, and each file keeps the
// permissions it had. WithEveryWriteLock holds both write locks while its work runs, and hands back what the work says.

// TestWriteFilesAtomicReplacesEveryFile covers the ordinary act, a new folder included.
func TestWriteFilesAtomicReplacesEveryFile(t *testing.T) {
	// Arrange: one map there already, and the blueprints' folder not there yet.
	root := t.TempDir()
	mapPath := filepath.Join(root, "data", "Map001.json")
	if err := os.MkdirAll(filepath.Dir(mapPath), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(mapPath, []byte("old map"), 0644); err != nil {
		t.Fatal(err)
	}
	blueprintsPath := filepath.Join(root, "jmz-editor", "blueprints.json")

	// Act.
	err := WriteFilesAtomic([]FileWrite{{Path: mapPath, Content: []byte("new map")}, {Path: blueprintsPath, Content: []byte("blueprints")}})

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	assertFileHolds(t, mapPath, "new map")
	assertFileHolds(t, blueprintsPath, "blueprints")
	assertFolderHoldsOnly(t, filepath.Join(root, "data"), "Map001.json")
	assertFolderHoldsOnly(t, filepath.Join(root, "jmz-editor"), "blueprints.json")
}

// TestWriteFilesAtomicRenamesEveryFileBeforePushingAnyFolder covers the gap between the first rename and the last: no
// folder is pushed to the disk until every file holds its new bytes, and each folder is pushed once.
func TestWriteFilesAtomicRenamesEveryFileBeforePushingAnyFolder(t *testing.T) {
	// Arrange: two maps in one folder and the blueprints in another, and a push that notes what every file held then.
	root := t.TempDir()
	files := []FileWrite{
		{Path: filepath.Join(root, "data", "Map001.json"), Content: []byte("new map 1")},
		{Path: filepath.Join(root, "data", "Map002.json"), Content: []byte("new map 2")},
		{Path: filepath.Join(root, "jmz-editor", "blueprints.json"), Content: []byte("new blueprints")},
	}
	for _, file := range files[:2] {
		if err := os.MkdirAll(filepath.Dir(file.Path), 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(file.Path, []byte("old"), 0644); err != nil {
			t.Fatal(err)
		}
	}
	pushed := []string{}
	heldThen := []bool{}
	original := pushFolder
	t.Cleanup(func() { pushFolder = original })
	pushFolder = func(folder string) {
		pushed = append(pushed, folder)
		every := true
		for _, file := range files {
			held, err := os.ReadFile(file.Path)
			every = every && err == nil && string(held) == string(file.Content)
		}
		heldThen = append(heldThen, every)
		original(folder)
	}

	// Act.
	err := WriteFilesAtomic(files)

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	expected := []string{filepath.Join(root, "data"), filepath.Join(root, "jmz-editor")}
	if len(pushed) != len(expected) || pushed[0] != expected[0] || pushed[1] != expected[1] {
		t.Errorf("pushed %v, expected %v", pushed, expected)
	}
	if len(heldThen) != 2 || heldThen[0] == false || heldThen[1] == false {
		t.Errorf("a folder was pushed before every file held its new bytes: %v", heldThen)
	}
}

// TestWriteFilesAtomicLeavesEveryFileWhenOneCannotBeStaged covers a failure before the renames: the files staged first
// are taken away again, and nothing is replaced.
func TestWriteFilesAtomicLeavesEveryFileWhenOneCannotBeStaged(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Windows has no folder permissions to refuse a write")
	}

	// Arrange: the second file's folder refuses new files.
	root := t.TempDir()
	first := filepath.Join(root, "Map001.json")
	locked := filepath.Join(root, "locked")
	if err := os.WriteFile(first, []byte("old"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(locked, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(locked, 0555); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(locked, 0755) })

	// Act.
	err := WriteFilesAtomic([]FileWrite{{Path: first, Content: []byte("new")}, {Path: filepath.Join(locked, "Map002.json"), Content: []byte("new")}})

	// Assert.
	if err == nil {
		t.Fatal("expected the act to fail")
	}
	assertFileHolds(t, first, "old")
	assertFolderHoldsOnly(t, root, "Map001.json", "locked")
	assertFolderHoldsOnly(t, locked)
}

// TestWriteFilesAtomicKeepsEachFilesPermissions guards each replaced file's mode.
func TestWriteFilesAtomicKeepsEachFilesPermissions(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Windows has no permission bits to keep")
	}

	// Arrange: a mode no default would produce.
	root := t.TempDir()
	path := filepath.Join(root, "Map001.json")
	if err := os.WriteFile(path, []byte("old"), 0640); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(path, 0640); err != nil {
		t.Fatal(err)
	}

	// Act.
	err := WriteFilesAtomic([]FileWrite{{Path: path, Content: []byte("new")}})

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	assertMode(t, path, 0640)
}

// TestWithEveryWriteLockHandsBackWhatTheWorkSays covers the lock's pass-through, and that both locks are free after.
func TestWithEveryWriteLockHandsBackWhatTheWorkSays(t *testing.T) {
	// Arrange.
	refusal := os.ErrPermission

	// Act.
	err := WithEveryWriteLock(func() error { return refusal })

	// Assert: a save in MZ's layout can take its lock again at once.
	if err != refusal {
		t.Errorf("the work's answer was lost: %v", err)
	}
	if mzWriteLock.TryLock() == false || fileUpdateLock.TryLock() == false {
		t.Fatal("a lock was left held")
	}
	mzWriteLock.Unlock()
	fileUpdateLock.Unlock()
}
