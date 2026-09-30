package api

import (
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"regexp"

	"jmz-data-editor/server/internal/mzjson"
	"jmz-data-editor/server/internal/store"
)

// editorDataKey is the shape of a document key: lowercase letters, digits and hyphens, which also
// makes it a file name on every platform with nothing in it that could climb out of the folder.
var editorDataKey = regexp.MustCompile(`^[a-z0-9-]+$`)

// LoadEditorData serves GET /api/editor-data/{key}: the editor's own document named key, such as
// its blueprints, tileset marks or saved layouts, inside the usual envelope; 404 when there is none.
func LoadEditorData(responseWriter http.ResponseWriter, httpRequest *http.Request) {
	var req RestRequest
	if req.ToRestRequest(responseWriter, httpRequest) != nil {
		return
	}

	key := httpRequest.PathValue("key")
	if editorDataKey.MatchString(key) == false {
		http.Error(responseWriter, "key must be lowercase letters, digits and hyphens", http.StatusBadRequest)
		return
	}

	relativePath := editorDataFile(key)
	raw, readErr := os.ReadFile(filepath.Join(req.ProjectPath, filepath.FromSlash(relativePath)))

	// Determine the status code and error message string
	var res RestResponse[json.RawMessage]
	switch {
	case errors.Is(readErr, fs.ErrNotExist):
		res.ToRestResponse(responseWriter, req.ProjectPath, relativePath+" does not exist", nil, http.StatusNotFound)
	case readErr != nil:
		res.ToRestResponse(responseWriter, req.ProjectPath, readErr.Error(), nil, http.StatusInternalServerError)
	case json.Valid(raw) == false:
		res.ToRestResponse(responseWriter, req.ProjectPath, relativePath+" is not valid JSON", nil, http.StatusInternalServerError)
	default:
		res.ToRestResponse(responseWriter, req.ProjectPath, "", json.RawMessage(raw), http.StatusOK)
	}
}

// SaveEditorData serves PUT /api/editor-data/{key}: the body is any JSON document, written as the
// editor's document named key, 204 on success.
//
// Nothing but the editor reads these, so there is no model to hold them to; the one check is that the
// body is a single well-formed JSON document. They are written indented, the way JSON.stringify(doc,
// null, 2) writes, so a change to one reads as a small diff in the game's history, and since the
// layout depends only on the content, saving an unchanged document reproduces its file.
func SaveEditorData(announcer WriteAnnouncer) http.HandlerFunc {
	return func(responseWriter http.ResponseWriter, httpRequest *http.Request) {
		projectPath, pathErr := GetProjectPath()
		if pathErr != nil {
			http.Error(responseWriter, pathErr.Error(), http.StatusBadRequest)
			return
		}

		key := httpRequest.PathValue("key")
		if editorDataKey.MatchString(key) == false {
			http.Error(responseWriter, "key must be lowercase letters, digits and hyphens", http.StatusBadRequest)
			return
		}

		// read and check the document before anything touches the disk.
		body, err := io.ReadAll(http.MaxBytesReader(responseWriter, httpRequest.Body, maxBodyBytes))
		if err != nil {
			refuseBody(responseWriter, err)
			return
		}
		document, err := mzjson.Parse(body)
		if err != nil {
			refuseBody(responseWriter, err)
			return
		}
		content, err := mzjson.IndentedLayout(document)
		if err != nil {
			refuseBody(responseWriter, err)
			return
		}

		// the folder appears with the first document saved into it.
		relativePath := editorDataFile(key)
		fullPath := filepath.Join(projectPath, filepath.FromSlash(relativePath))
		withdraw := announcer.Expect(relativePath, httpRequest.Header.Get(ClientHeader))
		writeErr := os.MkdirAll(filepath.Dir(fullPath), 0755)
		if writeErr == nil {
			writeErr = store.WriteFileAtomic(fullPath, content)
		}
		if writeErr != nil {
			withdraw()
			var res RestResponse[json.RawMessage]
			res.ToRestResponse(responseWriter, projectPath, writeErr.Error(), nil, http.StatusInternalServerError)
			return
		}

		responseWriter.WriteHeader(http.StatusNoContent)
	}
}

// editorDataFile is the project-relative file holding the editor's document named key.
func editorDataFile(key string) string {
	return store.EditorDataFolder + "/" + key + ".json"
}
