package main

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// The placements route owes the Enemies board every map event standing as the enemy it shows, inside the
// usual envelope and always as a list, empty when there is nothing to show, so the board never has to
// tell "nowhere" from "no answer". It must follow the maps as they change on disk, and it refuses an
// enemy id that could not be one. These run through the real route table.

// battlersFixture is a map holding a slime standing as enemy 5 and a bat standing as enemy 7.
const battlersFixture = `{"events":[null,` +
	`{"id":1,"name":"Slime","note":"","pages":[{"list":[{"code":108,"indent":0,"parameters":["<enemyId:5>"]},` +
	`{"code":0,"indent":0,"parameters":[]}]}],"x":3,"y":4},` +
	`{"id":2,"name":"Bat","note":"","pages":[{"list":[{"code":108,"indent":0,"parameters":["<enemyId:7>"]},` +
	`{"code":0,"indent":0,"parameters":[]}]}],"x":5,"y":6}` +
	`]}`

// cellarSlime is the answer about enemy 5 once the cellar holds battlersFixture.
const cellarSlime = `{"enemyId":5,"placements":[{"mapId":2,"mapName":"Cellar","eventId":1,"eventName":"Slime",` +
	`"x":3,"y":4,"pageIndexes":[0],"pageCount":1}]}`

// TestEnemyPlacementsAnswersWithTheEventsStandingAsTheEnemy covers the answer's shape: the slime, named
// from the map tree, and not the bat beside it.
func TestEnemyPlacementsAnswersWithTheEventsStandingAsTheEnemy(t *testing.T) {
	// Arrange.
	current := newProject(t)
	writeProjectFile(t, current, "data/Map002.json", battlersFixture)

	// Act.
	response := current.call(t, http.MethodGet, "/api/enemies/5/placements", "")

	// Assert.
	assertStatus(t, response, http.StatusOK)
	answer := readEnvelope(t, response)
	if string(answer.Data) != cellarSlime || answer.Path != current.root {
		t.Errorf("answered %s for %s", answer.Data, answer.Path)
	}
}

// TestEnemyPlacementsAnswersAnEmptyListForAnEnemyPlacedNowhere covers an enemy no event names.
func TestEnemyPlacementsAnswersAnEmptyListForAnEnemyPlacedNowhere(t *testing.T) {
	// Arrange.
	current := newProject(t)
	writeProjectFile(t, current, "data/Map002.json", battlersFixture)

	// Act.
	response := current.call(t, http.MethodGet, "/api/enemies/9/placements", "")

	// Assert- a list, not null and not missing.
	assertStatus(t, response, http.StatusOK)
	if data := string(readEnvelope(t, response).Data); data != `{"enemyId":9,"placements":[]}` {
		t.Errorf("answered %s", data)
	}
}

// TestEnemyPlacementsRefusesIdsThatAreNotEnemyIds covers the id guard.
func TestEnemyPlacementsRefusesIdsThatAreNotEnemyIds(t *testing.T) {
	for _, id := range []string{"abc", "0", "-3", "1.5"} {
		t.Run(id, func(t *testing.T) {
			// Arrange.
			current := newProject(t)

			// Act.
			response := current.call(t, http.MethodGet, "/api/enemies/"+id+"/placements", "")

			// Assert.
			assertStatus(t, response, http.StatusBadRequest)
			if message := strings.TrimSpace(response.Body.String()); message != "enemyId must be an integer of at least 1" {
				t.Errorf("said %q", message)
			}
		})
	}
}

// TestEnemyPlacementsNamesAMapTheModelsCannotRead covers a map carrying a field no model declares: a 500
// whose envelope says which file, rather than a list missing that map's battlers.
func TestEnemyPlacementsNamesAMapTheModelsCannotRead(t *testing.T) {
	// Arrange.
	current := newProject(t)
	writeProjectFile(t, current, "data/Map002.json", `{"events":[null],"sparkle":true}`)

	// Act.
	response := current.call(t, http.MethodGet, "/api/enemies/5/placements", "")

	// Assert.
	assertStatus(t, response, http.StatusInternalServerError)
	answer := readEnvelope(t, response)
	if strings.Contains(answer.Error, "Map002.json") == false || strings.Contains(answer.Error, `unknown field "sparkle"`) == false || answer.Data != nil {
		t.Errorf("said %q with %s", answer.Error, answer.Data)
	}
}

// TestEnemyPlacementsFollowsAMapChangedOnDisk covers a map edited while the server runs, in MZ or in
// another window: the next answers follow the file once the change stream announces it.
func TestEnemyPlacementsFollowsAMapChangedOnDisk(t *testing.T) {
	// Arrange- the slime is a placement of enemy 5 until the file changes.
	current := newProject(t)
	writeProjectFile(t, current, "data/Map002.json", battlersFixture)
	if data := string(readEnvelope(t, current.call(t, http.MethodGet, "/api/enemies/5/placements", "")).Data); data != cellarSlime {
		t.Fatalf("answered %s before the change", data)
	}

	// Act- the slime now names enemy 7.
	writeProjectFile(t, current, "data/Map002.json", strings.Replace(battlersFixture, "<enemyId:5>", "<enemyId:7>", 1))

	// Assert.
	waitForAnswer(t, current, "/api/enemies/5/placements", `{"enemyId":5,"placements":[]}`)
}

// TestEnemyPlacementsNeedAProjectRoot covers a server started without one.
func TestEnemyPlacementsNeedAProjectRoot(t *testing.T) {
	// Arrange.
	current := newProject(t)
	t.Setenv("JMZ_PROJECT_ROOT", "")

	// Act.
	response := current.call(t, http.MethodGet, "/api/enemies/5/placements", "")

	// Assert.
	assertStatus(t, response, http.StatusBadRequest)
}

// writeProjectFile writes a file into the project.
func writeProjectFile(t *testing.T, current *project, path string, content string) {
	t.Helper()

	if err := os.WriteFile(filepath.Join(current.root, filepath.FromSlash(path)), []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
}

// waitForAnswer asks a route again until the data it answers with is the expected, failing the test
// when it never is. The change stream announces a change once its file has been quiet for a tenth of a
// second, so the first answers after a change can still predate it.
func waitForAnswer(t *testing.T, current *project, target string, expected string) {
	t.Helper()

	deadline := time.Now().Add(streamWait)
	for {
		data := string(readEnvelope(t, current.call(t, http.MethodGet, target, "")).Data)
		if data == expected {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("still answered %s, expected %s", data, expected)
		}
		time.Sleep(20 * time.Millisecond)
	}
}
