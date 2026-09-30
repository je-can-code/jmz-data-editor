package placements

import (
	"encoding/json"
	"errors"
	"reflect"
	"strings"
	"testing"

	"jmz-data-editor/server/internal/models/db"
)

// scanMap owes the placements list one entry per event and enemy, carrying exactly the pages that name
// that enemy, because the pages are what tell an author when the enemy is really there: a battler on
// page 2 only appears once page 2's conditions hold. Events that name no enemy are left out entirely,
// and an event naming a different enemy on each of two pages is two entries, not one.

// TestScanMapListsEachEventUnderTheEnemyItNames covers two events naming two enemies, where each must
// keep its own enemy.
func TestScanMapListsEachEventUnderTheEnemyItNames(t *testing.T) {
	// Arrange.
	gameMap := mapOf(
		eventOf(1, "Slime", 3, 4, pageOf(commentOf(t, "<enemyId:5>"))),
		eventOf(2, "Bat", 7, 8, pageOf(commentOf(t, "<enemyId:7>"))),
	)

	// Act.
	battlers, err := scanMap(gameMap)

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	assertBattlers(t, battlers, []battler{
		{enemyId: 5, eventId: 1, eventName: "Slime", x: 3, y: 4, pageIndexes: []int{0}, pageCount: 1},
		{enemyId: 7, eventId: 2, eventName: "Bat", x: 7, y: 8, pageIndexes: []int{0}, pageCount: 1},
	})
}

// TestScanMapLeavesOutEventsThatNameNoEnemy covers the events around battlers: one whose comment is some
// other tag, one with no commands, and the null a deleted event leaves.
func TestScanMapLeavesOutEventsThatNameNoEnemy(t *testing.T) {
	// Arrange.
	gameMap := mapOf(
		eventOf(1, "Lamp", 0, 0, pageOf(commentOf(t, "<sight:5>"))),
		nil,
		eventOf(3, "Marker", 0, 0, pageOf()),
		eventOf(4, "Slime", 1, 2, pageOf(commentOf(t, "<enemyId:5>"))),
	)

	// Act.
	battlers, err := scanMap(gameMap)

	// Assert- only the battler, which also proves the scan got past the null.
	if err != nil {
		t.Fatal(err)
	}
	assertBattlers(t, battlers, []battler{
		{enemyId: 5, eventId: 4, eventName: "Slime", x: 1, y: 2, pageIndexes: []int{0}, pageCount: 1},
	})
}

// TestScanMapListsOnlyThePagesNamingTheEnemy covers battlers that stand on some pages and not others.
func TestScanMapListsOnlyThePagesNamingTheEnemy(t *testing.T) {
	// Arrange- a battler on its second page only, and one on pages 1 and 3 of 3.
	gameMap := mapOf(
		eventOf(1, "Ambush", 2, 2, pageOf(), pageOf(commentOf(t, "<enemyId:5>"))),
		eventOf(2, "Returner", 4, 4,
			pageOf(commentOf(t, "<enemyId:5>")),
			pageOf(commentOf(t, "<sight:5>")),
			pageOf(commentOf(t, "<enemyId:5>"))),
	)

	// Act.
	battlers, err := scanMap(gameMap)

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	assertBattlers(t, battlers, []battler{
		{enemyId: 5, eventId: 1, eventName: "Ambush", x: 2, y: 2, pageIndexes: []int{1}, pageCount: 2},
		{enemyId: 5, eventId: 2, eventName: "Returner", x: 4, y: 4, pageIndexes: []int{0, 2}, pageCount: 3},
	})
}

// TestScanMapListsAnEventOnceForEachEnemyItsPagesName covers an event that turns into another enemy on a
// later page, and back again.
func TestScanMapListsAnEventOnceForEachEnemyItsPagesName(t *testing.T) {
	// Arrange.
	gameMap := mapOf(
		eventOf(1, "Shifter", 5, 6,
			pageOf(commentOf(t, "<enemyId:5>")),
			pageOf(commentOf(t, "<enemyId:7>")),
			pageOf(commentOf(t, "<enemyId:5>"))),
	)

	// Act.
	battlers, err := scanMap(gameMap)

	// Assert- enemy 5 first, since its first page comes first.
	if err != nil {
		t.Fatal(err)
	}
	assertBattlers(t, battlers, []battler{
		{enemyId: 5, eventId: 1, eventName: "Shifter", x: 5, y: 6, pageIndexes: []int{0, 2}, pageCount: 3},
		{enemyId: 7, eventId: 1, eventName: "Shifter", x: 5, y: 6, pageIndexes: []int{1}, pageCount: 3},
	})
}

// TestScanMapNamesWhereACommandCannotBeRead covers a damaged command: the error says which event and
// which page, counted as MZ counts them, so the author can find it.
func TestScanMapNamesWhereACommandCannotBeRead(t *testing.T) {
	// Arrange.
	gameMap := mapOf(
		eventOf(1, "Fine", 0, 0, pageOf(commentOf(t, "<enemyId:5>"))),
		eventOf(2, "Damaged", 0, 0, pageOf(), pageOf(json.RawMessage(`{"code":108,"indent":0,"parameters":[5]}`))),
	)

	// Act.
	_, err := scanMap(gameMap)

	// Assert.
	if err == nil || strings.HasPrefix(err.Error(), "event 2, page 2: ") == false {
		t.Errorf("answered %v", err)
	}
}

// TestScanMapRefusesAFileHoldingNoMap covers a map file holding null, which decodes without complaint.
func TestScanMapRefusesAFileHoldingNoMap(t *testing.T) {
	// Arrange- nothing to set up; the decoded file is simply nil.

	// Act.
	_, err := scanMap(nil)

	// Assert.
	if errors.Is(err, errNoMap) == false {
		t.Errorf("answered %v, expected %v", err, errNoMap)
	}
}

// mapOf builds a map holding the given events after the null MZ puts at index 0.
func mapOf(events ...*db.RpgMapEvent) *db.RpgMap {
	return &db.RpgMap{Events: append([]*db.RpgMapEvent{nil}, events...)}
}

// eventOf builds one map event.
func eventOf(id int, name string, x int, y int, pages ...db.RpgMapEventPage) *db.RpgMapEvent {
	return &db.RpgMapEvent{Id: id, Name: name, X: x, Y: y, Pages: pages}
}

// pageOf builds one event page running the given commands, closed the way MZ closes every list.
func pageOf(commands ...json.RawMessage) db.RpgMapEventPage {
	return db.RpgMapEventPage{List: append(commands, endOfList())}
}

// assertBattlers compares what a scan found with what it should have, in order.
func assertBattlers(t *testing.T, actual []battler, expected []battler) {
	t.Helper()

	if reflect.DeepEqual(actual, expected) == false {
		t.Errorf("found %+v\nexpected %+v", actual, expected)
	}
}
