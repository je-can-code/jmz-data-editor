package plugins

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// TestMotionConfigurationRoundTripPreservesEveryBlock is the guard for the failure mode
// MotionConfiguration's own doc comment warns about: a save decodes the request body into the struct
// and re-marshals it, so a top-level block the struct does not declare is erased from the file
// rather than merely ignored.
//
// J-Motion and its extensions destructure these blocks at boot, so losing one is a crash on next
// launch rather than a missing default.
func TestMotionConfigurationRoundTripPreservesEveryBlock(t *testing.T) {
	// Arrange- one representative value per top-level block the file is known to carry. The values
	// themselves do not matter; their survival does.
	original := []byte(`{
		"breathe": { "amount": 0.05, "period": 150 },
		"stretch": { "amount": 0.05, "period": 150 },
		"pulse": { "amount": 0.05, "period": 150 },
		"float": { "distance": 12, "period": 180 },
		"sway": { "distance": 6, "period": 200 },
		"swing": { "angle": 8, "period": 170 },
		"spin": { "period": 120, "direction": "cw" },
		"ghost": { "min": 0.25, "max": 1.0, "period": 240 },
		"flicker": { "min": 0.6, "max": 1.0, "interval": 6 },
		"shake": { "strength": 4, "axis": "x", "interval": 1 },
		"hop": { "height": 24, "duration": 24, "rest": 30 },
		"throb": { "red": 0, "green": 0, "blue": 80, "gray": 0, "period": 120 },
		"flash": { "color": "#ffffff", "period": 40 },
		"scale": { "percent": 150, "duration": 30 },
		"angle": { "degrees": 90, "duration": 30 },
		"fade": { "percent": 50, "duration": 30 },
		"hue": { "degrees": 180, "duration": 30 },
		"tint": { "color": "#ffa0a0", "duration": 30 },
		"collapse": { "style": "swift", "duration": 30 },
		"death": { "defaultStyle": "swift", "durations": { "swift": 30 } },
		"loot": { "expiryWarnFrames": 300, "expiryFadeFrames": 120, "flicker": { "min": 0.2 } }
	}`)

	// Act- the exact decode/encode pair a save performs.
	var config MotionConfiguration
	if err := json.Unmarshal(original, &config); err != nil {
		t.Fatal(err)
	}

	saved, err := json.Marshal(config)
	if err != nil {
		t.Fatal(err)
	}

	var before map[string]json.RawMessage
	if err := json.Unmarshal(original, &before); err != nil {
		t.Fatal(err)
	}

	var after map[string]json.RawMessage
	if err := json.Unmarshal(saved, &after); err != nil {
		t.Fatal(err)
	}

	// Assert- every block that went in comes back out, carrying what it went in with. Compared as
	// decoded values rather than as bytes, because re-marshalling legitimately drops the source
	// file's whitespace and that is not a change anybody cares about.
	for block, originalValue := range before {
		savedValue, ok := after[block]
		if !ok {
			t.Errorf("block %q was erased by the round trip; MotionConfiguration must declare it", block)
			continue
		}

		if decodeBlock(t, originalValue) != decodeBlock(t, savedValue) {
			t.Errorf("block %q survived but changed: got %s, want %s", block, savedValue, originalValue)
		}
	}
}

// decodeBlock renders one config block in a canonical form, so two encodings of the same data
// compare equal regardless of how the source was spaced.
func decodeBlock(t *testing.T, raw json.RawMessage) string {
	t.Helper()

	var decoded any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatal(err)
	}

	canonical, err := json.Marshal(decoded)
	if err != nil {
		t.Fatal(err)
	}

	return string(canonical)
}

// TestMotionConfigurationRoundTripPreservesChefAdventureBlocks runs the same guard against the real
// file beside this repo, so a block Jeremy adds to the live config is caught here rather than at
// game boot.
func TestMotionConfigurationRoundTripPreservesChefAdventureBlocks(t *testing.T) {
	// Arrange- the sibling `ca` repo is optional; skip when it is not checked out beside this one.
	caData := filepath.Join("..", "..", "..", "..", "..", "ca", "chef-adventure", "data")
	if _, err := os.Stat(caData); err != nil {
		t.Skip("ca/chef-adventure/data not present beside jmz-data-editor (optional)")
	}

	bytes, err := os.ReadFile(filepath.Join(caData, "config.motion.json"))
	if err != nil {
		t.Fatal(err)
	}

	var before map[string]json.RawMessage
	if err := json.Unmarshal(bytes, &before); err != nil {
		t.Fatal(err)
	}

	// Act- decode into the typed struct and re-encode, exactly as a save does.
	var config MotionConfiguration
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
			t.Errorf("block %q exists in config.motion.json but is erased by a save; declare it on MotionConfiguration", block)
		}
	}
}
