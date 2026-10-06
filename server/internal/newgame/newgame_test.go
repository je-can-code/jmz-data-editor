package newgame

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"jmz-data-editor/server/internal/gametest"
)

// A new game's party owes the map editor exactly who Game_Party#setupStartingMembers seats: System.json's
// starting party, in order, keeping each actor whose Actors.json row exists and dropping one whose row is
// empty, past the end, or below it. A project missing either file starts with nobody, and a file that is
// not JSON fails, naming the file.

// writeDataFile writes one file into a project's data folder.
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

// TestReadSeatsTheStartingPartyWhoseRowsExist covers the party itself: actors 3 and 1 seated in that
// order, actor 2's empty row, actor 7 past the end and actor -1 below it left out, beside a field the read
// does not need.
func TestReadSeatsTheStartingPartyWhoseRowsExist(t *testing.T) {
	// Arrange.
	root := t.TempDir()
	writeDataFile(t, root, "System.json", `{"partyMembers":[3,2,7,1,-1],"switches":["","Door Open"]}`)
	writeDataFile(t, root, "Actors.json", `[null,{"id":1,"name":"Jerald"},null,{"id":3,"name":"Rupert"}]`)

	// Act.
	newGame, err := Read(root)

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	if reflect.DeepEqual(newGame.Party, []int{3, 1}) == false {
		t.Errorf("seated %v", newGame.Party)
	}
}

// TestReadStartsWithNobodyWithoutTheFiles covers a project with no System.json, and one with no
// Actors.json: an empty party, never null.
func TestReadStartsWithNobodyWithoutTheFiles(t *testing.T) {
	// Arrange: one project with neither file, one with only System.json.
	bare := t.TempDir()
	systemOnly := t.TempDir()
	writeDataFile(t, systemOnly, "System.json", `{"partyMembers":[1,2]}`)

	for _, root := range []string{bare, systemOnly} {
		// Act.
		newGame, err := Read(root)

		// Assert.
		if err != nil {
			t.Fatal(err)
		}
		if newGame.Party == nil || len(newGame.Party) != 0 {
			t.Errorf("seated %v", newGame.Party)
		}
	}
}

// TestReadFailsOnAFileThatIsNotJsonNamingIt covers a broken System.json and a broken Actors.json.
func TestReadFailsOnAFileThatIsNotJsonNamingIt(t *testing.T) {
	for _, file := range []string{"System.json", "Actors.json"} {
		t.Run(file, func(t *testing.T) {
			// Arrange.
			root := t.TempDir()
			writeDataFile(t, root, "System.json", `{"partyMembers":[1]}`)
			writeDataFile(t, root, "Actors.json", `[null,{"id":1}]`)
			writeDataFile(t, root, file, "{not json")

			// Act.
			_, err := Read(root)

			// Assert.
			if err == nil || strings.HasPrefix(err.Error(), "data/"+file+": ") == false {
				t.Errorf("failed with %v", err)
			}
		})
	}
}

// TestReadFailsOnAFileItCannotRead covers a file that exists but cannot be read: a folder where it should
// be.
func TestReadFailsOnAFileItCannotRead(t *testing.T) {
	// Arrange.
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "data", "System.json"), 0755); err != nil {
		t.Fatal(err)
	}

	// Act.
	_, err := Read(root)

	// Assert.
	if err == nil {
		t.Error("read a folder as System.json")
	}
}

// TestReadAcrossTheRealProject reads the game's own new game: Jerald and Rupert.
//
// It runs against the project JMZ_PROJECT_ROOT names, and fails when that names no project, or against
// the sibling checkout when the variable is unset; see gametest.
func TestReadAcrossTheRealProject(t *testing.T) {
	// Arrange.
	root := filepath.Dir(gametest.DataDir(t))

	// Act.
	newGame, err := Read(root)

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	if reflect.DeepEqual(newGame.Party, []int{1, 2}) == false {
		t.Errorf("seated %v", newGame.Party)
	}
}
