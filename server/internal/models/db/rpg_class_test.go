package db

import (
	"bytes"
	"encoding/json"
	"testing"
)

// TestClassKeepsTheDescriptionThisEditorWrites guards the one field RPG Maker never writes on a class.
//
// Both halves of a save decode strictly - the loader and the save request alike refuse a field the
// model does not declare - so an undeclared description would not quietly vanish. It would fail the
// save outright, and then fail every load once it had reached the file. The row here carries one, and
// has to come back out of a strict decode and an encode with it intact.
func TestClassKeepsTheDescriptionThisEditorWrites(t *testing.T) {
	// Arrange- a class row the way this editor saves one, description and all.
	raw := []byte(`[{"id":2,"name":"Brawler","note":"","description":"Hits first.\nAsks later.",` +
		`"expParams":[30,20,30,30],"learnings":[],"params":[],"traits":[]}]`)

	// Act- the strict decode both halves of a save perform, then the encode that writes it back.
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()

	var classes []*RpgClass
	if err := decoder.Decode(&classes); err != nil {
		t.Fatal(err)
	}

	saved, err := json.Marshal(classes)
	if err != nil {
		t.Fatal(err)
	}

	// Assert- the description made it through both.
	var after []map[string]any
	if err := json.Unmarshal(saved, &after); err != nil {
		t.Fatal(err)
	}

	if got, want := after[0]["description"], "Hits first.\nAsks later."; got != want {
		t.Errorf("description after a save: got %q, want %q", got, want)
	}
}

// TestClassKeepsTheIconThisEditorWrites guards the other field RPG Maker never writes on a class, for
// the same reason as its description: an undeclared icon would fail the save, then every load after.
func TestClassKeepsTheIconThisEditorWrites(t *testing.T) {
	// Arrange- a class row the way this editor saves one, icon and all.
	raw := []byte(`[{"id":2,"name":"Brawler","note":"","description":"","iconIndex":96,` +
		`"expParams":[30,20,30,30],"learnings":[],"params":[],"traits":[]}]`)

	// Act- the strict decode both halves of a save perform, then the encode that writes it back.
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()

	var classes []*RpgClass
	if err := decoder.Decode(&classes); err != nil {
		t.Fatal(err)
	}

	saved, err := json.Marshal(classes)
	if err != nil {
		t.Fatal(err)
	}

	// Assert- the icon made it through both. JSON numbers decode into a map as float64.
	var after []map[string]any
	if err := json.Unmarshal(saved, &after); err != nil {
		t.Fatal(err)
	}

	if got, want := after[0]["iconIndex"], float64(96); got != want {
		t.Errorf("iconIndex after a save: got %v, want %v", got, want)
	}
}
