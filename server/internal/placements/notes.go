package placements

import "jmz-data-editor/server/internal/models/db"

// EventNote is one map event's note, exactly as its map file holds it. The map editor keeps its own marks in event
// notes, which nothing in the game reads on any map but J-ABS's action map: a copy placed from a blueprint carries
// its link back to the blueprint there, so the notes across every map are what say how many copies each blueprint
// has, and where.
type EventNote struct {
	MapId   int    `json:"mapId"`
	EventId int    `json:"eventId"`
	Note    string `json:"note"`
}

// eventNote is one event's note as the index keeps it for its map.
type eventNote struct {
	eventId int
	note    string
}

// notesOnMap returns the note of every event on a map whose note holds anything, in event order. An empty note says
// nothing, and nearly every event has one, so leaving those out keeps the answer to the few that do.
func notesOnMap(gameMap *db.RpgMap) []eventNote {
	found := []eventNote{}
	for _, event := range gameMap.Events {
		// the events are indexed by id, so every deleted event leaves a null behind.
		if event == nil || event.Note == "" {
			continue
		}

		found = append(found, eventNote{eventId: event.Id, note: event.Note})
	}

	return found
}
