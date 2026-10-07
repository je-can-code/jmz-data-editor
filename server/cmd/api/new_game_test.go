package main

import (
	"net/http"
	"testing"
)

// The new-game route owes the map editor the party a new game seats, inside the usual envelope, so the
// editor can show each event's page as a fresh save would; a file it reads that is not JSON is a 500
// naming the file. It only reads: nothing may write through it. These run through the real route table.

// TestNewGameAnswersTheStartingParty covers the answer over the fixture project, given a starting party
// of two whose second actor has no row.
func TestNewGameAnswersTheStartingParty(t *testing.T) {
	// Arrange.
	current := newProject(t)
	writeProjectFile(t, current, "data/System.json", `{"partyMembers":[1,2],"switches":[""]}`)
	writeProjectFile(t, current, "data/Actors.json", `[null,{"id":1,"name":"Jerald"},null]`)

	// Act.
	response := current.call(t, http.MethodGet, "/api/new-game", "")

	// Assert.
	assertStatus(t, response, http.StatusOK)
	answer := readEnvelope(t, response)
	if string(answer.Data) != `{"party":[1]}` || answer.Path != current.root {
		t.Errorf("answered %s for %s", answer.Data, answer.Path)
	}
}

// TestNewGameWritesNothing covers the route being a read alone: a POST and a PUT are refused, and the
// files it reads are untouched.
func TestNewGameWritesNothing(t *testing.T) {
	// Arrange.
	current := newProject(t)
	system := `{"partyMembers":[1,2],"switches":[""]}`
	actors := `[null,{"id":1,"name":"Jerald"},null]`
	writeProjectFile(t, current, "data/System.json", system)
	writeProjectFile(t, current, "data/Actors.json", actors)

	for _, method := range []string{http.MethodPost, http.MethodPut} {
		// Act.
		response := current.call(t, method, "/api/new-game", `{"party":[3]}`, "Content-Type", "application/json")

		// Assert.
		assertStatus(t, response, http.StatusMethodNotAllowed)
	}
	if written := current.read(t, "data/System.json"); written != system {
		t.Errorf("System.json changed:\n%s", written)
	}
	if written := current.read(t, "data/Actors.json"); written != actors {
		t.Errorf("Actors.json changed:\n%s", written)
	}
}

// TestNewGameFailsOnABrokenSystemNamingIt covers a System.json that is not JSON, as the fixture
// project's is.
func TestNewGameFailsOnABrokenSystemNamingIt(t *testing.T) {
	// Arrange: the fixture's System.json holds a marker, not JSON.
	current := newProject(t)

	// Act.
	response := current.call(t, http.MethodGet, "/api/new-game", "")

	// Assert.
	assertStatus(t, response, http.StatusInternalServerError)
	if answer := readEnvelope(t, response); len(answer.Error) < len("data/System.json") || answer.Error[:len("data/System.json")] != "data/System.json" {
		t.Errorf("said %q", answer.Error)
	}
}
