package api

import (
	"net/http"

	"jmz-data-editor/server/internal/newgame"
)

// LoadNewGame serves GET /api/new-game: what a new game starts with, which is the party it seats, inside
// the usual envelope. The map editor shows each event's page as a fresh save would, and a page can wait
// for an actor in the party; it asks for the party alone rather than whole tables, which run to
// megabytes. A file it reads that is not JSON is a 500 whose envelope names the file.
func LoadNewGame(responseWriter http.ResponseWriter, httpRequest *http.Request) {
	var req RestRequest
	if req.ToRestRequest(responseWriter, httpRequest) != nil {
		return
	}

	newGame, err := newgame.Read(req.ProjectPath)

	var res RestResponse[*newgame.NewGame]
	if err != nil {
		res.ToRestResponse(responseWriter, req.ProjectPath, err.Error(), nil, http.StatusInternalServerError)
		return
	}

	res.ToRestResponse(responseWriter, req.ProjectPath, "", newGame, http.StatusOK)
}
