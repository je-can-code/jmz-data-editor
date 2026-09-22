package store

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"jmz-data-editor/server/internal/models/db"
	"jmz-data-editor/server/internal/models/plugins"
)

// chefAdventureData is the sibling game project; these tests read its real files and skip when it
// is not checked out, the same way the model unmarshal tests do.
const chefAdventureData = "../../../../ca/chef-adventure/data"

// TestLoadRefusesUnknownFields is the guard that makes the strictness worth having.
//
// `load` refuses a file carrying a field its model does not declare, which is only useful if
// somebody notices before the author does. So every file the server can actually open is loaded
// here through the real loader: a field added to the data by a newer MZ, or by a plugin growing a
// config block, fails here rather than silently vanishing out of somebody's save.
//
// A failure is not a bug in this test. It is the name of a field that needs declaring on the model
// the message points at.
func TestLoadRefusesUnknownFields(t *testing.T) {
	if _, err := os.Stat(chefAdventureData); err != nil {
		t.Skip("ca/chef-adventure/data not present beside jmz-data-editor (optional)")
	}

	t.Run("plugin configurations", func(t *testing.T) {
		loadOne(t, "config.crafting.json", func(p string) error { _, e := Load[plugins.CraftingConfiguration](p); return e })
		loadOne(t, "config.difficulty.json", func(p string) error { _, e := Load[plugins.DifficultyConfiguration](p); return e })
		loadOne(t, "config.jabs.json", func(p string) error { _, e := Load[plugins.JabsConfiguration](p); return e })
		loadOne(t, "config.level.json", func(p string) error { _, e := Load[plugins.LevelConfiguration](p); return e })
		loadOne(t, "config.motion.json", func(p string) error { _, e := Load[plugins.MotionConfiguration](p); return e })
		loadOne(t, "config.proficiency.json", func(p string) error { _, e := Load[plugins.ProficiencyConfiguration](p); return e })
		loadOne(t, "config.quest.json", func(p string) error { _, e := Load[plugins.QuestConfiguration](p); return e })
		loadOne(t, "config.sdp.json", func(p string) error { _, e := Load[plugins.SdpConfiguration](p); return e })
		loadOne(t, "config.weather.json", func(p string) error { _, e := Load[plugins.WeatherConfiguration](p); return e })
	})

	t.Run("database files", func(t *testing.T) {
		loadOne(t, "Actors.json", func(p string) error { _, e := LoadSlice[*db.RpgActor](p); return e })
		loadOne(t, "Animations.json", func(p string) error { _, e := LoadSlice[*db.RpgAnimation](p); return e })
		loadOne(t, "Armors.json", func(p string) error { _, e := LoadSlice[*db.RpgArmor](p); return e })
		loadOne(t, "Classes.json", func(p string) error { _, e := LoadSlice[*db.RpgClass](p); return e })
		loadOne(t, "CommonEvents.json", func(p string) error { _, e := LoadSlice[*db.RpgCommonEvent](p); return e })
		loadOne(t, "Enemies.json", func(p string) error { _, e := LoadSlice[*db.RpgEnemy](p); return e })
		loadOne(t, "Items.json", func(p string) error { _, e := LoadSlice[*db.RpgItem](p); return e })
		loadOne(t, "Skills.json", func(p string) error { _, e := LoadSlice[*db.RpgSkill](p); return e })
		loadOne(t, "States.json", func(p string) error { _, e := LoadSlice[*db.RpgState](p); return e })
		loadOne(t, "Weapons.json", func(p string) error { _, e := LoadSlice[*db.RpgWeapon](p); return e })
		loadOne(t, "System.json", func(p string) error { _, e := Load[*db.RpgSystem](p); return e })
	})

	// every map, because there are 383 of them and they differ: `meta` appears on thirty and on
	// none of the rest, which is exactly the kind of thing one sample file would miss.
	t.Run("every map", func(t *testing.T) {
		entries, err := os.ReadDir(chefAdventureData)
		if err != nil {
			t.Fatalf("reading %s: %v", chefAdventureData, err)
		}

		checked := 0
		for _, entry := range entries {
			name := entry.Name()
			if strings.HasPrefix(name, "Map") == false || strings.HasSuffix(name, ".json") == false {
				continue
			}
			if name == "MapInfos.json" {
				continue
			}

			loadOne(t, name, func(p string) error { _, e := Load[db.RpgMap](p); return e })
			checked++
		}

		if checked < 300 {
			t.Errorf("expected to sweep the whole map folder, only saw %d", checked)
		}
	})
}

// loadOne runs one file through the real loader and reports the field that stopped it.
func loadOne(t *testing.T, name string, load func(path string) error) {
	t.Helper()

	path := filepath.Join(chefAdventureData, name)
	if _, err := os.Stat(path); err != nil {
		return
	}

	if err := load(path); err != nil {
		t.Errorf("%s did not load: %v", name, err)
	}
}
