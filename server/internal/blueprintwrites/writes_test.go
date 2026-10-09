package blueprintwrites

import (
	"errors"
	"strconv"
	"strings"
	"testing"

	"jmz-data-editor/server/internal/mzjson"
)

// A change to a blueprint reaches every map holding a copy in one act, each map's file taking its patches as it stands.
// So this package owes the route three things. A body is read strictly, every patch whole, and anything else is refused
// before the disk is touched. A patch goes into a file only where the file still holds what it replaces, numbers by what
// they are worth and objects by their keys whatever their order, and a file holding anything else is refused, naming the
// map, so nothing is ever written over a change made since. And a value set keeps the key order of the one it replaces,
// so a change written and then taken back leaves the file byte for byte as it was.

// cellarMap is a one-tile map in MZ's own layout, its event's image keys in alphabetical order rather than the model's.
const cellarMap = "{\n" +
	`"autoplayBgm":false,"autoplayBgs":false,"battleback1Name":"","battleback2Name":"",` +
	`"bgm":{"name":"","pan":0,"pitch":100,"volume":90},"bgs":{"name":"","pan":0,"pitch":100,"volume":90},` +
	`"disableDashing":false,"displayName":"Cellar","encounterList":[],"encounterStep":30,"height":1,` +
	`"note":"","parallaxLoopX":false,"parallaxLoopY":false,"parallaxName":"",` +
	`"parallaxShow":true,"parallaxSx":0,"parallaxSy":0,"scrollType":0,"specifyBattleback":false,"tilesetId":1,"width":1,` + "\n" +
	`"data":[1536,0,0,0,0,0],` + "\n" +
	`"events":[` + "\n" +
	"null,\n" +
	`{"id":1,"name":"Guard","note":"<blueprint:[k3x9q2mf, 1]>","pages":[{"conditions":{"actorId":1,"actorValid":false,"itemId":1,"itemValid":false,` +
	`"selfSwitchCh":"A","selfSwitchValid":false,"switch1Id":1,"switch1Valid":false,"switch2Id":1,"switch2Valid":false,` +
	`"variableId":1,"variableValid":false,"variableValue":0},"directionFix":false,` +
	`"image":{"characterIndex":0,"characterName":"","direction":2,"pattern":0,"tileId":0},` +
	`"list":[{"code":0,"indent":0,"parameters":[]}],"moveFrequency":3,` +
	`"moveRoute":{"list":[{"code":0,"parameters":[]}],"repeat":true,"skippable":false,"wait":false},` +
	`"moveSpeed":3,"moveType":0,"priorityType":0,"stepAnime":false,"through":false,"trigger":0,"walkAnime":true}],"x":0,"y":0}` + "\n" +
	"]\n" +
	"}"

// guardAs is the cellar's event 1 as the editor sends it, in the model's own key order, named and sped as given.
func guardAs(name string, speed int) string {
	return `{"id":1,"name":"` + name + `","note":"<blueprint:[k3x9q2mf, 1]>","pages":[{"conditions":{"actorId":1,"actorValid":false,"itemId":1,"itemValid":false,` +
		`"selfSwitchCh":"A","selfSwitchValid":false,"switch1Id":1,"switch1Valid":false,"switch2Id":1,"switch2Valid":false,` +
		`"variableId":1,"variableValid":false,"variableValue":0},"directionFix":false,` +
		`"image":{"tileId":0,"characterName":"","direction":2,"pattern":0,"characterIndex":0},` +
		`"list":[{"code":0,"indent":0,"parameters":[]}],"moveFrequency":3,` +
		`"moveRoute":{"list":[{"code":0,"parameters":[]}],"repeat":true,"skippable":false,"wait":false},` +
		`"moveSpeed":` + strconv.Itoa(speed) + `,"moveType":0,"priorityType":0,"stepAnime":false,"through":false,"trigger":0,"walkAnime":true}],"x":0,"y":0}`
}

// patchesOf reads the patches of a body naming one map.
func patchesOf(t *testing.T, body string) []Patch {
	t.Helper()

	changes, err := Parse([]byte(body))
	if err != nil {
		t.Fatalf("the test's own body was refused: %v", err)
	}

	return changes.Maps[0].Patches
}

func TestParseReadsBlueprintsAndEveryMapsPatches(t *testing.T) {
	// Arrange.
	body := `{"blueprints":{"schemaVersion":1,"data":{"blueprints":{}}},"maps":[` +
		`{"map":1,"patches":[{"kind":"tiles","indices":[0],"before":[1536],"after":[1545]},{"kind":"set","path":["events",1,"name"],"before":"Guard","after":"Captain"}]},` +
		`{"map":7,"patches":[]}]}`

	// Act.
	changes, err := Parse([]byte(body))

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	set := changes.Maps[0].Patches[1]
	if changes.Check || changes.Blueprints == nil || len(changes.Maps) != 2 || changes.Maps[1].MapID != 7 || set.Kind != "set" || describePath(set.Path) != "events/1/name" || set.Becomes.Text != "Captain" {
		t.Errorf("read %+v", changes)
	}
}

