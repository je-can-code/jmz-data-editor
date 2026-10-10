// Package newgame reads what a new game starts with, as far as the map editor's page rule needs it. The
// editor shows each event's page as a fresh save would at the clock's time, and a page may wait for an
// actor in the party, so it needs the party a new game seats.
package newgame

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
)

// NewGame is what a new game starts with: the actors in its party, by id, in the order they are seated.
// A new game holds no items and turns no switch on, so there is nothing else to say.
type NewGame struct {
	Party []int `json:"party"`
}

// startingSystem is System.json as a new game's party reads it.
type startingSystem struct {
	PartyMembers []int `json:"partyMembers"`
}

// actorRow is one row of Actors.json as a new game's party reads it: whether there is a row at all.
type actorRow struct{}

// Read reads the party a new game starts with in the project at root, as Game_Party#setupStartingMembers
// seats it: System.json's starting party, keeping each actor Actors.json has a row for, in order. A
// project with no System.json starts with nobody, and one with no Actors.json has nobody to seat; a file
// that is not valid JSON fails the answer, naming the file.
func Read(root string) (*NewGame, error) {
	dataDir := filepath.Join(root, "data")
	system := startingSystem{}
	if err := readJson(dataDir, "System.json", &system); err != nil {
		return nil, err
	}

	actors := []*actorRow{}
	if err := readJson(dataDir, "Actors.json", &actors); err != nil {
		return nil, err
	}

	// an actor is seated only when its row exists, as $gameActors.actor answers nobody for a missing row.
	party := []int{}
	for _, actorId := range system.PartyMembers {
		if actorId >= 0 && actorId < len(actors) && actors[actorId] != nil {
			party = append(party, actorId)
		}
	}

	return &NewGame{Party: party}, nil
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
