package main

import (
	"net/http"
	"strings"
	"testing"
)

// The door sprites route owes the map editor every picture the project's doors are drawn with, and how many doors use
// each, the most used first, inside the usual envelope and always as a list, empty when there are no doors: placing a
// door starts from the picture the doors use most. It must follow the maps as they change on disk. These run through the
// real route table.

// doorRoute is the opening a door plays on itself: turn left, wait, turn right, wait, turn up, Through on.
const doorRoute = `{"code":205,"indent":0,"parameters":[0,{"list":[{"code":17},{"code":15,"parameters":[3]},{"code":18},` +
	`{"code":15,"parameters":[3]},{"code":19},{"code":37},{"code":0}],"repeat":false,"skippable":false,"wait":true}]}`

// doorMap is the cellar with its one event turned into a door drawn from !doors, character 2.
var doorMap = strings.Replace(
	strings.Replace(mapFixture, `"image":{"characterIndex":0,"characterName":"","direction":2,"pattern":0,"tileId":0}`,
		`"image":{"characterIndex":2,"characterName":"!doors","direction":2,"pattern":1,"tileId":0}`, 1),
	`"list":[{"code":101`, `"list":[`+doorRoute+`,{"code":101`, 1)

// TestDoorSpritesAnswersEachPictureWithItsDoors covers the answer's shape: the cellar's door, counted once.
func TestDoorSpritesAnswersEachPictureWithItsDoors(t *testing.T) {
	// Arrange.
	current := newProject(t)
	writeProjectFile(t, current, "data/Map001.json", doorMap)

	// Act.
	response := current.call(t, http.MethodGet, "/api/door-sprites", "")

	// Assert.
	assertStatus(t, response, http.StatusOK)
	expected := `{"sprites":[{"characterName":"!doors","characterIndex":2,"direction":2,"pattern":1,"doors":1}]}`
	if data := string(readEnvelope(t, response).Data); data != expected {
		t.Errorf("answered %s", data)
	}
}

// TestDoorSpritesAnswersAnEmptyListForAProjectWithoutDoors covers a project whose events open no doors.
func TestDoorSpritesAnswersAnEmptyListForAProjectWithoutDoors(t *testing.T) {
	// Arrange.
	current := newProject(t)

	// Act.
	response := current.call(t, http.MethodGet, "/api/door-sprites", "")

	// Assert- a list, not null and not missing.
	assertStatus(t, response, http.StatusOK)
	if data := string(readEnvelope(t, response).Data); data != `{"sprites":[]}` {
		t.Errorf("answered %s", data)
	}
}

// TestDoorSpritesFollowsAMapChangedOnDisk covers a door placed in MZ: the next answers count it once the change stream
// announces it.
func TestDoorSpritesFollowsAMapChangedOnDisk(t *testing.T) {
	// Arrange- no doors until the file changes.
	current := newProject(t)
	if data := string(readEnvelope(t, current.call(t, http.MethodGet, "/api/door-sprites", "")).Data); data != `{"sprites":[]}` {
		t.Fatalf("answered %s before the change", data)
	}

	// Act.
	writeProjectFile(t, current, "data/Map001.json", doorMap)

	// Assert.
	waitForAnswer(t, current, "/api/door-sprites", `{"sprites":[{"characterName":"!doors","characterIndex":2,"direction":2,"pattern":1,"doors":1}]}`)
}

// TestDoorSpritesNamesAMapTheModelsCannotRead covers a map carrying a field no model declares: a 500 whose envelope says
// which file, rather than a count missing that map's doors.
func TestDoorSpritesNamesAMapTheModelsCannotRead(t *testing.T) {
	// Arrange.
	current := newProject(t)
	writeProjectFile(t, current, "data/Map002.json", `{"events":[null],"sparkle":true}`)

	// Act.
	response := current.call(t, http.MethodGet, "/api/door-sprites", "")

	// Assert.
	assertStatus(t, response, http.StatusInternalServerError)
	answer := readEnvelope(t, response)
	if strings.Contains(answer.Error, "Map002.json") == false || answer.Data != nil {
		t.Errorf("said %q with %s", answer.Error, answer.Data)
	}
}

// TestDoorSpritesNeedAProjectRoot covers a server started without one.
func TestDoorSpritesNeedAProjectRoot(t *testing.T) {
	// Arrange.
	current := newProject(t)
	t.Setenv("JMZ_PROJECT_ROOT", "")

	// Act.
	response := current.call(t, http.MethodGet, "/api/door-sprites", "")

	// Assert.
	assertStatus(t, response, http.StatusBadRequest)
}
