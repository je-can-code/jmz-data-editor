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

// TestSaveInFileLayoutKeepsSystemJsonAsEitherAppLeftIt is the promise the switch and variable
// window rests on, held against the game's real System.json, read and never written, in both layouts
// it lives in: on one line, as MZ keeps it, and indented, as the data editor's own save leaves it,
// which is made here from the real file, into a temporary folder, by that very save. In each, a save
// of the unchanged settings gives back the file byte for byte, and renaming a switch changes that one
// name in the file, and every other byte stays as it was.
//
// The switch renamed is the first whose name the file holds exactly once, so the file with that name
// replaced in place is exactly the file a rename must write, whatever else the game has renamed
// since. The new name carries a `<`, an `&`, quotes and characters beyond ASCII, which the two apps
// spell differently: the saved line must spell them as the rest of its own file does. The body each
// save is made from has every object's keys sorted, as a client keeping no order would send them, so
// the file's key order comes from the file being replaced, as on a real save.
func TestSaveInFileLayoutKeepsSystemJsonAsEitherAppLeftIt(t *testing.T) {
	path := filepath.Join(gametest.DataDir(t), "System.json")
	original, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	system, err := Load[*db.RpgSystem](path)
	if err != nil {
		t.Fatalf("System.json did not load: %v", err)
	}

	// the data editor's POST /api/system save of the same settings: its own writer, into a temporary folder.
	indentedPath := filepath.Join(t.TempDir(), "System.json")
	if err := Save(system, indentedPath); err != nil {
		t.Fatal(err)
	}
	indented, err := os.ReadFile(indentedPath)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.HasPrefix(indented, []byte("{\n  \"advanced\": {\n    \"gameId\": ")) == false {
		t.Fatalf("the data editor no longer saves System.json indented as this test expects:\n%s", excerpt(indented, 0))
	}

	cases := []struct {
		name    string
		file    []byte
		spell   func(t *testing.T, name string) []byte
		renamed string
	}{
		{name: "MZ's one line", file: original, spell: quoted, renamed: `"Vampire's <gone> & \"dusted\" — ✓"`},
		{name: "the data editor's indent", file: indented, spell: goQuoted, renamed: "\"Vampire's \\u003cgone\\u003e \\u0026 \\\"dusted\\\" — ✓\""},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			// Arrange- the file where a save may write, and the first named switch whose name, spelled as the file
			// spells it, appears nowhere else in it.
			target := filepath.Join(t.TempDir(), "System.json")
			if err := os.WriteFile(target, testCase.file, 0644); err != nil {
				t.Fatal(err)
			}
			switchId := 0
			for id, name := range system.Switches {
				if name != "" && bytes.Count(testCase.file, testCase.spell(t, name)) == 1 {
					switchId = id
					break
				}
			}
			if switchId == 0 {
				t.Fatal("System.json names no switch a rename could be told apart by")
			}
			renamed := *system
			renamed.Switches = append([]string{}, system.Switches...)
			renamed.Switches[switchId] = "Vampire's <gone> & \"dusted\" — ✓"

			// Act- the unchanged settings saved, then the rename.
			saveFromClient(t, system, target)
			unchanged, err := os.ReadFile(target)
			if err != nil {
				t.Fatal(err)
			}
			saveFromClient(t, &renamed, target)
			written, err := os.ReadFile(target)
			if err != nil {
				t.Fatal(err)
			}

			// Assert- the file as it was, then with that one name replaced, spelled as the file spells its strings.
			if bytes.Equal(unchanged, testCase.file) == false {
				offset := firstDifference(unchanged, testCase.file)
				t.Errorf("an unchanged save changed the file at byte %d:\n  file:  %s\n  saved: %s",
					offset, excerpt(testCase.file, offset), excerpt(unchanged, offset))
			}
			expected := bytes.Replace(testCase.file, testCase.spell(t, system.Switches[switchId]), []byte(testCase.renamed), 1)
			if bytes.Equal(written, expected) == false {
				offset := firstDifference(written, expected)
				t.Errorf("renaming switch %d changed more than its name, at byte %d:\n  expected: %s\n  saved:    %s",
					switchId, offset, excerpt(expected, offset), excerpt(written, offset))
			}
		})
	}
}

// saveFromClient saves settings as PUT /api/system does: as a client's body, with every object's keys
// sorted the way a client keeping no order would send them, decoded strictly, then written over path.
func saveFromClient(t *testing.T, system *db.RpgSystem, path string) {
	t.Helper()

	var decoded *db.RpgSystem
	decoder := json.NewDecoder(bytes.NewReader(sortedKeys(t, system)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&decoded); err != nil {
		t.Fatalf("the body did not decode: %v", err)
	}
	if err := SaveInFileLayout(decoded, path, nil); err != nil {
		t.Fatalf("the save failed: %v", err)
	}
}

// quoted spells a name as JSON.stringify writes a string: in quotes, with only quotes, backslashes and
// control characters escaped, as mzjson writes it.
func quoted(t *testing.T, name string) []byte {
	t.Helper()

	value, err := mzjson.Parse(sortedKeys(t, name))
	if err != nil {
		t.Fatal(err)
	}

	return mzjson.Compact(value)
}

// goQuoted spells a name as Go's encoder writes a string, and so as the data editor's save does: in
// quotes, with `<`, `>` and `&` escaped besides what JSON.stringify escapes.
func goQuoted(t *testing.T, name string) []byte {
	t.Helper()

	spelled, err := json.Marshal(name)
	if err != nil {
		t.Fatal(err)
	}

	return spelled
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
