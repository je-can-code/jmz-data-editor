package plugins

// MonsterType is one page of the Monsterpedia: the kind of entry it lists, which an enemy names on its own row, the
// name and icon the page shows in the strip above the list, and whether the entries it lists show their stats. Read at
// runtime by J-OMNI-Monsters (rmmz-plugins/src/plugins/omni/ext/monster/_metadata/_pluginMetadata.js).
type MonsterType struct {
	Key        string `json:"key"`
	Name       string `json:"name"`
	IconIndex  int    `json:"iconIndex"`
	ShowsStats bool   `json:"showsStats"`
}

// OmniConfiguration is the root shape of data/config.omni.json, the Omnipedia's configuration. Today it holds the
// Monsterpedia's pages, in the order the game flips between them; the first is the page the Monsterpedia opens on.
type OmniConfiguration struct {
	MonsterTypes []MonsterType `json:"monsterTypes"`
}
