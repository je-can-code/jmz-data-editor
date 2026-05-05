package db

import "jmz-data-editor/server/internal/models"

type RpgActor struct {
	models.RpgBaseBattler
	CharacterIndex int    `json:"characterIndex"`
	CharacterName  string `json:"characterName"`
	ClassId        int    `json:"classId"`
	Equips         []int  `json:"equips"`
	FaceIndex      int    `json:"faceIndex"`
	FaceName       string `json:"faceName"`
	InitialLevel   int    `json:"initialLevel"`
	MaxLevel       int    `json:"maxLevel"`
	Nickname       string `json:"nickname"`
	Profile        string `json:"profile"`
}
