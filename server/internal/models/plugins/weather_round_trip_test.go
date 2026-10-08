package plugins

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"jmz-data-editor/server/internal/gametest"
	"jmz-data-editor/server/internal/store"
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

// TestWeatherConfigurationRoundTripsChefAdventure runs the same guard over the real file through the
// store's own strict read, which is the read GET /api/config/weather serves it with, and which the map
// editor's weather draws from: it must load, and every value it holds, at every depth, must come back
// out. The real file is the only copy carrying every authoring note in the position an author
// actually put it, and every knob J-Weather reads off a motion or a preset's layer.
func TestWeatherConfigurationRoundTripsChefAdventure(t *testing.T) {
	// Arrange- optional, like the unmarshal test beside it: gametest decides whether the game's
	// absence skips or fails.
	path := filepath.Join(gametest.DataDir(t), "config.weather.json")
	original, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}

	// Act- the strict read the API performs, then the model written back out.
	config, err := store.Load[WeatherConfiguration](path)
	if err != nil {
		t.Fatal(err)
	}

	saved, err := json.Marshal(config)
	if err != nil {
		t.Fatal(err)
	}

	// Assert- the same document, value for value, compared decoded so the source's spacing does not
	// count.
	if decodeBlock(t, saved) != decodeBlock(t, original) {
		t.Errorf("the round trip changed config.weather.json:\n got %s\nwant %s", decodeBlock(t, saved), decodeBlock(t, original))
	}
}

// TestWeatherConfigurationRefusesABlockItDoesNotDeclare holds the other half of the strict read: a
// top-level block the model has not learned is refused by name rather than read and then dropped, so
// a save can never erase it and the map editor never draws from a file it only half read.
func TestWeatherConfigurationRefusesABlockItDoesNotDeclare(t *testing.T) {
	// Arrange- a near miss of the shipped file: every block it carries, plus one the model does not
	// declare.
	original := []byte(`{
		"motions": { "fall": { "edge": "top", "speedY": 4 } },
		"presets": { "rain": { "stops": { "moderate": [] } } },
		"forecastFonts": { "title": "VictorMono" }
	}`)

	// Act- the strict decode the store's read performs.
	var config WeatherConfiguration
	decoder := json.NewDecoder(bytes.NewReader(original))
	decoder.DisallowUnknownFields()
	err := decoder.Decode(&config)

	// Assert- refused, naming the block.
	if err == nil || strings.Contains(err.Error(), `"forecastFonts"`) == false {
		t.Errorf("expected the undeclared block to be refused by name, got %v", err)
	}
}
