package db

// RpgMapInfo is one row of data/MapInfos.json: a map's place in the editor's map tree.
//
// The file is indexed by map id, so index 0 and the slot of every deleted map are null; decode it
// into []*RpgMapInfo so those slots survive as nil. Fields are declared in the order MZ writes them.
type RpgMapInfo struct {
	Id       int    `json:"id"`
	Expanded bool   `json:"expanded"`
	Name     string `json:"name"`
	Order    int    `json:"order"`
	ParentId int    `json:"parentId"`

	// ScrollX and ScrollY are the MZ editor's remembered scroll position for the map. They are often
	// fractional, so they are floats; an int field would refuse the file.
	ScrollX float64 `json:"scrollX"`
	ScrollY float64 `json:"scrollY"`

	// Quick is an editor flag MZ writes onto only some rows, as false far more often than true. A
	// pointer so that all three states - absent, false, true - survive a round-trip as themselves
	// rather than collapsing into two.
	Quick *bool `json:"quick,omitempty"`
}
