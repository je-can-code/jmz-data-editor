package commandlist

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

// The counter owes the command search one thing: counts by events that match the project on disk. An
// event counts once per command however many of its pages or lines use it, deleted events count for
// nothing, plugin commands count by plugin and command, and a file changed or removed since the last
// answer is read again or forgotten rather than answered from memory.

// gateMap is a map with an event using Play SE on both its pages and a plugin command on one, a deleted
// slot, and an event using only Wait.
const gateMap = `{"events":[null,` +
	`{"pages":[{"list":[{"code":250,"indent":0,"parameters":[{"name":"Open"}]},{"code":250,"indent":0,"parameters":[{"name":"Open"}]},{"code":0,"indent":0,"parameters":[]}]},` +
	`{"list":[{"code":250,"indent":0,"parameters":[{"name":"Shut"}]},{"code":357,"indent":0,"parameters":["j/omni/J-OMNI-Quests","progress-quest","Progress",{}]},{"code":0,"indent":0,"parameters":[]}]}]},` +
	`null,` +
	`{"pages":[{"list":[{"code":230,"indent":0,"parameters":[5]},{"code":0,"indent":0,"parameters":[]}]}]}` +
	`]}`

// commonEvents is a common events file with one common event running the same plugin command and a
// Play SE, and an empty slot.
const commonEvents = `[null,` +
	`{"list":[{"code":357,"indent":0,"parameters":["j/omni/J-OMNI-Quests","progress-quest","Progress",{}]},{"code":250,"indent":0,"parameters":[{"name":"Bell"}]},{"code":0,"indent":0,"parameters":[]}]},` +
	`null]`

// writeDataFile writes one file into a project's data folder, creating the folder.
func writeDataFile(t *testing.T, root string, name string, content string) {
	t.Helper()

	dataDir := filepath.Join(root, "data")
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dataDir, name), []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
}

// TestCountCountsEachCommandOncePerEvent covers the counting itself: Play SE counts for the gate once
// though it appears three times on two pages, and once for the common event; the deleted slots count for
// nothing; a file the counter does not read (the map tree) adds nothing.
func TestCountCountsEachCommandOncePerEvent(t *testing.T) {
	// Arrange.
	root := t.TempDir()
	writeDataFile(t, root, "Map001.json", gateMap)
	writeDataFile(t, root, "CommonEvents.json", commonEvents)
	writeDataFile(t, root, "MapInfos.json", `[null,{"id":1,"name":"Gate"}]`)

	// Act.
	usage, err := NewCounter().Count(root)

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	expected := &Usage{
		Events: 3,
		Codes:  map[string]int{"0": 3, "230": 1, "250": 2, "357": 2},
		PluginCommands: []PluginCommandUsage{
			{Plugin: "j/omni/J-OMNI-Quests", Command: "progress-quest", Events: 2},
		},
	}
	if reflect.DeepEqual(usage, expected) == false {
		t.Errorf("counted %+v", usage)
	}
}

// TestCountOrdersPluginCommandsByUseThenName covers the order plugin commands come in, so the answer
// never shuffles between asks.
func TestCountOrdersPluginCommandsByUseThenName(t *testing.T) {
	// Arrange: b is used by two events; a and c by one each.
	root := t.TempDir()
	plugin := func(name string) string {
		return `{"pages":[{"list":[{"code":357,"indent":0,"parameters":["p","` + name + `","",{}]}]}]}`
	}
	writeDataFile(t, root, "Map001.json", `{"events":[null,`+plugin("c")+`,`+plugin("b")+`,`+plugin("a")+`,`+plugin("b")+`]}`)

	// Act.
	usage, err := NewCounter().Count(root)

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	names := []string{}
	for _, each := range usage.PluginCommands {
		names = append(names, each.Command)
	}
	if strings.Join(names, ",") != "b,a,c" {
		t.Errorf("ordered %v", names)
	}
}

// TestCountSkipsPluginCommandsItCannotName covers a plugin command whose names are not text, or missing:
// it still counts as a plugin command, under no plugin.
func TestCountSkipsPluginCommandsItCannotName(t *testing.T) {
	// Arrange.
	root := t.TempDir()
	writeDataFile(t, root, "Map001.json", `{"events":[null,{"pages":[{"list":[{"code":357,"indent":0,"parameters":[5,"x"]},{"code":357,"indent":0,"parameters":["p"]}]}]}]}`)

	// Act.
	usage, err := NewCounter().Count(root)

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	if usage.Codes["357"] != 1 || len(usage.PluginCommands) != 0 {
		t.Errorf("counted %+v", usage)
	}
}

