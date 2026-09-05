package plugins

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// TestJabsConfigurationRoundTripPreservesEveryBlock is the guard for the failure mode JabsConfiguration's
// own doc comment warns about: a save decodes the request body into the struct and re-marshals it, so a
// top-level block the struct does not declare is erased from the file rather than merely ignored.
//
// The game reads several of these blocks at boot and destructures them without checking, so losing one
// is not a cosmetic diff — it is a crash on next launch.
func TestJabsConfigurationRoundTripPreservesEveryBlock(t *testing.T) {
	// Arrange- one representative value per top-level block the file is known to carry. The values
	// themselves do not matter; their survival does.
	original := []byte(`{
		"teams": [ { "id": 0, "key": "ALLY", "name": "Allies", "opposes": [ 1 ] } ],
		"juice": { "target": { "physicalSquishIntensity": 0.12 } },
		"metrics": { "enemiesDefeated": 61 },
		"loot": { "magnetRadius": 3 },
		"bosses": [],
		"foodTypes": [ { "key": "protein", "name": "Protein", "iconIndex": 1 } ]
	}`)

	// Act- the exact decode/encode pair a save performs.
	var config JabsConfiguration
	if err := json.Unmarshal(original, &config); err != nil {
		t.Fatal(err)
	}

	saved, err := json.Marshal(config)
	if err != nil {
		t.Fatal(err)
	}

	var reloaded map[string]json.RawMessage
	if err := json.Unmarshal(saved, &reloaded); err != nil {
		t.Fatal(err)
	}

	// Assert- every block that went in comes back out.
	for _, block := range []string{"teams", "juice", "metrics", "loot", "bosses", "foodTypes"} {
		if _, ok := reloaded[block]; !ok {
			t.Errorf("block %q was erased by the round trip; JabsConfiguration must declare it", block)
		}
	}
}

// TestJabsConfigurationRoundTripPreservesChefAdventureBlocks runs the same guard against the real file
// beside this repo, so a block Jeremy adds to the live config is caught here rather than at game boot.
func TestJabsConfigurationRoundTripPreservesChefAdventureBlocks(t *testing.T) {
	// Arrange- the sibling `ca` repo is optional; skip when it is not checked out beside this one.
	caData := filepath.Join("..", "..", "..", "..", "..", "ca", "chef-adventure", "data")
	if _, err := os.Stat(caData); err != nil {
		t.Skip("ca/chef-adventure/data not present beside jmz-data-editor (optional)")
	}

	bytes, err := os.ReadFile(filepath.Join(caData, "config.jabs.json"))
	if err != nil {
		t.Fatal(err)
	}

	var before map[string]json.RawMessage
	if err := json.Unmarshal(bytes, &before); err != nil {
		t.Fatal(err)
	}

	// Act- decode into the typed struct and re-encode, exactly as a save does.
	var config JabsConfiguration
	if err := json.Unmarshal(bytes, &config); err != nil {
		t.Fatal(err)
	}

	saved, err := json.Marshal(config)
	if err != nil {
		t.Fatal(err)
	}

	var after map[string]json.RawMessage
	if err := json.Unmarshal(saved, &after); err != nil {
		t.Fatal(err)
	}

	// Assert- no top-level key present on disk went missing.
	for block := range before {
		if _, ok := after[block]; !ok {
			t.Errorf("block %q exists in config.jabs.json but is erased by a save; declare it on JabsConfiguration", block)
		}
	}
}
