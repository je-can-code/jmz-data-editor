package api

import (
	"net/http"
	"os"
)

type HealthData struct {
	Ok            bool   `json:"ok"`
	ProjectRoot   string `json:"projectRoot,omitempty"`
	ProjectRootOk bool   `json:"projectRootOk"`
}

// Health returns a small JSON payload so the UI can quickly verify the API is reachable.
// It also reports whether JMZ_PROJECT_ROOT is set.
func Health(responseWriter http.ResponseWriter, httpRequest *http.Request) {
	path := httpRequest.URL.Path
	projectRoot := os.Getenv("JMZ_PROJECT_ROOT")
	rootOk := projectRoot != ""

	var res RestResponse[HealthData]
	res.ToRestResponse(
		responseWriter,
		path,
		"",
		HealthData{
			Ok:            true,
			ProjectRoot:   projectRoot,
			ProjectRootOk: rootOk,
		},
		http.StatusOK,
	)
}

