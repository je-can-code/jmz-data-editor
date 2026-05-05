package plugins

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// TestChefAdventurePluginConfigsJSON unmarshals Chef Adventure exports beside this repo (optional dev check).
func TestChefAdventurePluginConfigsJSON(t *testing.T) {
	// plugins -> … -> jmz repo root -> sibling `ca` repo (see workspace layout under gaming/).
	caData := filepath.Join("..", "..", "..", "..", "..", "ca", "chef-adventure", "data")
	if _, err := os.Stat(caData); err != nil {
		t.Skip("ca/chef-adventure/data not present beside jmz-data-editor (optional)")
	}

	cases := []struct {
		name string
		file string
		into any
	}{
		{"crafting", "config.crafting.json", new(CraftingConfiguration)},
		{"proficiency", "config.proficiency.json", new(ProficiencyConfiguration)},
		{"quest", "config.quest.json", new(QuestConfiguration)},
		{"sdp", "config.sdp.json", new(SdpConfiguration)},
		{"jabs", "config.jabs.json", new(JabsConfiguration)},
	}

	for _, c := range cases {
		c := c
		t.Run(c.name, func(t *testing.T) {
			path := filepath.Join(caData, c.file)
			bytes, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			if err := json.Unmarshal(bytes, c.into); err != nil {
				t.Fatal(err)
			}
		})
	}
}
