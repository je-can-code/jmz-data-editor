package placements

import (
	"encoding/json"
	"reflect"
	"testing"

	"jmz-data-editor/server/internal/models/db"
	"jmz-data-editor/server/internal/watch"
)

// The index owes the map editor the pictures the project's doors are drawn with, and how many doors use each, the most
// used first: placing a door offers them, starting from the one the doors use most, so the editor follows the author's
// own habit rather than a picture of its own. A door is a page that plays a door's opening on itself, the route every
// shipped door runs; the same route on the player, a route one step off, and a door drawing no character are not doors,
// and a count missing a map, or answered from before a change on disk, would offer the wrong picture first.

// openingRoute is a Set Movement Route moving a character along the given move command codes, each wait three frames.
func openingRoute(t *testing.T, character int, codes ...int) json.RawMessage {
	t.Helper()

	steps := []map[string]any{}
	for _, code := range codes {
		step := map[string]any{"code": code}
		if code == 15 {
			step["parameters"] = []int{3}
		}
		steps = append(steps, step)
	}

	return commandOf(t, setMovementRoute, 0, character, map[string]any{"list": steps, "repeat": false, "skippable": false, "wait": true})
}

// doorPage is a page drawn with a picture from a character sheet, running the commands given.
func doorPage(characterName string, characterIndex int, pattern int, commands ...json.RawMessage) db.RpgMapEventPage {
	page := pageOf(commands...)
	page.Image = db.RpgMapEventImage{CharacterName: characterName, CharacterIndex: characterIndex, Direction: 2, Pattern: pattern}
	return page
}

// TestDoorsOnMapListsEveryPageThatOpensAsADoor covers a door on a first page and one on a second, beside the near misses:
// the opening played on the player, a route ending facing down, a door drawn with no character, and a deleted event.
func TestDoorsOnMapListsEveryPageThatOpensAsADoor(t *testing.T) {
	// Arrange.
	gameMap := mapOf(
		eventOf(1, "Inn door", 3, 4, doorPage("!doors", 0, 1,
			commandOf(t, 250, 0, map[string]any{"name": "Open1", "volume": 90, "pitch": 100, "pan": 0}),
			openingRoute(t, thisEvent, doorOpening...),
			openingRoute(t, -1, 12, 0))),
		eventOf(2, "Locked gate", 5, 4,
			doorPage("!$Gate1", 0, 2, commandOf(t, 101, 0, "", 0, 0, 2)),
			doorPage("!$Gate1", 0, 2, openingRoute(t, thisEvent, doorOpening...))),
		eventOf(3, "Player opens", 6, 4, doorPage("!doors", 2, 1, openingRoute(t, -1, doorOpening...))),
		eventOf(4, "Turns down", 7, 4, doorPage("!doors", 2, 1, openingRoute(t, thisEvent, 17, 15, 18, 15, 16, 37, 0))),
		eventOf(5, "Drawn as a tile", 8, 4, doorPage("", 0, 0, openingRoute(t, thisEvent, doorOpening...))),
		nil,
	)

	// Act.
	found := doorsOnMap(gameMap)

	// Assert.
	expected := []doorSprite{
		{characterName: "!doors", characterIndex: 0, direction: 2, pattern: 1},
		{characterName: "!$Gate1", characterIndex: 0, direction: 2, pattern: 2},
	}
	if reflect.DeepEqual(found, expected) == false {
		t.Errorf("found %+v\nexpected %+v", found, expected)
	}
}

// TestDoorsOnMapPassesOverACommandItCannotRead covers a Set Movement Route whose character or route is not what MZ
// writes, which says nothing, beside a door on the same page that still counts.
func TestDoorsOnMapPassesOverACommandItCannotRead(t *testing.T) {
	// Arrange.
	gameMap := mapOf(eventOf(1, "Door", 0, 0, doorPage("!doors", 1, 1,
		commandOf(t, setMovementRoute, 0, "this event", map[string]any{"list": []any{}}),
		commandOf(t, setMovementRoute, 0, 0, "a route"),
		commandOf(t, setMovementRoute, 0, 0),
		openingRoute(t, thisEvent, doorOpening...))))

	// Act.
	found := doorsOnMap(gameMap)

	// Assert.
	expected := []doorSprite{{characterName: "!doors", characterIndex: 1, direction: 2, pattern: 1}}
	if reflect.DeepEqual(found, expected) == false {
		t.Errorf("found %+v\nexpected %+v", found, expected)
	}
}