func TestParseRefusesWhatIsNoChange(t *testing.T) {
	cases := map[string]string{
		"not JSON":                `{`,
		"a stray key":             `{"maps":[],"extra":1}`,
		"nothing at all":          `{}`,
		"a check not a boolean":   `{"check":"yes","maps":[{"map":1,"patches":[]}]}`,
		"blueprints without data": `{"blueprints":{"schemaVersion":1}}`,
		"maps not a list":         `{"maps":{}}`,
		"a map not an id":         `{"maps":[{"map":0,"patches":[]}]}`,
		"a map named twice":       `{"maps":[{"map":1,"patches":[]},{"map":1,"patches":[]}]}`,
		"patches not a list":      `{"maps":[{"map":1,"patches":{}}]}`,
		"a patch of no kind":      `{"maps":[{"map":1,"patches":[{}]}]}`,
		"a splice":                `{"maps":[{"map":1,"patches":[{"kind":"splice"}]}]}`,
		"tiles of uneven lists":   `{"maps":[{"map":1,"patches":[{"kind":"tiles","indices":[0,1],"before":[1],"after":[2,3]}]}]}`,
		"tiles not numbers":       `{"maps":[{"map":1,"patches":[{"kind":"tiles","indices":["a"],"before":[1],"after":[2]}]}]}`,
		"a set of no path":        `{"maps":[{"map":1,"patches":[{"kind":"set","path":[],"before":1,"after":2}]}]}`,
		"a set path below zero":   `{"maps":[{"map":1,"patches":[{"kind":"set","path":["events",-1],"before":1,"after":2}]}]}`,
		"a set with no before":    `{"maps":[{"map":1,"patches":[{"kind":"set","path":["note"],"after":2}]}]}`,
		"a key named twice":       `{"maps":[{"map":1,"map":2,"patches":[]}]}`,
		"a map not an object":     `{"maps":[1]}`,
	}

	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			// Arrange: the body alone.

			// Act.
			_, err := Parse([]byte(body))

			// Assert.
			var refused ChangesError
			if errors.As(err, &refused) == false {
				t.Errorf("expected a refusal of the body, got %v", err)
			}
		})
	}
}

func TestApplyToMapWritesTilesAndSetsWhereTheFileHoldsWhatTheyReplace(t *testing.T) {
	// Arrange.
	patches := patchesOf(t, `{"maps":[{"map":1,"patches":[{"kind":"tiles","indices":[0],"before":[1536],"after":[1545]},{"kind":"set","path":["events",1],"before":`+guardAs("Guard", 3)+`,"after":`+guardAs("Captain", 4)+`}]}]}`)

	// Act.
	written, err := ApplyToMap(1, []byte(cellarMap), patches)

	// Assert: the event keeps the file's key order, its image's keys alphabetical as before.
	if err != nil {
		t.Fatal(err)
	}
	text := string(written)
	if strings.Contains(text, `"data":[1545,0,0,0,0,0]`) == false || strings.Contains(text, `"name":"Captain"`) == false || strings.Contains(text, `"moveSpeed":4`) == false || strings.Contains(text, `"image":{"characterIndex":0,"characterName":"","direction":2,"pattern":0,"tileId":0}`) == false {
		t.Errorf("wrote:\n%s", text)
	}
}

func TestApplyToMapTakesAChangeBackByteForByte(t *testing.T) {
	// Arrange: the change, written, then its patches inverted.
	forward := patchesOf(t, `{"maps":[{"map":1,"patches":[{"kind":"tiles","indices":[0],"before":[1536],"after":[1545]},{"kind":"set","path":["events",1],"before":`+guardAs("Guard", 3)+`,"after":`+guardAs("Captain", 4)+`}]}]}`)
	backward := patchesOf(t, `{"maps":[{"map":1,"patches":[{"kind":"set","path":["events",1],"before":`+guardAs("Captain", 4)+`,"after":`+guardAs("Guard", 3)+`},{"kind":"tiles","indices":[0],"before":[1545],"after":[1536]}]}]}`)
	written, err := ApplyToMap(1, []byte(cellarMap), forward)
	if err != nil {
		t.Fatal(err)
	}

	// Act.
	restored, err := ApplyToMap(1, written, backward)

	// Assert.
	if err != nil || string(restored) != cellarMap {
		t.Errorf("restored (%v):\n%s", err, restored)
	}
}

func TestApplyToMapRefusesAFileNoLongerHoldingWhatAPatchReplaces(t *testing.T) {
	cases := map[string]string{
		"a cell painted since":       `{"kind":"tiles","indices":[0],"before":[1540],"after":[1545]}`,
		"a cell past the data":       `{"kind":"tiles","indices":[6],"before":[0],"after":[1545]}`,
		"an event renamed since":     `{"kind":"set","path":["events",1],"before":` + guardAs("Sentry", 3) + `,"after":` + guardAs("Captain", 3) + `}`,
		"an event that is not there": `{"kind":"set","path":["events",5],"before":` + guardAs("Guard", 3) + `,"after":` + guardAs("Captain", 3) + `}`,
		"a path through a value":     `{"kind":"set","path":["note","inner"],"before":"x","after":"y"}`,
	}

	for name, patch := range cases {
		t.Run(name, func(t *testing.T) {
			// Arrange.
			patches := patchesOf(t, `{"maps":[{"map":7,"patches":[`+patch+`]}]}`)

			// Act.
			_, err := ApplyToMap(7, []byte(cellarMap), patches)

			// Assert.
			var mismatch MismatchError
			if errors.As(err, &mismatch) == false || mismatch.MapID != 7 || strings.HasPrefix(err.Error(), "Map 007 no longer holds what the change replaced") == false {
				t.Errorf("expected a refusal naming map 7, got %v", err)
			}
		})
	}
}

