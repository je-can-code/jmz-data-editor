package plugins

// BossEncounter is one whole boss fight: who is fighting, who is allowed to drive them, and what
// recurs for the duration.
//
// Encounters live in the "bosses" block of data/config.jabs.json rather than a file of their own,
// alongside "teams" and "juice" — one config file per plugin family, one block per plugin. They are
// consumed at runtime by J-ABS-Boss
// (rmmz-plugins/src/plugins/abs/ext/boss/_metadata/_pluginMetadata.js).
type BossEncounter struct {
	Key          string            `json:"key"`
	Map          int               `json:"map"`
	Participants []BossParticipant `json:"participants"`
	AiControl    string            `json:"aiControl"`
	Routines     []BossRoutine     `json:"routines"`
}

// BossParticipant is a single body taking part in an encounter. This is a list rather than a lone
// boss on purpose: a boss with destructible parts, a pair of twins, and a swarm sharing one health
// pool are the same structure with a different win condition.
type BossParticipant struct {
	Key     string `json:"key"`
	EventId int    `json:"eventId"`
	EnemyId int    `json:"enemyId"`

	// Expect is the enemy name recorded when the encounter was authored, and it is the tripwire for
	// database drift. Ids move when the database is rebalanced and a stale id fails silently at
	// runtime, so the plugin compares this against the live name and refuses to start on a mismatch.
	Expect string `json:"expect"`
}

// BossRoutine is a repeating sequence that runs while its encounter is live.
type BossRoutine struct {
	Key string `json:"key"`

	// Cadence is the interval between executions, expressed in seconds. Authors design fights in
	// seconds; the plugin converts to frames exactly once when it loads this file.
	Cadence float64 `json:"cadence"`

	Steps []BossStep `json:"steps"`
}

// BossStep is one instruction inside a routine.
//
// Steps are polymorphic by their Verb, and only the verbs J-ABS-Boss actually implements are modeled
// here. Go drops unmodeled fields on save, so a new verb must land in this struct, in the editor, and
// in the plugin together - authoring a verb the runtime cannot honor would only produce a fight that
// throws the moment it starts.
type BossStep struct {
	Verb   string `json:"verb"`
	Skill  int    `json:"skill"`
	Expect string `json:"expect"`
	Cast   bool   `json:"cast"`
}
