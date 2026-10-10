package placements

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strconv"
	"strings"
	"testing"

	"jmz-data-editor/server/internal/gametest"
	"jmz-data-editor/server/internal/models/db"
	"jmz-data-editor/server/internal/store"
	"jmz-data-editor/server/internal/watch"
)

// TestPlacementsAcrossTheRealMaps asks the game's own project where every enemy stands. It proves that
// every shipped map reads strictly enough to be scanned, since one that did not would fail every answer,
// and it checks each placement against a plain reading of its map file: the event is there, under that
// id, name and position, with that many pages, and each page listed carries a tag naming the enemy.
//
// It runs against the project JMZ_PROJECT_ROOT names, and fails when that names no project, or against
// the sibling checkout when the variable is unset; see gametest. The floors are far below today's
// counts (4,734 placements across more than 300 maps), so adding content never breaks them, while a
// scan that quietly saw nothing would.
func TestPlacementsAcrossTheRealMaps(t *testing.T) {
	// Arrange- the project, and every enemy in its database.
	dataDir := gametest.DataDir(t)
	root := filepath.Dir(dataDir)
	enemies, err := store.Load[[]*db.RpgEnemy](filepath.Join(dataDir, "Enemies.json"))
	if err != nil {
		t.Fatal(err)
	}
	index, _ := newCountingIndex(t, watch.NewHub("data"))
	rawMaps := map[int][]*rawEvent{}

	// Act- ask about each enemy in turn, as the board would.
	found := []Placement{}
	for _, enemy := range enemies {
		if enemy == nil {
			continue
		}
		placements, err := index.Placements(root, enemy.Id)
		if err != nil {
			t.Fatal(err)
		}
		for _, placement := range placements {
			assertStandsOnItsMap(t, rawEventsOf(t, dataDir, placement.MapId, rawMaps), enemy.Id, placement)
		}
		found = append(found, placements...)
	}

	// Assert- the sweep saw the whole folder, and found battlers across it.
	maps := map[int]bool{}
	for _, placement := range found {
		maps[placement.MapId] = true
	}
	if len(index.mapIds) < 300 || len(found) < 1000 || len(maps) < 100 {
		t.Errorf("scanned %d maps and found %d placements on %d of them", len(index.mapIds), len(found), len(maps))
	}
}

// TestArrivalsAcrossTheRealMaps asks the game's own project which transfers land on each of its maps, as a
// resize of each would. It proves every shipped map reads for its transfers, and checks each arrival against
// a plain reading of the map it is on: the event is there under that id and name, and the page listed holds a
// Transfer Player naming that map and tile outright. It finds the project as the placements sweep does. The
// floors are far below today's counts (907 arrivals landing on 305 of 384 maps), so adding content never
// breaks them, while a scan that quietly saw nothing would.
func TestArrivalsAcrossTheRealMaps(t *testing.T) {
	// Arrange- the first answer lists the maps to ask about.
	dataDir := gametest.DataDir(t)
	root := filepath.Dir(dataDir)
	index, _ := newCountingIndex(t, watch.NewHub("data"))
	if _, err := index.Arrivals(root, 1); err != nil {
		t.Fatal(err)
	}
	mapIds := append([]int{}, index.mapIds...)
	rawMaps := map[int][]*rawEvent{}

	// Act- ask about each map in turn.
	found := 0
	landedOn := 0
	for _, mapId := range mapIds {
		arrivals, err := index.Arrivals(root, mapId)
		if err != nil {
			t.Fatal(err)
		}
		for _, arrival := range arrivals {
			assertLandsFromItsMap(t, rawEventsOf(t, dataDir, arrival.MapId, rawMaps), mapId, arrival)
		}
		found += len(arrivals)
		if len(arrivals) > 0 {
			landedOn++
		}
	}

	// Assert- the sweep found transfers into maps across the folder.
	if len(mapIds) < 300 || found < 300 || landedOn < 100 {
		t.Errorf("asked about %d maps and found %d arrivals landing on %d of them", len(mapIds), found, landedOn)
	}
}

