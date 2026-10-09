package main

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"jmz-data-editor/server/internal/mzjson"
	"jmz-data-editor/server/internal/watch"
)

// The record of where blueprints are placed describes the maps on disk, so the map editor writes a
// map's part of it only with that map's file, and only that part. The merge route owes it this: the
// maps a merge names change exactly as named, whole or one placement at a time, and every other map,
// saved by another window a moment before or not, stays exactly as the file holds it. Two windows
// merging two maps at once both land. A record read back and merged unchanged is left byte for byte,
// never written again, and a merge with nothing to record starts no record. A body that is not a merge
// is refused before anything touches the disk, a file that is not a
// record is never written over, nor is one a newer editor wrote, and an older record is raised to the
// merge's version with nothing else of it moved. The write reaches the change stream as the saving
// window's.

// usesPath is where the record lives in a project.
const usesPath = "jmz-editor/blueprint-uses.json"

// usesRoute is the merge route.
const usesRoute = "/api/editor-data/blueprint-uses/maps"

// recordOnDisk is a record as the editor leaves it: the camp (aa22) cut off at the left edge of map 3,
// and the camp twice and the roost (k3x9q2mf) once on map 16.
const recordOnDisk = `{"schemaVersion":2,"data":{"maps":{` +
	`"3":{"aa22":[{"x":-1,"y":0,"placed":{"x":1,"y":0,"width":2,"height":3}}]},` +
	`"16":{"aa22":[{"x":1,"y":3},{"x":12,"y":3}],"k3x9q2mf":[{"x":4,"y":7}]}` +
	`}}}`

// indented lays a compact document out the way the editor's own files are written.
func indented(t *testing.T, compact string) string {
	t.Helper()

	value, err := mzjson.Parse([]byte(compact))
	if err != nil {
		t.Fatalf("the test's own document is not JSON: %v\n%s", err, compact)
	}
	laid, err := mzjson.IndentedLayout(value)
	if err != nil {
		t.Fatal(err)
	}

	return string(laid)
}

// writeRecord writes the record's file into a project exactly as given, its folder made first.
func writeRecord(t *testing.T, current *project, content string) {
	t.Helper()

	if err := os.MkdirAll(filepath.Join(current.root, "jmz-editor"), 0755); err != nil {
		t.Fatal(err)
	}
	writeProjectFile(t, current, usesPath, content)
}

// projectWithRecord is a project holding the record given, laid out as the editor writes it.
func projectWithRecord(t *testing.T, compact string) *project {
	t.Helper()

	current := newProject(t)
	writeRecord(t, current, indented(t, compact))
	return current
}

// TestMergeBlueprintUsesChangesOnlyTheMapsItNames covers a map's save: map 16 takes the placements
// given in place of its own, map 7, new to the record, goes in among the others by id, and map 3 stays
// exactly as the file held it.
func TestMergeBlueprintUsesChangesOnlyTheMapsItNames(t *testing.T) {
	// Arrange.
	current := projectWithRecord(t, recordOnDisk)
	body := `{"schemaVersion":2,"maps":{"16":{"k3x9q2mf":[{"x":5,"y":7}]},"7":{"bb11":[{"x":0,"y":0}]}}}`

	// Act.
	response := current.call(t, http.MethodPut, usesRoute, body)

	// Assert.
	assertStatus(t, response, http.StatusNoContent)
	expected := indented(t, `{"schemaVersion":2,"data":{"maps":{`+
		`"3":{"aa22":[{"x":-1,"y":0,"placed":{"x":1,"y":0,"width":2,"height":3}}]},`+
		`"7":{"bb11":[{"x":0,"y":0}]},`+
		`"16":{"k3x9q2mf":[{"x":5,"y":7}]}`+
		`}}}`)
	if written := current.read(t, usesPath); written != expected {
		t.Errorf("the merge wrote:\n%s\nexpected:\n%s", written, expected)
	}
}

