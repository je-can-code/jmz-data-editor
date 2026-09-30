package placements

import (
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"jmz-data-editor/server/internal/models/db"
	"jmz-data-editor/server/internal/watch"
)

// The index owes the Enemies board every map event standing as the enemy on screen, and nothing else:
// each carrying its map's name and the pages naming the enemy, read from the files as they are now. It
// reads each map once, because reading all of them per answer would be slow, and so it must forget a
// map the moment the change stream says it changed, and only that map; a list that trailed behind the
// files would send an author to a battler that is no longer there. Each test runs against a throwaway
// project written into a temporary folder.

// eventuallyWait bounds how long a test waits for a change on disk to reach an answer. The stream
// announces a change once its file has been quiet for a tenth of a second.
const eventuallyWait = 5 * time.Second

// meadowSlime and the rest are the placements of enemy 5 in the fixture project, in the order the index
// owes them: by map id, then by event.
var (
	meadowSlime  = Placement{MapId: 1, MapName: "Meadow", EventId: 1, EventName: "Slime", X: 3, Y: 4, PageIndexes: []int{0}, PageCount: 1}
	meadowAmbush = Placement{MapId: 1, MapName: "Meadow", EventId: 4, EventName: "Ambush", X: 8, Y: 9, PageIndexes: []int{1}, PageCount: 2}
	caveSlime    = Placement{MapId: 2, MapName: "Cave", EventId: 2, EventName: "Slime", X: 2, Y: 2, PageIndexes: []int{0}, PageCount: 1}
	strayOutcast = Placement{MapId: 3, MapName: "", EventId: 1, EventName: "Outcast", X: 0, Y: 0, PageIndexes: []int{0}, PageCount: 1}
)

// TestPlacementsListsEveryEventStandingAsTheEnemy covers the near misses around each real placement:
// a bat naming another enemy, a lamp whose comment is another tag and whose dialogue quotes the tag, a
// deleted event, and a copy of a map under a name the game never loads.
func TestPlacementsListsEveryEventStandingAsTheEnemy(t *testing.T) {
	// Arrange.
	root := newFixtureProject(t)
	index, _ := newCountingIndex(t, watch.NewHub("data"))

	// Act.
	found, err := index.Placements(root, 5)

	// Assert- the ambusher only on its second page, and the map the tree has no row for unnamed.
	assertPlacements(t, found, err, []Placement{meadowSlime, meadowAmbush, caveSlime, strayOutcast})
}

// TestPlacementsListsOnlyTheEnemyAskedAbout is the other side of the bat: asked about its own enemy, it
// is the only placement.
func TestPlacementsListsOnlyTheEnemyAskedAbout(t *testing.T) {
	// Arrange.
	root := newFixtureProject(t)
	index, _ := newCountingIndex(t, watch.NewHub("data"))

	// Act.
	found, err := index.Placements(root, 7)

	// Assert.
	assertPlacements(t, found, err, []Placement{
		{MapId: 1, MapName: "Meadow", EventId: 2, EventName: "Bat", X: 5, Y: 6, PageIndexes: []int{0}, PageCount: 1},
	})
}

// TestPlacementsAnswersAnEmptyListForAnEnemyPlacedNowhere covers an enemy no event names, whose list
// must still be a list for the board to show as empty.
func TestPlacementsAnswersAnEmptyListForAnEnemyPlacedNowhere(t *testing.T) {
	// Arrange.
	root := newFixtureProject(t)
	index, _ := newCountingIndex(t, watch.NewHub("data"))

	// Act.
	found, err := index.Placements(root, 9)

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	encoded, _ := json.Marshal(found)
	if string(encoded) != "[]" {
		t.Errorf("answered %s, expected []", encoded)
	}
}

