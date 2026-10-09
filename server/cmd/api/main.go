package main

import (
	"errors"
	"fmt"
	"jmz-data-editor/server/internal/api"
	"jmz-data-editor/server/internal/commandlist"
	"jmz-data-editor/server/internal/middleware"
	"jmz-data-editor/server/internal/models/db"
	"jmz-data-editor/server/internal/models/plugins"
	"jmz-data-editor/server/internal/placements"
	"jmz-data-editor/server/internal/store"
	"jmz-data-editor/server/internal/watch"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
)

// listenAddress is where the API listens unless told otherwise: the loopback address only, on the port
// the UI expects (nw-app/main.js and the dev scripts both default to http://127.0.0.1:8080).
const listenAddress = "127.0.0.1:8080"

// defaultOrigins are the pages allowed to call the API unless told otherwise: the UI's Vite server on
// its default port, under either name for the loopback address.
var defaultOrigins = []string{"http://127.0.0.1:3000", "http://localhost:3000"}

// serverConfig is where the API listens and which pages may call it. The NW.js shell and the dev runner
// pass both in, from the same --api-base and --ui-url that tell the UI where everything is, so a UI
// moved to another port is allowed and nothing else is.
type serverConfig struct {
	// address is the host and port to listen on, always a loopback name.
	address string

	// origins are the page origins allowed to call the API from a browser, compared exactly.
	origins []string
}

// configFrom reads the server's configuration: JMZ_API_ADDRESS, the host and port to listen on, and
// JMZ_UI_ORIGINS, the comma-separated page origins allowed to call it. Either one unset keeps today's
// default. The address must be a loopback name, because the API reads and writes the game's files and
// must never be reachable from another machine.
func configFrom(getenv func(string) string) (serverConfig, error) {
	address := strings.TrimSpace(getenv("JMZ_API_ADDRESS"))
	if address == "" {
		address = listenAddress
	}

	host, port, err := net.SplitHostPort(address)
	if err != nil || port == "" {
		return serverConfig{}, fmt.Errorf("JMZ_API_ADDRESS must be host:port, not %q", address)
	}
	if host != "127.0.0.1" && strings.EqualFold(host, "localhost") == false {
		return serverConfig{}, fmt.Errorf("JMZ_API_ADDRESS must use 127.0.0.1 or localhost, not %q", host)
	}

	origins := []string{}
	for _, origin := range strings.Split(getenv("JMZ_UI_ORIGINS"), ",") {
		origin = strings.TrimRight(strings.TrimSpace(origin), "/")
		if origin == "" {
			continue
		}
		parsed, parseErr := url.Parse(origin)
		if parseErr != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" || parsed.Path != "" {
			return serverConfig{}, errors.New("JMZ_UI_ORIGINS must list origins such as http://127.0.0.1:3000, not " + origin)
		}
		origins = append(origins, origin)
	}
	if len(origins) == 0 {
		origins = defaultOrigins
	}

	return serverConfig{address: address, origins: origins}, nil
}

// policy is who may talk to the API: pages from the configured origins, and requests addressed to the
// API's own address, under either loopback name for its port.
func (config serverConfig) policy() middleware.Policy {
	_, port, _ := net.SplitHostPort(config.address)
	hosts := []string{config.address}
	for _, name := range []string{"127.0.0.1", "localhost"} {
		alias := net.JoinHostPort(name, port)
		if strings.EqualFold(alias, config.address) == false {
			hosts = append(hosts, alias)
		}
	}

	return middleware.Policy{AllowedOrigins: config.origins, AllowedHosts: hosts}
}

func main() {
	config, err := configFrom(os.Getenv)
	if err != nil {
		panic(err)
	}

	// one change stream for the whole server: every window's saves pass through it.
	changes := watch.NewHub("data", store.EditorDataFolder)

	fmt.Printf("Server running on http://%s\n", config.address)
	err = http.ListenAndServe(config.address, routes(changes, config.policy()))
	if err != nil {
		panic(err)
	}
}

// accessPolicy is the policy the server keeps when nothing configures it: pages from the UI's Vite
// server on port 3000 under either loopback name, and requests addressed to the API by either of those
// names on port 8080.
func accessPolicy() middleware.Policy {
	return serverConfig{address: listenAddress, origins: defaultOrigins}.policy()
}

