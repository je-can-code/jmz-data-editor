package db

import "jmz-data-editor/server/internal/models"

const (
	ClassParamKinds  = 8   // MHP, MMP, ATK, DEF, MAT, MDF, AGI, LUK
	ClassParamLevels = 100 // editor curve samples for levels 1–100
)

type ClassParams [ClassParamKinds][ClassParamLevels]int

type RpgClass struct {
	models.RpgBase
	ExpParams [4]int                    `json:"expParams"`
	Learnings []models.RpgClassLearning `json:"learnings"`
	Params    ClassParams               `json:"params"`
	Traits    []models.RpgTrait         `json:"traits"`
}