// TestPlacementsReadsEachMapOnce covers the cache: a second answer, even about another enemy, reads no
// map again.
func TestPlacementsReadsEachMapOnce(t *testing.T) {
	// Arrange.
	root := newFixtureProject(t)
	index, reads := newCountingIndex(t, watch.NewHub("data"))

	// Act.
	_, firstErr := index.Placements(root, 5)
	_, secondErr := index.Placements(root, 7)

	// Assert.
	if firstErr != nil || secondErr != nil {
		t.Fatal(firstErr, secondErr)
	}
	assertReads(t, reads, map[string]int{"Map001.json": 1, "Map002.json": 1, "Map003.json": 1})
}

// TestPlacementsRereadsOnlyAMapThatChanged covers a map edited outside the editor, in MZ or by a
// script: its placements follow the file, and the maps that did not change are not read again.
func TestPlacementsRereadsOnlyAMapThatChanged(t *testing.T) {
	// Arrange- the cave's slime is a placement until the file changes.
	root := newFixtureProject(t)
	index, reads := newCountingIndex(t, watch.NewHub("data"))
	if _, err := index.Placements(root, 5); err != nil {
		t.Fatal(err)
	}

	// Act- the slime now names enemy 7.
	writeMap(t, root, 2, mapOf(nil, eventOf(2, "Slime", 2, 2, pageOf(commentOf(t, "<enemyId:7>")))))

	// Assert.
	found := eventuallyPlacements(t, index, root, 5, func(found []Placement) bool { return len(found) == 3 })
	assertPlacements(t, found, nil, []Placement{meadowSlime, meadowAmbush, strayOutcast})
	assertReads(t, reads, map[string]int{"Map001.json": 1, "Map002.json": 2, "Map003.json": 1})
}

// TestPlacementsFindsAMapCreatedAfterTheFirstAnswer covers a brand-new map, which the list of maps the
// index made at first does not hold.
func TestPlacementsFindsAMapCreatedAfterTheFirstAnswer(t *testing.T) {
	// Arrange.
	root := newFixtureProject(t)
	index, _ := newCountingIndex(t, watch.NewHub("data"))
	if _, err := index.Placements(root, 5); err != nil {
		t.Fatal(err)
	}

	// Act.
	writeMap(t, root, 12, mapOf(eventOf(1, "Newcomer", 6, 1, pageOf(commentOf(t, "<enemyId:5>")))))

	// Assert.
	found := eventuallyPlacements(t, index, root, 5, func(found []Placement) bool { return len(found) == 5 })
	newcomer := Placement{MapId: 12, MapName: "", EventId: 1, EventName: "Newcomer", X: 6, Y: 1, PageIndexes: []int{0}, PageCount: 1}
	assertPlacements(t, found, nil, []Placement{meadowSlime, meadowAmbush, caveSlime, strayOutcast, newcomer})
}

// TestPlacementsForgetsAMapRemoved covers a map deleted from the project.
func TestPlacementsForgetsAMapRemoved(t *testing.T) {
	// Arrange.
	root := newFixtureProject(t)
	index, _ := newCountingIndex(t, watch.NewHub("data"))
	if _, err := index.Placements(root, 5); err != nil {
		t.Fatal(err)
	}

	// Act.
	if err := os.Remove(filepath.Join(root, "data", "Map002.json")); err != nil {
		t.Fatal(err)
	}

	// Assert.
	found := eventuallyPlacements(t, index, root, 5, func(found []Placement) bool { return len(found) == 3 })
	assertPlacements(t, found, nil, []Placement{meadowSlime, meadowAmbush, strayOutcast})
}

