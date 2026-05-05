package db

import "jmz-data-editor/server/internal/models"

type RpgWeapon struct {
	models.RpgEquipItem
	AnimationId int `json:"animationId"`
	WtypeId     int `json:"wtypeId"`
}
