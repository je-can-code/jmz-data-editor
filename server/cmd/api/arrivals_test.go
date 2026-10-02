package main

import (
	"net/http"
	"strings"
	"testing"
)

// The arrivals route owes the map editor's resize form every transfer landing on the map being resized,
// inside the usual envelope and always as a list, so the form can warn before a resize leaves them pointing
// at the old spot. It follows the maps as they change on disk, and refuses an id that could not be a map's.
// These run through the real route table.

// doorFixture is a map whose door sends the player to the fixture's map 1, at 0, 0.
const doorFixture = `{"events":[null,` +
	`{"id":1,"name":"Door","note":"","pages":[{"list":[{"code":201,"indent":0,"parameters":[0,1,0,0,2,0]},` +
	`{"code":0,"indent":0,"parameters":[]}]}],"x":4,"y":4}` +
	`]}`

// cellarDoor is the answer about map 1 once the cellar holds doorFixture.
const cellarDoor = `{"mapId":1,"arrivals":[{"mapId":2,"mapName":"Cellar","eventId":1,"eventName":"Door","pageIndex":0,"x":0,"y":0}]}`

// TestMapArrivalsAnswersWithTheTransfersLandingOnTheMap covers the answer's shape: the cellar's door, named
// from the map tree.
func TestMapArrivalsAnswersWithTheTransfersLandingOnTheMap(t *testing.T) {
	// Arrange.
	current := newProject(t)
	writeProjectFile(t, current, "data/Map002.json", doorFixture)

	// Act.
	response := current.call(t, http.MethodGet, "/api/maps/1/arrivals", "")

	// Assert.
	assertStatus(t, response, http.StatusOK)
	if data := string(readEnvelope(t, response).Data); data != cellarDoor {
		t.Errorf("answered %s", data)
	}
}

// TestMapArrivalsAnswersAnEmptyListForAMapNothingLandsOn covers the door's own map, which nothing names.
func TestMapArrivalsAnswersAnEmptyListForAMapNothingLandsOn(t *testing.T) {
	// Arrange.
	current := newProject(t)
	writeProjectFile(t, current, "data/Map002.json", doorFixture)

	// Act.
	response := current.call(t, http.MethodGet, "/api/maps/2/arrivals", "")

	// Assert- a list, not null and not missing.
	assertStatus(t, response, http.StatusOK)
	if data := string(readEnvelope(t, response).Data); data != `{"mapId":2,"arrivals":[]}` {
		t.Errorf("answered %s", data)
	}
}

// TestMapArrivalsFollowsAMapChangedOnDisk covers a door moved while the server runs: the next answers follow
// the file once the change stream announces it.
func TestMapArrivalsFollowsAMapChangedOnDisk(t *testing.T) {
	// Arrange- the door lands on map 1 until the file changes.
	current := newProject(t)
	writeProjectFile(t, current, "data/Map002.json", doorFixture)
	if data := string(readEnvelope(t, current.call(t, http.MethodGet, "/api/maps/1/arrivals", "")).Data); data != cellarDoor {
		t.Fatalf("answered %s before the change", data)
	}

	// Act- the door now sends the player to map 3.
	writeProjectFile(t, current, "data/Map002.json", strings.Replace(doorFixture, "[0,1,0,0,2,0]", "[0,3,0,0,2,0]", 1))

	// Assert.
	waitForAnswer(t, current, "/api/maps/1/arrivals", `{"mapId":1,"arrivals":[]}`)
}

// TestMapArrivalsRefusesIdsThatAreNotMapIds covers the id guard.
func TestMapArrivalsRefusesIdsThatAreNotMapIds(t *testing.T) {
	for _, id := range []string{"abc", "0", "-3", "1.5"} {
		t.Run(id, func(t *testing.T) {
			// Arrange.
			current := newProject(t)

			// Act.
			response := current.call(t, http.MethodGet, "/api/maps/"+id+"/arrivals", "")

			// Assert.
			assertStatus(t, response, http.StatusBadRequest)
			if message := strings.TrimSpace(response.Body.String()); message != "mapId must be an integer of at least 1" {
				t.Errorf("said %q", message)
			}
		})
	}
}