// TestPlacementsFollowsAMapRenamedInTheTree covers a new name in MapInfos.json, which reaches the
// answer without any map being read again.
func TestPlacementsFollowsAMapRenamedInTheTree(t *testing.T) {
	// Arrange.
	root := newFixtureProject(t)
	index, reads := newCountingIndex(t, watch.NewHub("data"))
	if _, err := index.Placements(root, 5); err != nil {
		t.Fatal(err)
	}

	// Act.
	writeFile(t, root, "data/MapInfos.json", strings.Replace(mapInfosFixture, `"Cave"`, `"Crystal Cave"`, 1))

	// Assert.
	found := eventuallyPlacements(t, index, root, 5, func(found []Placement) bool {
		return len(found) == 4 && found[2].MapName == "Crystal Cave"
	})
	renamed := caveSlime
	renamed.MapName = "Crystal Cave"
	assertPlacements(t, found, nil, []Placement{meadowSlime, meadowAmbush, renamed, strayOutcast})
	assertReads(t, reads, map[string]int{"Map001.json": 1, "Map002.json": 1, "Map003.json": 1})
}

// TestPlacementsStartsAgainWhenTheStreamDropsIt covers a script rewriting more maps at once than the
// stream will hold for a listener that is not reading. The stream drops the index rather than wait for
// it, so the index cannot know which of its maps are stale; it must read every one again, and find the
// new ones.
func TestPlacementsStartsAgainWhenTheStreamDropsIt(t *testing.T) {
	// Arrange.
	root := newFixtureProject(t)
	hub := watch.NewHub("data")
	index, reads := newCountingIndex(t, hub)
	if _, err := index.Placements(root, 5); err != nil {
		t.Fatal(err)
	}

	// Act- 300 new maps, each with one battler, and nobody asking in between.
	for mapId := 100; mapId < 400; mapId++ {
		writeMap(t, root, mapId, mapOf(eventOf(1, "Horde", 0, 0, pageOf(commentOf(t, "<enemyId:5>")))))
	}
	waitFor(t, "the stream to drop the index", func() bool { return hub.Subscribers() == 0 })
	found, err := index.Placements(root, 5)

	// Assert- the maps from before were read again, and every new battler is there.
	if err != nil {
		t.Fatal(err)
	}
	if len(found) != 304 {
		t.Errorf("found %d placements, expected 304", len(found))
	}
	if reads["Map001.json"] != 2 || reads["Map399.json"] != 1 {
		t.Errorf("read Map001.json %d times and Map399.json %d times, expected 2 and 1", reads["Map001.json"], reads["Map399.json"])
	}
}

// TestPlacementsNamesAMapTheModelsCannotRead covers a map carrying a field the model does not declare:
// the answer fails and says which file, rather than listing every battler but that map's.
func TestPlacementsNamesAMapTheModelsCannotRead(t *testing.T) {
	// Arrange.
	root := newFixtureProject(t)
	writeFile(t, root, "data/Map002.json", `{"events":[null],"sparkle":true}`)
	index, _ := newCountingIndex(t, watch.NewHub("data"))

	// Act.
	_, err := index.Placements(root, 5)

	// Assert.
	if err == nil || strings.Contains(err.Error(), "Map002.json") == false || strings.Contains(err.Error(), `unknown field "sparkle"`) == false {
		t.Errorf("answered %v", err)
	}
}

// TestPlacementsNamesTheMapOfACommandThatCannotBeRead covers a damaged comment, which the answer places
// by file, event and page.
func TestPlacementsNamesTheMapOfACommandThatCannotBeRead(t *testing.T) {
	// Arrange.
	root := newFixtureProject(t)
	writeMap(t, root, 2, mapOf(nil, eventOf(2, "Slime", 2, 2, pageOf(json.RawMessage(`{"code":408,"indent":0,"parameters":[]}`)))))
	index, _ := newCountingIndex(t, watch.NewHub("data"))

	// Act.
	_, err := index.Placements(root, 5)

	// Assert.
	if err == nil || strings.HasPrefix(err.Error(), "data/Map002.json: event 2, page 1: ") == false {
		t.Errorf("answered %v", err)
	}
}

