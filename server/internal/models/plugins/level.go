package plugins

// LevelConfiguration is the root shape of data/config.level.json, consumed at runtime by J-LevelMaster
// (rmmz-plugins/src/plugins/level/core/_metadata/_pluginMetadata.js). Every J-LevelMaster tuning value
// lives here now instead of PluginManager parameters.
type LevelConfiguration struct {
	UseScaling            bool     `json:"useScaling"`
	MinMultiplier         float64  `json:"minMultiplier"`
	MaxMultiplier         float64  `json:"maxMultiplier"`
	RewardMinMultiplier   *float64 `json:"rewardMinMultiplier"`
	RewardMaxMultiplier   *float64 `json:"rewardMaxMultiplier"`
	GrowthMultiplier      float64  `json:"growthMultiplier"`
	InvariantUpperRange   float64  `json:"invariantUpperRange"`
	InvariantLowerRange   float64  `json:"invariantLowerRange"`
	VariableActorBalancer int      `json:"variableActorBalancer"`
	VariableEnemyBalancer int      `json:"variableEnemyBalancer"`
	DefaultBeyondMaxLevel int      `json:"defaultBeyondMaxLevel"`
	TrueMaxLevel          int      `json:"trueMaxLevel"`
	UseSharedActorLevel   bool     `json:"useSharedActorLevel"`
	CanonicalExpBasis     float64  `json:"canonicalExpBasis"`
	CanonicalExpExtra     float64  `json:"canonicalExpExtra"`
	CanonicalExpAccA      float64  `json:"canonicalExpAccA"`
	CanonicalExpAccB      float64  `json:"canonicalExpAccB"`
}
