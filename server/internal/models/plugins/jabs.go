package plugins

// JabsConfiguration is the root shape of data/config.jabs.json (JABS team matrix for the data editor).
type JabsConfiguration struct {
	Teams []JabsTeam `json:"teams"`
}

// JabsTeam is one combat team definition (id, key, display name, opposed team ids).
type JabsTeam struct {
	Id      int    `json:"id"`
	Key     string `json:"key"`
	Name    string `json:"name"`
	Opposes []int  `json:"opposes"`
}
