package store

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

// WriteFileAtomic owes its callers a file that is either entirely the old bytes or entirely the new
// ones, whatever happens part-way through, with the permissions the game's files already had and no
// debris left behind. A save that leaves half a map, a stray temporary file in data/, or a map only
// its owner can read would each be found by somebody else, later, far from the cause.

// TestWriteFileAtomicReplacesTheContent covers the ordinary save.
func TestWriteFileAtomicReplacesTheContent(t *testing.T) {
	// Arrange.
	folder := t.TempDir()
	path := filepath.Join(folder, "Map001.json")
	if err := os.WriteFile(path, []byte("old"), 0644); err != nil {
		t.Fatal(err)
	}

	// Act.
	err := WriteFileAtomic(path, []byte("new"))

	// Assert- the new bytes, and nothing else left in the folder.
	if err != nil {
		t.Fatal(err)
	}
	assertFileHolds(t, path, "new")
	assertFolderHoldsOnly(t, folder, "Map001.json")
}

// TestWriteFileAtomicKeepsTheReplacedFilesPermissions guards against the temporary file's private
// 0600 mode quietly becoming the map's.
func TestWriteFileAtomicKeepsTheReplacedFilesPermissions(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Windows has no permission bits to keep")
	}

	// Arrange- a mode no default would produce.
	folder := t.TempDir()
	path := filepath.Join(folder, "Map001.json")
	if err := os.WriteFile(path, []byte("old"), 0640); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(path, 0640); err != nil {
		t.Fatal(err)
	}

	// Act.
	err := WriteFileAtomic(path, []byte("new"))

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	assertMode(t, path, 0640)
}

// TestWriteFileAtomicCreatesNewFilesReadable covers a new map, which gets the same 0644 as Save.
func TestWriteFileAtomicCreatesNewFilesReadable(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Windows has no permission bits to check")
	}

	// Arrange.
	folder := t.TempDir()
	path := filepath.Join(folder, "Map002.json")

	// Act.
	err := WriteFileAtomic(path, []byte("new"))

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	assertFileHolds(t, path, "new")
	assertMode(t, path, 0644)
}

// TestWriteFileAtomicLeavesNothingBehindWhenItFails makes the rename fail, by aiming the write at a
// folder, and checks the temporary file is cleaned up and the folder untouched.
func TestWriteFileAtomicLeavesNothingBehindWhenItFails(t *testing.T) {
	// Arrange- a non-empty folder where the file should be, which no rename may replace.
	parent := t.TempDir()
	target := filepath.Join(parent, "Map003.json")
	if err := os.Mkdir(target, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(target, "keep"), []byte("kept"), 0644); err != nil {
		t.Fatal(err)
	}

	// Act.
	err := WriteFileAtomic(target, []byte("new"))

	// Assert.
	if err == nil {
		t.Fatal("expected writing over a folder to fail")
	}
	assertFolderHoldsOnly(t, parent, "Map003.json")
	assertFileHolds(t, filepath.Join(target, "keep"), "kept")
}

// assertFileHolds checks a file's exact content.
func assertFileHolds(t *testing.T, path string, expected string) {
	t.Helper()

	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(content) != expected {
		t.Errorf("%s holds %q, expected %q", filepath.Base(path), content, expected)
	}
}

// assertFolderHoldsOnly checks a folder holds exactly the named entries, so a stray temporary file
// fails the test.
func assertFolderHoldsOnly(t *testing.T, folder string, names ...string) {
	t.Helper()

	entries, err := os.ReadDir(folder)
	if err != nil {
		t.Fatal(err)
	}

	found := []string{}
	for _, entry := range entries {
		found = append(found, entry.Name())
	}
	if len(found) != len(names) {
		t.Fatalf("folder holds %v, expected %v", found, names)
	}
	for index := range names {
		if found[index] != names[index] {
			t.Fatalf("folder holds %v, expected %v", found, names)
		}
	}
}

// assertMode checks a file's permission bits.
func assertMode(t *testing.T, path string, expected os.FileMode) {
	t.Helper()

	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != expected {
		t.Errorf("%s has mode %v, expected %v", filepath.Base(path), info.Mode().Perm(), expected)
	}
}
