package plugins

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// TestNotetagLinesConfigurationRoundTripPreservesEveryLine guards what a save does to this file: it decodes the
// request body into the struct and re-marshals it, so anything the struct did not carry would be erased. Every
// line has to come back exactly as written, text codes and tokens included, and a line written empty on purpose
// has to stay empty rather than vanish, since an empty line and a missing one mean different things.
func TestNotetagLinesConfigurationRoundTripPreservesEveryLine(t *testing.T) {
	// Arrange- a sentence with tokens, one with a text code, and one left empty on purpose.
	original := []byte(`[
		{ "key": "rewardMultiplier", "template": "Enemies yield {value} {reward}." },
		{ "key": "critMultiplier", "template": "\\C[1]Critical hits\\C[0] deal {value} more damage." },
		{ "key": "stackMax", "template": "" }
	]`)

	// Act- the exact decode/encode pair a save performs.
	var config NotetagLinesConfiguration
	if err := json.Unmarshal(original, &config); err != nil {
		t.Fatal(err)
	}

	saved, err := json.Marshal(config)
	if err != nil {
		t.Fatal(err)
	}

	// Assert- every line, key and words both, comes back as it went in.
	var before, after []map[string]string
	if err := json.Unmarshal(original, &before); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(saved, &after); err != nil {
		t.Fatal(err)
	}

	if len(after) != len(before) {
		t.Fatalf("line count changed: %d in, %d out", len(before), len(after))
	}

	for index, line := range before {
		for field, value := range line {
			if after[index][field] != value {
				t.Errorf("line %d field %q changed: %q in, %q out", index, field, value, after[index][field])
			}
		}
	}
}

// TestNotetagLinesConfigurationRoundTripsChefAdventure runs the same guard over the real file, and checks the save
// writes it back byte for byte, so the first save from the board is never a spurious diff.
func TestNotetagLinesConfigurationRoundTripsChefAdventure(t *testing.T) {
	// Arrange- optional, like the other round-trip tests: worth having when the sibling repo is present and worth
	// skipping when it is not.
	path := filepath.Join("..", "..", "..", "..", "..", "ca", "chef-adventure", "data", "config.notetag-lines.json")
	original, err := os.ReadFile(path)
	if err != nil {
		t.Skip("ca/chef-adventure/data not present beside jmz-data-editor (optional)")
	}

	// Act- decode, then encode exactly as the store saves.
	var config NotetagLinesConfiguration
	if err := json.Unmarshal(original, &config); err != nil {
		t.Fatal(err)
	}

	saved, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		t.Fatal(err)
	}

	// Assert
	if !bytes.Equal(saved, original) {
		t.Errorf("a save would rewrite the file:\n%s", saved)
	}
}
