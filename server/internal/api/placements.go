package api

import (
	"net/http"

	"jmz-data-editor/server/internal/placements"
)

// EnemyPlacements is what GET /api/enemies/{enemyId}/placements answers with.
type EnemyPlacements struct {
	// EnemyId is the enemy asked about, so an answer that arrives late can be told apart from the one
	// for the enemy now on screen.
	EnemyId int `json:"enemyId"`

	// Placements are the map events standing as that enemy, by map id and then event: an empty list,
	// never null, when there are none.
	Placements []placements.Placement `json:"placements"`
}

// EnemyBattlerPages is what GET /api/enemies/{enemyId}/battler-pages answers with.
type EnemyBattlerPages struct {
	// EnemyId is the enemy asked about, so an answer that arrives late can be told apart from the one
	// for the enemy now picked.
	EnemyId int `json:"enemyId"`

	// Battlers are the map events standing as that enemy, by map id and then event, each with the first
	// of its pages naming the enemy: an empty list, never null, when there are none.
	Battlers []placements.BattlerPage `json:"battlers"`
}

// MapArrivals is what GET /api/maps/{mapId}/arrivals answers with.
type MapArrivals struct {
	// MapId is the map asked about, so an answer that arrives late can be told apart from the one for the
	// map now on screen.
	MapId int `json:"mapId"`

	// Arrivals are the transfers landing on that map, by the map they are on and then event: an empty
	// list, never null, when there are none.
	Arrivals []placements.Arrival `json:"arrivals"`
}

// EventNotes is what GET /api/event-notes answers with.
type EventNotes struct {
	// Notes are every event note holding anything, on every map, by map id and then event: an empty list,
	// never null, when there are none.
	Notes []placements.EventNote `json:"notes"`
}

// DoorSprites is what GET /api/door-sprites answers with.
type DoorSprites struct {
	// Sprites are the pictures the project's doors are drawn with, the most used first: an empty list, never null,
	// when there are no doors.
	Sprites []placements.DoorSprite `json:"sprites"`
}

// LoadDoorSprites serves GET /api/door-sprites: every picture a door in the project is drawn with, and how many doors
// use each, the most used first, inside the usual envelope. The map editor offers them when it places a door, starting
// from the one the project's doors use most. The same index as the placements keeps what it read until the change
// stream says a map changed. A map that cannot be read strictly is a 500 whose envelope names the file.
func LoadDoorSprites(index *placements.Index) http.HandlerFunc {
	return func(responseWriter http.ResponseWriter, httpRequest *http.Request) {
		var req RestRequest
		if req.ToRestRequest(responseWriter, httpRequest) != nil {
			return
		}

		found, err := index.DoorSprites(req.ProjectPath)

		var res RestResponse[*DoorSprites]
		if err != nil {
			res.ToRestResponse(responseWriter, req.ProjectPath, err.Error(), nil, http.StatusInternalServerError)
			return
		}

		res.ToRestResponse(responseWriter, req.ProjectPath, "", &DoorSprites{Sprites: found}, http.StatusOK)
	}
}

// LoadEventNotes serves GET /api/event-notes: the note of every map event, on any map, whose note holds
// anything, with its map and event ids, inside the usual envelope. The map editor counts the copies of
// each blueprint from them, since a copy carries its link to the blueprint in its note. The same index
// as the placements keeps what it read until the change stream says a map changed, so asking again after
// every save costs one map's reading. A map that cannot be read strictly is a 500 whose envelope names
// the file.
func LoadEventNotes(index *placements.Index) http.HandlerFunc {
	return func(responseWriter http.ResponseWriter, httpRequest *http.Request) {
		var req RestRequest
		if req.ToRestRequest(responseWriter, httpRequest) != nil {
			return
		}

		found, err := index.EventNotes(req.ProjectPath)

		var res RestResponse[*EventNotes]
		if err != nil {
			res.ToRestResponse(responseWriter, req.ProjectPath, err.Error(), nil, http.StatusInternalServerError)
			return
		}

		res.ToRestResponse(responseWriter, req.ProjectPath, "", &EventNotes{Notes: found}, http.StatusOK)
	}
}

