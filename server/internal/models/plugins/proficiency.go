package plugins

// ProficiencyConfiguration is the root shape of data/config.proficiency.json (J-Proficiency editor export).
type ProficiencyConfiguration struct {
	Conditionals []ProficiencyConditional `json:"conditionals"`
}

// ProficiencyConditional is one proficiency gate / reward bundle.
type ProficiencyConditional struct {
	Key          string                   `json:"key"`
	ActorIds     []int                    `json:"actorIds"`
	Requirements []ProficiencyRequirement `json:"requirements"`
	SkillRewards []int                    `json:"skillRewards"`
	JsRewards    string                   `json:"jsRewards"`
}

// ProficiencyRequirement is one skill proficiency threshold inside a conditional.
type ProficiencyRequirement struct {
	SkillId           int   `json:"skillId"`
	Proficiency       int   `json:"proficiency"`
	SecondarySkillIds []int `json:"secondarySkillIds"`
}
