package db

import "jmz-data-editor/server/internal/models"

type RpgItem struct {
	models.RpgUsableItem
	Consumable bool `json:"consumable"`
	ItypeId    int  `json:"itypeId"`
	Price      int  `json:"price"`
}
