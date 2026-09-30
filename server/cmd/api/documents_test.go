package main

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

// The document routes owe the map editor MZ's files, unchanged by a round trip: GET answers with the
// file inside the usual envelope, PUT takes the whole document back and writes it in MZ's layout
// with 204, and whatever the models cannot account for is refused with a 400 naming it, before
// anything touches the disk. These run through the real route table, so a route missing from main
// or registered under the wrong method fails here too.

// TestGetMapAnswersWithTheMap covers the route the boss and skill boards already read.
func TestGetMapAnswersWithTheMap(t *testing.T) {
	// Arrange.
	current := newProject(t)

	// Act.
	response := current.call(t, http.MethodGet, "/api/maps/1", "")

	// Assert.
	assertStatus(t, response, http.StatusOK)
	var gameMap struct {
		DisplayName string `json:"displayName"`
		Width       int    `json:"width"`
	}
	if err := json.Unmarshal(readEnvelope(t, response).Data, &gameMap); err != nil {
		t.Fatal(err)
	}
	if gameMap.DisplayName != "<b>Cellar</b>" || gameMap.Width != 1 {
		t.Errorf("answered %+v", gameMap)
	}
}

// TestGetMapAnswers404ForAMapWithNoFile covers an id with nothing behind it.
func TestGetMapAnswers404ForAMapWithNoFile(t *testing.T) {
	// Arrange.
	current := newProject(t)

	// Act.
	response := current.call(t, http.MethodGet, "/api/maps/999", "")

	// Assert- a 404 whose envelope says which file, so the front end can show it.
	assertStatus(t, response, http.StatusNotFound)
	if message := readEnvelope(t, response).Error; message != "data/Map999.json does not exist" {
		t.Errorf("said %q", message)
	}
}

// TestMapRoutesRefuseIdsThatAreNotMapIds covers the id guard on both methods. Being digits only is
// what keeps a map id from naming anything outside data/.
func TestMapRoutesRefuseIdsThatAreNotMapIds(t *testing.T) {
	cases := []struct {
		name   string
		method string
		target string
	}{
		{name: "a word", method: http.MethodGet, target: "/api/maps/abc"},
		{name: "a negative id", method: http.MethodGet, target: "/api/maps/-1"},
		{name: "an encoded traversal", method: http.MethodGet, target: "/api/maps/..%2F..%2Fsecret.txt"},
		{name: "an encoded traversal on a save", method: http.MethodPut, target: "/api/maps/..%2FSystem"},
		{name: "map zero on a save", method: http.MethodPut, target: "/api/maps/0"},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			// Arrange.
			current := newProject(t)

			// Act.
			response := current.call(t, testCase.method, testCase.target, mapFixture)

			// Assert- refused, and the project untouched.
			assertRefused(t, response, http.StatusBadRequest)
			if current.read(t, "data/System.json") != secret {
				t.Error("a refused save still wrote a file")
			}
		})
	}
}

// TestPutMapWritesBackWhatGetAnswered is the round trip the editor lives on: whatever GET hands out,
// PUT takes back, and an unchanged map leaves its file byte for byte as it was.
func TestPutMapWritesBackWhatGetAnswered(t *testing.T) {
	// Arrange- the map as GET hands it out, which Go has re-encoded with its own escaping.
	current := newProject(t)
	body := string(readEnvelope(t, current.call(t, http.MethodGet, "/api/maps/1", "")).Data)

	// Act.
	response := current.call(t, http.MethodPut, "/api/maps/1", body)

	// Assert.
	assertStatus(t, response, http.StatusNoContent)
	if response.Body.Len() != 0 {
		t.Errorf("a 204 carried a body: %q", response.Body.String())
	}
	if written := current.read(t, "data/Map001.json"); written != mapFixture {
		t.Errorf("an unchanged save rewrote the map:\n%s", written)
	}
}