// TestMergeBlueprintUsesTakesAnEmptiedMapOut covers a map saved with no placements left, given as null
// or as an entry holding nothing: either way its entry goes, and the other map's stays.
func TestMergeBlueprintUsesTakesAnEmptiedMapOut(t *testing.T) {
	cases := []struct {
		name  string
		entry string
	}{
		{name: "null", entry: `null`},
		{name: "an entry holding nothing", entry: `{}`},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			// Arrange.
			current := projectWithRecord(t, recordOnDisk)

			// Act.
			response := current.call(t, http.MethodPut, usesRoute, `{"schemaVersion":2,"maps":{"16":`+testCase.entry+`}}`)

			// Assert.
			assertStatus(t, response, http.StatusNoContent)
			expected := indented(t, `{"schemaVersion":2,"data":{"maps":{"3":{"aa22":[{"x":-1,"y":0,"placed":{"x":1,"y":0,"width":2,"height":3}}]}}}}`)
			if written := current.read(t, usesPath); written != expected {
				t.Errorf("the merge wrote:\n%s\nexpected:\n%s", written, expected)
			}
		})
	}
}

// TestMergeBlueprintUsesWritesBackWhatGetAnswered is the round trip a map's save rests on: every map's
// placements, as GET handed them out, merged back unchanged, leave the record byte for byte.
func TestMergeBlueprintUsesWritesBackWhatGetAnswered(t *testing.T) {
	// Arrange- the maps exactly as GET answered them, in a merge naming every one.
	current := projectWithRecord(t, recordOnDisk)
	original := current.read(t, usesPath)
	answered := readEnvelope(t, current.call(t, http.MethodGet, "/api/editor-data/blueprint-uses", "")).Data
	stored, err := mzjson.Parse(answered)
	if err != nil {
		t.Fatal(err)
	}
	maps := stored.Member("data").Member("maps")
	body := `{"schemaVersion":2,"maps":` + string(mzjson.Compact(maps)) + `}`

	// Act.
	response := current.call(t, http.MethodPut, usesRoute, body)

	// Assert.
	assertStatus(t, response, http.StatusNoContent)
	if written := current.read(t, usesPath); written != original {
		t.Errorf("an unchanged merge rewrote the record:\n%s\nwas:\n%s", written, original)
	}
}

// TestMergeBlueprintUsesStartsTheRecord covers a project's first placement saved: no record yet, so
// one is made at the merge's version, holding the map given.
func TestMergeBlueprintUsesStartsTheRecord(t *testing.T) {
	// Arrange.
	current := newProject(t)

	// Act.
	response := current.call(t, http.MethodPut, usesRoute, `{"schemaVersion":2,"maps":{"16":{"aa22":[{"x":1,"y":3}]}}}`)

	// Assert.
	assertStatus(t, response, http.StatusNoContent)
	expected := indented(t, `{"schemaVersion":2,"data":{"maps":{"16":{"aa22":[{"x":1,"y":3}]}}}}`)
	if written := current.read(t, usesPath); written != expected {
		t.Errorf("the merge wrote:\n%s\nexpected:\n%s", written, expected)
	}
}

// TestMergeBlueprintUsesStartsNoRecordForNothing covers a project that places no blueprints: a map saved
// with no placements, and a placement taken out of a map no record names, start no record, and no folder
// for one.
func TestMergeBlueprintUsesStartsNoRecordForNothing(t *testing.T) {
	cases := []struct {
		name string
		body string
	}{
		{name: "a map saved with none", body: `{"schemaVersion":2,"maps":{"16":null}}`},
		{name: "a placement taken out of nothing", body: `{"schemaVersion":2,"remove":[{"map":16,"blueprint":"aa22","x":1,"y":3}]}`},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			// Arrange.
			current := newProject(t)

			// Act.
			response := current.call(t, http.MethodPut, usesRoute, testCase.body)

			// Assert.
			assertStatus(t, response, http.StatusNoContent)
			if current.exists("jmz-editor") {
				t.Error("a merge with nothing to record made the record's folder")
			}
		})
	}
}

