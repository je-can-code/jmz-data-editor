package store

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"jmz-data-editor/server/internal/models/db"
	"jmz-data-editor/server/internal/mzjson"
)

// SaveInMzLayout owes its callers MZ's file, exactly: a new map in MZ's own key order, and an
// existing one in whatever order its file already used, so that only real changes show up in the
// game's history. These use a small made-up map, so they run whether or not the game is checked out;
// the sweep over every real file lives in mz_round_trip_test.go.

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
	err = SaveInMzLayout(loaded, path, mzjson.MapLayout)

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	assertFileHolds(t, path, replacedMap)
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
	err := SaveInMzLayout(&gameMap, path, mzjson.MapLayout)

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
	err := SaveInMzLayout(rows, path, mzjson.MapLayout)

	// Assert- refused, and nothing written.
	if err == nil {
		t.Fatal("expected a table to be refused by the map layout")
	}
	if _, statErr := os.Stat(path); os.IsNotExist(statErr) == false {
		t.Errorf("expected no file to be written, stat said %v", statErr)
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
