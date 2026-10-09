package main

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// A change to a blueprint must reach the blueprints and every map holding a copy of it in one act, or a crash between
// two writes leaves the blueprint ahead of its copies and every copy reads as hand-edited when the game is opened again.
// So the route owes this: the blueprints and every map are written together or not at all; each map takes its patches
// against its file as it stands, so a change made there since, by MZ or by hand, refuses the whole act, naming the map,
// and nothing is written, the blueprints included; a check tries every patch and writes nothing; and a change written and
// taken back leaves every file byte for byte as it was.

// blueprintsPath is where the blueprints live in a project.
const blueprintsPath = "jmz-editor/blueprints.json"

// changesRoute is the route.
const changesRoute = "/api/blueprint-changes"

// cellarChange repaints the cellar's one tile and renames it, with the blueprints given whole.
const cellarChange = `{"blueprints":{"schemaVersion":1,"data":{"blueprints":{"k3x9q2mf":{"name":"Camp"}}}},"maps":[{"map":1,"patches":[` +
	`{"kind":"tiles","indices":[0],"before":[1536],"after":[1545]},` +
	`{"kind":"set","path":["displayName"],"before":"<b>Cellar</b>","after":"<b>Vault</b>"}]}]}`

// cellarChangeBack takes the cellar's change back.
const cellarChangeBack = `{"maps":[{"map":1,"patches":[` +
	`{"kind":"set","path":["displayName"],"before":"<b>Vault</b>","after":"<b>Cellar</b>"},` +
	`{"kind":"tiles","indices":[0],"before":[1545],"after":[1536]}]}]}`

func TestBlueprintChangesWriteTheBlueprintsAndEveryMapInOneAct(t *testing.T) {
	// Arrange.
	current := newProject(t)

	// Act.
	response := current.call(t, http.MethodPut, changesRoute, cellarChange, "Content-Type", "application/json", "X-Jmz-Client", "window-a")

	// Assert.
	assertStatus(t, response, http.StatusNoContent)
	written := current.read(t, "data/Map001.json")
	if strings.Contains(written, `"data":[1545,0,0,0,0,0]`) == false || strings.Contains(written, `"displayName":"<b>Vault</b>"`) == false {
		t.Errorf("the map was written as:\n%s", written)
	}
	if current.read(t, blueprintsPath) != "{\n  \"schemaVersion\": 1,\n  \"data\": {\n    \"blueprints\": {\n      \"k3x9q2mf\": {\n        \"name\": \"Camp\"\n      }\n    }\n  }\n}\n" {
		t.Errorf("the blueprints were written as:\n%s", current.read(t, blueprintsPath))
	}
}

func TestBlueprintChangesTakenBackLeaveTheMapByteForByte(t *testing.T) {
	// Arrange.
	current := newProject(t)
	assertStatus(t, current.call(t, http.MethodPut, changesRoute, cellarChange, "Content-Type", "application/json"), http.StatusNoContent)

	// Act.
	response := current.call(t, http.MethodPut, changesRoute, cellarChangeBack, "Content-Type", "application/json")

	// Assert.
	assertStatus(t, response, http.StatusNoContent)
	if current.read(t, "data/Map001.json") != mapFixture {
		t.Errorf("the map came back as:\n%s", current.read(t, "data/Map001.json"))
	}
}

func TestBlueprintChangesRefuseAMapChangedSinceAndWriteNothing(t *testing.T) {
	// Arrange: the cellar renamed on disk after the editor read it.
	current := newProject(t)
	renamed := strings.Replace(mapFixture, "<b>Cellar</b>", "<b>Wine cellar</b>", 1)
	writeProjectFile(t, current, "data/Map001.json", renamed)

	// Act.
	response := current.call(t, http.MethodPut, changesRoute, cellarChange, "Content-Type", "application/json")

	// Assert: neither the map nor the blueprints were touched.
	assertStatus(t, response, http.StatusConflict)
	assertBodyContains(t, response, "Map 001 no longer holds what the change replaced")
	if current.read(t, "data/Map001.json") != renamed || current.exists(blueprintsPath) {
		t.Errorf("something was written")
	}
}

func TestBlueprintChangesCheckEveryPatchAndWriteNothing(t *testing.T) {
	cases := map[string]struct {
		body   string
		status int
	}{
		"a change that fits":    {body: strings.Replace(cellarChange, `{"blueprints"`, `{"check":true,"blueprints"`, 1), status: http.StatusNoContent},
		"a change that misfits": {body: strings.Replace(cellarChangeBack, `{"maps"`, `{"check":true,"maps"`, 1), status: http.StatusConflict},
	}

	for name, testCase := range cases {
		t.Run(name, func(t *testing.T) {
			// Arrange.
			current := newProject(t)

			// Act.
			response := current.call(t, http.MethodPut, changesRoute, testCase.body, "Content-Type", "application/json")

			// Assert.
			assertStatus(t, response, testCase.status)
			if current.read(t, "data/Map001.json") != mapFixture || current.exists(blueprintsPath) {
				t.Errorf("a check wrote something")
			}
		})
	}
}

func TestBlueprintChangesRefuseAGoneMapAndABodyThatIsNoChange(t *testing.T) {
	cases := map[string]struct {
		body   string
		status int
	}{
		"a map that is gone":       {body: `{"maps":[{"map":40,"patches":[]}]}`, status: http.StatusNotFound},
		"a body that is no change": {body: `{"maps":[{"map":1}]}`, status: http.StatusBadRequest},
		"a change leaving no map":  {body: `{"maps":[{"map":1,"patches":[{"kind":"set","path":["bgm"],"before":{"name":"","pan":0,"pitch":100,"volume":90},"after":{"loud":true}}]}]}`, status: http.StatusBadRequest},
	}

	for name, testCase := range cases {
		t.Run(name, func(t *testing.T) {
			// Arrange.
			current := newProject(t)

			// Act.
			response := current.call(t, http.MethodPut, changesRoute, testCase.body, "Content-Type", "application/json")

			// Assert.
			assertStatus(t, response, testCase.status)
			if current.read(t, "data/Map001.json") != mapFixture {
				t.Errorf("the map was written")
			}
		})
	}
}

func TestBlueprintChangesLeaveNoTemporaryFilesBehind(t *testing.T) {
	// Arrange.
	current := newProject(t)

	// Act.
	assertStatus(t, current.call(t, http.MethodPut, changesRoute, cellarChange, "Content-Type", "application/json"), http.StatusNoContent)

	// Assert.
	for _, folder := range []string{"data", "jmz-editor"} {
		entries, err := os.ReadDir(filepath.Join(current.root, folder))
		if err != nil {
			t.Fatal(err)
		}
		for _, entry := range entries {
			if strings.HasSuffix(entry.Name(), ".tmp") {
				t.Errorf("%s/%s was left behind", folder, entry.Name())
			}
		}
	}
}