// TestMergeBlueprintUsesLeavesAnUnchangedRecordUntouched covers a map saved with the placements the file
// already holds for it: the editor sends them with every save, and a merge that changes nothing never
// writes the file again.
func TestMergeBlueprintUsesLeavesAnUnchangedRecordUntouched(t *testing.T) {
	// Arrange- the record as the editor wrote it, its time set well back.
	current := projectWithRecord(t, recordOnDisk)
	path := filepath.Join(current.root, filepath.FromSlash(usesPath))
	then := time.Date(2020, 1, 2, 3, 4, 5, 0, time.UTC)
	if err := os.Chtimes(path, then, then); err != nil {
		t.Fatal(err)
	}
	before := current.read(t, usesPath)

	// Act- map 16 given whole exactly as the file holds it, and map 7, which it does not hold, given none.
	body := `{"schemaVersion":2,"maps":{"16":{"aa22":[{"x":1,"y":3},{"x":12,"y":3}],"k3x9q2mf":[{"x":4,"y":7}]},"7":null}}`
	response := current.call(t, http.MethodPut, usesRoute, body)

	// Assert.
	assertStatus(t, response, http.StatusNoContent)
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if current.read(t, usesPath) != before || info.ModTime().Equal(then) == false {
		t.Errorf("a merge changing nothing wrote the record again, at %v", info.ModTime())
	}
}

// TestMergeBlueprintUsesTakesOutAndPutsInSinglePlacements covers forgetting a placement and taking that
// back: one placement goes, its neighbours at other corners staying; a blueprint's last placement takes
// the blueprint with it, and a map's last takes the map; one put in replaces its blueprint's at the same
// corner, a new blueprint going in among the others by id and a new map among the maps.
func TestMergeBlueprintUsesTakesOutAndPutsInSinglePlacements(t *testing.T) {
	// Arrange.
	current := projectWithRecord(t, recordOnDisk)
	body := `{"schemaVersion":2,` +
		`"remove":[` +
		`{"map":16,"blueprint":"aa22","x":12,"y":3},` +
		`{"map":16,"blueprint":"k3x9q2mf","x":4,"y":7},` +
		`{"map":3,"blueprint":"aa22","x":-1,"y":0},` +
		`{"map":40,"blueprint":"aa22","x":0,"y":0}` +
		`],` +
		`"add":[` +
		`{"map":16,"blueprint":"aa22","x":1,"y":3,"placed":{"x":0,"y":0,"width":1,"height":1}},` +
		`{"map":16,"blueprint":"aa22","x":5,"y":1},` +
		`{"map":16,"blueprint":"bb11","x":2,"y":2},` +
		`{"map":20,"blueprint":"aa22","x":7,"y":8}` +
		`]}`

	// Act.
	response := current.call(t, http.MethodPut, usesRoute, body)

	// Assert.
	assertStatus(t, response, http.StatusNoContent)
	expected := indented(t, `{"schemaVersion":2,"data":{"maps":{`+
		`"16":{"aa22":[{"x":5,"y":1},{"x":1,"y":3,"placed":{"x":0,"y":0,"width":1,"height":1}}],"bb11":[{"x":2,"y":2}]},`+
		`"20":{"aa22":[{"x":7,"y":8}]}`+
		`}}}`)
	if written := current.read(t, usesPath); written != expected {
		t.Errorf("the merge wrote:\n%s\nexpected:\n%s", written, expected)
	}
}