// LoadMapArrivals serves GET /api/maps/{mapId}/arrivals: every Transfer Player command, on any map, that
// names outright a tile of this map as where it lands, with the map it is on, its event and page, and the
// tile, inside the usual envelope. A resize moving this map's tiles leaves each of them pointing at the old
// spot, which the map editor lists before the resize is made. The same index as the placements keeps what
// it read until the change stream says a map changed. A map that cannot be read strictly is a 500 whose
// envelope names the file.
func LoadMapArrivals(index *placements.Index) http.HandlerFunc {
	return func(responseWriter http.ResponseWriter, httpRequest *http.Request) {
		// map ids start at 1; there is no map 0 for anything to land on.
		mapId, ok := mapIdFromPath(responseWriter, httpRequest, 1)
		if ok == false {
			return
		}

		var req RestRequest
		if req.ToRestRequest(responseWriter, httpRequest) != nil {
			return
		}

		found, err := index.Arrivals(req.ProjectPath, mapId)

		var res RestResponse[*MapArrivals]
		if err != nil {
			res.ToRestResponse(responseWriter, req.ProjectPath, err.Error(), nil, http.StatusInternalServerError)
			return
		}

		res.ToRestResponse(responseWriter, req.ProjectPath, "", &MapArrivals{MapId: mapId, Arrivals: found}, http.StatusOK)
	}
}

// LoadEnemyBattlerPages serves GET /api/enemies/{enemyId}/battler-pages: every map event whose comments
// make it a battler of the enemy, with its map, its id and name, and the first of its pages naming the
// enemy, whole, inside the usual envelope. The map editor's battler brush shapes a new battler of the
// enemy after the ones already placed. The same index as the placements answers it. A map that cannot be
// read strictly is a 500 whose envelope names the file.
func LoadEnemyBattlerPages(index *placements.Index) http.HandlerFunc {
	return func(responseWriter http.ResponseWriter, httpRequest *http.Request) {
		// enemy ids start at 1, as the rows of every database table do.
		enemyId, ok := idFromPath(responseWriter, httpRequest, "enemyId", 1)
		if ok == false {
			return
		}

		var req RestRequest
		if req.ToRestRequest(responseWriter, httpRequest) != nil {
			return
		}

		found, err := index.BattlerPages(req.ProjectPath, enemyId)

		var res RestResponse[*EnemyBattlerPages]
		if err != nil {
			res.ToRestResponse(responseWriter, req.ProjectPath, err.Error(), nil, http.StatusInternalServerError)
			return
		}

		res.ToRestResponse(responseWriter, req.ProjectPath, "", &EnemyBattlerPages{EnemyId: enemyId, Battlers: found}, http.StatusOK)
	}
}

// LoadEnemyPlacements serves GET /api/enemies/{enemyId}/placements: every map event whose comments make
// it a battler of the enemy, with its map's name, its id, name and position, and the pages naming the
// enemy, inside the usual envelope. The index keeps what it read until the change stream says a map
// changed, so asking again each time the board shows another enemy costs next to nothing. A map that
// cannot be read strictly is a 500 whose envelope names the file.
func LoadEnemyPlacements(index *placements.Index) http.HandlerFunc {
	return func(responseWriter http.ResponseWriter, httpRequest *http.Request) {
		// enemy ids start at 1, as the rows of every database table do.
		enemyId, ok := idFromPath(responseWriter, httpRequest, "enemyId", 1)
		if ok == false {
			return
		}

		var req RestRequest
		if req.ToRestRequest(responseWriter, httpRequest) != nil {
			return
		}

		found, err := index.Placements(req.ProjectPath, enemyId)

		var res RestResponse[*EnemyPlacements]
		if err != nil {
			res.ToRestResponse(responseWriter, req.ProjectPath, err.Error(), nil, http.StatusInternalServerError)
			return
		}

		res.ToRestResponse(responseWriter, req.ProjectPath, "", &EnemyPlacements{EnemyId: enemyId, Placements: found}, http.StatusOK)
	}
}
