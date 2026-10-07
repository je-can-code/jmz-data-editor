package store

import (
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"jmz-data-editor/server/internal/models/db"
	"jmz-data-editor/server/internal/mzjson"
)

// SaveInMzLayout owes its callers MZ's file, exactly: a new map in MZ's own key order, and an
// existing one in whatever order its file already used, so that only real changes show up in the
// game's history. CreateInMzLayout owes the same bytes for a new file, and never writes over one that
// exists. UpdateInFileLayout owes a change made to the file as it stands on disk, in the layout it
// already has, and never one made over a file it cannot read. These use small made-up documents, so
// they run whether or not the game is checked out; the sweep over every real file lives in
// mz_round_trip_test.go.

// replacedMap is a one-event map whose event image lists its keys alphabetically, one of the three
// orders the real maps use, rather than in the model's field order.
const replacedMap = "{\n" +
	`"autoplayBgm":false,"autoplayBgs":false,"battleback1Name":"","battleback2Name":"",` +
	`"bgm":{"name":"","pan":0,"pitch":100,"volume":90},"bgs":{"name":"","pan":0,"pitch":100,"volume":90},` +
	`"disableDashing":false,"displayName":"<b>Cellar</b>","encounterList":[],"encounterStep":30,"height":1,` +
	`"note":"a \"quoted\" note\nover two lines","parallaxLoopX":false,"parallaxLoopY":false,"parallaxName":"",` +
	`"parallaxShow":true,"parallaxSx":0,"parallaxSy":0,"scrollType":0,"specifyBattleback":false,"tilesetId":2,"width":1,` + "\n" +
	`"data":[1536,0,0,0,0,0],` + "\n" +
	`"events":[` + "\n" +
	"null,\n" +
	`{"id":1,"name":"EV001","note":"","pages":[{"conditions":{"actorId":1,"actorValid":false,"itemId":1,"itemValid":false,` +
	`"selfSwitchCh":"A","selfSwitchValid":false,"switch1Id":1,"switch1Valid":false,"switch2Id":1,"switch2Valid":false,` +
	`"variableId":1,"variableValid":false,"variableValue":0},"directionFix":false,` +
	`"image":{"characterIndex":0,"characterName":"","direction":2,"pattern":0,"tileId":0},` +
	`"list":[{"code":0,"indent":0,"parameters":[]}],"moveFrequency":3,` +
	`"moveRoute":{"list":[{"code":0,"parameters":[]}],"repeat":true,"skippable":false,"wait":false},` +
	`"moveSpeed":3,"moveType":0,"priorityType":0,"stepAnime":false,"through":false,"trigger":0,"walkAnime":true}],"x":0,"y":0}` + "\n" +
	"]\n" +
	"}"

// TestSaveInMzLayoutReproducesTheFileItReplaces saves the map it just loaded and expects the same
// bytes back, alphabetical image keys, raw `<`, escaped quotes and all.
func TestSaveInMzLayoutReproducesTheFileItReplaces(t *testing.T) {
	// Arrange.
	path := filepath.Join(t.TempDir(), "Map001.json")
	if err := os.WriteFile(path, []byte(replacedMap), 0644); err != nil {
		t.Fatal(err)
	}
	loaded, err := Load[*db.RpgMap](path)
	if err != nil {
		t.Fatal(err)
	}

	// Act.
	announced := []byte{}
	err = SaveInMzLayout(loaded, path, mzjson.MapLayout, func(content []byte) { announced = content })

	// Assert- the same bytes back, and the announcement carried exactly those bytes.
	if err != nil {
		t.Fatal(err)
	}
	assertFileHolds(t, path, replacedMap)
	if string(announced) != replacedMap {
		t.Errorf("announced %q before writing", announced)
	}
}