// TestPutMapSavesAChange is the near miss for the round trip: a real change does reach the file,
// and only the change.
func TestPutMapSavesAChange(t *testing.T) {
	// Arrange.
	current := newProject(t)
	body := string(readEnvelope(t, current.call(t, http.MethodGet, "/api/maps/1", "")).Data)
	body = strings.Replace(body, `"displayName":"\u003cb\u003eCellar\u003c/b\u003e"`, `"displayName":"Wine Cellar"`, 1)

	// Act.
	response := current.call(t, http.MethodPut, "/api/maps/1", body)

	// Assert.
	assertStatus(t, response, http.StatusNoContent)
	expected := strings.Replace(mapFixture, `"displayName":"<b>Cellar</b>"`, `"displayName":"Wine Cellar"`, 1)
	if written := current.read(t, "data/Map001.json"); written != expected {
		t.Errorf("the save wrote:\n%s\nexpected:\n%s", written, expected)
	}
}

// TestPutMapCreatesANewMap covers a map that has no file yet. With no file to lend an order, it is
// written in MZ's own order whatever order the body used: here, every key reversed.
func TestPutMapCreatesANewMap(t *testing.T) {
	// Arrange.
	current := newProject(t)
	body := `{"events":[null],"data":[1,2,0,0,0,0,0,0,0,0,0,0],"width":2,"tilesetId":1,"specifyBattleback":false,` +
		`"scrollType":0,"parallaxSy":0,"parallaxSx":0,"parallaxShow":true,"parallaxName":"","parallaxLoopY":false,` +
		`"parallaxLoopX":false,"note":"","height":1,"encounterStep":30,"encounterList":[],"displayName":"Attic",` +
		`"disableDashing":false,"bgs":{"volume":90,"pitch":100,"pan":0,"name":""},"bgm":{"volume":90,"pitch":100,"pan":0,"name":""},` +
		`"battleback2Name":"","battleback1Name":"","autoplayBgs":false,"autoplayBgm":false}`

	// Act.
	response := current.call(t, http.MethodPut, "/api/maps/12", body)

	// Assert- the padded file name, and MZ's order and layout, tiles and events last.
	assertStatus(t, response, http.StatusNoContent)
	written := current.read(t, "data/Map012.json")
	expected := "{\n" +
		`"autoplayBgm":false,"autoplayBgs":false,"battleback1Name":"","battleback2Name":"",` +
		`"bgm":{"name":"","pan":0,"pitch":100,"volume":90},"bgs":{"name":"","pan":0,"pitch":100,"volume":90},` +
		`"disableDashing":false,"displayName":"Attic","encounterList":[],"encounterStep":30,"height":1,"note":"",` +
		`"parallaxLoopX":false,"parallaxLoopY":false,"parallaxName":"","parallaxShow":true,"parallaxSx":0,"parallaxSy":0,` +
		`"scrollType":0,"specifyBattleback":false,"tilesetId":1,"width":2,` + "\n" +
		`"data":[1,2,0,0,0,0,0,0,0,0,0,0],` + "\n" +
		"\"events\":[\nnull\n]\n}"
	if written != expected {
		t.Errorf("the new map was written as:\n%s\nexpected:\n%s", written, expected)
	}
}

// TestPutMapRefusesFieldsTheModelCannotAccountFor is the strict decode: a field the model would drop
// is named in a 400, and the map on disk is left alone.
func TestPutMapRefusesFieldsTheModelCannotAccountFor(t *testing.T) {
	// Arrange- an event page carrying a field no model declares.
	current := newProject(t)
	body := strings.Replace(mapFixture, `"directionFix":false`, `"directionFix":false,"sparkle":true`, 1)

	// Act.
	response := current.call(t, http.MethodPut, "/api/maps/1", body)

	// Assert.
	assertStatus(t, response, http.StatusBadRequest)
	assertBodyContains(t, response, `unknown field "sparkle"`)
	if current.read(t, "data/Map001.json") != mapFixture {
		t.Error("a refused save still changed the map")
	}
}

