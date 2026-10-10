package main

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"testing"

	"jmz-data-editor/server/internal/gametest"
	"jmz-data-editor/server/internal/mzjson"
)

// Every map the game ships must take a transfer pair's end and give it back with nothing lost, since the editor places
// pairs on Jeremy's real maps and writes them through this route. So each real map, copied into a throwaway project (the
// game's own folder is only ever read), takes an event placed past the end of its events, two maps to an act as a pair
// joins them, the way the editor places one: with empty slots before it when the list is empty, as the editor never gives
// an event id 0. Placed, each file is the file it was with the new event on a line of its own after its last event and
// nothing else changed; taken back, it is byte for byte the file it was. The few files a tool rather than MZ wrote come
// back as their own content in MZ's layout, as any save of them does, and are logged.

// realPairEnd is one end of a pair as the editor places it on a real map, in MZ's own key order: an invisible way out,
// touched by the player, sending them to another map.
func realPairEnd(id int, target int) string {
	return `{"id":` + strconv.Itoa(id) + `,"name":"Transfer (Elsewhere)","note":"","pages":[{"conditions":{"actorId":1,"actorValid":false,` +
		`"itemId":1,"itemValid":false,"selfSwitchCh":"A","selfSwitchValid":false,"switch1Id":1,"switch1Valid":false,"switch2Id":1,` +
		`"switch2Valid":false,"variableId":1,"variableValid":false,"variableValue":0},"directionFix":false,` +
		`"image":{"characterIndex":0,"characterName":"","direction":2,"pattern":0,"tileId":0},` +
		`"list":[{"code":250,"indent":0,"parameters":[{"name":"Move1","volume":90,"pitch":100,"pan":0}]},` +
		`{"code":201,"indent":0,"parameters":[0,` + strconv.Itoa(target) + `,1,1,2,0]},{"code":0,"indent":0,"parameters":[]}],"moveFrequency":3,` +
		`"moveRoute":{"list":[{"code":0,"parameters":[]}],"repeat":true,"skippable":false,"wait":false},` +
		`"moveSpeed":3,"moveType":0,"priorityType":0,"stepAnime":false,"through":false,"trigger":1,"walkAnime":true}],"x":0,"y":0}`
}

// realMapEnd is what placing an end on one real map takes and leaves: the map's patches each way, and its file once placed.
type realMapEnd struct {
	place    string
	takeBack string
	placed   string
}

// endOnRealMap works out an end placed on a real map past the end of its events, as the editor places one, sending the
// player to target: the splice each way, and the file the map should be once the end is in, worked out from the file's
// own content in MZ's layout.
func endOnRealMap(t *testing.T, mapId int, laid string, target int) realMapEnd {
	t.Helper()

	root, err := mzjson.Parse([]byte(laid))
	if err != nil {
		t.Fatal(err)
	}
	events := len(root.Member("events").Items)

	// the editor's first free id is the list's length, and never 0; the slots between stay empty.
	id := max(events, 1)
	items := []string{}
	for slot := events; slot < id; slot++ {
		items = append(items, "null")
	}
	items = append(items, realPairEnd(id, target))
	inserted := strings.Join(items, ",")

	// placed, the new items sit on lines of their own after the last event, as MZ lays events out.
	const end = "\n]\n}"
	before := ",\n"
	if events == 0 {
		before = "\n"
	}

	return realMapEnd{
		place:    fmt.Sprintf(`{"map":%d,"patches":[{"kind":"splice","path":["events"],"index":%d,"removed":[],"inserted":[%s]}]}`, mapId, events, inserted),
		takeBack: fmt.Sprintf(`{"map":%d,"patches":[{"kind":"splice","path":["events"],"index":%d,"removed":[%s],"inserted":[]}]}`, mapId, events, inserted),
		placed:   strings.TrimSuffix(laid, end) + before + strings.Join(items, ",\n") + end,
	}
}

