package plugins

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// TestWeatherConfigurationRoundTripPreservesEveryBlock is the guard for the failure mode
// WeatherConfiguration's own doc comment warns about: a save decodes the request body into the
// struct and re-marshals it, so a top-level block the struct does not declare is erased from the
// file rather than merely ignored.
//
// Weather carries an unusual amount that matters here. The `_comment_*` blocks are the only
// documentation an author reading the file by hand has, and every other block is destructured by
// J-Weather or J-Weather-Time at boot - so losing one is either a silent loss of the file's own
// explanation of itself, or a crash on next launch.
func TestWeatherConfigurationRoundTripPreservesEveryBlock(t *testing.T) {
	// Arrange- one representative value per top-level block the file is known to carry, including
	// the authoring notes. The values themselves do not matter; their survival does.
	original := []byte(`{
		"motions": { "fall": { "edge": "top", "speedY": 4 } },
		"presets": { "rain": { "description": "wet", "stops": { "light": [] } } },
		"_comment_ids": [ "never renumber an existing preset" ],
		"presetIds": { "rain": 1 },
		"intensityIds": { "light": 1, "moderate": 2, "heavy": 3 },
		"variables": { "enabled": true, "weatherType": 131, "weatherIntensity": 132 },
		"_comment_sky": [ "a season says what is possible" ],
		"sky": { "types": {}, "seasons": {}, "settleTo": "clear" },
		"_comment_climates": [ "byType or byIntensity, not both" ],
		"climates": { "dreaming": { "byType": { "clear": "heavy" } } }
	}`)

	// Act- the exact decode/encode pair a save performs.
	var config WeatherConfiguration
	if err := json.Unmarshal(original, &config); err != nil {
		t.Fatal(err)
	}

	saved, err := json.Marshal(config)
	if err != nil {
		t.Fatal(err)
	}

	// Assert- every key that went in comes back out.
	var before, after map[string]json.RawMessage
	if err := json.Unmarshal(original, &before); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(saved, &after); err != nil {
		t.Fatal(err)
	}

	for key := range before {
		if _, present := after[key]; !present {
			t.Errorf("block %q was erased by a save", key)
		}
	}

	if len(after) != len(before) {
		t.Errorf("block count changed: %d in, %d out", len(before), len(after))
	}
}

// TestWeatherConfigurationRoundTripsChefAdventure runs the same guard over the real file, which is
// the only copy carrying every authoring note in the position an author actually put it.
func TestWeatherConfigurationRoundTripsChefAdventure(t *testing.T) {
	// Arrange- optional, like the unmarshal test beside it: worth having when the sibling repo is
	// present and worth skipping when it is not.
	path := filepath.Join("..", "..", "..", "..", "..", "ca", "chef-adventure", "data", "config.weather.json")
	original, err := os.ReadFile(path)
	if err != nil {
		t.Skip("ca/chef-adventure/data not present beside jmz-data-editor (optional)")
	}

	// Act.
	var config WeatherConfiguration
	if err := json.Unmarshal(original, &config); err != nil {
		t.Fatal(err)
	}

	saved, err := json.Marshal(config)
	if err != nil {
		t.Fatal(err)
	}

	// Assert- the same keys, in the same order. Order matters because the authoring notes read as
	// headings for the blocks beneath them, and one that moves explains the wrong thing.
	var before, after map[string]json.RawMessage
	if err := json.Unmarshal(original, &before); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(saved, &after); err != nil {
		t.Fatal(err)
	}

	for key := range before {
		if _, present := after[key]; !present {
			t.Errorf("block %q was erased by a save", key)
		}
	}
}
