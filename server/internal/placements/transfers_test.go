package placements

import (
	"reflect"
	"testing"
)

// transfersOnMap owes a resize every transfer that names outright where it lands, because those are the
// transfers a resize leaves pointing at the old spot: one entry per event page and landing, wherever on the
// page the command sits. A transfer by variables, a command that only looks like one, and every other
// command say nothing about where a player lands, so they are left out.

// TestTransfersOnMapListsEachTransferNamingItsLanding covers the transfers around one real landing: one
// nested in a branch, one sending the player within the map itself, a repeat of a landing on the same page,
// the same landing on a later page, and the near misses beside them.
func TestTransfersOnMapListsEachTransferNamingItsLanding(t *testing.T) {
	// Arrange.
	gameMap := mapOf(
		eventOf(1, "Door", 3, 4,
			pageOf(
				commandOf(t, transferPlayer, 0, 0, 2, 5, 6, 2, 0),
				commandOf(t, 111, 0, 0, 1, 0),
				commandOf(t, transferPlayer, 1, 0, 2, 5, 6, 8, 1),
				commandOf(t, transferPlayer, 1, 0, 7, 1, 1, 0, 0)),
			pageOf(commandOf(t, transferPlayer, 0, 0, 2, 5, 6, 2, 0))),
		nil,
		eventOf(3, "Stairs", 0, 0, pageOf(
			commandOf(t, transferPlayer, 0, 1, 12, 13, 14, 2, 0),
			commandOf(t, 202, 0, 0, 0, 2, 9, 9),
			commandOf(t, transferPlayer, 0, 0, 2, 9, 9, 2),
			commandOf(t, transferPlayer, 0, 0, 2, "9", 9, 2, 0),
			commandOf(t, transferPlayer, 0, 0, 1, 0, 1, 4, 2))),
	)

	// Act.
	found := transfersOnMap(gameMap)

	// Assert- the repeat on the first page once, the later page again, and nothing from the near misses.
	expected := []transfer{
		{eventId: 1, eventName: "Door", pageIndex: 0, targetMapId: 2, x: 5, y: 6},
		{eventId: 1, eventName: "Door", pageIndex: 0, targetMapId: 7, x: 1, y: 1},
		{eventId: 1, eventName: "Door", pageIndex: 1, targetMapId: 2, x: 5, y: 6},
		{eventId: 3, eventName: "Stairs", pageIndex: 0, targetMapId: 1, x: 0, y: 1},
	}
	if reflect.DeepEqual(found, expected) == false {
		t.Errorf("found %+v\nexpected %+v", found, expected)
	}
}

// TestTransfersOnMapAnswersAnEmptyListForAMapWithoutTransfers covers a map sending the player nowhere,
// whose list must still be a list.
func TestTransfersOnMapAnswersAnEmptyListForAMapWithoutTransfers(t *testing.T) {
	// Arrange.
	gameMap := mapOf(eventOf(1, "Slime", 0, 0, pageOf(commentOf(t, "<enemyId:5>"))))

	// Act.
	found := transfersOnMap(gameMap)

	// Assert.
	if found == nil || len(found) != 0 {
		t.Errorf("found %#v", found)
	}
}
