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
	Teams  []JabsTeam      `json:"teams"`
	Juice  json.RawMessage `json:"juice,omitempty"`
	Bosses []BossEncounter `json:"bosses"`
}

// JabsTeam is one combat team definition (id, key, display name, opposed team ids).
type JabsTeam struct {
	Id      int    `json:"id"`
	Key     string `json:"key"`
	Name    string `json:"name"`
	Opposes []int  `json:"opposes"`
}
