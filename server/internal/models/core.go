package models

type RpgUsableItem struct {
	RpgBaseItem
	AnimationId int               `json:"animationId"`
	Damage      RpgSkillDamage    `json:"damage"`
	Effects     []RpgUsableEffect `json:"effects"`
	HitType     int               `json:"hitType"`
	Occasion    int               `json:"occasion"`
	Repeats     int               `json:"repeats"`
	Scope       int               `json:"scope"`
	Speed       int               `json:"speed"`
	SuccessRate int               `json:"successRate"`
	TpGain      int               `json:"tpGain"`
}

type RpgEquipItem struct {
	RpgTraited
	EtypeId int    `json:"etypeId"`
	Params  [8]int `json:"params"`
	Price   int    `json:"price"`
}
