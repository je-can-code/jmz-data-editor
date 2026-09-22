package db

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// chefAdventureData is the sibling game project; skipped when it is not checked out.
const chefAdventureData = "../../../../../ca/chef-adventure/data"

// TestStateRoundTripKeepsEveryField guards a field that was being erased for real.
//
// `messageType` decides who a state's message1-4 lines are announced for, and every one of the
// 1600 states in the game carries it. RpgState did not declare it, so the decode dropped it and
// the save wrote the file back without it - silently, on every save through the States board.
//
// The check is deliberately not "messageType survives". It is "nothing is lost", because the next
// field MZ adds will not be this one.
func TestStateRoundTripKeepsEveryField(t *testing.T) {
	// Arrange- the real file, since the point is what the game actually carries rather than what
	// a fixture author remembered to include.
	raw := readGameFile(t, "States.json")

	var before []map[string]json.RawMessage
	if err := json.Unmarshal(raw, &before); err != nil {
		t.Fatal(err)
	}

	// Act- the exact decode/encode pair a save performs.
	var states []*RpgState
	if err := json.Unmarshal(raw, &states); err != nil {
		t.Fatal(err)
	}

	saved, err := json.Marshal(states)
	if err != nil {
		t.Fatal(err)
	}

	var after []map[string]json.RawMessage
	if err := json.Unmarshal(saved, &after); err != nil {
		t.Fatal(err)
	}

	// Assert- same number of rows, and no row quietly lighter than it arrived.
	if len(after) != len(before) {
		t.Fatalf("row count changed: %d in, %d out", len(before), len(after))
	}

	lost := map[string]int{}
	for index, original := range before {
		for key := range original {
			if _, present := after[index][key]; present == false {
				lost[key]++
			}
		}
	}

	for key, count := range lost {
		t.Errorf("field %q was erased from %d states by a save", key, count)
	}
}

// TestCommonEventRoundTripKeepsFoldedBranches covers the same erasure one level down.
//
// `collapsed` sits on individual event commands rather than on the event, and only on the ones
// somebody has folded shut in the MZ editor - two of them in this project. A field that rare is
// the easy one to model badly, and losing it is how a save quietly reorganises somebody's editor.
func TestCommonEventRoundTripKeepsFoldedBranches(t *testing.T) {
	// Arrange.
	raw := readGameFile(t, "CommonEvents.json")

	// Act.
	var events []*RpgCommonEvent
	if err := json.Unmarshal(raw, &events); err != nil {
		t.Fatal(err)
	}

	saved, err := json.Marshal(events)
	if err != nil {
		t.Fatal(err)
	}

	// Assert- the folded branches are still folded, and nothing else grew one. Counting both
	// directions matters: a `collapsed` written onto every command would also "preserve" the two.
	if got, want := countCollapsed(t, saved), countCollapsed(t, raw); got != want {
		t.Errorf("folded branches changed across a save: %d before, %d after", want, got)
	}
}

// countCollapsed reports how many event commands in a CommonEvents payload are folded shut.
func countCollapsed(t *testing.T, payload []byte) int {
	t.Helper()

	var events []*RpgCommonEvent
	if err := json.Unmarshal(payload, &events); err != nil {
		t.Fatal(err)
	}

	total := 0
	for _, event := range events {
		if event == nil {
			continue
		}

		for _, command := range event.List {
			if command.Collapsed != nil && *command.Collapsed {
				total++
			}
		}
	}

	return total
}

// readGameFile returns one file from the sibling game project, skipping when it is absent.
func readGameFile(t *testing.T, name string) []byte {
	t.Helper()

	path := filepath.Join(chefAdventureData, name)
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Skipf("%s not present beside jmz-data-editor (optional)", name)
	}

	return raw
}
