package db

import "jmz-data-editor/server/internal/models"

type RpgArmor struct {
	models.RpgEquipItem
	AtypeId int `json:"atypeId"`
}