// TestDoorSpritesCountsEachPictureTheMostUsedFirst covers doors across two maps: a picture used by three doors ahead of
// one used by two, and two pictures used once each ordered by sheet, then index and pattern.
func TestDoorSpritesCountsEachPictureTheMostUsedFirst(t *testing.T) {
	// Arrange.
	root := t.TempDir()
	writeFile(t, root, "data/MapInfos.json", mapInfosFixture)
	door := func(id int, characterName string, characterIndex int, pattern int) *db.RpgMapEvent {
		return eventOf(id, "Door", id, 0, doorPage(characterName, characterIndex, pattern, openingRoute(t, thisEvent, doorOpening...)))
	}
	writeMap(t, root, 1, mapOf(door(1, "!doors", 2, 1), door(2, "!doors", 2, 1), door(3, "!Door1", 6, 0), door(4, "!doors", 0, 1)))
	writeMap(t, root, 2, mapOf(door(1, "!EX_Dungeon_Doors", 4, 2), door(2, "!doors", 2, 1), door(3, "!EX_Dungeon_Doors", 4, 2), door(4, "!doors", 0, 0)))
	index, _ := newCountingIndex(t, watch.NewHub("data"))

	// Act.
	found, err := index.DoorSprites(root)

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	expected := []DoorSprite{
		{CharacterName: "!doors", CharacterIndex: 2, Direction: 2, Pattern: 1, Doors: 3},
		{CharacterName: "!EX_Dungeon_Doors", CharacterIndex: 4, Direction: 2, Pattern: 2, Doors: 2},
		{CharacterName: "!Door1", CharacterIndex: 6, Direction: 2, Pattern: 0, Doors: 1},
		{CharacterName: "!doors", CharacterIndex: 0, Direction: 2, Pattern: 0, Doors: 1},
		{CharacterName: "!doors", CharacterIndex: 0, Direction: 2, Pattern: 1, Doors: 1},
	}
	if reflect.DeepEqual(found, expected) == false {
		t.Errorf("answered %+v\nexpected %+v", found, expected)
	}
}

// TestDoorSpritesAnswersAnEmptyListForAProjectWithoutDoors covers a project whose events open no doors, whose list must
// still be a list.
func TestDoorSpritesAnswersAnEmptyListForAProjectWithoutDoors(t *testing.T) {
	// Arrange.
	root := t.TempDir()
	writeFile(t, root, "data/MapInfos.json", mapInfosFixture)
	writeMap(t, root, 1, mapOf(eventOf(1, "Sign", 0, 0, pageOf(commandOf(t, 101, 0, "", 0, 0, 2)))))
	index, _ := newCountingIndex(t, watch.NewHub("data"))

	// Act.
	found, err := index.DoorSprites(root)

	// Assert.
	if err != nil || found == nil || len(found) != 0 {
		t.Errorf("answered %+v (%v), expected an empty list", found, err)
	}
}

// TestDoorSpritesNamesAMapTheModelsCannotRead covers a map file that is no map, which fails the whole count rather than
// leaving its doors out of it.
func TestDoorSpritesNamesAMapTheModelsCannotRead(t *testing.T) {
	// Arrange.
	root := t.TempDir()
	writeFile(t, root, "data/MapInfos.json", mapInfosFixture)
	writeFile(t, root, "data/Map001.json", `{"events":"none"}`)
	index, _ := newCountingIndex(t, watch.NewHub("data"))

	// Act.
	_, err := index.DoorSprites(root)

	// Assert.
	if err == nil {
		t.Error("expected the count to fail on a map that is no map")
	}
}
