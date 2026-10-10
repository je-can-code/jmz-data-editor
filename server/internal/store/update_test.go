package store

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

// UpdateFile owes the editor's own files one promise: a write that keeps part of a file keeps it as
// the file holds it at that very moment. Two windows each writing their own part of one file at once
// must both land, whatever order the server takes them in, so reading the file and replacing it are
// one step. A file that is not there is told apart from one holding nothing, a refused update leaves
// the file exactly as it was, so does one with nothing to write, which makes no folder either, and the
// folder appears with the first file written into it.

// TestUpdateFileHandsOverTheFileAsItStands covers the ordinary write: the update sees the file's own
// bytes, and what it returns is what lands, announced first.
func TestUpdateFileHandsOverTheFileAsItStands(t *testing.T) {
	// Arrange.
	folder := t.TempDir()
	path := filepath.Join(folder, "record.json")
	if err := os.WriteFile(path, []byte("old"), 0644); err != nil {
		t.Fatal(err)
	}
	seen := ""
	announced := ""

	// Act.
	err := UpdateFile(path, func(current []byte) ([]byte, error) {
		seen = string(current)
		return []byte(seen + "+new"), nil
	}, func(content []byte) {
		announced = string(content)
	})

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	if seen != "old" || announced != "old+new" {
		t.Errorf("the update saw %q and announced %q", seen, announced)
	}
	assertFileHolds(t, path, "old+new")
	assertFolderHoldsOnly(t, folder, "record.json")
}

// TestUpdateFileTellsAMissingFileFromAnEmptyOne covers the first write of a file, into a folder that
// is not there yet, beside the write of a file that is there and holds nothing.
func TestUpdateFileTellsAMissingFileFromAnEmptyOne(t *testing.T) {
	// Arrange- one file missing with its folder, and one there and empty.
	root := t.TempDir()
	missing := filepath.Join(root, "jmz-editor", "record.json")
	empty := filepath.Join(root, "empty.json")
	if err := os.WriteFile(empty, nil, 0644); err != nil {
		t.Fatal(err)
	}
	seen := map[string]bool{}

	// Act.
	for _, path := range []string{missing, empty} {
		err := UpdateFile(path, func(current []byte) ([]byte, error) {
			seen[path] = current == nil
			return []byte("written"), nil
		}, nil)
		if err != nil {
			t.Fatal(err)
		}
	}

	// Assert- nil for the missing file alone, and both written.
	if seen[missing] == false || seen[empty] {
		t.Errorf("the update was told the missing file is nil: %v, and the empty one: %v", seen[missing], seen[empty])
	}
	assertFileHolds(t, missing, "written")
	assertFileHolds(t, empty, "written")
}

// TestUpdateFileLeavesTheFileWhenTheUpdateRefuses covers a refusal: the error comes back as it is,
// nothing is announced, and the file keeps every byte.
func TestUpdateFileLeavesTheFileWhenTheUpdateRefuses(t *testing.T) {
	// Arrange.
	folder := t.TempDir()
	path := filepath.Join(folder, "record.json")
	if err := os.WriteFile(path, []byte("kept"), 0644); err != nil {
		t.Fatal(err)
	}
	refusal := errors.New("not a record")
	announced := false

	// Act.
	err := UpdateFile(path, func(current []byte) ([]byte, error) {
		return nil, refusal
	}, func(content []byte) {
		announced = true
	})

	// Assert.
	if errors.Is(err, refusal) == false {
		t.Errorf("expected the update's own refusal, got %v", err)
	}
	if announced {
		t.Error("a refused update was still announced")
	}
	assertFileHolds(t, path, "kept")
	assertFolderHoldsOnly(t, folder, "record.json")
}

// TestUpdateFileWritesNothingForAnUpdateWithNothingToWrite covers an update handing back nil: a file
// keeps every byte and its time, a missing file stays missing with no folder made for it, and nothing is
// announced.
func TestUpdateFileWritesNothingForAnUpdateWithNothingToWrite(t *testing.T) {
	// Arrange- one file there, its time set well back, and one missing with its folder.
	root := t.TempDir()
	kept := filepath.Join(root, "record.json")
	missing := filepath.Join(root, "jmz-editor", "record.json")
	if err := os.WriteFile(kept, []byte("kept"), 0644); err != nil {
		t.Fatal(err)
	}
	then := time.Date(2020, 1, 2, 3, 4, 5, 0, time.UTC)
	if err := os.Chtimes(kept, then, then); err != nil {
		t.Fatal(err)
	}
	announced := 0

	// Act.
	for _, path := range []string{kept, missing} {
		err := UpdateFile(path, func(current []byte) ([]byte, error) {
			return nil, nil
		}, func(content []byte) {
			announced++
		})
		if err != nil {
			t.Fatal(err)
		}
	}

	// Assert.
	assertFileHolds(t, kept, "kept")
	info, err := os.Stat(kept)
	if err != nil {
		t.Fatal(err)
	}
	if info.ModTime().Equal(then) == false {
		t.Errorf("the kept file was written again, at %v", info.ModTime())
	}
	if _, err := os.Stat(filepath.Dir(missing)); errors.Is(err, fs.ErrNotExist) == false {
		t.Errorf("the missing file's folder was made, or could not be looked for: %v", err)
	}
	if announced != 0 {
		t.Errorf("an update with nothing to write was announced %d times", announced)
	}
}

// TestUpdateFileNeverLosesAConcurrentUpdate is the promise the lock keeps: many writers, each adding
// its own line to one file at the same time, all land, none writing over another's.
func TestUpdateFileNeverLosesAConcurrentUpdate(t *testing.T) {
	// Arrange.
	path := filepath.Join(t.TempDir(), "record.json")
	const writers = 40
	var group sync.WaitGroup

	// Act- every writer at once.
	for index := 0; index < writers; index++ {
		group.Add(1)
		go func(index int) {
			defer group.Done()
			err := UpdateFile(path, func(current []byte) ([]byte, error) {
				return append(current, []byte(fmt.Sprintf("line %d\n", index))...), nil
			}, nil)
			if err != nil {
				t.Error(err)
			}
		}(index)
	}
	group.Wait()

	// Assert- one line per writer, each once.
	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(strings.TrimSuffix(string(content), "\n"), "\n")
	if len(lines) != writers {
		t.Fatalf("expected %d lines, the file holds %d:\n%s", writers, len(lines), content)
	}
	for index := 0; index < writers; index++ {
		if strings.Count(string(content), fmt.Sprintf("line %d\n", index)) != 1 {
			t.Errorf("line %d is not in the file exactly once", index)
		}
	}
}
