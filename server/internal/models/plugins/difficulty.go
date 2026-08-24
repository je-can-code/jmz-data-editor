package plugins

// DifficultyBattlerEffects is the parameter scaling one difficulty layer applies to one side of a
// fight. Every value is a percentage where 100 means "unchanged", and the three fixed-length groups
// mirror RPG Maker's own parameter families: b-params are the eight core stats, x-params the ten
// ex-parameters, s-params the ten sp-parameters. CParams are Jeremy's custom parameters and are
// open-ended, so they stay a plain slice.
type DifficultyBattlerEffects struct {
	BParams []int `json:"bparams"`
	XParams []int `json:"xparams"`
	SParams []int `json:"sparams"`
	CParams []int `json:"cparams"`
}

// DifficultyBonusEffects is the reward scaling a difficulty layer applies to the party, again as
// percentages against 100.
type DifficultyBonusEffects struct {
	Exp        int `json:"exp"`
	Gold       int `json:"gold"`
	Drops      int `json:"drops"`
	Encounters int `json:"encounters"`
	Sdp        int `json:"sdp"`
}

// DifficultyAffixGrant hands a weight to an enemy affix state that was authored at weight zero,
// which is what makes that affix reachable at all while the granting layer is enabled.
//
// Authored as an object with named fields rather than as a map keyed by state id, because JSON
// object keys are always strings: a keyed form would make every id arrive as text needing conversion
// before it could match the numerically-keyed affix pools on the plugin side.
type DifficultyAffixGrant struct {
	StateID int `json:"stateId"`
	Weight  int `json:"weight"`
}

// DifficultyAffixEffects is the optional affix biasing a layer applies while it is enabled, read at
// runtime by J-Difficulty-Affix. A layer that omits the block entirely changes nothing about how
// affixes roll, which is why the field is a pointer rather than a value.
type DifficultyAffixEffects struct {
	PrefixChance *int                   `json:"prefixChance,omitempty"`
	SuffixChance *int                   `json:"suffixChance,omitempty"`
	Flatten      *int                   `json:"flatten,omitempty"`
	Grants       []DifficultyAffixGrant `json:"grants,omitempty"`
}

// DifficultyLayer is one entry in data/config.difficulty.json, consumed at runtime by J-Difficulty
// (rmmz-plugins/src/plugins/diff/core/_metadata/_pluginMetadata.js). Any subset of the layers can be
// enabled at once, and their effects multiply together.
//
// Every authored field is represented here even though the editor does not yet expose all of them.
// This model is what a save round-trips through, so a field missing from the struct is a field
// silently erased from the file the first time anybody presses save.
type DifficultyLayer struct {
	Key          string                   `json:"key"`
	Name         string                   `json:"name"`
	IconIndex    int                      `json:"iconIndex"`
	Description  string                   `json:"description"`
	Cost         int                      `json:"cost"`
	ActorEffects DifficultyBattlerEffects `json:"actorEffects"`
	EnemyEffects DifficultyBattlerEffects `json:"enemyEffects"`
	Rewards      DifficultyBonusEffects   `json:"rewards"`
	Enabled      bool                     `json:"enabled"`
	Unlocked     bool                     `json:"unlocked"`
	Hidden       bool                     `json:"hidden"`
	AffixEffects *DifficultyAffixEffects  `json:"affixEffects,omitempty"`
}

// DifficultyConfiguration is the root shape of data/config.difficulty.json: a bare array of layers,
// with no wrapping object.
type DifficultyConfiguration []DifficultyLayer
