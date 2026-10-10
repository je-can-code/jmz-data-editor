package main

import (
	"net/http"
	"strconv"
	"strings"
	"testing"
)

// A transfer pair stands on two maps, a door on one and the way back on the other, and placing it, undoing it or redoing it
// changes both at once: a save writes one map at a time, so a crash between two saves would leave a door leading nowhere.
// So the route owes this: both maps are written together or not at all, each taking its patches against its file as it
// stands, so a map changed since, by MZ or by hand, refuses the whole act, naming it, and neither map is written; a pair
// written and taken back leaves both files byte for byte as they were; and a body naming the blueprints, which this route
// never writes, is refused before the disk is touched.

// mapChangesRoute is the route.
const mapChangesRoute = "/api/map-changes"

// pairEnd is one end of a pair as the editor places it: event 2, in MZ's own key order, sending the player to a map.
func pairEnd(target int) string {
	return `{"id":2,"name":"Transfer (Cellar)","note":"","pages":[{"conditions":{"actorId":1,"actorValid":false,"itemId":1,"itemValid":false,` +
		`"selfSwitchCh":"A","selfSwitchValid":false,"switch1Id":1,"switch1Valid":false,"switch2Id":1,"switch2Valid":false,` +
		`"variableId":1,"variableValid":false,"variableValue":0},"directionFix":false,` +
		`"image":{"characterIndex":0,"characterName":"","direction":2,"pattern":0,"tileId":0},` +
		`"list":[{"code":201,"indent":0,"parameters":[0,` + strconv.Itoa(target) + `,0,0,2,0]},{"code":0,"indent":0,"parameters":[]}],"moveFrequency":3,` +
		`"moveRoute":{"list":[{"code":0,"parameters":[]}],"repeat":true,"skippable":false,"wait":false},` +
		`"moveSpeed":3,"moveType":0,"priorityType":0,"stepAnime":false,"through":false,"trigger":1,"walkAnime":true}],"x":0,"y":0}`
}

// placePair places each map's end past the end of its events, as event 2.
var placePair = `{"maps":[` +
	`{"map":1,"patches":[{"kind":"splice","path":["events"],"index":2,"removed":[],"inserted":[` + pairEnd(2) + `]}]},` +
	`{"map":2,"patches":[{"kind":"splice","path":["events"],"index":2,"removed":[],"inserted":[` + pairEnd(1) + `]}]}]}`

// takePairBack takes both ends away again.
var takePairBack = `{"maps":[` +
	`{"map":1,"patches":[{"kind":"splice","path":["events"],"index":2,"removed":[` + pairEnd(2) + `],"inserted":[]}]},` +
	`{"map":2,"patches":[{"kind":"splice","path":["events"],"index":2,"removed":[` + pairEnd(1) + `],"inserted":[]}]}]}`

// newPairProject is a project with the cellar as map 1 and a copy of it as map 2.
func newPairProject(t *testing.T) *project {
	t.Helper()

	current := newProject(t)
	writeProjectFile(t, current, "data/Map002.json", mapFixture)
	return current
}

func TestMapChangesWriteBothEndsOfAPairInOneAct(t *testing.T) {
	// Arrange.
	current := newPairProject(t)

	// Act.
	response := current.call(t, http.MethodPut, mapChangesRoute, placePair, "Content-Type", "application/json", "X-Jmz-Client", "window-a")

	// Assert: each map holds its end on a line of its own after its first event.
	assertStatus(t, response, http.StatusNoContent)
	for mapId, target := range map[int]int{1: 2, 2: 1} {
		written := current.read(t, "data/Map00"+strconv.Itoa(mapId)+".json")
		if strings.HasSuffix(written, "\n"+pairEnd(target)+"\n]\n}") == false {
			t.Errorf("map %d was written as:\n%s", mapId, written)
		}
	}
}

func TestMapChangesTakenBackLeaveBothMapsByteForByte(t *testing.T) {
	// Arrange.
	current := newPairProject(t)
	assertStatus(t, current.call(t, http.MethodPut, mapChangesRoute, placePair, "Content-Type", "application/json"), http.StatusNoContent)

	// Act.
	response := current.call(t, http.MethodPut, mapChangesRoute, takePairBack, "Content-Type", "application/json")

	// Assert.
	assertStatus(t, response, http.StatusNoContent)
	if current.read(t, "data/Map001.json") != mapFixture || current.read(t, "data/Map002.json") != mapFixture {
		t.Errorf("the maps came back as:\n%s\n%s", current.read(t, "data/Map001.json"), current.read(t, "data/Map002.json"))
	}
}

