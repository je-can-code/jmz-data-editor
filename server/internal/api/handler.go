package api

import (
	"fmt"
	"jmz-data-editor/server/internal/models/db"
	"jmz-data-editor/server/internal/store"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
)

func Save[T any](filename string) http.HandlerFunc {
	return func(responseWriter http.ResponseWriter, httpRequest *http.Request) {
		// derive the request from the body and query params.
		var req RestRequestSave[*T]
		toRequestError := req.ToRestRequestSave(responseWriter, httpRequest)
		if toRequestError != nil {
			return
		}

		// write the data to disk.
		repo := &store.BaseRepository[*T]{
			ProjectPath: req.ProjectPath,
			FileName:    filename,
		}
		writeErr := repo.Write(req.Data)

		// Determine the status code and error message string
		statusCode := http.StatusOK
		errMsg := ""
		if writeErr != nil {
			statusCode = http.StatusInternalServerError
			errMsg = writeErr.Error()
		}

		// write the response.
		var res RestResponse[*T]
		res.ToRestResponse(responseWriter, req.ProjectPath, errMsg, nil, statusCode)

		// success!
	}
}

func SaveAll[RPG any](filename string) http.HandlerFunc {
	return func(responseWriter http.ResponseWriter, httpRequest *http.Request) {
		// derive the request from the body and query params.
		var req RestRequestSave[[]*RPG]
		toRequestError := req.ToRestRequestSave(responseWriter, httpRequest)
		if toRequestError != nil {
			return
		}

		// write the data to disk.
		repo := &store.BaseRepository[*RPG]{
			ProjectPath: req.ProjectPath,
			FileName:    filename,
		}
		writeErr := repo.WriteAll(req.Data)

		// Determine the status code and error message string
		statusCode := http.StatusOK
		errMsg := ""
		if writeErr != nil {
			statusCode = http.StatusInternalServerError
			errMsg = writeErr.Error()
		}

		// write the response.
		var res RestResponse[[]*RPG]
		res.ToRestResponse(responseWriter, req.ProjectPath, errMsg, nil, statusCode)

		// success!
	}
}

func Load[T any](filename string) http.HandlerFunc {
	return func(responseWriter http.ResponseWriter, httpRequest *http.Request) {
		// derive the request from the query parameters.
		var req RestRequest
		toRequestError := req.ToRestRequest(responseWriter, httpRequest)
		if toRequestError != nil {
			return
		}

		repo := &store.BaseRepository[*T]{
			ProjectPath: req.ProjectPath,
			FileName:    filename,
		}
		data, readErr := repo.Read()

		// Determine the status code and error message string
		statusCode := http.StatusOK
		errMsg := ""
		if readErr != nil {
			statusCode = http.StatusInternalServerError
			errMsg = readErr.Error()
		}

		// write the response.
		var res RestResponse[*T]
		res.ToRestResponse(responseWriter, req.ProjectPath, errMsg, data, statusCode)

		// success!
	}
}

func LoadAll[RPG any](filename string) http.HandlerFunc {
	return func(responseWriter http.ResponseWriter, httpRequest *http.Request) {
		// derive the request from the query parameters.
		var req RestRequest
		toRequestError := req.ToRestRequest(responseWriter, httpRequest)
		if toRequestError != nil {
			return
		}

		repo := &store.BaseRepository[*RPG]{
			ProjectPath: req.ProjectPath,
			FileName:    filename,
		}
		data, readErr := repo.ReadAll()

		// Determine the status code and error message string
		statusCode := http.StatusOK
		errMsg := ""
		if readErr != nil {
			statusCode = http.StatusInternalServerError
			errMsg = readErr.Error()
		}

		// write the response.
		var res RestResponse[[]*RPG]
		res.ToRestResponse(responseWriter, req.ProjectPath, errMsg, data, statusCode)

		// success!
	}
}

// LoadMap serves GET /api/maps/{mapId} by delegating to the same JSON read path as Load, after MZ padding rules.
func LoadMap(responseWriter http.ResponseWriter, httpRequest *http.Request) {
	raw := httpRequest.PathValue("mapId")
	id, err := strconv.Atoi(raw)
	if err != nil || id < 0 {
		http.Error(responseWriter, "mapId must be a non-negative integer", http.StatusBadRequest)
		return
	}

	filename := fmt.Sprintf("data/Map%03d.json", id)
	Load[db.RpgMap](filename)(responseWriter, httpRequest)
}

func LoadIconset(responseWriter http.ResponseWriter, _ *http.Request) {
	root, pathErr := GetProjectPath()
	if pathErr != nil {
		http.Error(responseWriter, pathErr.Error(), http.StatusBadRequest)
		return
	}

	full := filepath.Join(root, "img", "system", "IconSet.png")
	data, err := os.ReadFile(full)
	if err != nil {
		http.Error(responseWriter, "icon set not found", http.StatusNotFound)
		return
	}
	responseWriter.Header().Set("Content-Type", "image/png")
	responseWriter.Header().Set("Content-Length", strconv.Itoa(len(data)))
	responseWriter.WriteHeader(http.StatusOK)
	_, _ = responseWriter.Write(data)
}

func LoadPluginMetadata(responseWriter http.ResponseWriter, _ *http.Request) {
	root, pathErr := GetProjectPath()
	if pathErr != nil {
		http.Error(responseWriter, pathErr.Error(), http.StatusBadRequest)
		return
	}

	full := filepath.Join(root, "js", "plugins.js")
	data, err := os.ReadFile(full)
	if err != nil {
		http.Error(responseWriter, "plugins.js not found", http.StatusNotFound)
		return
	}
	responseWriter.Header().Set("Content-Type", "application/javascript")
	responseWriter.Header().Set("Content-Length", strconv.Itoa(len(data)))
	responseWriter.WriteHeader(http.StatusOK)
	_, _ = responseWriter.Write(data)
}
