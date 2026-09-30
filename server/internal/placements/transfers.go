package placements

import (
	"encoding/json"
	"slices"

	"jmz-data-editor/server/internal/models/db"
)

const (
	// transferPlayer is the command code of Transfer Player.
	transferPlayer = 201

	// directDesignation is a transfer naming its map and tile outright, rather than by variables.
	directDesignation = 0
)

// transfer is one Transfer Player command that names outright where it lands.
type transfer struct {
	eventId     int
	eventName   string
	pageIndex   int
	targetMapId int
	x           int
	y           int
}

// transfersOnMap returns every Transfer Player command on a map that names outright where it lands, in event
// order, then page and command order. A page sending the player to the same tile from several places (two
// branches of one choice, say) lists that landing once.
//
// A transfer by variables names no map until the game runs, so it is left out, and so is a command whose
// parameters are not the six whole numbers MZ writes: neither says where it lands. The map's own events are
// read the same way whatever map they point at, since a transfer within a map lands on it just the same.
func transfersOnMap(gameMap *db.RpgMap) []transfer {
	found := []transfer{}
	for _, event := range gameMap.Events {
		// the events are indexed by id, so every deleted event leaves a null behind.
		if event == nil {
			continue
		}

		for pageIndex, page := range event.Pages {
			for _, raw := range page.List {
				targetMapId, x, y, lands := landingOf(raw)
				if lands == false {
					continue
				}

				landing := transfer{eventId: event.Id, eventName: event.Name, pageIndex: pageIndex, targetMapId: targetMapId, x: x, y: y}
				if slices.Contains(found, landing) == false {
					found = append(found, landing)
				}
			}
		}
	}

	return found
}

// landingOf reads where a command sends the player, when it is a Transfer Player naming its map and tile
// outright: the map, then the tile's x and y.
func landingOf(raw json.RawMessage) (int, int, int, bool) {
	var decoded command
	if json.Unmarshal(raw, &decoded) != nil || decoded.Code != transferPlayer || len(decoded.Parameters) != 6 {
		return 0, 0, 0, false
	}

	// designation, map, x, y, direction and fade, every one a whole number in the files MZ writes.
	numbers := make([]int, len(decoded.Parameters))
	for index, parameter := range decoded.Parameters {
		if json.Unmarshal(parameter, &numbers[index]) != nil {
			return 0, 0, 0, false
		}
	}
	if numbers[0] != directDesignation {
		return 0, 0, 0, false
	}

	return numbers[1], numbers[2], numbers[3], true
}
