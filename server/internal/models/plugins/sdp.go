package plugins

// SdpConfiguration is the root shape of data/config.sdp.json (J-SDP panel definitions).
type SdpConfiguration struct {
	Sdps      []SdpPanel      `json:"sdps"`
	Subgroups []SdpSubgroup   `json:"subgroups"`
	Families  []SdpFamily     `json:"families"`
}

// SdpPanelIdentity is presentation and unlock metadata for one panel.
type SdpPanelIdentity struct {
	Name              string `json:"name"`
	IconIndex         int    `json:"iconIndex"`
	UnlockedByDefault bool   `json:"unlockedByDefault"`
	Description       string `json:"description"`
	TopFlavorText     string `json:"topFlavorText"`
}

// SdpPanelProgression is rank cap, rarity tier, and rank-up cost offsets.
type SdpPanelProgression struct {
	MaxRank        int     `json:"maxRank"`
	Rarity         int     `json:"rarity"`
	BaseCost       int     `json:"baseCost"`
	FlatGrowthCost int     `json:"flatGrowthCost"`
	MultGrowthCost float64 `json:"multGrowthCost"`
}

// SdpPanelMastery is subgroup mastery enrollment for one panel.
type SdpPanelMastery struct {
	SubgroupKey    string `json:"subgroupKey"`
	SubgroupTier   int    `json:"subgroupTier"`
	MasterySkillId int    `json:"masterySkillId"`
}

// SdpPanel is one stat distribution panel the player can rank up.
type SdpPanel struct {
	Key             string              `json:"key"`
	Identity        SdpPanelIdentity    `json:"identity"`
	Progression     SdpPanelProgression `json:"progression"`
	Mastery         SdpPanelMastery     `json:"mastery"`
	PanelParameters []SdpParameter      `json:"panelParameters"`
	PanelRewards    []SdpReward         `json:"panelRewards"`
}

// SdpSubgroup groups tiered panels whose masteries replace one another.
type SdpSubgroup struct {
	Name        string `json:"name"`
	Key         string `json:"key"`
	IconIndex   int    `json:"iconIndex"`
	Description string `json:"description"`
}

// SdpFamily groups subgroups for the in-game SDP family filter strip.
type SdpFamily struct {
	Name         string   `json:"name"`
	Key          string   `json:"key"`
	IconIndex    int      `json:"iconIndex"`
	Description  string   `json:"description"`
	SubgroupKeys []string `json:"subgroupKeys"`
}

// SdpParameter is one parameter growth line on a panel.
type SdpParameter struct {
	ParameterKey string  `json:"parameterKey"`
	PerRank      float64 `json:"perRank"`
	IsFlat       bool    `json:"isFlat"`
	IsCore       bool    `json:"isCore"`
}

// SdpReward is a script reward granted at or above a rank threshold.
type SdpReward struct {
	RewardName   string `json:"rewardName"`
	RankRequired int    `json:"rankRequired"`
	Effect       string `json:"effect"`
}
