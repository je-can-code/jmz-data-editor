package plugins

// ProficiencyConfiguration is the root shape of data/config.proficiency.json (J-Proficiency editor export).
//
// The three knowledge blocks belong to J-Proficiency-Knowledge rather than to J-Proficiency itself, and
// live here for the same reason boss encounters live in the JABS config: one file per plugin family
// keeps the boards mapping one-to-one onto config files. They are omitempty so a project that has not
// authored any of them keeps its file byte-identical.
type ProficiencyConfiguration struct {
	Conditionals       []ProficiencyConditional `json:"conditionals"`
	KnowledgeTags      []KnowledgeTag           `json:"knowledgeTags,omitempty"`
	SkillTypeMapping   map[string][]string      `json:"skillTypeMapping,omitempty"`
	KnowledgeExchanges []KnowledgeExchange      `json:"knowledgeExchanges,omitempty"`
}

// KnowledgeTag is one kind of knowledge the party can accumulate by using skills.
type KnowledgeTag struct {
	Key         string `json:"key"`
	Name        string `json:"name"`
	IconIndex   int    `json:"iconIndex"`
	Description string `json:"description"`
}

// KnowledgeExchange is a standing offer to convert one kind of knowledge into a database entry.
type KnowledgeExchange struct {
	Key    string                  `json:"key"`
	TagKey string                  `json:"tagKey"`
	Cost   int                     `json:"cost"`
	Output KnowledgeExchangeOutput `json:"output"`
}

// KnowledgeExchangeOutput is what a single unit of an exchange hands over.
type KnowledgeExchangeOutput struct {
	Id    int    `json:"id"`
	Type  string `json:"type"`
	Count int    `json:"count"`
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
