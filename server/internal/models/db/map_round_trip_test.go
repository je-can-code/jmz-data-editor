package db

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"
	"testing"

	"jmz-data-editor/server/internal/gametest"
)

// TestMapInfosRoundTripKeepsEveryField holds the map tree to the same standard as the database
// tables: whatever MapInfos.json carries, a decode and encode through RpgMapInfo carries too.
//
// `quick` is the field worth watching. MZ writes it on some rows and not others, as false far more
// often than true, so a model that collapsed "absent" into "false" would add it to 288 rows, and one
// that dropped it would erase it from 96.
func TestMapInfosRoundTripKeepsEveryField(t *testing.T) {
	// Arrange- the real file.
	raw := readGameFile(t, "MapInfos.json")

	// Act- the decode/encode pair a save performs.
	var infos []*RpgMapInfo
	saved := roundTrip(t, raw, &infos)

	// Assert- nothing erased, nothing added, nothing altered, at any depth.
	assertNothingLost(t, "MapInfos.json", raw, saved)
}

// TestTilesetsRoundTripKeepsEveryField covers the tilesets, whose 8192 passage flags per row are the
// easiest place in the project for a model to be subtly wrong and still look fine.
func TestTilesetsRoundTripKeepsEveryField(t *testing.T) {
	// Arrange- the real file.
	raw := readGameFile(t, "Tilesets.json")

	// Act.
	var tilesets []*RpgTileset
	saved := roundTrip(t, raw, &tilesets)

	// Assert.
	assertNothingLost(t, "Tilesets.json", raw, saved)
}

// TestEveryMapRoundTripKeepsEveryField runs every map through RpgMap, because the maps are not
// alike: `meta` sits on two of them and on 490 of their events, a few commands carry `collapsed`,
// and move route commands come in three shapes. One sample file would miss most of that.
func TestEveryMapRoundTripKeepsEveryField(t *testing.T) {
	// Arrange- every map file the folder holds.
	entries, err := os.ReadDir(gametest.DataDir(t))
	if err != nil {
		t.Fatal(err)
	}

	// Act and Assert, once per map.
	checked := 0
	for _, entry := range entries {
		name := entry.Name()
		if strings.HasPrefix(name, "Map") == false || strings.HasSuffix(name, ".json") == false || name == "MapInfos.json" {
			continue
		}

		raw := readGameFile(t, name)
		var gameMap RpgMap
		saved := roundTrip(t, raw, &gameMap)
		assertNothingLost(t, name, raw, saved)
		checked++
	}

	// a sweep that quietly saw nothing proves nothing.
	if checked < 300 {
		t.Errorf("expected to sweep the whole map folder, only saw %d", checked)
	}
}

// roundTrip decodes raw into model and returns what encoding the model writes back.
func roundTrip(t *testing.T, raw []byte, model any) []byte {
	t.Helper()

	if err := json.Unmarshal(raw, model); err != nil {
		t.Fatal(err)
	}

	saved, err := json.Marshal(model)
	if err != nil {
		t.Fatal(err)
	}

	return saved
}

// assertNothingLost compares a file with its re-encoded self at every depth, reporting any key that
// was erased or added and any value that changed. Numbers compare as their literal text, so a value
// that survived only approximately still counts as changed.
func assertNothingLost(t *testing.T, name string, before []byte, after []byte) {
	t.Helper()

	differences := []string{}
	compareJSON(decodeGeneric(t, before), decodeGeneric(t, after), name, &differences)

	// report a handful; one broken field repeats on every row that carries it.
	for index, difference := range differences {
		if index == 10 {
			t.Errorf("%s: and %d more", name, len(differences)-index)
			break
		}
		t.Error(difference)
	}
}

// decodeGeneric decodes JSON into maps, slices and literal-text numbers.
func decodeGeneric(t *testing.T, payload []byte) any {
	t.Helper()

	var generic any
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.UseNumber()
	if err := decoder.Decode(&generic); err != nil {
		t.Fatal(err)
	}

	return generic
}

// compareJSON walks two generic JSON values together, noting every place they differ.
func compareJSON(before any, after any, path string, differences *[]string) {
	switch typed := before.(type) {
	case map[string]any:
		other, isObject := after.(map[string]any)
		if isObject == false {
			*differences = append(*differences, fmt.Sprintf("%s: was an object, became %T", path, after))
			return
		}

		// walk the keys in a stable order, so a failure reads the same on every run.
		keys := make([]string, 0, len(typed))
		for key := range typed {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		for _, key := range keys {
			value, present := other[key]
			if present == false {
				*differences = append(*differences, fmt.Sprintf("%s.%s: erased by a save", path, key))
				continue
			}
			compareJSON(typed[key], value, path+"."+key, differences)
		}
		for key := range other {
			if _, present := typed[key]; present == false {
				*differences = append(*differences, fmt.Sprintf("%s.%s: added by a save", path, key))
			}
		}
	case []any:
		other, isArray := after.([]any)
		if isArray == false || len(other) != len(typed) {
			*differences = append(*differences, fmt.Sprintf("%s: array of %d became %v", path, len(typed), describeLength(after)))
			return
		}
		for index := range typed {
			compareJSON(typed[index], other[index], fmt.Sprintf("%s[%d]", path, index), differences)
		}
	default:
		if before != after {
			*differences = append(*differences, fmt.Sprintf("%s: %v became %v", path, before, after))
		}
	}
}

// describeLength says what a value that should have been an array turned into.
func describeLength(value any) string {
	if array, isArray := value.([]any); isArray {
		return fmt.Sprintf("an array of %d", len(array))
	}

	return fmt.Sprintf("%T", value)
}
