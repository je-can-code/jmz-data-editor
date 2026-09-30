package main

import (
	"encoding/json"
	"net/http"
	"reflect"
	"testing"

	"jmz-data-editor/server/internal/commandlist"
)

// The command list's routes owe the map editor two answers about the whole project, inside the usual
// envelope: how many events use each command, and the names of switches, variables and database rows.
// Either answers a 500 naming the file when a file it reads is not JSON. These run through the real route
// table.

// TestCommandUsageCountsTheProjectsEvents covers the usage answer over the fixture project, whose one map
// has one event showing a line of text, beside two common events: one showing a line, one empty.
func TestCommandUsageCountsTheProjectsEvents(t *testing.T) {
	// Arrange.
	current := newProject(t)

	// Act.
	response := current.call(t, http.MethodGet, "/api/command-usage", "")

	// Assert.
	assertStatus(t, response, http.StatusOK)
	answer := readEnvelope(t, response)
	if string(answer.Data) != `{"events":3,"codes":{"0":3,"101":2,"401":2},"pluginCommands":[]}` || answer.Path != current.root {
		t.Errorf("answered %s for %s", answer.Data, answer.Path)
	}
}

// TestCommandUsageFailsOnABrokenMapNamingIt covers a map that is not JSON.
func TestCommandUsageFailsOnABrokenMapNamingIt(t *testing.T) {
	// Arrange.
	current := newProject(t)
	writeProjectFile(t, current, "data/Map002.json", "{not json")

	// Act.
	response := current.call(t, http.MethodGet, "/api/command-usage", "")

	// Assert.
	assertStatus(t, response, http.StatusInternalServerError)
	if answer := readEnvelope(t, response); len(answer.Error) < len("data/Map002.json") || answer.Error[:len("data/Map002.json")] != "data/Map002.json" {
		t.Errorf("said %q", answer.Error)
	}
}

// TestDatabaseNamesAnswersTheNamesById covers the names answer: the map tree's, tilesets' and common
// events' names, and the system's switches, with empty lists for the tables the fixture project lacks.
func TestDatabaseNamesAnswersTheNamesById(t *testing.T) {
	// Arrange.
	current := newProject(t)
	writeProjectFile(t, current, "data/System.json", `{"switches":["","Door Open"],"variables":[""],"equipTypes":[""]}`)

	// Act.
	response := current.call(t, http.MethodGet, "/api/database-names", "")

	// Assert: decoded, since the answer escapes the map tree's markup the way Go's encoder does.
	assertStatus(t, response, http.StatusOK)
	var names commandlist.Names
	if err := json.Unmarshal(readEnvelope(t, response).Data, &names); err != nil {
		t.Fatal(err)
	}
	expected := commandlist.Names{
		Switches: []string{"", "Door Open"}, Variables: []string{""}, EquipTypes: []string{""},
		Actors: []string{}, Classes: []string{}, Skills: []string{}, Items: []string{}, Weapons: []string{},
		Armors: []string{}, Enemies: []string{}, Troops: []string{}, States: []string{}, Animations: []string{},
		Tilesets: []string{"", "Outside"}, CommonEvents: []string{"", "Greet", ""}, Maps: []string{"", `<Town> & "Square"`, "Cellar"},
	}
	if reflect.DeepEqual(names, expected) == false {
		t.Errorf("answered %+v", names)
	}
}

// TestDatabaseNamesFailsOnABrokenTableNamingIt covers a System.json that is not JSON, as the fixture
// project's is.
func TestDatabaseNamesFailsOnABrokenTableNamingIt(t *testing.T) {
	// Arrange: the fixture's System.json holds a marker, not JSON.
	current := newProject(t)

	// Act.
	response := current.call(t, http.MethodGet, "/api/database-names", "")

	// Assert.
	assertStatus(t, response, http.StatusInternalServerError)
	if answer := readEnvelope(t, response); len(answer.Error) < len("data/System.json") || answer.Error[:len("data/System.json")] != "data/System.json" {
		t.Errorf("said %q", answer.Error)
	}
}