// TestCountAnswersAFileHoldingNoMapAsNoEvents covers a map file holding null, which MZ never writes but
// which must not fail every answer.
func TestCountAnswersAFileHoldingNoMapAsNoEvents(t *testing.T) {
	// Arrange.
	root := t.TempDir()
	writeDataFile(t, root, "Map001.json", "null")

	// Act.
	usage, err := NewCounter().Count(root)

	// Assert.
	if err != nil || usage.Events != 0 || len(usage.Codes) != 0 || usage.PluginCommands == nil {
		t.Errorf("counted %+v, %v", usage, err)
	}
}

// TestCountReadsAChangedFileAgainAndForgetsARemovedOne covers the cache: the second answer follows the
// files as they now are.
func TestCountReadsAChangedFileAgainAndForgetsARemovedOne(t *testing.T) {
	// Arrange.
	root := t.TempDir()
	writeDataFile(t, root, "Map001.json", gateMap)
	writeDataFile(t, root, "CommonEvents.json", commonEvents)
	counter := NewCounter()
	if _, err := counter.Count(root); err != nil {
		t.Fatal(err)
	}

	// Act- the map now holds only the Wait event, and the common events are gone.
	writeDataFile(t, root, "Map001.json", `{"events":[null,{"pages":[{"list":[{"code":230,"indent":0,"parameters":[5]}]}]}]}`)
	later := time.Now().Add(time.Minute)
	if err := os.Chtimes(filepath.Join(root, "data", "Map001.json"), later, later); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(filepath.Join(root, "data", "CommonEvents.json")); err != nil {
		t.Fatal(err)
	}
	usage, err := counter.Count(root)

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	if usage.Events != 1 || reflect.DeepEqual(usage.Codes, map[string]int{"230": 1}) == false || len(counter.files) != 1 {
		t.Errorf("counted %+v, keeping %d files", usage, len(counter.files))
	}
}

// TestCountAnswersFromWhatItKeptWhileAFileIsUnchanged covers the cache's saving: an unchanged file is not
// read again. The kept counts are swapped for a marker the file could never produce, which only an
// answer from memory would show.
func TestCountAnswersFromWhatItKeptWhileAFileIsUnchanged(t *testing.T) {
	// Arrange.
	root := t.TempDir()
	writeDataFile(t, root, "Map001.json", gateMap)
	counter := NewCounter()
	if _, err := counter.Count(root); err != nil {
		t.Fatal(err)
	}
	kept := counter.files["Map001.json"]
	kept.events = []eventUsage{{codes: map[int]bool{999: true}, plugins: map[pluginKey]bool{}}}
	counter.files["Map001.json"] = kept

	// Act.
	usage, err := counter.Count(root)

	// Assert.
	if err != nil || reflect.DeepEqual(usage.Codes, map[string]int{"999": 1}) == false {
		t.Errorf("counted %+v, %v", usage, err)
	}
}

// TestCountForgetsWhatItKeptForAnotherProject covers asking about a second project with the same counter.
func TestCountForgetsWhatItKeptForAnotherProject(t *testing.T) {
	// Arrange.
	first := t.TempDir()
	second := t.TempDir()
	writeDataFile(t, first, "Map001.json", gateMap)
	writeDataFile(t, second, "Map002.json", `{"events":[]}`)
	counter := NewCounter()
	if _, err := counter.Count(first); err != nil {
		t.Fatal(err)
	}

	// Act.
	usage, err := counter.Count(second)

	// Assert.
	if err != nil || usage.Events != 0 || len(counter.files) != 1 {
		t.Errorf("counted %+v, keeping %v, %v", usage, counter.files, err)
	}
}

// TestCountFailsOnAFileThatIsNotJsonNamingIt covers a broken map, which fails the whole answer rather
// than leaving its events out.
func TestCountFailsOnAFileThatIsNotJsonNamingIt(t *testing.T) {
	for name, content := range map[string]string{"Map003.json": "{not json", "CommonEvents.json": "{}"} {
		t.Run(name, func(t *testing.T) {
			// Arrange.
			root := t.TempDir()
			writeDataFile(t, root, "Map001.json", gateMap)
			writeDataFile(t, root, name, content)

			// Act.
			_, err := NewCounter().Count(root)

			// Assert.
			if err == nil || strings.HasPrefix(err.Error(), "data/"+name+": ") == false {
				t.Errorf("failed with %v", err)
			}
		})
	}
}

// TestCountFailsWithoutADataFolder covers a project root that holds no project.
func TestCountFailsWithoutADataFolder(t *testing.T) {
	// Arrange.
	root := t.TempDir()

	// Act.
	_, err := NewCounter().Count(root)

	// Assert.
	if err == nil {
		t.Error("counted a project with no data folder")
	}
}