// TestSavesRefuseDocumentsWithKeysMissing is the other half of the strict decode: a key the body
// leaves out, or sends as null, would reach the file as a zero value, so it is named in a 400 and the
// file on disk is left alone. The cases are the ones that would each break the game: a map with no
// tiles or events, a map from an empty object, a silent sound, a tileset with no flags, and a map
// tree wiped by an empty array.
func TestSavesRefuseDocumentsWithKeysMissing(t *testing.T) {
	withoutTilesOrEvents := mapFixture[:strings.Index(mapFixture, ",\n\"data\"")] + "\n}"
	cases := []struct {
		name     string
		route    string
		file     string
		body     string
		expected string
	}{
		{name: "a map without tiles or events", route: "/api/maps/1", file: "data/Map001.json", body: withoutTilesOrEvents, expected: `missing key "data"`},
		{name: "a map from an empty object", route: "/api/maps/1", file: "data/Map001.json", body: `{}`, expected: `missing key "autoplayBgm"`},
		{name: "a map whose music has no volume", route: "/api/maps/1", file: "data/Map001.json",
			body: strings.Replace(mapFixture, `"bgm":{"name":"","pan":0,"pitch":100,"volume":90}`, `"bgm":{"name":"","pan":0,"pitch":100}`, 1), expected: `missing key "volume" in bgm`},
		{name: "a map whose events are null", route: "/api/maps/1", file: "data/Map001.json",
			body: mapFixture[:strings.Index(mapFixture, "\"events\":")] + "\"events\":null}", expected: `events must not be null`},
		{name: "a new map from an empty object", route: "/api/maps/7", file: "data/Map001.json", body: `{}`, expected: `missing key "autoplayBgm"`},
		{name: "a map that is null", route: "/api/maps/1", file: "data/Map001.json", body: `null`, expected: `the body must not be null`},
		{name: "a tileset without flags", route: "/api/tilesets", file: "data/Tilesets.json", body: `[null,{"id":1}]`, expected: `missing key "flags" in [1]`},
		{name: "tilesets that are null", route: "/api/tilesets", file: "data/Tilesets.json", body: `null`, expected: "the body must be a JSON array"},
		{name: "an empty map tree", route: "/api/mapinfos", file: "data/MapInfos.json", body: `[]`, expected: "the body must start with null, as MZ's tables do"},
		{name: "a map tree without its leading null", route: "/api/mapinfos", file: "data/MapInfos.json",
			body: `[{"id":1,"expanded":false,"name":"A","order":1,"parentId":0,"scrollX":0,"scrollY":0}]`, expected: "the body must start with null, as MZ's tables do"},
		{name: "a map tree with no maps", route: "/api/mapinfos", file: "data/MapInfos.json", body: `[null]`, expected: "the body holds no rows after the leading null"},
		{name: "a common event without its commands", route: "/api/common-events", file: "data/CommonEvents.json",
			body: `[null,{"id":1,"name":"A","switchId":1,"trigger":0}]`, expected: `missing key "list" in [1]`},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			// Arrange.
			current := newProject(t)
			before := current.read(t, testCase.file)

			// Act.
			response := current.call(t, http.MethodPut, testCase.route, testCase.body)

			// Assert- a 400 naming what is wrong, and nothing written, not even a new map's file.
			assertStatus(t, response, http.StatusBadRequest)
			if message := strings.TrimSpace(response.Body.String()); message != testCase.expected {
				t.Errorf("said %q, expected %q", message, testCase.expected)
			}
			if current.read(t, testCase.file) != before || current.exists("data/Map007.json") {
				t.Error("a refused save still wrote a file")
			}
		})
	}
}

// TestPutMapRefusesMoreThanOneDocument keeps anything after the map from being silently ignored.
func TestPutMapRefusesMoreThanOneDocument(t *testing.T) {
	// Arrange.
	current := newProject(t)

	// Act.
	response := current.call(t, http.MethodPut, "/api/maps/1", mapFixture+"{}")

	// Assert.
	assertStatus(t, response, http.StatusBadRequest)
	if current.read(t, "data/Map001.json") != mapFixture {
		t.Error("a refused save still changed the map")
	}
}