func TestApplyToMapReadsNumbersByWorthAndObjectsByKeysWhateverTheirOrder(t *testing.T) {
	// Arrange: the scroll speed spelled 0.0 and the bgm's keys reversed, both still the file's values.
	patches := patchesOf(t, `{"maps":[{"map":1,"patches":[{"kind":"set","path":["parallaxSx"],"before":0.0,"after":2},{"kind":"set","path":["bgm"],"before":{"volume":90,"pitch":100,"pan":0,"name":""},"after":{"volume":80,"pitch":100,"pan":0,"name":"Town"}}]}]}`)

	// Act.
	written, err := ApplyToMap(1, []byte(cellarMap), patches)

	// Assert: the bgm keeps the file's key order.
	if err != nil || strings.Contains(string(written), `"bgm":{"name":"Town","pan":0,"pitch":100,"volume":80}`) == false || strings.Contains(string(written), `"parallaxSx":2`) == false {
		t.Errorf("wrote (%v):\n%s", err, written)
	}
}

func TestApplyToMapTellsTwoValuesOfTheSameShapeApart(t *testing.T) {
	cases := map[string]string{
		"a number of another worth":  `{"kind":"set","path":["parallaxSx"],"before":1,"after":2}`,
		"a list of another length":   `{"kind":"set","path":["encounterList"],"before":[1],"after":[]}`,
		"a list of another value":    `{"kind":"set","path":["events",1,"pages",0,"list",0,"parameters"],"before":[0],"after":[]}`,
		"an object with another key": `{"kind":"set","path":["bgm"],"before":{"name":"","pan":0,"pitch":100,"loud":90},"after":{}}`,
		"an object of fewer keys":    `{"kind":"set","path":["bgm"],"before":{"name":"","pan":0},"after":{}}`,
		"a string for a number":      `{"kind":"set","path":["parallaxSx"],"before":"0","after":2}`,
		"a word of another spelling": `{"kind":"set","path":["displayName"],"before":"cellar","after":"Vault"}`,
	}

	for name, patch := range cases {
		t.Run(name, func(t *testing.T) {
			// Arrange.
			patches := patchesOf(t, `{"maps":[{"map":1,"patches":[`+patch+`]}]}`)

			// Act.
			_, err := ApplyToMap(1, []byte(cellarMap), patches)

			// Assert.
			var mismatch MismatchError
			if errors.As(err, &mismatch) == false {
				t.Errorf("expected a mismatch, got %v", err)
			}
		})
	}
}

func TestApplyToMapRefusesAChangeLeavingNoWholeMap(t *testing.T) {
	// Arrange: a key the model does not know put into the bgm.
	patches := patchesOf(t, `{"maps":[{"map":1,"patches":[{"kind":"set","path":["bgm"],"before":{"name":"","pan":0,"pitch":100,"volume":90},"after":{"name":"","pan":0,"pitch":100,"volume":90,"loud":true}}]}]}`)

	// Act.
	_, err := ApplyToMap(1, []byte(cellarMap), patches)

	// Assert.
	var refused ChangesError
	if errors.As(err, &refused) == false || strings.Contains(err.Error(), "no whole map") == false {
		t.Errorf("expected a refusal, got %v", err)
	}
}

func TestApplyToMapRefusesAFileThatIsNoMap(t *testing.T) {
	cases := map[string]string{
		"not JSON":         `{`,
		"no tiles":         `{"events":[]}`,
		"tiles not a list": `{"data":{},"events":[]}`,
	}

	for name, file := range cases {
		t.Run(name, func(t *testing.T) {
			// Arrange.
			patches := patchesOf(t, `{"maps":[{"map":1,"patches":[{"kind":"tiles","indices":[0],"before":[0],"after":[1]}]}]}`)

			// Act.
			_, err := ApplyToMap(1, []byte(file), patches)

			// Assert.
			if err == nil {
				t.Errorf("expected a refusal of %s", file)
			}
		})
	}
}

func TestBlueprintsLaysTheDocumentOutIndented(t *testing.T) {
	// Arrange.
	document, _ := mzjson.Parse([]byte(`{"schemaVersion":1,"data":{"blueprints":{}}}`))

	// Act.
	laid, err := Blueprints(document)

	// Assert.
	if err != nil || string(laid) != "{\n  \"schemaVersion\": 1,\n  \"data\": {\n    \"blueprints\": {}\n  }\n}\n" {
		t.Errorf("laid out (%v):\n%s", err, laid)
	}
}
