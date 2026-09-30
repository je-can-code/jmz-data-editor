// Package gametest finds the real game's data folder for the tests that read it.
//
// Those tests are the ones that catch a model falling behind the game's files, so a test that skips
// when it should have run is worse than one that fails: it prints ok and proves nothing. The rules
// here keep the two apart.
package gametest

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

// Locate finds the game's data folder.
//
// When JMZ_PROJECT_ROOT is set, the folder is its data folder, and a missing folder is an error: the
// variable says the game is meant to be there. When it is not set, the folder is the sibling checkout
// beside this repo (../ca/chef-adventure/data), which is optional, so a missing one is not an error.
// found reports whether the folder exists.
func Locate() (folder string, found bool, err error) {
	if root := os.Getenv("JMZ_PROJECT_ROOT"); root != "" {
		folder = filepath.Join(root, "data")
		if isFolder(folder) == false {
			return folder, false, fmt.Errorf("JMZ_PROJECT_ROOT is %s, which has no data folder", root)
		}
		return folder, true, nil
	}

	moduleRoot, err := findModuleRoot()
	if err != nil {
		return "", false, err
	}

	// the module is server/ inside the repo, and the game sits beside the repo.
	folder = filepath.Join(moduleRoot, "..", "..", "ca", "chef-adventure", "data")
	return folder, isFolder(folder), nil
}

// DataDir returns the game's data folder for a test that reads the real files. It fails the test when
// JMZ_PROJECT_ROOT names a project with no data folder, and skips it when the variable is unset and
// the sibling checkout is absent.
func DataDir(t testing.TB) string {
	t.Helper()

	folder, found, err := Locate()
	if err != nil {
		t.Fatal(err)
	}
	if found == false {
		t.Skip("ca/chef-adventure/data not present beside jmz-data-editor, and JMZ_PROJECT_ROOT is not set (optional)")
	}

	return folder
}

// findModuleRoot walks up from the working directory, which is a test's own package folder, to the
// folder holding go.mod, so the sibling path does not depend on how deep the package sits.
func findModuleRoot() (string, error) {
	folder, err := os.Getwd()
	if err != nil {
		return "", err
	}

	for {
		if _, err := os.Stat(filepath.Join(folder, "go.mod")); err == nil {
			return folder, nil
		}
		parent := filepath.Dir(folder)
		if parent == folder {
			return "", errors.New("no go.mod above the working directory")
		}
		folder = parent
	}
}

// isFolder reports whether a path is an existing folder.
func isFolder(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}
