package plugins

import "encoding/json"

// JabsConfiguration is the root shape of data/config.jabs.json — everything the JABS plugin family
// reads, one top-level block per plugin.
//
// Every block that exists on disk must appear here, including blocks this server never interprets.
// Go's encoding/json silently discards fields a struct does not declare, and because a save decodes
// the request body into this type and then re-marshals it, an unmodeled block is not merely ignored:
// it is erased from the file. Blocks with no meaning to the server are held as json.RawMessage, which
// round-trips them untouched without anyone having to hand-maintain a mirror of their shape.
type JabsConfiguration struct {
	Teams     []JabsTeam      `json:"teams"`
	Juice     json.RawMessage `json:"juice,omitempty"`
	Metrics   json.RawMessage `json:"metrics,omitempty"`
	Loot      json.RawMessage `json:"loot,omitempty"`
	Bosses    []BossEncounter `json:"bosses"`
	FoodTypes []JabsFoodType  `json:"foodTypes,omitempty"`
}

// JabsFoodType is one food group a consumable can belong to, such as "protein" or "sweet".
//
// Eating binds the battler to that group's state chain, and only one group can be active at a time. The keys here are
// the same ones the chain states are tagged with, so this list is the vocabulary an author picks from rather than a
// second definition of what the groups are.
type JabsFoodType struct {
	Key       string `json:"key"`
	Name      string `json:"name"`
	IconIndex int    `json:"iconIndex"`
}

// JabsTeam is one combat team definition (id, key, display name, opposed team ids).
type JabsTeam struct {
	Id      int    `json:"id"`
	Key     string `json:"key"`
	Name    string `json:"name"`
	Opposes []int  `json:"opposes"`
}
