package db

// RpgTileset is one row of data/Tilesets.json. Index 0 is null, so decode the file into
// []*RpgTileset. Fields are declared in the order MZ writes them.
type RpgTileset struct {
	Id int `json:"id"`

	// Flags holds one entry per tile id, 8192 of them: the passage bits (which of the four directions
	// block, and whether the tile draws above characters), plus ladder, bush, counter, damage floor,
	// boat and ship passage, airship landing, and the terrain tag in the top four bits.
	Flags []int `json:"flags"`

	// Mode is 0 for a World tileset and 1 for an Area tileset; the engine reads it only to decide
	// whether a map counts as an overworld.
	Mode int    `json:"mode"`
	Name string `json:"name"`
	Note string `json:"note"`

	// TilesetNames is the nine sheet images, A1 to A5 then B to E, named within img/tilesets. A
	// sheet the tileset does not use is an empty string.
	TilesetNames []string `json:"tilesetNames"`
}
