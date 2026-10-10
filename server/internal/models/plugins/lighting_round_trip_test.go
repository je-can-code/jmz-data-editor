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

// decodeLightingStrictly reads a lighting config the way the API's read does (store.Load): a field the model does not
// declare, at any depth, is an error rather than something quietly dropped.
func decodeLightingStrictly(t *testing.T, raw []byte) (LightingConfiguration, error) {
	t.Helper()

	var config LightingConfiguration
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	err := decoder.Decode(&config)
	return config, err
}

// TestLightingConfigurationRoundTripPreservesEveryField holds the promise LightingConfiguration's doc comment makes:
// every field the file carries is declared, so reading the file and writing the model back out gives the same values,
// nested ones included, and the map editor draws with exactly what the game reads.
func TestLightingConfigurationRoundTripPreservesEveryField(t *testing.T) {
	// Arrange- every field the file carries, each with a value unlike its neighbours, so a field read into the wrong
	// place shows.
	original := []byte(`{
		"light": {
			"radius": 5.5,
			"color": "#ffbb73",
			"intensity": 0.25,
			"effects": {
				"flicker": { "depth": 0.2, "period": 40, "chance": 0.01, "variance": 0.18 },
				"pulse":   { "depth": 0.45, "period": 165, "chance": 0.02, "variance": 0.22 },
				"glitch":  { "depth": 0.85, "period": 55, "chance": 0.28, "variance": 0.12 }
			}
		},
		"ambient": { "color": "#0a2a2a" }
	}`)

	// Act- the strict read, then the model written back out.
	config, err := decodeLightingStrictly(t, original)
	if err != nil {
		t.Fatal(err)
	}

	written, err := json.Marshal(config)
	if err != nil {
		t.Fatal(err)
	}

	// Assert- the same document, value for value, compared decoded so the source's spacing does not count.
	if decodeBlock(t, written) != decodeBlock(t, original) {
		t.Errorf("the round trip changed the config:\n got %s\nwant %s", decodeBlock(t, written), decodeBlock(t, original))
	}
}

// TestLightingConfigurationRefusesAFieldItDoesNotDeclare holds the other half of that promise: a field the model has
// not learned, however deep, is refused rather than ignored, so the editor never draws lights without a default the
// game reads.
func TestLightingConfigurationRefusesAFieldItDoesNotDeclare(t *testing.T) {
	// Arrange- a near miss of the shipped file: one field the model does not declare, inside an effect's tuning.
	original := []byte(`{
		"light": {
			"radius": 5,
			"color": "#FFFFFF",
			"intensity": 0,
			"effects": {
				"flicker": { "depth": 0.2, "period": 40, "chance": 0, "variance": 0.18, "smoothing": 2 },
				"pulse":   { "depth": 0.45, "period": 165, "chance": 0, "variance": 0.22 },
				"glitch":  { "depth": 0.85, "period": 55, "chance": 0.28, "variance": 0.12 }
			}
		},
		"ambient": { "color": "#000000" }
	}`)

	// Act.
	_, err := decodeLightingStrictly(t, original)

	// Assert- refused, naming the field.
	if err == nil || strings.Contains(err.Error(), `"smoothing"`) == false {
		t.Errorf("expected the unknown field to be refused by name, got %v", err)
	}
}

// TestLightingConfigurationRoundTripsChefAdventure runs the same guard over the real file through the store's own
// strict read, which is the read the API serves it with: it must load, and every value it holds must come back out.
func TestLightingConfigurationRoundTripsChefAdventure(t *testing.T) {
	// Arrange- optional, like the other round-trip tests: gametest decides whether the game's absence skips or fails.
	path := filepath.Join(gametest.DataDir(t), "config.lighting.json")
	original, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}

	// Act- the strict read the API performs, then the model written back out.
	config, err := store.Load[LightingConfiguration](path)
	if err != nil {
		t.Fatal(err)
	}

	written, err := json.Marshal(config)
	if err != nil {
		t.Fatal(err)
	}

	// Assert- the same document, value for value.
	if decodeBlock(t, written) != decodeBlock(t, original) {
		t.Errorf("the round trip changed config.lighting.json:\n got %s\nwant %s", decodeBlock(t, written), decodeBlock(t, original))
	}
}