func TestMapChangesPlaceAndTakeBackAPairOnEveryRealMap(t *testing.T) {
	// Arrange: every map file the game holds, read before the project below points the server at its own folder, and that
	// file's content in MZ's layout, which is the file itself for every map MZ wrote.
	dataDir := gametest.DataDir(t)
	entries, err := os.ReadDir(dataDir)
	if err != nil {
		t.Fatal(err)
	}
	originals := map[int]string{}
	laidOut := map[int]string{}
	ids := []int{}
	for _, entry := range entries {
		name := entry.Name()
		mapId, convertErr := strconv.Atoi(strings.TrimSuffix(strings.TrimPrefix(name, "Map"), ".json"))
		if strings.HasPrefix(name, "Map") == false || strings.HasSuffix(name, ".json") == false || convertErr != nil {
			continue
		}
		content, readErr := os.ReadFile(filepath.Join(dataDir, name))
		if readErr != nil {
			t.Fatal(readErr)
		}
		value, parseErr := mzjson.Parse(content)
		if parseErr != nil {
			t.Fatalf("%s: %v", name, parseErr)
		}
		laid, layErr := mzjson.MapLayout(value)
		if layErr != nil {
			t.Fatalf("%s: %v", name, layErr)
		}
		originals[mapId] = string(content)
		laidOut[mapId] = string(laid)
		ids = append(ids, mapId)
	}
	sort.Ints(ids)

	// a sweep that quietly saw nothing proves nothing.
	if len(ids) < 300 {
		t.Fatalf("expected to sweep the whole map folder, only saw %d maps", len(ids))
	}
	current := newProject(t)
	for _, mapId := range ids {
		writeProjectFile(t, current, fmt.Sprintf("data/Map%03d.json", mapId), originals[mapId])
	}

	// Act and Assert, once per pair of maps, each map paired with the next, the last with the first when they are odd.
	relaid := []int{}
	for index := 0; index < len(ids); index += 2 {
		pair := []int{ids[index], ids[(index+1)%len(ids)]}
		ends := []realMapEnd{endOnRealMap(t, pair[0], laidOut[pair[0]], pair[1]), endOnRealMap(t, pair[1], laidOut[pair[1]], pair[0])}

		placed := current.call(t, http.MethodPut, mapChangesRoute, `{"maps":[`+ends[0].place+`,`+ends[1].place+`]}`, "Content-Type", "application/json")
		assertStatus(t, placed, http.StatusNoContent)
		for side, mapId := range pair {
			if written := current.read(t, fmt.Sprintf("data/Map%03d.json", mapId)); written != ends[side].placed {
				offset := firstDifference(written, ends[side].placed)
				t.Errorf("Map%03d placed differs at byte %d: %q", mapId, offset, written[max(0, offset-60):min(len(written), offset+60)])
			}
		}

		takenBack := current.call(t, http.MethodPut, mapChangesRoute, `{"maps":[`+ends[0].takeBack+`,`+ends[1].takeBack+`]}`, "Content-Type", "application/json")
		assertStatus(t, takenBack, http.StatusNoContent)
		for _, mapId := range pair {
			written := current.read(t, fmt.Sprintf("data/Map%03d.json", mapId))
			if written == originals[mapId] {
				continue
			}

			// a file a tool wrote comes back as its own content in MZ's layout, and only that.
			if written == laidOut[mapId] {
				relaid = append(relaid, mapId)
				continue
			}

			offset := firstDifference(written, originals[mapId])
			t.Errorf("Map%03d came back changed at byte %d: %q", mapId, offset, written[max(0, offset-60):min(len(written), offset+60)])
		}
	}

	if len(relaid) > 0 {
		t.Logf("%d of %d maps are not in MZ's layout and came back in it: %v", len(relaid), len(ids), relaid)
	}
}

// firstDifference finds the first byte at which two texts differ.
func firstDifference(left string, right string) int {
	for index := 0; index < len(left) && index < len(right); index++ {
		if left[index] != right[index] {
			return index
		}
	}

	return min(len(left), len(right))
}
