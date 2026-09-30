package main

import (
	"fmt"
	"jmz-data-editor/server/internal/api"
	"jmz-data-editor/server/internal/middleware"
	"jmz-data-editor/server/internal/models/db"
	"jmz-data-editor/server/internal/models/plugins"
	"jmz-data-editor/server/internal/store"
	"jmz-data-editor/server/internal/watch"
	"net/http"
)

func main() {
	// one change stream for the whole server: every window's saves pass through it.
	changes := watch.NewHub("data", store.EditorDataFolder)

	fmt.Println("Server running on http://localhost:8080")
	err := http.ListenAndServe("127.0.0.1:8080", routes(changes))
	if err != nil {
		panic(err)
	}
}

// routes registers every endpoint the API serves, wrapped in the CORS middleware.
func routes(changes *watch.Hub) http.Handler {
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

	mux.HandleFunc("GET /api/config/motion", api.Load[plugins.MotionConfiguration]("data/config.motion.json"))
	mux.HandleFunc("POST /api/config/motion", api.Save[plugins.MotionConfiguration]("data/config.motion.json"))

	mux.HandleFunc("GET /api/config/weather", api.Load[plugins.WeatherConfiguration]("data/config.weather.json"))
	mux.HandleFunc("POST /api/config/weather", api.Save[plugins.WeatherConfiguration]("data/config.weather.json"))

	mux.HandleFunc("GET /api/config/notetag-lines", api.Load[plugins.NotetagLinesConfiguration]("data/config.notetag-lines.json"))
	mux.HandleFunc("POST /api/config/notetag-lines", api.Save[plugins.NotetagLinesConfiguration]("data/config.notetag-lines.json"))
	//endregion plugin config endpoints

	//region map editor endpoints
	mux.HandleFunc("PUT /api/maps/{mapId}", api.SaveMap(changes))

	mux.HandleFunc("GET /api/mapinfos", api.LoadMapInfos)
	mux.HandleFunc("PUT /api/mapinfos", api.SaveMapInfos(changes))

	mux.HandleFunc("GET /api/tilesets", api.LoadTilesets)
	mux.HandleFunc("PUT /api/tilesets", api.SaveTilesets(changes))

	mux.HandleFunc("GET /api/img/{folder}/{name}", api.LoadImage)
	mux.HandleFunc("GET /api/audio/{folder}/{name}", api.LoadAudio)
	mux.HandleFunc("GET /api/plugin-source/{path...}", api.LoadPluginSource)

	mux.HandleFunc("GET /api/editor-data/{key}", api.LoadEditorData)
	mux.HandleFunc("PUT /api/editor-data/{key}", api.SaveEditorData(changes))

	mux.HandleFunc("GET /api/file-changes", api.StreamFileChanges(changes, api.KeepAliveInterval))
	//endregion map editor endpoints

	return middleware.CORS(mux)
}