// TestEventNotesAcrossTheRealMaps asks the game's own project for every event note that holds anything, as the map
// editor does to count each blueprint's copies, and holds the answer against a plain reading of every map file the
// game loads: the very same notes, byte for byte, by map and then event, and none missing. It finds the project as
// the placements sweep does. Chef Adventure's notes are nearly all empty (one held text when this was written: stab
// 3's on the action map), so the comparison is exact rather than a floor, and the floor is on the maps swept.
func TestEventNotesAcrossTheRealMaps(t *testing.T) {
	// Arrange- every map the game loads, read plainly.
	dataDir := gametest.DataDir(t)
	root := filepath.Dir(dataDir)
	entries, err := os.ReadDir(dataDir)
	if err != nil {
		t.Fatal(err)
	}
	expected := []EventNote{}
	swept := 0
	rawMaps := map[int][]*rawEvent{}
	mapIds := []int{}
	for _, entry := range entries {
		if mapId, isMap := mapIdOfFile(entry.Name()); isMap {
			mapIds = append(mapIds, mapId)
		}
	}
	slices.Sort(mapIds)
	for _, mapId := range mapIds {
		swept++
		for _, event := range rawEventsOf(t, dataDir, mapId, rawMaps) {
			if event != nil && event.Note != "" {
				expected = append(expected, EventNote{MapId: mapId, EventId: event.Id, Note: event.Note})
			}
		}
	}
	index, _ := newCountingIndex(t, watch.NewHub("data"))

	// Act.
	found, err := index.EventNotes(root)

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	if swept < 300 || reflect.DeepEqual(found, expected) == false {
		t.Errorf("swept %d maps; answered %+v\nexpected %+v", swept, found, expected)
	}
}

// TestDoorSpritesAcrossTheRealMaps asks the game's own project what its doors are drawn with, as the map editor does
// before it places a door, and holds the count against a plain reading of every map file the game loads: as many doors
// in all as there are pages playing a door's opening on themselves, the pictures in order of use. It finds the project
// as the placements sweep does. The floor is far below today's count (28 doors, drawn with 11 pictures), so adding doors
// never breaks it, while a scan that quietly saw nothing would.
func TestDoorSpritesAcrossTheRealMaps(t *testing.T) {
	// Arrange- every door page, counted plainly: a route on this event whose codes are the opening's.
	dataDir := gametest.DataDir(t)
	root := filepath.Dir(dataDir)
	entries, err := os.ReadDir(dataDir)
	if err != nil {
		t.Fatal(err)
	}
	rawMaps := map[int][]*rawEvent{}
	doors := 0
	for _, entry := range entries {
		mapId, isMap := mapIdOfFile(entry.Name())
		if isMap == false {
			continue
		}
		for _, event := range rawEventsOf(t, dataDir, mapId, rawMaps) {
			if event == nil {
				continue
			}
			for _, page := range event.Pages {
				if rawPageOpensAsADoor(page.List) {
					doors++
				}
			}
		}
	}
	index, _ := newCountingIndex(t, watch.NewHub("data"))

	// Act.
	found, err := index.DoorSprites(root)

	// Assert- every door counted once, under a picture, the most used first.
	if err != nil {
		t.Fatal(err)
	}
	counted := 0
	for position, sprite := range found {
		counted += sprite.Doors
		if position > 0 && sprite.Doors > found[position-1].Doors {
			t.Errorf("%+v comes after %+v", sprite, found[position-1])
		}
	}
	if doors < 10 || counted != doors {
		t.Errorf("counted %d doors in %+v, the files hold %d", counted, found, doors)
	}
}

// rawPageOpensAsADoor reads a page's commands plainly for a door's opening played on its own event.
func rawPageOpensAsADoor(list []struct {
	Code       int   `json:"code"`
	Parameters []any `json:"parameters"`
}) bool {
	for _, line := range list {
		if line.Code != setMovementRoute || len(line.Parameters) != 2 || line.Parameters[0] != float64(thisEvent) {
			continue
		}
		route, isRoute := line.Parameters[1].(map[string]any)
		steps, hasSteps := route["list"].([]any)
		if isRoute == false || hasSteps == false || len(steps) != len(doorOpening) {
			continue
		}
		matches := true
		for position, step := range steps {
			fields, isStep := step.(map[string]any)
			if isStep == false || fields["code"] != float64(doorOpening[position]) {
				matches = false
			}
		}
		if matches {
			return true
		}
	}

	return false
}

