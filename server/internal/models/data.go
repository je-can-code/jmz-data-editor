package models

type RpgSkillDamage struct {
	Critical  bool   `json:"critical"`
	ElementId int    `json:"elementId"`
	Formula   string `json:"formula"`
	Type      int    `json:"type"`
	Variance  int    `json:"variance"`
}

type RpgUsableEffect struct {
	Code   int     `json:"code"`
	DataId int     `json:"dataId"`
	Value1 float64 `json:"value1"`
	Value2 float64 `json:"value2"`
}

type RpgTrait struct {
	Code   int     `json:"code"`
	DataId int     `json:"dataId"`
	Value  float64 `json:"value"`
}

type RpgClassLearning struct {
	Level   int    `json:"level"`
	SkillId int    `json:"skillId"`
	Note    string `json:"note"`
}

type RpgEnemyAction struct {
	ConditionParam1 int `json:"conditionParam1"`
	ConditionParam2 int `json:"conditionParam2"`
	ConditionType   int `json:"conditionType"`
	Rating          int `json:"rating"`
	SkillId         int `json:"skillId"`
}

type RpgDropItem struct {
	DataId      int `json:"dataId"`
	Denominator int `json:"denominator"`
	Kind        int `json:"kind"`
}
