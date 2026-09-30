package db

import (
	"os"
	"path/filepath"
)

// gameDataDir is where tests that read the real game find its data folder.
//
// The sibling checkout beside jmz-data-editor is the default, as it always has been. JMZ_PROJECT_ROOT,
// the variable the server itself reads, takes precedence when it is set, because a checkout that
// lives anywhere else (a second worktree, say) has no sibling for the relative path to find, and
// every test that depends on it would quietly skip.
func gameDataDir() string {
	if root := os.Getenv("JMZ_PROJECT_ROOT"); root != "" {
		return filepath.Join(root, "data")
	}

	return chefAdventureData
}
