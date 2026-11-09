package plugins

// BossEncounter is one whole boss fight: who is fighting, who is allowed to drive them, and what
// recurs for the duration.
//
// Encounters live in the "bosses" block of data/config.jabs.json rather than a file of their own,
// alongside "teams" and "juice" — one config file per plugin family, one block per plugin. They are
// consumed at runtime by J-ABS-Boss
// (rmmz-plugins/src/plugins/abs/ext/boss/_metadata/_pluginMetadata.js).
type BossEncounter struct {
	Key string `json:"key"`
	Map int    `json:"map"`

	// DefeatSwitch is the switch the plugin turns on once every body in the encounter has fallen, and 0
	// turns none on. It only turns on for a fight won on Map, so a test hall staging the same fight never
	// touches the story.
	DefeatSwitch int `json:"defeatSwitch"`

	Participants []BossParticipant `json:"participants"`
	AiControl    string            `json:"aiControl"`
	Routines     []BossRoutine     `json:"routines"`

	// Reactions are what the fight does once each, in answer to its own moments: as it begins, or once a
	// named group of bodies has fallen. A fight that does the same thing from start to finish has none.
	Reactions []BossReaction `json:"reactions,omitempty"`
}

// BossParticipant is a single body taking part in an encounter. This is a list rather than a lone
// boss on purpose: a boss with destructible parts, a pair of twins, and a swarm sharing one health
// pool are the same structure with a different win condition.
//
// A body is an enemy and the tile it appears on, never an event on a map. The plugin spawns every
// body from the enemy clone map when the encounter starts, from EnemyId's own slot unless Template
// names another, so the same encounter runs on any map shaped like its arena.
type BossParticipant struct {
	Key     string `json:"key"`
	EnemyId int    `json:"enemyId"`

	// Expect is the enemy name recorded when the encounter was authored, and it is the tripwire for
	// database drift. Ids move when the database is rebalanced and a stale id fails silently at
	// runtime, so the plugin compares this against the live name and refuses to start on a mismatch.
	Expect string `json:"expect"`

	// X and Y are the tile this body appears on when the encounter starts.
	X int `json:"x"`
	Y int `json:"y"`

	// Template is the clone map event this body spawns from instead of its enemy's own slot, and 0 means
	// the enemy's own. It lets the same enemy turn up dressed for one fight, with a prefix, a role or a
	// level of its own, without touching the template every other spawn of that enemy uses.
	Template int `json:"template,omitempty"`
}

// BossRoutine is a repeating sequence that runs while its encounter is live.
type BossRoutine struct {
	Key string `json:"key"`

	// Cadence is the interval between executions, expressed in seconds. Authors design fights in
	// seconds; the plugin converts to frames exactly once when it loads this file.
	Cadence float64 `json:"cadence"`

	Steps []BossStep `json:"steps"`
}

// BossReaction is something an encounter does once, the moment a thing happens in it.
type BossReaction struct {
	Key string `json:"key"`

	// On is the moment answered: "start" as the fight begins, "fallen" once every body named in
	// Participants has fallen and finished its death scene, or "health" once every body named there (the
	// boss, when none are) stands at or below Below percent of its health.
	On string `json:"on"`

	// Participants are the bodies, by key, a "fallen" or "health" reaction waits on. A "start" reaction
	// names none, and a "health" reaction naming none watches the boss.
	Participants []string `json:"participants,omitempty"`

	// Below is the percent of its health a "health" reaction waits for, inclusive, and 0 for every other
	// moment.
	Below int `json:"below,omitempty"`

	Steps []BossStep `json:"steps"`
}

// BossStep is one instruction inside a routine or a reaction.
//
// Steps are polymorphic by their Verb, and only the verbs J-ABS-Boss actually implements are modeled
// here. Go drops unmodeled fields on save, so a new verb must land in this struct, in the editor, and
// in the plugin together - authoring a verb the runtime cannot honor would only produce a fight that
// throws the moment it starts.
//
// Every field any verb reads lives here, and a verb reads only the ones it has a use for. The fields a
// verb added after forceSkill reads are omitted when empty, so a step keeps only what it uses on disk.
type BossStep struct {
	Verb   string `json:"verb"`
	Skill  int    `json:"skill"`
	Expect string `json:"expect"`
	Cast   bool   `json:"cast"`

	// Participant is the body the step acts on, by key, and empty means the first body: the boss.
	Participant string `json:"participant,omitempty"`

	// State is the state addState and removeState put on or take off the participant.
	State int `json:"state,omitempty"`

	// Image and Index are the character sheet and the character on it that changeImage turns the
	// participant into.
	Image string `json:"image,omitempty"`
	Index int    `json:"index,omitempty"`

	// Routine and Seconds are the routine quickenRoutine speeds up, by key, and the seconds it takes off
	// that routine's wait. Seconds is also how long a tint takes to settle.
	Routine string  `json:"routine,omitempty"`
	Seconds float64 `json:"seconds,omitempty"`

	// EnemyId, Template, X and Y are what spawn puts on the map and where: an enemy copied from the clone
	// map slot with its id, unless Template names another, onto the tile at X and Y. Expect records the
	// enemy's name, the same as a participant's.
	EnemyId  int `json:"enemyId,omitempty"`
	Template int `json:"template,omitempty"`
	X        int `json:"x,omitempty"`
	Y        int `json:"y,omitempty"`

	// Tone is the screen tone tint settles on: red, green and blue from -255 to 255, then gray from 0 to 255.
	Tone []int `json:"tone,omitempty"`

	// Animation is the animation, by id, played over the participant.
	Animation int `json:"animation,omitempty"`

	// Speaker and Lines are dialogue: the name shown with the participant's line, and its text, shown
	// together as one message.
	Speaker string   `json:"speaker,omitempty"`
	Lines   []string `json:"lines,omitempty"`
}