// TestMergeBlueprintUsesLandsWindowsSavingAtOnce is the promise the route exists for: many windows, each
// saving its own map at the same moment, all land, and the maps none of them named stay.
func TestMergeBlueprintUsesLandsWindowsSavingAtOnce(t *testing.T) {
	// Arrange.
	current := projectWithRecord(t, recordOnDisk)
	const windows = 24
	statuses := make([]int, windows)
	var group sync.WaitGroup

	// Act- every window's merge at once, each naming its own map.
	for index := 0; index < windows; index++ {
		group.Add(1)
		go func(index int) {
			defer group.Done()
			body := fmt.Sprintf(`{"schemaVersion":2,"maps":{"%d":{"aa22":[{"x":%d,"y":0}]}}}`, 100+index, index)
			statuses[index] = current.call(t, http.MethodPut, usesRoute, body, "X-Jmz-Client", fmt.Sprintf("window-%d", index)).Code
		}(index)
	}
	group.Wait()

	// Assert- every merge answered 204, and the record holds every window's map beside the two it had.
	entries := []string{
		`"3":{"aa22":[{"x":-1,"y":0,"placed":{"x":1,"y":0,"width":2,"height":3}}]}`,
		`"16":{"aa22":[{"x":1,"y":3},{"x":12,"y":3}],"k3x9q2mf":[{"x":4,"y":7}]}`,
	}
	for index := 0; index < windows; index++ {
		if statuses[index] != http.StatusNoContent {
			t.Errorf("window %d's merge answered %d", index, statuses[index])
		}
		entries = append(entries, fmt.Sprintf(`"%d":{"aa22":[{"x":%d,"y":0}]}`, 100+index, index))
	}
	expected := indented(t, `{"schemaVersion":2,"data":{"maps":{`+strings.Join(entries, ",")+`}}}`)
	if written := current.read(t, usesPath); written != expected {
		t.Errorf("the merges left:\n%s\nexpected:\n%s", written, expected)
	}
}

// TestMergeBlueprintUsesRaisesAnOlderRecord covers a record the editor wrote before placements cut off
// at the map's edge said what went down: it is raised to the merge's version, and its maps the merge
// does not name stay as they were.
func TestMergeBlueprintUsesRaisesAnOlderRecord(t *testing.T) {
	// Arrange- a record of version 1, as the editor wrote it then.
	current := projectWithRecord(t, `{"schemaVersion":1,"data":{"maps":{"1":{"k3x9q2mf":[{"x":22,"y":17}]}}}}`)

	// Act.
	response := current.call(t, http.MethodPut, usesRoute, `{"schemaVersion":2,"maps":{"16":{"aa22":[{"x":-2,"y":0,"placed":{"x":2,"y":0,"width":3,"height":3}}]}}}`)

	// Assert.
	assertStatus(t, response, http.StatusNoContent)
	expected := indented(t, `{"schemaVersion":2,"data":{"maps":{`+
		`"1":{"k3x9q2mf":[{"x":22,"y":17}]},`+
		`"16":{"aa22":[{"x":-2,"y":0,"placed":{"x":2,"y":0,"width":3,"height":3}}]}`+
		`}}}`)
	if written := current.read(t, usesPath); written != expected {
		t.Errorf("the merge wrote:\n%s\nexpected:\n%s", written, expected)
	}
}

// TestMergeBlueprintUsesRefusesARecordFromANewerEditor covers a record of a shape this editor does not
// know: nothing in it can be told safe to keep, so it is refused with a 409 and left byte for byte.
func TestMergeBlueprintUsesRefusesARecordFromANewerEditor(t *testing.T) {
	// Arrange.
	current := projectWithRecord(t, `{"schemaVersion":3,"data":{"maps":{"16":{"aa22":[{"x":1,"y":3,"shade":4}]}}}}`)
	before := current.read(t, usesPath)

	// Act.
	response := current.call(t, http.MethodPut, usesRoute, `{"schemaVersion":2,"maps":{"7":{"aa22":[{"x":0,"y":0}]}}}`)

	// Assert.
	assertStatus(t, response, http.StatusConflict)
	if message := readEnvelope(t, response).Error; message != "jmz-editor/blueprint-uses.json was written by a newer editor (version 3)" {
		t.Errorf("said %q", message)
	}
	if current.read(t, usesPath) != before {
		t.Error("a refused merge still changed the record")
	}
}