func TestMapChangesRefuseAMapChangedSinceAndWriteNeitherEnd(t *testing.T) {
	// Arrange: an event placed on map 2 in MZ after the editor read it, so its list no longer ends where it did.
	current := newPairProject(t)
	grown := strings.Replace(mapFixture, "\n]\n}", ",\n"+pairEnd(1)+"\n]\n}", 1)
	writeProjectFile(t, current, "data/Map002.json", grown)

	// Act.
	response := current.call(t, http.MethodPut, mapChangesRoute, placePair, "Content-Type", "application/json")

	// Assert: map 1 was not written either.
	assertStatus(t, response, http.StatusConflict)
	assertBodyContains(t, response, "Map 002 no longer holds what the change replaced: its events changed")
	if current.read(t, "data/Map001.json") != mapFixture || current.read(t, "data/Map002.json") != grown {
		t.Errorf("something was written")
	}
}

func TestMapChangesRefuseABodyNamingTheBlueprints(t *testing.T) {
	// Arrange.
	current := newPairProject(t)
	body := strings.Replace(placePair, `{"maps"`, `{"blueprints":{"schemaVersion":1,"data":{"blueprints":{}}},"maps"`, 1)

	// Act.
	response := current.call(t, http.MethodPut, mapChangesRoute, body, "Content-Type", "application/json")

	// Assert.
	assertStatus(t, response, http.StatusBadRequest)
	if current.read(t, "data/Map001.json") != mapFixture || current.read(t, "data/Map002.json") != mapFixture || current.exists(blueprintsPath) {
		t.Errorf("something was written")
	}
}

func TestMapChangesRefuseWhatNoPairWritesAndWriteNeitherEnd(t *testing.T) {
	// an end placed on map 1 as a pair places it, beside a second end that cannot go where the body says.
	firstEnd := `{"map":1,"patches":[{"kind":"splice","path":["events"],"index":2,"removed":[],"inserted":[` + pairEnd(2) + `]}]}`
	cases := map[string]struct {
		body     string
		status   int
		expected string
	}{
		"a map that is gone":             {body: `{"maps":[` + firstEnd + `,{"map":40,"patches":[]}]}`, status: http.StatusNotFound, expected: "data/Map040.json does not exist"},
		"a body changing nothing":        {body: `{"maps":[]}`, status: http.StatusBadRequest, expected: "the body changes nothing"},
		"a map named twice":              {body: `{"maps":[` + firstEnd + `,` + firstEnd + `]}`, status: http.StatusBadRequest, expected: "map 1 is named twice"},
		"no map's id":                    {body: `{"maps":[{"map":0,"patches":[]}]}`, status: http.StatusBadRequest, expected: "maps[0].map must be a map's id"},
		"an end short of a whole event":  {body: `{"maps":[` + firstEnd + `,{"map":2,"patches":[{"kind":"splice","path":["events"],"index":2,"removed":[],"inserted":[{"id":2,"x":0,"y":0}]}]}]}`, status: http.StatusBadRequest, expected: "the change would leave Map 002 no whole map"},
		"an end put in short of the end": {body: `{"maps":[` + firstEnd + `,{"map":2,"patches":[{"kind":"splice","path":["events"],"index":1,"removed":[],"inserted":[` + pairEnd(1) + `]}]}]}`, status: http.StatusConflict, expected: "Map 002 no longer holds what the change replaced: its events changed"},
	}

	for name, testCase := range cases {
		t.Run(name, func(t *testing.T) {
			// Arrange.
			current := newPairProject(t)

			// Act.
			response := current.call(t, http.MethodPut, mapChangesRoute, testCase.body, "Content-Type", "application/json")

			// Assert: the refusal says why, and map 1, whose end alone would have fitted, was not written either.
			assertStatus(t, response, testCase.status)
			assertBodyContains(t, response, testCase.expected)
			if current.read(t, "data/Map001.json") != mapFixture || current.read(t, "data/Map002.json") != mapFixture {
				t.Errorf("something was written")
			}
		})
	}
}