// TestSaveInMzLayoutWritesANewMapInMzsOrder saves the same map to a path with no file yet, so there
// is no template, and expects MZ's own order, which puts the image's tile id first.
func TestSaveInMzLayoutWritesANewMapInMzsOrder(t *testing.T) {
	// Arrange.
	var gameMap db.RpgMap
	if err := json.Unmarshal([]byte(replacedMap), &gameMap); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "Map002.json")

	// Act.
	err := SaveInMzLayout(&gameMap, path, mzjson.MapLayout, nil)

	// Assert- identical but for the image, which a new file writes in the model's order.
	if err != nil {
		t.Fatal(err)
	}
	written, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	expected := []byte(replacedMap)
	expected = replaceOnce(t, expected,
		`"image":{"characterIndex":0,"characterName":"","direction":2,"pattern":0,"tileId":0}`,
		`"image":{"tileId":0,"characterName":"","direction":2,"pattern":0,"characterIndex":0}`)
	if string(written) != string(expected) {
		t.Errorf("a new map was written as\n%s\nexpected\n%s", written, expected)
	}
}

// TestSaveInMzLayoutRefusesADocumentItCannotLayOut keeps a table from being written as a map.
func TestSaveInMzLayoutRefusesADocumentItCannotLayOut(t *testing.T) {
	// Arrange- a table, handed to the map layout.
	path := filepath.Join(t.TempDir(), "Map003.json")
	rows := []*db.RpgMapInfo{nil}

	// Act.
	announced := false
	err := SaveInMzLayout(rows, path, mzjson.MapLayout, func([]byte) { announced = true })

	// Assert- refused, nothing announced, and nothing written.
	if err == nil {
		t.Fatal("expected a table to be refused by the map layout")
	}
	if announced {
		t.Error("a document that never rendered was still announced")
	}
	if _, statErr := os.Stat(path); os.IsNotExist(statErr) == false {
		t.Errorf("expected no file to be written, stat said %v", statErr)
	}
}

// TestCreateInMzLayoutWritesANewMapInMzsOrder covers a create where no file is: the same bytes a save of a new map
// writes, announced before they land.
func TestCreateInMzLayoutWritesANewMapInMzsOrder(t *testing.T) {
	// Arrange- the map saved to one new path, then created at another.
	var gameMap db.RpgMap
	if err := json.Unmarshal([]byte(replacedMap), &gameMap); err != nil {
		t.Fatal(err)
	}
	folder := t.TempDir()
	if err := SaveInMzLayout(&gameMap, filepath.Join(folder, "Map004.json"), mzjson.MapLayout, nil); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(folder, "Map005.json")

	// Act.
	announced := []byte{}
	err := CreateInMzLayout(&gameMap, path, mzjson.MapLayout, func(content []byte) { announced = content })

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	saved, readErr := os.ReadFile(filepath.Join(folder, "Map004.json"))
	if readErr != nil {
		t.Fatal(readErr)
	}
	assertFileHolds(t, path, string(saved))
	if string(announced) != string(saved) {
		t.Errorf("announced %q before writing", announced)
	}
}

// TestCreateInMzLayoutRefusesAFileThatExists covers the one place a create never lands: on a file that is there,
// which it leaves byte for byte as it was, announcing nothing.
func TestCreateInMzLayoutRefusesAFileThatExists(t *testing.T) {
	// Arrange.
	path := filepath.Join(t.TempDir(), "Map001.json")
	if err := os.WriteFile(path, []byte(replacedMap), 0644); err != nil {
		t.Fatal(err)
	}
	var gameMap db.RpgMap
	if err := json.Unmarshal([]byte(strings.Replace(replacedMap, "<b>Cellar</b>", "Attic", 1)), &gameMap); err != nil {
		t.Fatal(err)
	}

	// Act.
	announced := false
	err := CreateInMzLayout(&gameMap, path, mzjson.MapLayout, func([]byte) { announced = true })

	// Assert.
	if errors.Is(err, fs.ErrExist) == false {
		t.Fatalf("expected fs.ErrExist, got %v", err)
	}
	if announced {
		t.Error("a refused create was still announced")
	}
	assertFileHolds(t, path, replacedMap)
}

