package db

import "jmz-data-editor/server/internal/models"

type RpgEnemy struct {
	models.RpgBaseBattler
	Actions    []models.RpgEnemyAction `json:"actions"`
	BattlerHue int                     `json:"battlerHue"`
	DropItems  [3]models.RpgDropItem   `json:"dropItems"`
	Exp        int                     `json:"exp"`
	Gold       int                     `json:"gold"`
	Params     [8]int                  `json:"params"`
}