// routes registers every endpoint the API serves, behind the access policy.
func routes(changes *watch.Hub, policy middleware.Policy) http.Handler {
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

	// the map editor draws lights with these defaults; no board edits them, so there is nothing to save.
	mux.HandleFunc("GET /api/config/lighting", api.Load[plugins.LightingConfiguration]("data/config.lighting.json"))

	// the map editor draws the sky at its clock's hour with this curve; it is edited by hand, so it is only read.
	mux.HandleFunc("GET /api/config/lighting-time", api.Load[plugins.LightingTimeConfiguration]("data/config.lighting-time.json"))
	//endregion plugin config endpoints

	//region map editor endpoints
	mux.HandleFunc("PUT /api/maps/{mapId}", api.SaveMap(changes))
	mux.HandleFunc("DELETE /api/maps/{mapId}", api.DeleteMap)
	mux.HandleFunc("GET /api/maps/{mapId}/file", api.LoadMapFile)
	mux.HandleFunc("PUT /api/maps/{mapId}/file", api.RestoreMapFile(changes))

	mux.HandleFunc("GET /api/mapinfos", api.LoadMapInfos)
	mux.HandleFunc("PUT /api/mapinfos", api.SaveMapInfos(changes))

	mux.HandleFunc("GET /api/tilesets", api.LoadTilesets)
	mux.HandleFunc("PUT /api/tilesets", api.SaveTilesets(changes))

	// the common events read through the data editor's GET above; the map editor saves them here.
	mux.HandleFunc("PUT /api/common-events", api.SaveCommonEvents(changes))

	// System.json reads through the data editor's GET above too; the map editor renames switches and
	// variables, and saves them here, in whichever layout the file already has.
	mux.HandleFunc("PUT /api/system", api.SaveSystem(changes))

	mux.HandleFunc("GET /api/img/{folder}", api.ListImages)
	mux.HandleFunc("GET /api/img/{folder}/{name}", api.LoadImage)
	mux.HandleFunc("GET /api/audio/{folder}/{name}", api.LoadAudio)
	mux.HandleFunc("GET /api/plugin-source/{path...}", api.LoadPluginSource)

	mux.HandleFunc("GET /api/editor-data/{key}", api.LoadEditorData)
	mux.HandleFunc("PUT /api/editor-data/{key}", api.SaveEditorData(changes))

	// the record of where blueprints are placed is never written whole: each map's part is merged into the
	// file as it stands, so two windows saving two maps at once both land.
	mux.HandleFunc("PUT /api/editor-data/blueprint-uses/maps", api.MergeBlueprintUses(changes))

	// a change to a blueprint reaches the blueprints and every map holding a copy of it in one act, each map's file
	// taking its patches as it stands, so the blueprint and its copies on disk never part.
	mux.HandleFunc("PUT /api/blueprint-changes", api.WriteBlueprintChanges(changes))

	// the party a new game seats, for showing each event's page as a fresh save would.
	mux.HandleFunc("GET /api/new-game", api.LoadNewGame)

	mux.HandleFunc("GET /api/file-changes", api.StreamFileChanges(changes, api.DefaultStreamTiming))
	//endregion map editor endpoints

	//region cross references
	// the index listens to the change stream from its first answer on, to know which maps to read again. One
	// index answers all three, since all three come from the same reading of every map.
	index := placements.NewIndex(changes)
	mux.HandleFunc("GET /api/enemies/{enemyId}/placements", api.LoadEnemyPlacements(index))
	mux.HandleFunc("GET /api/maps/{mapId}/arrivals", api.LoadMapArrivals(index))
	mux.HandleFunc("GET /api/event-notes", api.LoadEventNotes(index))
	//endregion cross references

	//region command list
	// the counter keeps each file's counts until the file changes on disk.
	mux.HandleFunc("GET /api/command-usage", api.LoadCommandUsage(commandlist.NewCounter()))
	mux.HandleFunc("GET /api/database-names", api.LoadDatabaseNames)
	//endregion command list

	return middleware.CORS(mux, policy)
}