// TestPlacementsRereadsAMapThatFailed is the near miss for the failure above: a map that could not be
// read is not remembered as broken, so the same answer asked again tries the file again.
func TestPlacementsRereadsAMapThatFailed(t *testing.T) {
	// Arrange.
	root := newFixtureProject(t)
	writeFile(t, root, "data/Map002.json", "null")
	index, reads := newCountingIndex(t, watch.NewHub("data"))

	// Act.
	_, firstErr := index.Placements(root, 5)
	_, secondErr := index.Placements(root, 5)

	// Assert.
	if errors.Is(firstErr, errNoMap) == false || errors.Is(secondErr, errNoMap) == false {
		t.Errorf("answered %v and %v, expected %v", firstErr, secondErr, errNoMap)
	}
	if reads["Map002.json"] != 2 {
		t.Errorf("read Map002.json %d times, expected 2", reads["Map002.json"])
	}
}

// TestPlacementsNeedsTheMapTree covers a project with no MapInfos.json, where no map can be named.
func TestPlacementsNeedsTheMapTree(t *testing.T) {
	// Arrange.
	root := newFixtureProject(t)
	if err := os.Remove(filepath.Join(root, "data", "MapInfos.json")); err != nil {
		t.Fatal(err)
	}
	index, _ := newCountingIndex(t, watch.NewHub("data"))

	// Act.
	_, err := index.Placements(root, 5)

	// Assert.
	if errors.Is(err, fs.ErrNotExist) == false {
		t.Errorf("answered %v", err)
	}
}

// TestPlacementsNeedsADataFolder covers a project root with no data folder, which nothing can watch.
func TestPlacementsNeedsADataFolder(t *testing.T) {
	// Arrange.
	root := t.TempDir()
	index, _ := newCountingIndex(t, watch.NewHub("data"))

	// Act.
	found, err := index.Placements(root, 5)

	// Assert.
	if err == nil || found != nil {
		t.Errorf("answered %v with %v", found, err)
	}
}

// TestMapIdOfFileAcceptsOnlyTheNamesTheGameLoads covers the file names around a real map's.
func TestMapIdOfFileAcceptsOnlyTheNamesTheGameLoads(t *testing.T) {
	cases := []struct {
		name     string
		expected int
		isMap    bool
	}{
		{name: "Map007.json", expected: 7, isMap: true},
		{name: "Map1000.json", expected: 1000, isMap: true},
		{name: "Map7.json"},
		{name: "Map0007.json"},
		{name: "Map000.json"},
		{name: "MapInfos.json"},
		{name: "Map007.json.bak"},
		{name: "map007.json"},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			// Arrange- nothing to set up; the name is the whole input.

			// Act.
			mapId, isMap := mapIdOfFile(testCase.name)

			// Assert.
			if mapId != testCase.expected || isMap != testCase.isMap {
				t.Errorf("answered %d, %v; expected %d, %v", mapId, isMap, testCase.expected, testCase.isMap)
			}
		})
	}
}

// mapInfosFixture is the fixture project's map tree: the meadow and the cave, and no row for map 3.
const mapInfosFixture = "[\n" +
	"null,\n" +
	`{"id":1,"expanded":false,"name":"Meadow","order":1,"parentId":0,"scrollX":0,"scrollY":0},` + "\n" +
	`{"id":2,"expanded":false,"name":"Cave","order":2,"parentId":0,"scrollX":0,"scrollY":0}` + "\n" +
	"]"

