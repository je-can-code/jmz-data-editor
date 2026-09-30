package store

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"jmz-data-editor/server/internal/gametest"
	"jmz-data-editor/server/internal/models/db"
	"jmz-data-editor/server/internal/mzjson"
)

// TestSaveInMzLayoutReproducesEveryFile is the promise the map editor's saves rest on: a document
// loaded and saved without a change comes back byte for byte, in MZ's own layout.
//
// "Nothing is lost" is necessary and not enough. A save that keeps every field but reorders keys,
// escapes `<` as \u003c or rewrites 1.5e2 still turns a no-op save into a diff across a map file,
// and nobody can review a real change buried inside a reformatted one. So the check is exact.
//
// The body each file is saved from has every object's keys sorted, the way a client that kept none
// of the file's order would send it. What restores the order is the file being replaced, exactly as
// on a real save; a pass here therefore does not depend on the editor's front end preserving order.
//
// A file MZ never wrote cannot come back as it was, because the save writes MZ's layout. Those are
// logged rather than failed, but only once the test has shown that the save changed nothing except
// the layout: the file's own content, laid out MZ's way, must equal what the save wrote.
func TestSaveInMzLayoutReproducesEveryFile(t *testing.T) {
	folder := gametest.DataDir(t)

	t.Run("MapInfos.json", func(t *testing.T) {
		// Arrange, Act and Assert all live in the helper; this names the file and its model.
		assertSaveReproduces[[]*db.RpgMapInfo](t, filepath.Join(folder, "MapInfos.json"), mzjson.TableLayout, tableOf[*db.RpgMapInfo])
	})

	t.Run("Tilesets.json", func(t *testing.T) {
		// Arrange, Act and Assert all live in the helper; this names the file and its model.
		assertSaveReproduces[[]*db.RpgTileset](t, filepath.Join(folder, "Tilesets.json"), mzjson.TableLayout, tableOf[*db.RpgTileset])
	})

	t.Run("CommonEvents.json", func(t *testing.T) {
		// Arrange, Act and Assert all live in the helper; this names the file and its model.
		assertSaveReproduces[[]*db.RpgCommonEvent](t, filepath.Join(folder, "CommonEvents.json"), mzjson.TableLayout, tableOf[*db.RpgCommonEvent])
	})

	t.Run("every map", func(t *testing.T) {
		// Arrange- every map file in the folder, because they differ: `meta` sits on two maps, three
		// orders of event image keys run through one file, and a few maps were written by tools.
		entries, err := os.ReadDir(folder)
		if err != nil {
			t.Fatal(err)
		}

		// Act and Assert, once per map.
		checked := 0
		rewritten := []string{}
		for _, entry := range entries {
			name := entry.Name()
			if strings.HasPrefix(name, "Map") == false || strings.HasSuffix(name, ".json") == false || name == "MapInfos.json" {
				continue
			}
			if assertSaveReproduces[*db.RpgMap](t, filepath.Join(folder, name), mzjson.MapLayout, objectOf[*db.RpgMap]) {
				rewritten = append(rewritten, name)
			}
			checked++
		}

		// a sweep that quietly saw nothing proves nothing.
		if checked < 300 {
			t.Errorf("expected to sweep the whole map folder, only saw %d", checked)
		}
		if len(rewritten) > 0 {
			t.Logf("%d of %d maps are not in MZ's layout and would be rewritten in it: %v", len(rewritten), checked, rewritten)
		}
	})
}

// assertSaveReproduces saves one real file through the same steps a PUT takes and checks the result,
// reporting true when the file came back in MZ's layout rather than its own. whole is the PUT's check
// that a body is complete, which an unchanged real document must pass or it could never be saved.
func assertSaveReproduces[T any](t *testing.T, path string, layout mzjson.Layout, whole func(*mzjson.Value) error) bool {
	t.Helper()

	// Arrange- the file, loaded strictly the way GET loads it.
	original, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	loaded, err := Load[T](path)
	if err != nil {
		t.Fatalf("%s did not load: %v", filepath.Base(path), err)
	}

	// what comes back from a client: the same document with every object's keys sorted.
	body := sortedKeys(t, loaded)

	// the PUT's checks: strict decode, then every key present and null only where it may be.
	var decoded T
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&decoded); err != nil {
		t.Fatalf("%s: the body did not decode: %v", filepath.Base(path), err)
	}
	parsed, err := mzjson.Parse(body)
	if err != nil {
		t.Fatal(err)
	}
	if err := whole(parsed); err != nil {
		t.Fatalf("%s: a save of the unchanged document would be refused: %v", filepath.Base(path), err)
	}

	// the save replaces a copy of the file, so the copy is what lends its key order.
	target := filepath.Join(t.TempDir(), filepath.Base(path))
	if err := os.WriteFile(target, original, 0644); err != nil {
		t.Fatal(err)
	}

	// Act.
	if err := SaveInMzLayout(decoded, target, layout, nil); err != nil {
		t.Fatalf("%s did not save: %v", filepath.Base(path), err)
	}
	written, err := os.ReadFile(target)
	if err != nil {
		t.Fatal(err)
	}

	// Assert- identical, or identical to the file's own content in MZ's layout.
	if bytes.Equal(written, original) {
		return false
	}

	own, err := mzjson.Parse(original)
	if err != nil {
		t.Fatal(err)
	}
	relaid, err := layout(own)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Equal(written, relaid) {
		return true
	}

	offset := firstDifference(written, relaid)
	t.Errorf("%s changed across a save at byte %d:\n  file:  %s\n  saved: %s",
		filepath.Base(path), offset, excerpt(relaid, offset), excerpt(written, offset))
	return false
}

// objectOf is the PUT's completeness check for an object document of model T.
func objectOf[T any](document *mzjson.Value) error {
	return mzjson.RequireEveryKey(document, reflect.TypeFor[T]())
}

// tableOf is the PUT's completeness check for a table of rows of type T.
func tableOf[T any](document *mzjson.Value) error {
	return mzjson.RequireTable(document, reflect.TypeFor[T]())
}

// sortedKeys re-encodes a document with the keys of every object in alphabetical order, numbers
// kept as their literal text, by passing it through Go's generic map, which sorts keys on encode.
func sortedKeys(t *testing.T, document any) []byte {
	t.Helper()

	encoded, err := json.Marshal(document)
	if err != nil {
		t.Fatal(err)
	}

	var generic any
	decoder := json.NewDecoder(bytes.NewReader(encoded))
	decoder.UseNumber()
	if err := decoder.Decode(&generic); err != nil {
		t.Fatal(err)
	}

	sorted, err := json.Marshal(generic)
	if err != nil {
		t.Fatal(err)
	}

	return sorted
}

// firstDifference returns the offset of the first byte at which two slices differ.
func firstDifference(left []byte, right []byte) int {
	for index := 0; index < len(left) && index < len(right); index++ {
		if left[index] != right[index] {
			return index
		}
	}

	return min(len(left), len(right))
}

// excerpt quotes the bytes around an offset, so a failure shows what changed rather than where.
func excerpt(content []byte, offset int) string {
	start := max(0, offset-40)
	end := min(len(content), offset+40)
	return strings.ReplaceAll(string(content[start:end]), "\n", `\n`)
}