// TestUpdateInFileLayoutChangesTheFileAsItStands covers an update made from the file as it is on disk
// at that moment: what the update leaves alone is written back as the file holds it, its neighbour on
// the same line included, in the file's own layout, and the exact bytes are announced before they land.
func TestUpdateInFileLayoutChangesTheFileAsItStands(t *testing.T) {
	// Arrange- a tileset indented the way the data editor leaves files, renamed by hand since the caller read it.
	path := filepath.Join(t.TempDir(), "Tileset.json")
	const onDisk = "{\n  \"id\": 3,\n  \"flags\": [\n    16,\n    0\n  ],\n  \"mode\": 1,\n  \"name\": \"Castle (renamed by hand)\",\n  \"note\": \"\",\n  \"tilesetNames\": [\n    \"Castle_A1\"\n  ]\n}"
	if err := os.WriteFile(path, []byte(onDisk), 0644); err != nil {
		t.Fatal(err)
	}

	// Act- the mode changed, and nothing else.
	announced := []byte{}
	err := UpdateInFileLayout(path, func(current *db.RpgTileset) *db.RpgTileset {
		current.Mode = 0
		return current
	}, func(content []byte) { announced = content })

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	expected := "{\n  \"id\": 3,\n  \"flags\": [\n    16,\n    0\n  ],\n  \"mode\": 0,\n  \"name\": \"Castle (renamed by hand)\",\n  \"note\": \"\",\n  \"tilesetNames\": [\n    \"Castle_A1\"\n  ]\n}"
	assertFileHolds(t, path, expected)
	if string(announced) != expected {
		t.Errorf("announced %q before writing", announced)
	}
}

// TestUpdateInFileLayoutNeverWritesOverWhatItCannotRead covers the two files an update cannot start
// from: one that is not there, and one holding a key the model cannot account for, which it would
// drop. Each is refused with nothing announced, and the unreadable one is left byte for byte.
func TestUpdateInFileLayoutNeverWritesOverWhatItCannotRead(t *testing.T) {
	cases := []struct {
		name    string
		exists  bool
		content string
	}{
		{name: "no file", exists: false},
		{name: "a key the model lacks", exists: true, content: `{"id":3,"flags":[],"mode":1,"name":"Castle","note":"","sparkle":true,"tilesetNames":[]}`},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			// Arrange.
			path := filepath.Join(t.TempDir(), "Tileset.json")
			if testCase.exists {
				if err := os.WriteFile(path, []byte(testCase.content), 0644); err != nil {
					t.Fatal(err)
				}
			}

			// Act.
			updated := false
			announced := false
			err := UpdateInFileLayout(path, func(current *db.RpgTileset) *db.RpgTileset {
				updated = true
				return current
			}, func([]byte) { announced = true })

			// Assert- refused before the update ran, nothing announced, and the file as it was.
			if err == nil {
				t.Fatal("expected the update to be refused")
			}
			if updated || announced {
				t.Errorf("a refused update still ran (%v) or announced (%v)", updated, announced)
			}
			if testCase.exists == false {
				if _, statErr := os.Stat(path); os.IsNotExist(statErr) == false {
					t.Errorf("expected no file to be written, stat said %v", statErr)
				}
				return
			}
			assertFileHolds(t, path, testCase.content)
		})
	}
}

// replaceOnce swaps one exact occurrence of old for new, failing when old is absent so the expected
// value can never silently equal the original.
func replaceOnce(t *testing.T, content []byte, old string, replacement string) []byte {
	t.Helper()

	text := string(content)
	if strings.Contains(text, old) == false {
		t.Fatalf("expected %q in the fixture", old)
	}

	return []byte(strings.Replace(text, old, replacement, 1))
}
