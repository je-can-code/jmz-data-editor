package placements

import (
	"encoding/json"
	"slices"
	"strings"

	"jmz-data-editor/server/internal/models/db"
)

const (
	// setMovementRoute is the command code of Set Movement Route.
	setMovementRoute = 205

	// thisEvent is the character a movement route names when it moves the event running it.
	thisEvent = 0
)

// doorOpening is the route a door plays on itself as it opens, by move command code: turn left, wait, turn right, wait,
// turn up, Through on, and the end of the route. A door sheet draws the door closed facing down and opening a step
// further with each turn, and Through lets the player walk into the doorway it leaves.
var doorOpening = []int{17, 15, 18, 15, 19, 37, 0}

// DoorSprite is one picture the project's doors are drawn with, from a character sheet, and how many doors use it. A door
// is an event page that plays a door's opening on itself (see doorOpening), whatever else it does.
type DoorSprite struct {
	CharacterName  string `json:"characterName"`
	CharacterIndex int    `json:"characterIndex"`
	Direction      int    `json:"direction"`
	Pattern        int    `json:"pattern"`

	// Doors is how many door pages, across every map, are drawn with it.
	Doors int `json:"doors"`
}

// doorSprite is the picture one door page is drawn with, as the index keeps it for its map.
type doorSprite struct {
	characterName  string
	characterIndex int
	direction      int
	pattern        int
}

// routeStep is one command of a movement route, by its code alone.
type routeStep struct {
	Code int `json:"code"`
}

// movementRoute is a movement route as a Set Movement Route command carries it.
type movementRoute struct {
	List []routeStep `json:"list"`
}

// doorsOnMap returns the picture of every door page on a map, in event and then page order: a page that plays a door's
// opening on itself. A page drawing no character, a tile or nothing at all, is no door the editor could place again.
func doorsOnMap(gameMap *db.RpgMap) []doorSprite {
	found := []doorSprite{}
	for _, event := range gameMap.Events {
		// the events are indexed by id, so every deleted event leaves a null behind.
		if event == nil {
			continue
		}

		for _, page := range event.Pages {
			if page.Image.CharacterName != "" && opensAsADoor(page) {
				found = append(found, doorSprite{
					characterName:  page.Image.CharacterName,
					characterIndex: page.Image.CharacterIndex,
					direction:      page.Image.Direction,
					pattern:        page.Image.Pattern,
				})
			}
		}
	}

	return found
}

// opensAsADoor reports whether a page plays a door's opening on its own event: a Set Movement Route moving this event
// along exactly the door's route, however long its waits. A command that cannot be read says nothing.
func opensAsADoor(page db.RpgMapEventPage) bool {
	for _, raw := range page.List {
		var decoded command
		if json.Unmarshal(raw, &decoded) != nil || decoded.Code != setMovementRoute || len(decoded.Parameters) != 2 {
			continue
		}

		var character int
		var route movementRoute
		if json.Unmarshal(decoded.Parameters[0], &character) != nil || character != thisEvent || json.Unmarshal(decoded.Parameters[1], &route) != nil {
			continue
		}

		codes := []int{}
		for _, step := range route.List {
			codes = append(codes, step.Code)
		}
		if slices.Equal(codes, doorOpening) {
			return true
		}
	}

	return false
}

// countDoorSprites counts the doors drawn with each picture, the most used first, and those used as often by sheet,
// then index, pattern and direction, so the answer is the same however the maps are read.
func countDoorSprites(doors []doorSprite) []DoorSprite {
	counts := map[doorSprite]int{}
	for _, door := range doors {
		counts[door]++
	}

	sprites := []DoorSprite{}
	for door, count := range counts {
		sprites = append(sprites, DoorSprite{
			CharacterName:  door.characterName,
			CharacterIndex: door.characterIndex,
			Direction:      door.direction,
			Pattern:        door.pattern,
			Doors:          count,
		})
	}
	slices.SortFunc(sprites, func(left DoorSprite, right DoorSprite) int {
		if left.Doors != right.Doors {
			return right.Doors - left.Doors
		}
		if order := strings.Compare(left.CharacterName, right.CharacterName); order != 0 {
			return order
		}
		if left.CharacterIndex != right.CharacterIndex {
			return left.CharacterIndex - right.CharacterIndex
		}
		if left.Pattern != right.Pattern {
			return left.Pattern - right.Pattern
		}
		return left.Direction - right.Direction
	})

	return sprites
}
