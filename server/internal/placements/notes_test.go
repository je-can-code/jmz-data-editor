package placements

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"

	"jmz-data-editor/server/internal/models/db"
	"jmz-data-editor/server/internal/watch"
)

// The index owes the map editor the note of every map event that holds one, exactly as the file writes it, by map
// and then event: the editor keeps a blueprint's links in its copies' notes, and counts every blueprint's copies
// from this answer. A note missed, or one answered from before a change on disk, would count a copy that is gone or
// miss one that is there, and a blueprint could be deleted from under its copies. An empty note says nothing, and
// nearly every event has one, so those are left out.

// notedEvent builds a map event holding a note.
func notedEvent(id int, name string, note string) *db.RpgMapEvent {
	event := eventOf(id, name, id, id, pageOf())
	event.Note = note
	return event
}

// TestNotesOnMapListsEveryNoteHoldingSomething covers the near misses beside each note listed: an event whose note
// is empty and a deleted event are left out, while a note of nothing but a line break holds something, and is
// listed exactly as written.
func TestNotesOnMapListsEveryNoteHoldingSomething(t *testing.T) {
	// Arrange.
	gameMap := mapOf(
		notedEvent(1, "Goblin", "<blueprint:[k3x9q2mf, 1]>"),
		notedEvent(2, "Lamp", ""),
		nil,
		notedEvent(4, "Stab", "<moveSpeed:6.0>\r\nkept"),
		notedEvent(5, "Blank", "\n"),
	)

	// Act.
	found := notesOnMap(gameMap)

	// Assert.
	expected := []eventNote{{eventId: 1, note: "<blueprint:[k3x9q2mf, 1]>"}, {eventId: 4, note: "<moveSpeed:6.0>\r\nkept"}, {eventId: 5, note: "\n"}}
	if reflect.DeepEqual(found, expected) == false {
		t.Errorf("found %+v\nexpected %+v", found, expected)
	}
}

// TestNotesOnMapAnswersAnEmptyListForAMapWithoutNotes covers a map whose events all have empty notes, as nearly every
// map's do: a list, never nil, so the answer reads as a list.
func TestNotesOnMapAnswersAnEmptyListForAMapWithoutNotes(t *testing.T) {
	// Arrange.
	gameMap := mapOf(notedEvent(1, "Lamp", ""))

	// Act.
	encoded, err := json.Marshal(notesOnMap(gameMap))

	// Assert.
	if err != nil || string(encoded) != "[]" {
		t.Errorf("answered %s (%v), expected []", encoded, err)
	}
}

// TestEventNotesListsEveryNoteByMapThenEvent covers the answer across a project: every note holding something, on
// every map the game loads, by map id and then event, and nothing from a copy of a map under a name the game never
// loads.
func TestEventNotesListsEveryNoteByMapThenEvent(t *testing.T) {
	// Arrange- the fixture's maps hold no notes; two more maps do, written out of order, and Map004 has a stray copy.
	root := newFixtureProject(t)
	writeMap(t, root, 5, mapOf(notedEvent(1, "Goblin", "<blueprint:[k3x9q2mf, 1]>"), notedEvent(2, "Lamp", "")))
	writeMap(t, root, 4, mapOf(nil, notedEvent(2, "Orc", "Guard\n<blueprint:[k3x9q2mf, 2]>"), notedEvent(3, "Wolf", "a")))
	writeMap(t, root, 1004, mapOf(notedEvent(1, "Bear", "<blueprint:[zz, 1]>")))
	writeFile(t, root, "data/Map4.json", `{"events":[null,{"id":1,"name":"Stray","note":"never loaded","pages":[],"x":0,"y":0}]}`)
	index, _ := newCountingIndex(t, watch.NewHub("data"))

	// Act.
	found, err := index.EventNotes(root)

	// Assert- Map1004 sorts after Map005 by id, though not by name.
	if err != nil {
		t.Fatal(err)
	}
	expected := []EventNote{
		{MapId: 4, EventId: 2, Note: "Guard\n<blueprint:[k3x9q2mf, 2]>"},
		{MapId: 4, EventId: 3, Note: "a"},
		{MapId: 5, EventId: 1, Note: "<blueprint:[k3x9q2mf, 1]>"},
		{MapId: 1004, EventId: 1, Note: "<blueprint:[zz, 1]>"},
	}
	if reflect.DeepEqual(found, expected) == false {
		t.Errorf("answered %+v\nexpected %+v", found, expected)
	}
}

// TestEventNotesAnswersAnEmptyListForAProjectWithoutNotes covers a project none of whose events holds a note.
func TestEventNotesAnswersAnEmptyListForAProjectWithoutNotes(t *testing.T) {
	// Arrange.
	root := newFixtureProject(t)
	index, _ := newCountingIndex(t, watch.NewHub("data"))

	// Act.
	found, err := index.EventNotes(root)

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	encoded, _ := json.Marshal(found)
	if string(encoded) != "[]" {
		t.Errorf("answered %s, expected []", encoded)
	}
}

// TestEventNotesFollowsAMapChangedOnDisk covers a copy placed in another window and saved, or edited in MZ: the next
// answers follow the file once the change stream announces it, reading that map again and no other.
func TestEventNotesFollowsAMapChangedOnDisk(t *testing.T) {
	// Arrange- the cave's slime holds no note until the file changes.
	root := newFixtureProject(t)
	index, reads := newCountingIndex(t, watch.NewHub("data"))
	if _, err := index.EventNotes(root); err != nil {
		t.Fatal(err)
	}

	// Act.
	writeMap(t, root, 2, mapOf(nil, notedEvent(2, "Slime", "<blueprint:[k3x9q2mf, 1]>")))

	// Assert.
	var found []EventNote
	waitFor(t, "the change to reach the notes", func() bool {
		answer, err := index.EventNotes(root)
		if err != nil {
			t.Fatal(err)
		}
		found = answer
		return len(answer) == 1
	})
	if reflect.DeepEqual(found, []EventNote{{MapId: 2, EventId: 2, Note: "<blueprint:[k3x9q2mf, 1]>"}}) == false {
		t.Errorf("answered %+v", found)
	}
	assertReads(t, reads, map[string]int{"Map001.json": 1, "Map002.json": 2, "Map003.json": 1})
}

// TestEventNotesShareTheReadingWithThePlacements covers the one reading of every map: asking where an enemy stands
// and then for the notes reads no map twice.
func TestEventNotesShareTheReadingWithThePlacements(t *testing.T) {
	// Arrange.
	root := newFixtureProject(t)
	index, reads := newCountingIndex(t, watch.NewHub("data"))
	if _, err := index.Placements(root, 5); err != nil {
		t.Fatal(err)
	}

	// Act.
	_, err := index.EventNotes(root)

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	assertReads(t, reads, map[string]int{"Map001.json": 1, "Map002.json": 1, "Map003.json": 1})
}

// TestEventNotesNamesAMapTheModelsCannotRead covers a map the strict models refuse: the whole answer fails naming its
// file, rather than leaving out notes that may hold copies.
func TestEventNotesNamesAMapTheModelsCannotRead(t *testing.T) {
	// Arrange.
	root := newFixtureProject(t)
	writeFile(t, root, "data/Map002.json", `{"events":[null],"sparkle":true}`)
	index, _ := newCountingIndex(t, watch.NewHub("data"))

	// Act.
	found, err := index.EventNotes(root)

	// Assert.
	if err == nil || found != nil || strings.Contains(err.Error(), "Map002.json") == false || strings.Contains(err.Error(), `unknown field "sparkle"`) == false {
		t.Errorf("answered %+v with %v", found, err)
	}
}
