package main

import (
	"net/http"
	"testing"
)

// The new-game route owes the map editor the party a new game seats, inside the usual envelope, so the
// editor can show each event's page as a fresh save would; a file it reads that is not JSON is a 500
// naming the file. These run through the real route table.

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
