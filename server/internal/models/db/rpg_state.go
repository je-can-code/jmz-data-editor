package db

import "jmz-data-editor/server/internal/models"

// RpgState is the implementation that represents a single state in the RPG Maker MZ database.
type RpgState struct {
	models.RpgTraited
	AutoRemovalTiming   int    `json:"autoRemovalTiming"`
	ChanceByDamage      int    `json:"chanceByDamage"`
	MinTurns            int    `json:"minTurns"`
	MaxTurns            int    `json:"maxTurns"`
	Message1            string `json:"message1"`
	Message2            string `json:"message2"`
	Message3            string `json:"message3"`
	Message4            string `json:"message4"`
	Motion              int    `json:"motion"`
	Overlay             int    `json:"overlay"`
	Priority            int    `json:"priority"`
	Restriction         int    `json:"restriction"`
	RemoveAtBattleEnd   bool   `json:"removeAtBattleEnd"`
	RemoveByDamage      bool   `json:"removeByDamage"`
	RemoveByRestriction bool   `json:"removeByRestriction"`
	RemoveByWalking     bool   `json:"removeByWalking"`
	StepsToRemove       int    `json:"stepsToRemove"`
}
