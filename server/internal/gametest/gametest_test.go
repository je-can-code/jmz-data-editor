package gametest

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Locate owes the real-file tests an honest answer: run against the folder JMZ_PROJECT_ROOT names,
// fail when that folder is not there, and only skip when nobody asked for the game at all. A wrong
// path that quietly skipped every real-file test would print ok and prove nothing.

// TestLocateRefusesAVariableThatNamesNoProject is the silent skip this package exists to prevent.
func TestLocateRefusesAVariableThatNamesNoProject(t *testing.T) {
	// Arrange- a folder with no data/ inside.
	t.Setenv("JMZ_PROJECT_ROOT", t.TempDir())

	// Act.
	_, found, err := Locate()

	// Assert.
	if err == nil || found {
		t.Errorf("expected an error for a project with no data folder, got found=%v err=%v", found, err)
	}
}

// TestLocateUsesTheVariable covers the variable pointing at a real project.
func TestLocateUsesTheVariable(t *testing.T) {
	// Arrange.
	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, "data"), 0755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("JMZ_PROJECT_ROOT", root)

	// Act.
	folder, found, err := Locate()

	// Assert.
	if err != nil || found == false || folder != filepath.Join(root, "data") {
		t.Errorf("located %q found=%v err=%v", folder, found, err)
	}
}

// TestLocateFallsBackToTheSiblingCheckout covers the variable unset, where the game is optional.
func TestLocateFallsBackToTheSiblingCheckout(t *testing.T) {
	// Arrange.
	t.Setenv("JMZ_PROJECT_ROOT", "")

	// Act.
	folder, _, err := Locate()

	// Assert- no error whether or not the sibling is there, and the sibling's path.
	if err != nil {
		t.Fatal(err)
	}
	if strings.HasSuffix(filepath.ToSlash(folder), "/ca/chef-adventure/data") == false {
		t.Errorf("located %q", folder)
	}
}
