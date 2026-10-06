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

// decodeLightingTimeStrictly reads a day and night curve the way the API's read does (store.Load): a field the model
// does not declare, at any depth, is an error rather than something quietly dropped.
func decodeLightingTimeStrictly(t *testing.T, raw []byte) (LightingTimeConfiguration, error) {
	t.Helper()

	var config LightingTimeConfiguration
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	err := decoder.Decode(&config)
	return config, err
}

// TestLightingTimeConfigurationRoundTripPreservesEveryField holds the promise LightingTimeConfiguration's doc comment
// makes: every field the file carries is declared, so reading the file and writing the model back out gives the same
// values, every phase and the whole sequence included, and the map editor draws the sky with exactly what the game reads.
func TestLightingTimeConfigurationRoundTripPreservesEveryField(t *testing.T) {
	// Arrange- two phases with values unlike each other, fractions included, and a sequence naming one twice.
	original := []byte(`{
		"phases": {
			"Dusk":  { "tone": [-30.5, -18, 34, 170], "darkness": 0.72 },
			"Noon":  { "tone": [12, 8, -4, 0],        "darkness": 0 }
		},
		"sequence": [ "Dusk", "Noon", "Dusk" ]
	}`)

	// Act- the strict read, then the model written back out.
	config, err := decodeLightingTimeStrictly(t, original)
	if err != nil {
		t.Fatal(err)
	}

	written, err := json.Marshal(config)
	if err != nil {
		t.Fatal(err)
	}

	// Assert- the same document, value for value, compared decoded so the source's spacing and key order do not count.
	if decodeBlock(t, written) != decodeBlock(t, original) {
		t.Errorf("the round trip changed the curve:\n got %s\nwant %s", decodeBlock(t, written), decodeBlock(t, original))
	}
}

// TestLightingTimeConfigurationRefusesAFieldItDoesNotDeclare holds the other half of that promise: a field the model has
// not learned, inside a phase, is refused rather than ignored, so the editor never draws a sky without something the
// game reads.
func TestLightingTimeConfigurationRefusesAFieldItDoesNotDeclare(t *testing.T) {
	// Arrange- a near miss of the shipped file: one phase carrying a field the model does not declare.
	original := []byte(`{
		"phases": {
			"Night": { "tone": [-34, -14, 40, 95], "darkness": 0.55, "fog": 0.2 }
		},
		"sequence": [ "Night", "Night" ]
	}`)

	// Act.
	_, err := decodeLightingTimeStrictly(t, original)

	// Assert- refused, naming the field.
	if err == nil || strings.Contains(err.Error(), `"fog"`) == false {
		t.Errorf("expected the unknown field to be refused by name, got %v", err)
	}
}

// TestLightingTimeConfigurationRoundTripsChefAdventure runs the same guard over the real file through the store's own
// strict read, which is the read the API serves it with: it must load, and every value it holds must come back out.
func TestLightingTimeConfigurationRoundTripsChefAdventure(t *testing.T) {
	// Arrange- optional, like the other round-trip tests: gametest decides whether the game's absence skips or fails.
	path := filepath.Join(gametest.DataDir(t), "config.lighting-time.json")
	original, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}

	// Act- the strict read the API performs, then the model written back out.
	config, err := store.Load[LightingTimeConfiguration](path)
	if err != nil {
		t.Fatal(err)
	}

	written, err := json.Marshal(config)
	if err != nil {
		t.Fatal(err)
	}

	// Assert- the same document, value for value.
	if decodeBlock(t, written) != decodeBlock(t, original) {
		t.Errorf("the round trip changed config.lighting-time.json:\n got %s\nwant %s", decodeBlock(t, written), decodeBlock(t, original))
	}
}
