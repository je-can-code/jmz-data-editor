package placements

import (
	"encoding/json"
	"os"
	"path/filepath"
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

// rawEvent is a map event as a plain reading of the file sees it.
type rawEvent struct {
	Id    int    `json:"id"`
	Name  string `json:"name"`
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
