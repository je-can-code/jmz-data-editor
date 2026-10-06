package plugins

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"jmz-data-editor/server/internal/gametest"
)

// TestChefAdventurePluginConfigsJSON unmarshals Chef Adventure exports beside this repo (optional dev check).
func TestChefAdventurePluginConfigsJSON(t *testing.T) {
	// the sibling `ca` repo, or the project JMZ_PROJECT_ROOT names; see gametest.
	caData := gametest.DataDir(t)

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
		{"weather", "config.weather.json", new(WeatherConfiguration)},
		{"lighting", "config.lighting.json", new(LightingConfiguration)},
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