// assertLandsFromItsMap checks one arrival against the events of the map it is on, read without the models.
func assertLandsFromItsMap(t *testing.T, events []*rawEvent, targetMapId int, arrival Arrival) {
	t.Helper()

	where := mapFileName(arrival.MapId) + " event " + strconv.Itoa(arrival.EventId)
	if arrival.EventId >= len(events) || events[arrival.EventId] == nil {
		t.Fatalf("%s: no such event", where)
	}
	event := events[arrival.EventId]
	if event.Id != arrival.EventId || event.Name != arrival.EventName || arrival.PageIndex >= len(event.Pages) {
		t.Errorf("%s: answered %+v, the file holds id %d %q with %d pages", where, arrival, event.Id, event.Name, len(event.Pages))
		return
	}

	// the page holds a transfer naming this map and tile outright; plain JSON reads its numbers as floats.
	for _, line := range event.Pages[arrival.PageIndex].List {
		if line.Code == transferPlayer && len(line.Parameters) == 6 &&
			line.Parameters[0] == float64(directDesignation) && line.Parameters[1] == float64(targetMapId) &&
			line.Parameters[2] == float64(arrival.X) && line.Parameters[3] == float64(arrival.Y) {
			return
		}
	}
	t.Errorf("%s: page %d holds no transfer to map %d at %d,%d", where, arrival.PageIndex+1, targetMapId, arrival.X, arrival.Y)
}

// rawEvent is a map event as a plain reading of the file sees it.
type rawEvent struct {
	Id    int    `json:"id"`
	Name  string `json:"name"`
	Note  string `json:"note"`
	X     int    `json:"x"`
	Y     int    `json:"y"`
	Pages []struct {
		List []struct {
			Code       int   `json:"code"`
			Parameters []any `json:"parameters"`
		} `json:"list"`
	} `json:"pages"`
}

// rawEventsOf reads a map's events without the models, once per map.
func rawEventsOf(t *testing.T, dataDir string, mapId int, rawMaps map[int][]*rawEvent) []*rawEvent {
	t.Helper()

	if events, read := rawMaps[mapId]; read {
		return events
	}

	content, err := os.ReadFile(filepath.Join(dataDir, mapFileName(mapId)))
	if err != nil {
		t.Fatal(err)
	}
	var raw struct {
		Events []*rawEvent `json:"events"`
	}
	if err := json.Unmarshal(content, &raw); err != nil {
		t.Fatal(err)
	}

	rawMaps[mapId] = raw.Events
	return raw.Events
}

// assertStandsOnItsMap checks one placement against its map's events, read without the models.
func assertStandsOnItsMap(t *testing.T, events []*rawEvent, enemyId int, placement Placement) {
	t.Helper()

	where := mapFileName(placement.MapId) + " event " + strconv.Itoa(placement.EventId)
	if placement.EventId >= len(events) || events[placement.EventId] == nil {
		t.Fatalf("%s: no such event", where)
	}
	event := events[placement.EventId]
	if event.Id != placement.EventId || event.Name != placement.EventName || event.X != placement.X || event.Y != placement.Y || len(event.Pages) != placement.PageCount {
		t.Errorf("%s: answered %+v, the file holds id %d %q at %d,%d with %d pages", where, placement, event.Id, event.Name, event.X, event.Y, len(event.Pages))
		return
	}

	// each page listed carries the tag, however it is spaced or spelled.
	tag := "<enemyid:" + strconv.Itoa(enemyId) + ">"
	for _, pageIndex := range placement.PageIndexes {
		carried := false
		for _, line := range event.Pages[pageIndex].List {
			text, isText := firstText(line.Parameters)
			if (line.Code == commentFirstLine || line.Code == commentNextLine) && isText {
				carried = carried || strings.Contains(strings.ToLower(strings.ReplaceAll(text, " ", "")), tag)
			}
		}
		if carried == false {
			t.Errorf("%s: page %d carries no %s", where, pageIndex+1, tag)
		}
	}
}

// firstText returns a command's first parameter when it is text.
func firstText(parameters []any) (string, bool) {
	if len(parameters) == 0 {
		return "", false
	}
	text, isText := parameters[0].(string)
	return text, isText
}
