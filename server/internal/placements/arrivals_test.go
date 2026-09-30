package placements

import (
	"reflect"
	"testing"

	"jmz-data-editor/server/internal/watch"
)

// The index owes a resize every transfer landing on the map being resized, from whichever map it is on, that
// one included, and nothing else: a transfer sending the player somewhere else is not the resize's business.
// It reads the maps it already reads for the placements, so the two answers always come from the same files.

// newArrivalsProject writes a project where the meadow, the cave itself and a map the tree has no row for
// each hold a transfer into the cave, beside a transfer from the meadow to itself.
func newArrivalsProject(t *testing.T) string {
	t.Helper()

	root := t.TempDir()
	writeFile(t, root, "data/MapInfos.json", mapInfosFixture)
	writeMap(t, root, 1, mapOf(eventOf(1, "Door", 0, 0, pageOf(
		commandOf(t, transferPlayer, 0, 0, 2, 3, 4, 2, 0),
		commandOf(t, transferPlayer, 0, 0, 1, 9, 9, 2, 0)))))
	writeMap(t, root, 2, mapOf(eventOf(1, "Ladder", 1, 1, pageOf(commandOf(t, transferPlayer, 0, 0, 2, 5, 5, 8, 0)))))
	writeMap(t, root, 3, mapOf(eventOf(2, "Portal", 0, 0, pageOf(commandOf(t, transferPlayer, 0, 0, 2, 6, 7, 2, 0)))))
	return root
}

// TestArrivalsListsEveryTransferLandingOnTheMap covers the three transfers into the cave, by map id, each
// named from the tree, and not the meadow's transfer to itself.
func TestArrivalsListsEveryTransferLandingOnTheMap(t *testing.T) {
	// Arrange.
	root := newArrivalsProject(t)
	index, _ := newCountingIndex(t, watch.NewHub("data"))

	// Act.
	found, err := index.Arrivals(root, 2)

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	expected := []Arrival{
		{MapId: 1, MapName: "Meadow", EventId: 1, EventName: "Door", PageIndex: 0, X: 3, Y: 4},
		{MapId: 2, MapName: "Cave", EventId: 1, EventName: "Ladder", PageIndex: 0, X: 5, Y: 5},
		{MapId: 3, MapName: "", EventId: 2, EventName: "Portal", PageIndex: 0, X: 6, Y: 7},
	}
	if reflect.DeepEqual(found, expected) == false {
		t.Errorf("answered %+v\nexpected %+v", found, expected)
	}
}

// TestArrivalsAnswersAnEmptyListForAMapNothingLandsOn covers a map no transfer names, whose list must still
// be a list.
func TestArrivalsAnswersAnEmptyListForAMapNothingLandsOn(t *testing.T) {
	// Arrange.
	root := newArrivalsProject(t)
	index, _ := newCountingIndex(t, watch.NewHub("data"))

	// Act.
	found, err := index.Arrivals(root, 9)

	// Assert.
	if err != nil || found == nil || len(found) != 0 {
		t.Errorf("answered %#v, %v", found, err)
	}
}

// TestArrivalsAndPlacementsShareOneReadingOfEachMap covers the cost: asking for both reads each map once.
func TestArrivalsAndPlacementsShareOneReadingOfEachMap(t *testing.T) {
	// Arrange.
	root := newArrivalsProject(t)
	index, reads := newCountingIndex(t, watch.NewHub("data"))

	// Act.
	if _, err := index.Placements(root, 5); err != nil {
		t.Fatal(err)
	}
	if _, err := index.Arrivals(root, 2); err != nil {
		t.Fatal(err)
	}

	// Assert.
	assertReads(t, reads, map[string]int{"Map001.json": 1, "Map002.json": 1, "Map003.json": 1})
}
