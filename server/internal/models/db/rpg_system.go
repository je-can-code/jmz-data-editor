package db

// RpgSystemAdvanced is the "Advanced" block on the System tab.
type RpgSystemAdvanced struct {
	GameId             int    `json:"gameId"`
	ScreenWidth        int    `json:"screenWidth"`
	ScreenHeight       int    `json:"screenHeight"`
	UiAreaWidth        int    `json:"uiAreaWidth"`
	UiAreaHeight       int    `json:"uiAreaHeight"`
	NumberFontFilename string `json:"numberFontFilename"`
	FallbackFonts      string `json:"fallbackFonts"`
	FontSize           int    `json:"fontSize"`
	MainFontFilename   string `json:"mainFontFilename"`
	WindowOpacity      int    `json:"windowOpacity"`
	ScreenScale        int    `json:"screenScale"`
	PicturesUpperLimit int    `json:"picturesUpperLimit"`
}

// RpgSystemVehicle is airship / boat / ship data (same JSON shape).
type RpgSystemVehicle struct {
	Bgm            RpgSoundEffect `json:"bgm"`
	CharacterIndex int            `json:"characterIndex"`
	CharacterName  string         `json:"characterName"`
	StartMapId     int            `json:"startMapId"`
	StartX         int            `json:"startX"`
	StartY         int            `json:"startY"`
}

// RpgSystemAttackMotion is one row in attackMotions[].
type RpgSystemAttackMotion struct {
	Type          int `json:"type"`
	WeaponImageId int `json:"weaponImageId"`
}

// RpgSystemTerms is the nested "terms" object (basic/commands/params + message dictionary).
type RpgSystemTerms struct {
	Basic    []string          `json:"basic"`
	Commands []string          `json:"commands"`
	Params   []string          `json:"params"`
	Messages map[string]string `json:"messages"`
}

// RpgSystemTestBattler is one entry in testBattlers[].
type RpgSystemTestBattler struct {
	ActorId int   `json:"actorId"`
	Level   int   `json:"level"`
	Equips  []int `json:"equips"`
}

// RpgSystemTitleCommandWindow is the title command window layout block.
type RpgSystemTitleCommandWindow struct {
	OffsetX    int `json:"offsetX"`
	OffsetY    int `json:"offsetY"`
	Background int `json:"background"`
}

// RpgSystemEditor holds editor-only metadata Degica persists into System.json.
type RpgSystemEditor struct {
	MessageWidth1   int `json:"messageWidth1"`
	MessageWidth2   int `json:"messageWidth2"`
	JsonFormatLevel int `json:"jsonFormatLevel"`
}

// RpgSystem is the single root object in System.json (MZ "System 1" database).
//
// Shaped against chef-adventure/data/System.json (58 top-level keys). Arrays like switches[]
// use []string because MZ stores display names per id slot on disk for this project.
type RpgSystem struct {
	Advanced           RpgSystemAdvanced           `json:"advanced"`
	Airship            RpgSystemVehicle            `json:"airship"`
	ArmorTypes         []string                    `json:"armorTypes"`
	AttackMotions      []RpgSystemAttackMotion     `json:"attackMotions"`
	BattleBgm          RpgSoundEffect              `json:"battleBgm"`
	BattleSystem       int                         `json:"battleSystem"`
	Battleback1Name    string                      `json:"battleback1Name"`
	Battleback2Name    string                      `json:"battleback2Name"`
	BattlerHue         int                         `json:"battlerHue"`
	BattlerName        string                      `json:"battlerName"`
	Boat               RpgSystemVehicle            `json:"boat"`
	CurrencyUnit       string                      `json:"currencyUnit"`
	DefeatMe           RpgSoundEffect              `json:"defeatMe"`
	EditMapId          int                         `json:"editMapId"`
	Editor             RpgSystemEditor             `json:"editor"`
	Elements           []string                    `json:"elements"`
	EquipTypes         []string                    `json:"equipTypes"`
	FaceSize           int                         `json:"faceSize"`
	GameTitle          string                      `json:"gameTitle"`
	GameoverMe         RpgSoundEffect              `json:"gameoverMe"`
	IconSize           int                         `json:"iconSize"`
	ItemCategories     []bool                      `json:"itemCategories"`
	Locale             string                      `json:"locale"`
	MagicSkills        []int                       `json:"magicSkills"`
	MenuCommands       []bool                      `json:"menuCommands"`
	OptAutosave        bool                        `json:"optAutosave"`
	OptDisplayTp       bool                        `json:"optDisplayTp"`
	OptDrawTitle       bool                        `json:"optDrawTitle"`
	OptExtraExp        bool                        `json:"optExtraExp"`
	OptFloorDeath      bool                        `json:"optFloorDeath"`
	OptFollowers       bool                        `json:"optFollowers"`
	OptKeyItemsNumber  bool                        `json:"optKeyItemsNumber"`
	OptMessageSkip     bool                        `json:"optMessageSkip"`
	OptSideView        bool                        `json:"optSideView"`
	OptSlipDeath       bool                        `json:"optSlipDeath"`
	OptSplashScreen    bool                        `json:"optSplashScreen"`
	OptTransparent     bool                        `json:"optTransparent"`
	PartyMembers       []int                       `json:"partyMembers"`
	Ship               RpgSystemVehicle            `json:"ship"`
	SkillTypes         []string                    `json:"skillTypes"`
	Sounds             []RpgSoundEffect            `json:"sounds"`
	StartMapId         int                         `json:"startMapId"`
	StartX             int                         `json:"startX"`
	StartY             int                         `json:"startY"`
	Switches           []string                    `json:"switches"`
	Terms              RpgSystemTerms              `json:"terms"`
	TestBattlers       []RpgSystemTestBattler      `json:"testBattlers"`
	TestTroopId        int                         `json:"testTroopId"`
	TileSize           int                         `json:"tileSize"`
	Title1Name         string                      `json:"title1Name"`
	Title2Name         string                      `json:"title2Name"`
	TitleBgm           RpgSoundEffect              `json:"titleBgm"`
	TitleCommandWindow RpgSystemTitleCommandWindow `json:"titleCommandWindow"`
	Variables          []string                    `json:"variables"`
	VersionId          int                         `json:"versionId"`
	VictoryMe          RpgSoundEffect              `json:"victoryMe"`
	WeaponTypes        []string                    `json:"weaponTypes"`
	WindowTone         [4]int                      `json:"windowTone"`
}