// newFixtureProject writes a small project into a temporary folder and returns its root. Its battlers
// of enemy 5 are the placements declared above; everything else in it is a near miss.
func newFixtureProject(t *testing.T) string {
	t.Helper()

	root := t.TempDir()
	writeFile(t, root, "data/MapInfos.json", mapInfosFixture)

	writeMap(t, root, 1, mapOf(
		eventOf(1, "Slime", 3, 4, pageOf(commentOf(t, "<enemyId:5>"), commentOf(t, "<sight:4>"))),
		eventOf(2, "Bat", 5, 6, pageOf(commentOf(t, "<enemyId:7>"))),
		eventOf(3, "Lamp", 1, 1, pageOf(
			commentOf(t, "<sight:5>"),
			commandOf(t, 101, 0, "", 0, 0, 2, ""),
			commandOf(t, 401, 0, "<enemyId:5>"))),
		eventOf(4, "Ambush", 8, 9, pageOf(commentOf(t, "<sight:5>")), pageOf(commentOf(t, "<enemyId:5>"))),
	))
	writeMap(t, root, 2, mapOf(nil, eventOf(2, "Slime", 2, 2, pageOf(commentOf(t, "<enemyId: 5>")))))
	writeMap(t, root, 3, mapOf(eventOf(1, "Outcast", 0, 0, pageOf(commentOf(t, "<enemyId:5>")))))

	// a copy of the meadow under a name the game never loads.
	content, err := os.ReadFile(filepath.Join(root, "data", "Map001.json"))
	if err != nil {
		t.Fatal(err)
	}
	writeFile(t, root, "data/Map1.json", string(content))

	return root
}

// writeMap writes a map into the project the way the game keeps it, as data/Map###.json.
func writeMap(t *testing.T, root string, mapId int, gameMap *db.RpgMap) {
	t.Helper()

	content, err := json.Marshal(gameMap)
	if err != nil {
		t.Fatal(err)
	}
	writeFile(t, root, "data/"+mapFileName(mapId), string(content))
}

// writeFile writes a project file, creating its folder when needed.
func writeFile(t *testing.T, root string, path string, content string) {
	t.Helper()

	full := filepath.Join(root, filepath.FromSlash(path))
	if err := os.MkdirAll(filepath.Dir(full), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(full, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
}

// newCountingIndex makes an index that counts how often it reads each map file, by file name, and stops
// listening when the test ends, so no test leaves a watcher behind.
func newCountingIndex(t *testing.T, hub *watch.Hub) (*Index, map[string]int) {
	t.Helper()

	index := NewIndex(hub)
	reads := map[string]int{}
	read := index.readMap
	index.readMap = func(path string) (*db.RpgMap, error) {
		reads[filepath.Base(path)]++
		return read(path)
	}

	t.Cleanup(func() {
		index.mu.Lock()
		defer index.mu.Unlock()
		if index.subscription != nil {
			index.stopListening()
		}
	})

	return index, reads
}

// eventuallyPlacements asks the index again until its answer satisfies done, and returns that answer.
func eventuallyPlacements(t *testing.T, index *Index, root string, enemyId int, done func([]Placement) bool) []Placement {
	t.Helper()

	var found []Placement
	waitFor(t, "the change to reach the answer", func() bool {
		answer, err := index.Placements(root, enemyId)
		if err != nil {
			t.Fatal(err)
		}
		found = answer
		return done(answer)
	})

	return found
}

// waitFor polls a condition until it holds, failing the test when it never does.
func waitFor(t *testing.T, what string, condition func() bool) {
	t.Helper()

	deadline := time.Now().Add(eventuallyWait)
	for condition() == false {
		if time.Now().After(deadline) {
			t.Fatalf("gave up waiting for %s", what)
		}
		time.Sleep(20 * time.Millisecond)
	}
}

// assertPlacements compares an answer with the one expected, in order.
func assertPlacements(t *testing.T, actual []Placement, err error, expected []Placement) {
	t.Helper()

	if err != nil {
		t.Fatal(err)
	}
	if reflect.DeepEqual(actual, expected) == false {
		t.Errorf("answered %+v\nexpected %+v", actual, expected)
	}
}

// assertReads compares how often each map file was read with what was expected.
func assertReads(t *testing.T, actual map[string]int, expected map[string]int) {
	t.Helper()

	if reflect.DeepEqual(actual, expected) == false {
		t.Errorf("read %v, expected %v", actual, expected)
	}
}
