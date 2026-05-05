package plugins

// QuestConfiguration is the root shape of data/config.quest.json (Questopedia editor export).
type QuestConfiguration struct {
	Quests     []QuestDefinition `json:"quests"`
	Tags       []QuestTag        `json:"tags"`
	Categories []QuestCategory   `json:"categories"`
}

// QuestDefinition is one quest header plus its objectives.
type QuestDefinition struct {
	Name             string           `json:"name"`
	Key              string           `json:"key"`
	CategoryKey      string           `json:"categoryKey"`
	TagKeys          []string         `json:"tagKeys"`
	UnknownHint      string           `json:"unknownHint"`
	Overview         string           `json:"overview"`
	RecommendedLevel int              `json:"recommendedLevel"`
	Objectives       []QuestObjective `json:"objectives"`
	IconIndex        int              `json:"iconIndex"`
}

// QuestObjective is one step toward completing a quest.
type QuestObjective struct {
	Id              int                `json:"id"`
	Type            string             `json:"type"`
	Description     string             `json:"description"`
	Logs            QuestObjectiveLogs `json:"logs"`
	Fulfillment     QuestFulfillment   `json:"fulfillment"`
	HiddenByDefault bool               `json:"hiddenByDefault"`
	IsOptional      bool               `json:"isOptional"`
}

// QuestObjectiveLogs is journal copy for each objective lifecycle state.
type QuestObjectiveLogs struct {
	Inactive  string `json:"inactive"`
	Active    string `json:"active"`
	Completed string `json:"completed"`
	Failed    string `json:"failed"`
	Missed    string `json:"missed"`
}

// QuestFulfillment carries every fulfillment subtype so unknown JSON keys still round-trip per objective.
type QuestFulfillment struct {
	Indiscriminate QuestIndiscriminateData `json:"indiscriminate"`
	Destination    QuestDestinationData    `json:"destination"`
	Fetch          QuestFetchData          `json:"fetch"`
	Slay           QuestSlayData           `json:"slay"`
	Quest          QuestKeysData           `json:"quest"`
}

// QuestIndiscriminateData is the freeform / tutorial-style fulfillment block.
type QuestIndiscriminateData struct {
	Hint string `json:"hint"`
}

// QuestDestinationData is the rectangle / map fulfillment block.
type QuestDestinationData struct {
	MapId int `json:"mapId"`
	X1    int `json:"x1"`
	X2    int `json:"x2"`
	Y1    int `json:"y1"`
	Y2    int `json:"y2"`
}

// QuestFetchData is the collect / deliver items fulfillment block.
type QuestFetchData struct {
	Type   int `json:"type"`
	Id     int `json:"id"`
	Amount int `json:"amount"`
}

// QuestSlayData is the defeat N enemies fulfillment block.
type QuestSlayData struct {
	Id     int `json:"id"`
	Amount int `json:"amount"`
}

// QuestKeysData is the prerequisite quest keys fulfillment block.
type QuestKeysData struct {
	Keys []string `json:"keys"`
}

// QuestTag is a quest grouping tag row.
type QuestTag struct {
	Key       string `json:"key"`
	Name      string `json:"name"`
	IconIndex int    `json:"iconIndex"`
}

// QuestCategory is a quest category row.
type QuestCategory struct {
	Key       string `json:"key"`
	Name      string `json:"name"`
	IconIndex int    `json:"iconIndex"`
}
