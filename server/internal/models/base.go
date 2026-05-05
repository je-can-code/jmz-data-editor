package models

type RpgBase struct {
	Id   int    `json:"id"`
	Name string `json:"name"`
	Note string `json:"note"`
}

type RpgBaseItem struct {
	RpgBase
	Description string `json:"description"`
	IconIndex   int    `json:"iconIndex"`
}

type RpgBaseBattler struct {
	RpgBase
	BattlerName string     `json:"battlerName"`
	Traits      []RpgTrait `json:"traits"`
}

type RpgTraited struct {
	RpgBaseItem
	Traits []RpgTrait `json:"traits"`
}
