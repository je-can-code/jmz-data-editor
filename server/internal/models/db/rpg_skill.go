package db

import "jmz-data-editor/server/internal/models"

// RpgSkill is the implementation that represents a single skill in the RPG Maker MZ database.
type RpgSkill struct {
	models.RpgUsableItem
	Message1         string `json:"message1"`
	Message2         string `json:"message2"`
	MessageType      int    `json:"messageType"`
	MpCost           int    `json:"mpCost"`
	RequiredWtypeId1 int    `json:"requiredWtypeId1"`
	RequiredWtypeId2 int    `json:"requiredWtypeId2"`
	STypeId          int    `json:"stypeId"`
	TpCost           int    `json:"tpCost"`
}
