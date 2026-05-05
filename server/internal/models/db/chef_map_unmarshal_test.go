package db

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// TestChefAdventureMap001JSON checks Map001.json against RpgMap (optional dev check).
func TestChefAdventureMap001JSON(t *testing.T) {
	caMap := filepath.Join("..", "..", "..", "..", "..", "ca", "chef-adventure", "data", "Map001.json")
	if _, err := os.Stat(caMap); err != nil {
		t.Skip("ca/chef-adventure/data/Map001.json not present beside jmz-data-editor (optional)")
	}
	bytes, err := os.ReadFile(caMap)
	if err != nil {
		t.Fatal(err)
	}
	var m RpgMap
	if err := json.Unmarshal(bytes, &m); err != nil {
		t.Fatal(err)
	}
	if m.Width <= 0 || m.Height <= 0 {
		t.Fatalf("expected positive size, got %dx%d", m.Width, m.Height)
	}
	if len(m.Data) != m.Width*m.Height*6 {
		t.Fatalf("tile data length %d want width*height*6=%d", len(m.Data), m.Width*m.Height*6)
	}
	if len(m.Events) < 2 || m.Events[0] != nil {
		t.Fatalf("expected null event at index 0, got %#v", m.Events[0])
	}
}

// TestChefAdventureMap236Encounters checks a map with encounterList populated.
func TestChefAdventureMap236Encounters(t *testing.T) {
	caMap := filepath.Join("..", "..", "..", "..", "..", "ca", "chef-adventure", "data", "Map236.json")
	if _, err := os.Stat(caMap); err != nil {
		t.Skip("Map236.json not present (optional)")
	}
	bytes, err := os.ReadFile(caMap)
	if err != nil {
		t.Fatal(err)
	}
	var m RpgMap
	if err := json.Unmarshal(bytes, &m); err != nil {
		t.Fatal(err)
	}
	if len(m.EncounterList) < 1 {
		t.Fatal("expected at least one encounter on Map236")
	}
	if m.EncounterList[0].TroopId < 1 {
		t.Fatalf("unexpected troopId %d", m.EncounterList[0].TroopId)
	}
}
