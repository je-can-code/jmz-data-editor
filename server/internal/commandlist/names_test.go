package commandlist

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

// Names owe the command list each table's names by id, with an empty name where a table has no row, so a
// row can say "Switch #0012 Door Open" where the command holds 12. A table the project lacks reads as no
// names rather than failing, and a table that is not JSON fails, naming the file.

// TestReadNamesReadsEachTableById covers the names themselves, including the empty name at index 0 and
// at a deleted row, and the system's switches, variables and equipment types.
func TestReadNamesReadsEachTableById(t *testing.T) {
	// Arrange.
	root := t.TempDir()
	writeDataFile(t, root, "System.json", `{"switches":["","Door Open"],"variables":["","Coins"],"equipTypes":["","Weapon","Shield"],"other":1}`)
	writeDataFile(t, root, "Actors.json", `[null,{"id":1,"name":"Harold","note":""},null,{"id":3,"name":"Therese"}]`)
	writeDataFile(t, root, "MapInfos.json", `[null,{"id":1,"name":"Town"}]`)
	writeDataFile(t, root, "CommonEvents.json", `[null,{"id":1,"name":"Heal Party","list":[]}]`)

	// Act.
	names, err := ReadNames(root)

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	if reflect.DeepEqual(names.Switches, []string{"", "Door Open"}) == false ||
		reflect.DeepEqual(names.Variables, []string{"", "Coins"}) == false ||
		reflect.DeepEqual(names.EquipTypes, []string{"", "Weapon", "Shield"}) == false ||
		reflect.DeepEqual(names.Actors, []string{"", "Harold", "", "Therese"}) == false ||
		reflect.DeepEqual(names.Maps, []string{"", "Town"}) == false ||
		reflect.DeepEqual(names.CommonEvents, []string{"", "Heal Party"}) == false {
		t.Errorf("read %+v", names)
	}
}

// TestReadNamesReadsMissingTablesAsNoNames covers a project with only a map tree: every list is empty,
// never null.
func TestReadNamesReadsMissingTablesAsNoNames(t *testing.T) {
	// Arrange.
	root := t.TempDir()
	writeDataFile(t, root, "MapInfos.json", `[null]`)

	// Act.
	names, err := ReadNames(root)

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	lists := [][]string{names.Switches, names.Variables, names.EquipTypes, names.Skills, names.Troops, names.States, names.Tilesets}
	for _, list := range lists {
		if list == nil || len(list) != 0 {
			t.Errorf("read %+v", names)
		}
	}
}

// TestReadNamesFailsOnATableThatIsNotJsonNamingIt covers a broken table, and a broken System.json.
func TestReadNamesFailsOnATableThatIsNotJsonNamingIt(t *testing.T) {
	for _, file := range []string{"Skills.json", "System.json"} {
		t.Run(file, func(t *testing.T) {
			// Arrange.
			root := t.TempDir()
			writeDataFile(t, root, file, "{not json")

			// Act.
			_, err := ReadNames(root)

			// Assert.
			if err == nil || strings.HasPrefix(err.Error(), "data/"+file+": ") == false {
				t.Errorf("failed with %v", err)
			}
		})
	}
}

// TestReadNamesFailsOnAFileItCannotRead covers a table that exists but cannot be read: a folder where the
// file should be.
func TestReadNamesFailsOnAFileItCannotRead(t *testing.T) {
	// Arrange.
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "data", "Items.json"), 0755); err != nil {
		t.Fatal(err)
	}

	// Act.
	_, err := ReadNames(root)

	// Assert.
	if err == nil {
		t.Error("read a folder as a table")
	}
}
