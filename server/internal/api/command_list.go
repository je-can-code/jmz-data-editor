package api

import (
	"net/http"

	"jmz-data-editor/server/internal/commandlist"
)

// LoadCommandUsage serves GET /api/command-usage: how many events in the project use each command code
// and each plugin command, inside the usual envelope. The map editor's command search ranks by it. The
// counter keeps each file's counts until the file changes, so asking again costs a look at the data
// folder. A map that is not valid JSON is a 500 whose envelope names the file.
func LoadCommandUsage(counter *commandlist.Counter) http.HandlerFunc {
	return func(responseWriter http.ResponseWriter, httpRequest *http.Request) {
		var req RestRequest
		if req.ToRestRequest(responseWriter, httpRequest) != nil {
			return
		}

		usage, err := counter.Count(req.ProjectPath)

		var res RestResponse[*commandlist.Usage]
		if err != nil {
			res.ToRestResponse(responseWriter, req.ProjectPath, err.Error(), nil, http.StatusInternalServerError)
			return
		}

		res.ToRestResponse(responseWriter, req.ProjectPath, "", usage, http.StatusOK)
	}
}

// LoadDatabaseNames serves GET /api/database-names: the names of the project's switches, variables and
// database rows, each list indexed by id, inside the usual envelope. The command list reads its rows as
// sentences with them, and asks for names alone rather than whole tables, which run to megabytes.
func LoadDatabaseNames(responseWriter http.ResponseWriter, httpRequest *http.Request) {
	var req RestRequest
	if req.ToRestRequest(responseWriter, httpRequest) != nil {
		return
	}

	names, err := commandlist.ReadNames(req.ProjectPath)

	var res RestResponse[*commandlist.Names]
	if err != nil {
		res.ToRestResponse(responseWriter, req.ProjectPath, err.Error(), nil, http.StatusInternalServerError)
		return
	}

	res.ToRestResponse(responseWriter, req.ProjectPath, "", names, http.StatusOK)
}