// TestMergeBlueprintUsesNeverWritesOverWhatItCannotRead covers a file that is not a record of
// placements, or whose map a single placement goes into holds something else: whatever it holds could
// not be carried over, so the merge is refused with a 500 saying why, and the file stays byte for byte.
func TestMergeBlueprintUsesNeverWritesOverWhatItCannotRead(t *testing.T) {
	cases := []struct {
		name     string
		file     string
		body     string
		fragment string
	}{
		{name: "not JSON", file: `{"schemaVersion":2,`, body: `{"schemaVersion":2,"maps":{"7":null}}`, fragment: "is not JSON"},
		{name: "an empty file", file: ``, body: `{"schemaVersion":2,"maps":{"7":{"aa22":[{"x":0,"y":0}]}}}`, fragment: "is not JSON"},
		{name: "a list", file: `[]`, body: `{"schemaVersion":2,"maps":{"7":null}}`, fragment: "is not a record of placements"},
		{name: "no version", file: `{"data":{"maps":{}}}`, body: `{"schemaVersion":2,"maps":{"7":null}}`, fragment: "is not a record of placements"},
		{name: "maps as a list", file: `{"schemaVersion":2,"data":{"maps":[]}}`, body: `{"schemaVersion":2,"maps":{"7":null}}`, fragment: "is not a record of placements"},
		{name: "a key no map has", file: `{"schemaVersion":2,"data":{"maps":{"cave":{}}}}`, body: `{"schemaVersion":2,"maps":{"7":null}}`, fragment: `holds "cave", which is no map's id`},
		{name: "a map named twice", file: `{"schemaVersion":2,"data":{"maps":{"7":{},"7":{}}}}`, body: `{"schemaVersion":2,"maps":{"8":null}}`, fragment: `names "7" twice`},
		{name: "a placement put into something else", file: `{"schemaVersion":2,"data":{"maps":{"16":{"aa22":{"x":1,"y":3}}}}}`, body: `{"schemaVersion":2,"add":[{"map":16,"blueprint":"aa22","x":0,"y":0}]}`, fragment: "must be a list of placements"},
		{name: "a placement taken out of something else", file: `{"schemaVersion":2,"data":{"maps":{"16":{"aa22":[{"x":1.5,"y":3}]}}}}`, body: `{"schemaVersion":2,"remove":[{"map":16,"blueprint":"aa22","x":0,"y":0}]}`, fragment: "must name its corner in whole numbers"},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			// Arrange- the file exactly as given, laid out by nobody.
			current := newProject(t)
			writeRecord(t, current, testCase.file)

			// Act.
			response := current.call(t, http.MethodPut, usesRoute, testCase.body)

			// Assert.
			assertStatus(t, response, http.StatusInternalServerError)
			if message := readEnvelope(t, response).Error; strings.Contains(message, testCase.fragment) == false {
				t.Errorf("said %q, expected it to mention %q", message, testCase.fragment)
			}
			if current.read(t, usesPath) != testCase.file {
				t.Error("a refused merge still changed the file")
			}
		})
	}
}

