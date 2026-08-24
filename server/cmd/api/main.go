package main

import (
	"fmt"
	"jmz-data-editor/server/internal/api"
	"jmz-data-editor/server/internal/middleware"
	"jmz-data-editor/server/internal/models/db"
	"jmz-data-editor/server/internal/models/plugins"
	"net/http"
)

func main() {
	mux := http.NewServeMux()

	//region health
	mux.HandleFunc("GET /api/health", api.Health)
	//endregion health

	//region database endpoints
	mux.HandleFunc("GET /api/actors", api.LoadAll[*db.RpgActor]("data/Actors.json"))
	mux.HandleFunc("POST /api/actors", api.SaveAll[*db.RpgActor]("data/Actors.json"))

	mux.HandleFunc("GET /api/animations", api.LoadAll[*db.RpgAnimation]("data/Animations.json"))
	mux.HandleFunc("POST /api/animations", api.SaveAll[*db.RpgAnimation]("data/Animations.json"))

	mux.HandleFunc("GET /api/armors", api.LoadAll[*db.RpgArmor]("data/Armors.json"))
	mux.HandleFunc("POST /api/armors", api.SaveAll[*db.RpgArmor]("data/Armors.json"))

	mux.HandleFunc("GET /api/classes", api.LoadAll[*db.RpgClass]("data/Classes.json"))
	mux.HandleFunc("POST /api/classes", api.SaveAll[*db.RpgClass]("data/Classes.json"))

	mux.HandleFunc("GET /api/common-events", api.LoadAll[*db.RpgCommonEvent]("data/CommonEvents.json"))
	mux.HandleFunc("POST /api/common-events", api.SaveAll[*db.RpgCommonEvent]("data/CommonEvents.json"))

	mux.HandleFunc("GET /api/enemies", api.LoadAll[*db.RpgEnemy]("data/Enemies.json"))
	mux.HandleFunc("POST /api/enemies", api.SaveAll[*db.RpgEnemy]("data/Enemies.json"))

	mux.HandleFunc("GET /api/items", api.LoadAll[*db.RpgItem]("data/Items.json"))
	mux.HandleFunc("POST /api/items", api.SaveAll[*db.RpgItem]("data/Items.json"))

	mux.HandleFunc("GET /api/skills", api.LoadAll[*db.RpgSkill]("data/Skills.json"))
	mux.HandleFunc("POST /api/skills", api.SaveAll[*db.RpgSkill]("data/Skills.json"))

	mux.HandleFunc("GET /api/states", api.LoadAll[*db.RpgState]("data/States.json"))
	mux.HandleFunc("POST /api/states", api.SaveAll[*db.RpgState]("data/States.json"))

	mux.HandleFunc("GET /api/weapons", api.LoadAll[*db.RpgWeapon]("data/Weapons.json"))
	mux.HandleFunc("POST /api/weapons", api.SaveAll[*db.RpgWeapon]("data/Weapons.json"))

	mux.HandleFunc("GET /api/system", api.Load[*db.RpgSystem]("data/System.json"))
	mux.HandleFunc("POST /api/system", api.Save[*db.RpgSystem]("data/System.json"))
	//endregion database endpoints

	//region project assets
	mux.HandleFunc("GET /api/maps/{mapId}", api.LoadMap)
	mux.HandleFunc("GET /api/iconset", api.LoadIconset)
	mux.HandleFunc("GET /api/plugin-metadata", api.LoadPluginMetadata)
	//endregion project assets

	//region plugin config endpoints
	mux.HandleFunc("GET /api/config/crafting", api.Load[plugins.CraftingConfiguration]("data/config.crafting.json"))
	mux.HandleFunc("POST /api/config/crafting", api.Save[plugins.CraftingConfiguration]("data/config.crafting.json"))

	mux.HandleFunc("GET /api/config/proficiency", api.Load[plugins.ProficiencyConfiguration]("data/config.proficiency.json"))
	mux.HandleFunc("POST /api/config/proficiency", api.Save[plugins.ProficiencyConfiguration]("data/config.proficiency.json"))

	mux.HandleFunc("GET /api/config/quest", api.Load[plugins.QuestConfiguration]("data/config.quest.json"))
	mux.HandleFunc("POST /api/config/quest", api.Save[plugins.QuestConfiguration]("data/config.quest.json"))

	mux.HandleFunc("GET /api/config/sdp", api.Load[plugins.SdpConfiguration]("data/config.sdp.json"))
	mux.HandleFunc("POST /api/config/sdp", api.Save[plugins.SdpConfiguration]("data/config.sdp.json"))

	mux.HandleFunc("GET /api/config/jabs", api.Load[plugins.JabsConfiguration]("data/config.jabs.json"))
	mux.HandleFunc("POST /api/config/jabs", api.Save[plugins.JabsConfiguration]("data/config.jabs.json"))

	mux.HandleFunc("GET /api/config/level", api.Load[plugins.LevelConfiguration]("data/config.level.json"))
	mux.HandleFunc("POST /api/config/level", api.Save[plugins.LevelConfiguration]("data/config.level.json"))

	mux.HandleFunc("GET /api/config/difficulty", api.Load[plugins.DifficultyConfiguration]("data/config.difficulty.json"))
	mux.HandleFunc("POST /api/config/difficulty", api.Save[plugins.DifficultyConfiguration]("data/config.difficulty.json"))
	//endregion plugin config endpoints

	fmt.Println("Server running on http://localhost:8080")
	err := http.ListenAndServe("127.0.0.1:8080", middleware.CORS(mux))
	if err != nil {
		panic(err)
	}
}
