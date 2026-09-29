package db

import "jmz-data-editor/server/internal/models"

const (
	ClassParamKinds  = 8   // MHP, MMP, ATK, DEF, MAT, MDF, AGI, LUK
	ClassParamLevels = 100 // editor curve samples for levels 1–100
)

type ClassParams [ClassParamKinds][ClassParamLevels]int

// RpgClass is a row in Classes.json.
//
// Description and IconIndex are this editor's own additions: RPG Maker's editor has no field for
// a class's description or icon, so a class it saved carries neither, and decodes to an empty
// string and to icon zero, which is no icon of its own.
type RpgClass struct {
	models.RpgBase
	Description string                    `json:"description"`
	ExpParams   [4]int                    `json:"expParams"`
	IconIndex   int                       `json:"iconIndex"`
	Learnings   []models.RpgClassLearning `json:"learnings"`
	Params      ClassParams               `json:"params"`
	Traits      []models.RpgTrait         `json:"traits"`
}