// TestMergeBlueprintUsesRefusesWhatIsNotAMerge keeps anything that is not a merge of placements off the
// disk: each is refused with a 400 naming what is wrong, and the record stays byte for byte.
func TestMergeBlueprintUsesRefusesWhatIsNotAMerge(t *testing.T) {
	cases := []struct {
		name     string
		body     string
		fragment string
	}{
		{name: "not JSON", body: `{"schemaVersion":2,`, fragment: "the body is not JSON"},
		{name: "no version", body: `{"maps":{"7":null}}`, fragment: `the body has no "schemaVersion"`},
		{name: "a version of nothing", body: `{"schemaVersion":0,"maps":{"7":null}}`, fragment: "schemaVersion must be a whole number from 1 up"},
		{name: "a fractional version", body: `{"schemaVersion":1.5,"maps":{"7":null}}`, fragment: "schemaVersion must be a whole number from 1 up"},
		{name: "a key it has no use for", body: `{"schemaVersion":2,"maps":{"7":null},"also":1}`, fragment: `the body holds "also"`},
		{name: "nothing to change", body: `{"schemaVersion":2,"maps":{},"remove":[]}`, fragment: "the body changes no placements"},
		{name: "maps as a list", body: `{"schemaVersion":2,"maps":[]}`, fragment: "maps must be an object of map ids"},
		{name: "map 0", body: `{"schemaVersion":2,"maps":{"0":null}}`, fragment: `maps holds "0", which is no map's id`},
		{name: "a map named twice", body: `{"schemaVersion":2,"maps":{"7":null,"7":{}}}`, fragment: `maps names "7" twice`},
		{name: "an entry that is a list", body: `{"schemaVersion":2,"maps":{"7":[]}}`, fragment: "map 7 must be an object of blueprint ids"},
		{name: "a blueprint id no blueprint has", body: `{"schemaVersion":2,"maps":{"7":{"No-Id":[]}}}`, fragment: `holds "No-Id", which is no blueprint's id`},
		{name: "a corner short of a row", body: `{"schemaVersion":2,"maps":{"7":{"aa22":[{"x":1}]}}}`, fragment: `map 7.aa22[0] has no "y"`},
		{name: "a corner with a fraction", body: `{"schemaVersion":2,"maps":{"7":{"aa22":[{"x":1.5,"y":0}]}}}`, fragment: "must name its corner in whole numbers"},
		{name: "a placement holding more", body: `{"schemaVersion":2,"maps":{"7":{"aa22":[{"x":1,"y":0,"z":2}]}}}`, fragment: `holds "z"`},
		{name: "a part placed of nothing", body: `{"schemaVersion":2,"maps":{"7":{"aa22":[{"x":1,"y":0,"placed":{"x":0,"y":0,"width":0,"height":2}}]}}}`, fragment: "must be a rectangle inside the blueprint"},
		{name: "a part placed before the blueprint", body: `{"schemaVersion":2,"maps":{"7":{"aa22":[{"x":1,"y":0,"placed":{"x":-1,"y":0,"width":1,"height":2}}]}}}`, fragment: "must be a rectangle inside the blueprint"},
		{name: "two placements at one corner", body: `{"schemaVersion":2,"maps":{"7":{"aa22":[{"x":1,"y":0},{"x":1,"y":0}]}}}`, fragment: "holds two placements at 1, 0"},
		{name: "a placement taken out of no map", body: `{"schemaVersion":2,"remove":[{"blueprint":"aa22","x":1,"y":0}]}`, fragment: `remove[0] has no "map"`},
		{name: "a placement taken out with its part", body: `{"schemaVersion":2,"remove":[{"map":7,"blueprint":"aa22","x":1,"y":0,"placed":{"x":0,"y":0,"width":1,"height":1}}]}`, fragment: `remove[0] holds "placed"`},
		{name: "a placement put in for no blueprint", body: `{"schemaVersion":2,"add":[{"map":7,"blueprint":"","x":1,"y":0}]}`, fragment: "add[0].blueprint must be a blueprint's id"},
		{name: "a placement put in on map 0", body: `{"schemaVersion":2,"add":[{"map":0,"blueprint":"aa22","x":1,"y":0}]}`, fragment: "add[0].map must be a map's id"},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			// Arrange.
			current := projectWithRecord(t, recordOnDisk)
			before := current.read(t, usesPath)

			// Act.
			response := current.call(t, http.MethodPut, usesRoute, testCase.body)

			// Assert- a 400 naming what is wrong, and the record as it was.
			assertStatus(t, response, http.StatusBadRequest)
			assertBodyContains(t, response, testCase.fragment)
			if current.read(t, usesPath) != before {
				t.Error("a refused merge still changed the record")
			}
		})
	}
}

// TestMergeBlueprintUsesIsCreditedToItsWindow covers the change stream: a map's placements saved by a
// window come back carrying that window's id, so no window of the session takes the write for a change
// made outside the editor.
func TestMergeBlueprintUsesIsCreditedToItsWindow(t *testing.T) {
	// Arrange.
	current, server := serve(t)
	writeRecord(t, current, indented(t, recordOnDisk))
	stream := openStream(t, server.URL)

	// Act.
	put(t, server.URL+usesRoute, `{"schemaVersion":2,"maps":{"16":null}}`, "window-a")

	// Assert.
	assertEvent(t, stream.next(t), watch.Change{Path: usesPath, Kind: watch.KindWrite, Client: "window-a"})
}
