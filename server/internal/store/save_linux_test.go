package store

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
)

// Save and SaveSlice owe the data editor's saves what WriteFileAtomic owes the map editor's: a save that stops part-way
// leaves the file exactly as it was, never cut short. The bundled editor ends its API the moment the shell closes or
// dies, so a save can stop at any byte, and a database file cut short is a game that no longer loads.
//
// Stopping a write part-way takes the kernel's cap on how large a file a process may write, which only Linux is relied
// on for here; the file's name keeps it to Linux.

// TestSaveLeavesTheOldFileWholeWhenTheWriteStopsPartWay stops a save part-way, the way a full disk would, and checks
// the file still holds every byte it held before.
func TestSaveLeavesTheOldFileWholeWhenTheWriteStopsPartWay(t *testing.T) {
	// Arrange- a file holding an earlier save, and a save far larger than the cap about to be set.
	folder := t.TempDir()
	path := filepath.Join(folder, "Skills.json")
	earlier := "[\n  \"an earlier save\"\n]"
	if err := os.WriteFile(path, []byte(earlier), 0644); err != nil {
		t.Fatal(err)
	}
	larger := []string{strings.Repeat("a save larger than the cap ", 200)}

	// Act- with no file this process writes allowed past 1 KiB.
	err := withFileSizeCap(t, 1024, func() error {
		return SaveSlice(larger, path)
	})

	// Assert- the save failed where the cap stopped it, the earlier save is whole, and nothing was left beside it.
	if errors.Is(err, syscall.EFBIG) == false {
		t.Fatalf("expected the save to stop at the cap with EFBIG, got %v", err)
	}
	assertFileHolds(t, path, earlier)
	assertFolderHoldsOnly(t, folder, "Skills.json")
}

// withFileSizeCap runs work while no file this process writes may grow past limit bytes, then lifts the cap. A write
// past it fails with EFBIG; the SIGXFSZ the kernel sends alongside is one the Go runtime ignores.
func withFileSizeCap(t *testing.T, limit uint64, work func() error) error {
	t.Helper()

	var original syscall.Rlimit
	if err := syscall.Getrlimit(syscall.RLIMIT_FSIZE, &original); err != nil {
		t.Fatal(err)
	}
	capped := syscall.Rlimit{Cur: limit, Max: original.Max}
	if err := syscall.Setrlimit(syscall.RLIMIT_FSIZE, &capped); err != nil {
		t.Fatal(err)
	}

	// the cap holds for the whole process, so it is lifted however work ends.
	defer func() {
		if err := syscall.Setrlimit(syscall.RLIMIT_FSIZE, &original); err != nil {
			t.Fatal(err)
		}
	}()

	return work()
}
