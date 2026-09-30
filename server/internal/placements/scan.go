package placements

import (
	"errors"
	"fmt"

	"jmz-data-editor/server/internal/models/db"
)

// errNoMap is a map file that holds null rather than a map.
var errNoMap = errors.New("the file holds no map")

// battler is one map event standing as a battler of one enemy, on the pages it names that enemy.
type battler struct {
	enemyId   int
	eventId   int
	eventName string
	x         int
	y         int

	// pageIndexes are the pages naming the enemy, counted from 0 in page order.
	pageIndexes []int

	// pageCount is how many pages the event has in all.
	pageCount int
}

// scanMap returns every battler on a map, in event order.
//
// An event is a battler on whichever of its pages name an enemy, and only while the game has it on one
// of those pages, which its page conditions decide as the game runs. So an event appears once for each
// enemy its pages name, listing the pages naming that enemy: most name one enemy on every page, but an
// event can name one enemy on its first page and another on a later one, and then it appears twice.
func scanMap(gameMap *db.RpgMap) ([]battler, error) {
	if gameMap == nil {
		return nil, errNoMap
	}

	battlers := []battler{}
	for _, event := range gameMap.Events {
		// the events are indexed by id, so every deleted event leaves a null behind.
		if event == nil {
			continue
		}

		found, err := scanEvent(event)
		if err != nil {
			return nil, err
		}
		battlers = append(battlers, found...)
	}

	return battlers, nil
}

// scanEvent returns one battler for each enemy an event's pages name, ordered by the first page naming
// each one.
func scanEvent(event *db.RpgMapEvent) ([]battler, error) {
	battlers := []battler{}
	for pageIndex, page := range event.Pages {
		enemyId, err := enemyOnPage(page.List)
		if err != nil {
			return nil, fmt.Errorf("event %d, page %d: %w", event.Id, pageIndex+1, err)
		}
		if enemyId == 0 {
			continue
		}

		// a later page naming the same enemy joins the battler an earlier page began.
		index := indexOfEnemy(battlers, enemyId)
		if index >= 0 {
			battlers[index].pageIndexes = append(battlers[index].pageIndexes, pageIndex)
			continue
		}

		battlers = append(battlers, battler{
			enemyId:     enemyId,
			eventId:     event.Id,
			eventName:   event.Name,
			x:           event.X,
			y:           event.Y,
			pageIndexes: []int{pageIndex},
			pageCount:   len(event.Pages),
		})
	}

	return battlers, nil
}

// indexOfEnemy returns where in battlers the one of an enemy sits, or -1 when there is none yet.
func indexOfEnemy(battlers []battler, enemyId int) int {
	for index, found := range battlers {
		if found.enemyId == enemyId {
			return index
		}
	}

	return -1
}
