package commandlist

import (
	"path/filepath"
	"testing"

	"jmz-data-editor/server/internal/gametest"
)

// TestCountAcrossTheRealProject counts the game's own maps and common events. It proves every shipped map
// reads, and that the counts look like the game: thousands of events, Play SE and Transfer Player among
// the most used, and dozens of distinct plugin commands. The floors sit far below today's counts, so new
// content never breaks them, while a scan that quietly read nothing would.
//
// It runs against the project JMZ_PROJECT_ROOT names, and fails when that names no project, or against
// the sibling checkout when the variable is unset; see gametest.
func TestCountAcrossTheRealProject(t *testing.T) {
	// Arrange.
	root := filepath.Dir(gametest.DataDir(t))

	// Act.
	usage, err := NewCounter().Count(root)

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	if usage.Events < 5000 || usage.Codes["250"] < 500 || usage.Codes["201"] < 500 || len(usage.PluginCommands) < 30 {
		t.Errorf("counted %d events, %d using Play SE, %d using Transfer Player, %d plugin commands",
			usage.Events, usage.Codes["250"], usage.Codes["201"], len(usage.PluginCommands))
	}
}

// TestReadNamesAcrossTheRealProject reads the game's own names: every table reads, and each holds rows.
func TestReadNamesAcrossTheRealProject(t *testing.T) {
	// Arrange.
	root := filepath.Dir(gametest.DataDir(t))

	// Act.
	names, err := ReadNames(root)

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	counts := map[string]int{
		"switches":     len(names.Switches),
		"variables":    len(names.Variables),
		"actors":       len(names.Actors),
		"skills":       len(names.Skills),
		"items":        len(names.Items),
		"states":       len(names.States),
		"commonEvents": len(names.CommonEvents),
		"maps":         len(names.Maps),
	}
	for table, count := range counts {
		if count < 2 {
			t.Errorf("%s holds %d names", table, count)
		}
	}
}
