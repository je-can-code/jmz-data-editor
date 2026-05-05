package plugins

// SdpConfiguration is the root shape of data/config.sdp.json (J-SDP panel definitions).
type SdpConfiguration struct {
	Sdps []SdpPanel `json:"sdps"`
}

// SdpPanel is one stat distribution panel the player can rank up.
type SdpPanel struct {
	Name              string         `json:"name"`
	Key               string         `json:"key"`
	IconIndex         int            `json:"iconIndex"`
	UnlockedByDefault bool           `json:"unlockedByDefault"`
	Description       string         `json:"description"`
	TopFlavorText     string         `json:"topFlavorText"`
	MaxRank           int            `json:"maxRank"`
	BaseCost          int            `json:"baseCost"`
	FlatGrowthCost    int            `json:"flatGrowthCost"`
	MultGrowthCost    int            `json:"multGrowthCost"`
	PanelParameters   []SdpParameter `json:"panelParameters"`
	PanelRewards      []SdpReward    `json:"panelRewards"`
	Rarity            int            `json:"rarity"`
}

// SdpParameter is one parameter growth line on a panel.
type SdpParameter struct {
	ParameterId int     `json:"parameterId"`
	PerRank     float64 `json:"perRank"`
	IsFlat      bool    `json:"isFlat"`
	IsCore      bool    `json:"isCore"`
}

// SdpReward is a script reward granted at or above a rank threshold.
type SdpReward struct {
	RewardName   string `json:"rewardName"`
	RankRequired int    `json:"rankRequired"`
	Effect       string `json:"effect"`
}
