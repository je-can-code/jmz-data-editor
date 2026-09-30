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
