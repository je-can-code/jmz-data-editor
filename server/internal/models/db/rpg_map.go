package db

import "encoding/json"

// RpgMap is the root object in data/Map###.json (MZ map editor export).
type RpgMap struct {
	AutoplayBgm       bool              `json:"autoplayBgm"`
	AutoplayBgs       bool              `json:"autoplayBgs"`
	Battleback1Name   string            `json:"battleback1Name"`
	Battleback2Name   string            `json:"battleback2Name"`
	Bgm               RpgSoundEffect    `json:"bgm"`
	Bgs               RpgSoundEffect    `json:"bgs"`
	Data              []int             `json:"data"`
	DisableDashing    bool              `json:"disableDashing"`
	DisplayName       string            `json:"displayName"`
	EncounterList     []RpgMapEncounter `json:"encounterList"`
	EncounterStep     int               `json:"encounterStep"`
	Events            []*RpgMapEvent    `json:"events"`
	Height            int               `json:"height"`
	Note              string            `json:"note"`
	ParallaxLoopX     bool              `json:"parallaxLoopX"`
	ParallaxLoopY     bool              `json:"parallaxLoopY"`
	ParallaxName      string            `json:"parallaxName"`
	ParallaxShow      bool              `json:"parallaxShow"`
	ParallaxSx        int               `json:"parallaxSx"`
	ParallaxSy        int               `json:"parallaxSy"`
	ScrollType        int               `json:"scrollType"`
	SpecifyBattleback bool              `json:"specifyBattleback"`
	TilesetId         int               `json:"tilesetId"`
	Width             int               `json:"width"`
}

// RpgMapEncounter is one random encounter row on the map properties.
type RpgMapEncounter struct {
	TroopId   int   `json:"troopId"`
	Weight    int   `json:"weight"`
	RegionSet []int `json:"regionSet"`
}

// RpgMapEvent is one map event (sparse array in JSON; null slots must round-trip).
type RpgMapEvent struct {
	Id    int               `json:"id"`
	Name  string            `json:"name"`
	Note  string            `json:"note"`
	Pages []RpgMapEventPage `json:"pages"`
	X     int               `json:"x"`
	Y     int               `json:"y"`
}

// RpgMapEventPage is one event page (graphic, conditions, interpreter list, move route).
type RpgMapEventPage struct {
	Conditions    RpgMapEventConditions `json:"conditions"`
	DirectionFix  bool                  `json:"directionFix"`
	Image         RpgMapEventImage      `json:"image"`
	List          []json.RawMessage     `json:"list"`
	MoveFrequency int                   `json:"moveFrequency"`
	MoveRoute     RpgMapMoveRoute       `json:"moveRoute"`
	MoveSpeed     int                   `json:"moveSpeed"`
	MoveType      int                   `json:"moveType"`
	PriorityType  int                   `json:"priorityType"`
	StepAnime     bool                  `json:"stepAnime"`
	Through       bool                  `json:"through"`
	Trigger       int                   `json:"trigger"`
	WalkAnime     bool                  `json:"walkAnime"`
}

// RpgMapEventConditions is the page activation gate block (MZ event page conditions).
type RpgMapEventConditions struct {
	ActorId         int    `json:"actorId"`
	ActorValid      bool   `json:"actorValid"`
	ItemId          int    `json:"itemId"`
	ItemValid       bool   `json:"itemValid"`
	SelfSwitchCh    string `json:"selfSwitchCh"`
	SelfSwitchValid bool   `json:"selfSwitchValid"`
	Switch1Id       int    `json:"switch1Id"`
	Switch1Valid    bool   `json:"switch1Valid"`
	Switch2Id       int    `json:"switch2Id"`
	Switch2Valid    bool   `json:"switch2Valid"`
	VariableId      int    `json:"variableId"`
	VariableValid   bool   `json:"variableValid"`
	VariableValue   int    `json:"variableValue"`
}

// RpgMapEventImage is the walking / tile graphic for an event page.
type RpgMapEventImage struct {
	TileId         int    `json:"tileId"`
	CharacterName  string `json:"characterName"`
	Direction      int    `json:"direction"`
	Pattern        int    `json:"pattern"`
	CharacterIndex int    `json:"characterIndex"`
}

// RpgMapMoveRoute is the autonomous movement route on an event page.
type RpgMapMoveRoute struct {
	List      []json.RawMessage `json:"list"`
	Repeat    bool              `json:"repeat"`
	Skippable bool              `json:"skippable"`
	Wait      bool              `json:"wait"`
}