// TestTableRoutesRoundTripTheirFiles covers GET and PUT of MapInfos.json, Tilesets.json and
// CommonEvents.json together, since they share one shape: an array with null at index 0, written one
// row per line. The common events are read through the data editor's GET, whose answer Go escapes,
// and still come back exactly as MZ wrote them.
func TestTableRoutesRoundTripTheirFiles(t *testing.T) {
	cases := []struct {
		route   string
		file    string
		fixture string
	}{
		{route: "/api/mapinfos", file: "data/MapInfos.json", fixture: mapInfosFixture},
		{route: "/api/tilesets", file: "data/Tilesets.json", fixture: tilesetsFixture},
		{route: "/api/common-events", file: "data/CommonEvents.json", fixture: commonEventsFixture},
	}

	for _, testCase := range cases {
		t.Run(testCase.route, func(t *testing.T) {
			// Arrange- the table as GET hands it out.
			current := newProject(t)
			got := current.call(t, http.MethodGet, testCase.route, "")
			assertStatus(t, got, http.StatusOK)
			body := readEnvelope(t, got).Data

			// Act.
			response := current.call(t, http.MethodPut, testCase.route, string(body))

			// Assert- index 0 came out null, and the file is exactly as it was.
			var rows []json.RawMessage
			if err := json.Unmarshal(body, &rows); err != nil {
				t.Fatal(err)
			}
			if len(rows) < 2 || string(rows[0]) != "null" {
				t.Errorf("expected null at index 0, got %s", body)
			}
			assertStatus(t, response, http.StatusNoContent)
			if written := current.read(t, testCase.file); written != testCase.fixture {
				t.Errorf("an unchanged save rewrote %s:\n%s", testCase.file, written)
			}
		})
	}
}

// TestTableRoutesAnswer404WithoutTheirFile covers a project missing the table.
func TestTableRoutesAnswer404WithoutTheirFile(t *testing.T) {
	cases := []struct {
		route string
		file  string
	}{
		{route: "/api/mapinfos", file: "data/MapInfos.json"},
		{route: "/api/tilesets", file: "data/Tilesets.json"},
	}

	for _, testCase := range cases {
		t.Run(testCase.route, func(t *testing.T) {
			// Arrange.
			current := newProject(t)
			removeFile(t, current, testCase.file)

			// Act.
			response := current.call(t, http.MethodGet, testCase.route, "")

			// Assert.
			assertStatus(t, response, http.StatusNotFound)
			if message := readEnvelope(t, response).Error; message != testCase.file+" does not exist" {
				t.Errorf("said %q", message)
			}
		})
	}
}

// TestTableRoutesRefuseFieldsTheModelsCannotAccountFor is the strict decode for both tables, with the
// wrong type of value as its near miss.
func TestTableRoutesRefuseFieldsTheModelsCannotAccountFor(t *testing.T) {
	cases := []struct {
		name     string
		route    string
		file     string
		body     string
		fragment string
	}{
		{
			name: "an unknown map info field", route: "/api/mapinfos", file: "data/MapInfos.json",
			body: `[null,{"id":1,"expanded":false,"name":"A","order":1,"parentId":0,"scrollX":0,"scrollY":0,"pinned":true}]`, fragment: `unknown field "pinned"`,
		},
		{
			name: "a map info id that is not a number", route: "/api/mapinfos", file: "data/MapInfos.json",
			body: `[null,{"id":"one","expanded":false,"name":"A","order":1,"parentId":0,"scrollX":0,"scrollY":0}]`, fragment: "RpgMapInfo.id",
		},
		{
			name: "an unknown tileset field", route: "/api/tilesets", file: "data/Tilesets.json",
			body: `[null,{"id":1,"flags":[],"mode":1,"name":"A","note":"","tilesetNames":[],"animated":true}]`, fragment: `unknown field "animated"`,
		},
		{
			name: "an unknown common event field", route: "/api/common-events", file: "data/CommonEvents.json",
			body: `[null,{"id":1,"list":[],"name":"A","switchId":1,"trigger":0,"sparkle":true}]`, fragment: `unknown field "sparkle"`,
		},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			// Arrange.
			current := newProject(t)
			before := current.read(t, testCase.file)

			// Act.
			response := current.call(t, http.MethodPut, testCase.route, testCase.body)

			// Assert.
			assertStatus(t, response, http.StatusBadRequest)
			assertBodyContains(t, response, testCase.fragment)
			if current.read(t, testCase.file) != before {
				t.Error("a refused save still changed the file")
			}
		})
	}
}

// TestDocumentRoutesNeedAProjectRoot covers a server started without one.
func TestDocumentRoutesNeedAProjectRoot(t *testing.T) {
	// Arrange.
	current := newProject(t)
	t.Setenv("JMZ_PROJECT_ROOT", "")

	// Act.
	response := current.call(t, http.MethodGet, "/api/mapinfos", "")

	// Assert.
	assertStatus(t, response, http.StatusBadRequest)
}
