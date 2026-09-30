package commandlist

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
)

// Names are the names a project gives its database rows, switches and variables, each list indexed by id
// with an empty name for an id that has no row, so the command list can read "Switch #0012 Door Open"
// where the command holds only 12. Reading only names keeps the answer small: an event window asks for
// it as it opens, and the tables it comes from run to megabytes.
type Names struct {
	Switches     []string `json:"switches"`
	Variables    []string `json:"variables"`
	Actors       []string `json:"actors"`
	Classes      []string `json:"classes"`
	Skills       []string `json:"skills"`
	Items        []string `json:"items"`
	Weapons      []string `json:"weapons"`
	Armors       []string `json:"armors"`
	Enemies      []string `json:"enemies"`
	Troops       []string `json:"troops"`
	States       []string `json:"states"`
	Animations   []string `json:"animations"`
	Tilesets     []string `json:"tilesets"`
	CommonEvents []string `json:"commonEvents"`
	Maps         []string `json:"maps"`
	EquipTypes   []string `json:"equipTypes"`
}

// namedRow is a database row as names read it.
type namedRow struct {
	Name string `json:"name"`
}

// systemNames is System.json as names read it.
type systemNames struct {
	Switches   []string `json:"switches"`
	Variables  []string `json:"variables"`
	EquipTypes []string `json:"equipTypes"`
}

// ReadNames reads the names of every table the command list names rows from, in the project at root. A
// table the project has no file for reads as no names; a file that is not valid JSON fails the answer,
// naming the file.
func ReadNames(root string) (*Names, error) {
	dataDir := filepath.Join(root, "data")
	system := systemNames{}
	if err := readJson(dataDir, "System.json", &system); err != nil {
		return nil, err
	}

	names := &Names{
		Switches:   orEmpty(system.Switches),
		Variables:  orEmpty(system.Variables),
		EquipTypes: orEmpty(system.EquipTypes),
	}

	tables := []struct {
		file   string
		target *[]string
	}{
		{"Actors.json", &names.Actors},
		{"Classes.json", &names.Classes},
		{"Skills.json", &names.Skills},
		{"Items.json", &names.Items},
		{"Weapons.json", &names.Weapons},
		{"Armors.json", &names.Armors},
		{"Enemies.json", &names.Enemies},
		{"Troops.json", &names.Troops},
		{"States.json", &names.States},
		{"Animations.json", &names.Animations},
		{"Tilesets.json", &names.Tilesets},
		{"CommonEvents.json", &names.CommonEvents},
		{"MapInfos.json", &names.Maps},
	}
	for _, table := range tables {
		read, err := readTableNames(dataDir, table.file)
		if err != nil {
			return nil, err
		}
		*table.target = read
	}

	return names, nil
}

// readTableNames reads one table's names, by position, which is each row's id in every RMMZ table.
func readTableNames(dataDir string, file string) ([]string, error) {
	rows := []*namedRow{}
	if err := readJson(dataDir, file, &rows); err != nil {
		return nil, err
	}

	names := make([]string, len(rows))
	for id, row := range rows {
		if row != nil {
			names[id] = row.Name
		}
	}

	return names, nil
}

// readJson decodes one data file into target, leaving target as it is when the file does not exist.
func readJson(dataDir string, file string, target any) error {
	content, err := os.ReadFile(filepath.Join(dataDir, file))
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}

	if err := json.Unmarshal(content, target); err != nil {
		return fmt.Errorf("data/%s: %w", file, err)
	}

	return nil
}

// orEmpty answers an empty list for a missing one, so the answer holds lists and never null.
func orEmpty(names []string) []string {
	if names == nil {
		return []string{}
	}

	return names
}
