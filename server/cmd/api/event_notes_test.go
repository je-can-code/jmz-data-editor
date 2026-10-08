package main

import (
	"encoding/json"
	"net/http"
	"reflect"
	"strings"
	"testing"
)

// The event notes route owes the map editor every event note on every map that holds anything, inside the usual
// envelope and always as a list, empty when there is nothing to show, each note exactly as its file writes it,
// angle brackets and line breaks included: the editor reads its blueprint links out of them. It must follow the maps
// as they change on disk. These run through the real route table.

// notedNote is one note as the route answers it, decoded.
type notedNote struct {
	MapId   int    `json:"mapId"`
	EventId int    `json:"eventId"`
	Note    string `json:"note"`
}

// readNotes decodes the notes an answer carries.
func readNotes(t *testing.T, data json.RawMessage) []notedNote {
	t.Helper()

	var decoded struct {
		Notes []notedNote `json:"notes"`
	}
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("answered %s: %v", data, err)
	}

	return decoded.Notes
}

// linkedBat is the cellar's battlers with the bat carrying a blueprint link after a line of its own.
var linkedBat = strings.Replace(battlersFixture, `"name":"Bat","note":""`, `"name":"Bat","note":"Guard\n<blueprint:[k3x9q2mf, 1]>"`, 1)

// TestEventNotesAnswersEveryNoteHoldingSomething covers the answer's shape: the bat's note, exactly as written, and
// neither the slime beside it nor the town's event, whose notes are empty.
func TestEventNotesAnswersEveryNoteHoldingSomething(t *testing.T) {
	// Arrange.
	current := newProject(t)
	writeProjectFile(t, current, "data/Map002.json", linkedBat)

	// Act.
	response := current.call(t, http.MethodGet, "/api/event-notes", "")

	// Assert.
	assertStatus(t, response, http.StatusOK)
	answer := readEnvelope(t, response)
	expected := []notedNote{{MapId: 2, EventId: 2, Note: "Guard\n<blueprint:[k3x9q2mf, 1]>"}}
	if notes := readNotes(t, answer.Data); reflect.DeepEqual(notes, expected) == false || answer.Path != current.root {
		t.Errorf("answered %+v for %s", notes, answer.Path)
	}
}

// TestEventNotesAnswersAnEmptyListForAProjectWithoutNotes covers a project whose events hold no notes.
func TestEventNotesAnswersAnEmptyListForAProjectWithoutNotes(t *testing.T) {
	// Arrange.
	current := newProject(t)

	// Act.
	response := current.call(t, http.MethodGet, "/api/event-notes", "")

	// Assert- a list, not null and not missing.
	assertStatus(t, response, http.StatusOK)
	if data := string(readEnvelope(t, response).Data); data != `{"notes":[]}` {
		t.Errorf("answered %s", data)
	}
}

// TestEventNotesFollowsAMapChangedOnDisk covers a copy placed and saved in another window, or edited in MZ: the next
// answers follow the file once the change stream announces it.
func TestEventNotesFollowsAMapChangedOnDisk(t *testing.T) {
	// Arrange- the bat carries its link until the file changes.
	current := newProject(t)
	writeProjectFile(t, current, "data/Map002.json", linkedBat)
	if notes := readNotes(t, readEnvelope(t, current.call(t, http.MethodGet, "/api/event-notes", "")).Data); len(notes) != 1 {
		t.Fatalf("answered %+v before the change", notes)
	}

	// Act- the link is taken off again.
	writeProjectFile(t, current, "data/Map002.json", battlersFixture)

	// Assert.
	waitForAnswer(t, current, "/api/event-notes", `{"notes":[]}`)
}

// TestEventNotesNamesAMapTheModelsCannotRead covers a map carrying a field no model declares: a 500 whose envelope
// says which file, rather than a list missing that map's notes.
func TestEventNotesNamesAMapTheModelsCannotRead(t *testing.T) {
	// Arrange.
	current := newProject(t)
	writeProjectFile(t, current, "data/Map002.json", `{"events":[null],"sparkle":true}`)

	// Act.
	response := current.call(t, http.MethodGet, "/api/event-notes", "")

	// Assert.
	assertStatus(t, response, http.StatusInternalServerError)
	answer := readEnvelope(t, response)
	if strings.Contains(answer.Error, "Map002.json") == false || answer.Data != nil {
		t.Errorf("said %q with %s", answer.Error, answer.Data)
	}
}

// TestEventNotesNeedAProjectRoot covers a server started without one.
func TestEventNotesNeedAProjectRoot(t *testing.T) {
	// Arrange.
	current := newProject(t)
	t.Setenv("JMZ_PROJECT_ROOT", "")

	// Act.
	response := current.call(t, http.MethodGet, "/api/event-notes", "")

	// Assert.
	assertStatus(t, response, http.StatusBadRequest)
}
