package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"path/filepath"
	"strconv"

	"jmz-data-editor/server/internal/models/db"
	"jmz-data-editor/server/internal/mzjson"
	"jmz-data-editor/server/internal/store"
)

// ClientHeader names the window a write comes from. The change stream hands it back on the change
// the write causes, so the window that saved can recognise its own save and skip it.
const ClientHeader = "X-Jmz-Client"

// maxBodyBytes caps a request body. The largest shipped map is under half a megabyte and the
// tilesets under one; this leaves room for maps far bigger than any the game has.
const maxBodyBytes = 64 << 20

// WriteAnnouncer is told about each write the server is about to make, so that the change the write
// causes can say which client asked for it. The server's change stream (a *watch.Hub) is the one in
// use; the returned function withdraws the announcement when the write fails.
type WriteAnnouncer interface {
	Expect(path string, client string) func()
}

// LoadMapInfos serves GET /api/mapinfos: the map tree, as MapInfos.json stores it (index 0 is null).
func LoadMapInfos(responseWriter http.ResponseWriter, httpRequest *http.Request) {
	loadDocument[[]*db.RpgMapInfo](responseWriter, httpRequest, "data/MapInfos.json")
}

// SaveMapInfos serves PUT /api/mapinfos: the body is the complete map tree.
func SaveMapInfos(announcer WriteAnnouncer) http.HandlerFunc {
	return func(responseWriter http.ResponseWriter, httpRequest *http.Request) {
		saveDocument[[]*db.RpgMapInfo](responseWriter, httpRequest, announcer, "data/MapInfos.json", mzjson.TableLayout)
	}
}

// LoadTilesets serves GET /api/tilesets: every tileset, as Tilesets.json stores them (index 0 is null).
func LoadTilesets(responseWriter http.ResponseWriter, httpRequest *http.Request) {
	loadDocument[[]*db.RpgTileset](responseWriter, httpRequest, "data/Tilesets.json")
}

// SaveTilesets serves PUT /api/tilesets: the body is the complete tileset table.
func SaveTilesets(announcer WriteAnnouncer) http.HandlerFunc {
	return func(responseWriter http.ResponseWriter, httpRequest *http.Request) {
		saveDocument[[]*db.RpgTileset](responseWriter, httpRequest, announcer, "data/Tilesets.json", mzjson.TableLayout)
	}
}

// SaveMap serves PUT /api/maps/{mapId}: the body is a complete map, written to data/Map###.json and
// creating the file when the map is new.
func SaveMap(announcer WriteAnnouncer) http.HandlerFunc {
	return func(responseWriter http.ResponseWriter, httpRequest *http.Request) {
		// map ids start at 1; there is no map 0 for a save to create.
		id, ok := mapIdFromPath(responseWriter, httpRequest, 1)
		if ok == false {
			return
		}

		saveDocument[*db.RpgMap](responseWriter, httpRequest, announcer, mapFileName(id), mzjson.MapLayout)
	}
}

// mapIdFromPath reads the {mapId} path value, answering 400 itself when it is not an integer of at
// least minimum. Being digits only, a valid id can never reach outside data/.
func mapIdFromPath(responseWriter http.ResponseWriter, httpRequest *http.Request, minimum int) (int, bool) {
	raw := httpRequest.PathValue("mapId")
	id, err := strconv.Atoi(raw)
	if err != nil || id < minimum {
		http.Error(responseWriter, fmt.Sprintf("mapId must be an integer of at least %d", minimum), http.StatusBadRequest)
		return 0, false
	}

	return id, true
}

// mapFileName is the project-relative file of a map, padded the way MZ pads it.
func mapFileName(id int) string {
	return fmt.Sprintf("data/Map%03d.json", id)
}

// loadDocument answers with the file at relativePath decoded strictly into T, inside the usual
// envelope. A file that does not exist is a 404 whose envelope says so, rather than a 500, because a
// missing map or document is an ordinary answer, not a server fault.
func loadDocument[T any](responseWriter http.ResponseWriter, httpRequest *http.Request, relativePath string) {
	var req RestRequest
	if req.ToRestRequest(responseWriter, httpRequest) != nil {
		return
	}

	data, readErr := store.Load[T](filepath.Join(req.ProjectPath, filepath.FromSlash(relativePath)))

	// Determine the status code and error message string
	statusCode := http.StatusOK
	errMsg := ""
	if readErr != nil {
		statusCode = http.StatusInternalServerError
		errMsg = readErr.Error()
		if errors.Is(readErr, fs.ErrNotExist) {
			statusCode = http.StatusNotFound
			errMsg = relativePath + " does not exist"
		}
	}

	var res RestResponse[T]
	res.ToRestResponse(responseWriter, req.ProjectPath, errMsg, data, statusCode)
}

// saveDocument decodes the body strictly into T and writes it to relativePath in MZ's layout,
// answering 204 with no body.
//
// Strict for the same reason every write here is: whatever this decodes into is what reaches the
// disk, so a field the model does not declare would be dropped from the file without a word. A 400
// naming the field is the better outcome. The body must also be exactly one JSON value; anything
// after it is refused rather than ignored.
func saveDocument[T any](responseWriter http.ResponseWriter, httpRequest *http.Request, announcer WriteAnnouncer, relativePath string, layout mzjson.Layout) {
	projectPath, pathErr := GetProjectPath()
	if pathErr != nil {
		http.Error(responseWriter, pathErr.Error(), http.StatusBadRequest)
		return
	}

	// decode the body, refusing what the model cannot account for.
	var data T
	decoder := json.NewDecoder(http.MaxBytesReader(responseWriter, httpRequest.Body, maxBodyBytes))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&data); err != nil {
		refuseBody(responseWriter, err)
		return
	}
	if _, err := decoder.Token(); errors.Is(err, io.EOF) == false {
		refuseBody(responseWriter, errors.New("the body must hold exactly one JSON document"))
		return
	}

	// announce the write before making it, so the change it causes can carry the client's name.
	withdraw := announcer.Expect(relativePath, httpRequest.Header.Get(ClientHeader))

	// write it where MZ keeps it, in MZ's layout.
	writeErr := store.SaveInMzLayout(data, filepath.Join(projectPath, filepath.FromSlash(relativePath)), layout)
	if writeErr != nil {
		withdraw()
		var res RestResponse[*T]
		res.ToRestResponse(responseWriter, projectPath, writeErr.Error(), nil, http.StatusInternalServerError)
		return
	}

	responseWriter.WriteHeader(http.StatusNoContent)
}

// refuseBody answers a body that cannot be accepted: 413 when it was too large, 400 otherwise, with
// the decoder's own message, which names any field the model does not declare.
func refuseBody(responseWriter http.ResponseWriter, err error) {
	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) {
		http.Error(responseWriter, err.Error(), http.StatusRequestEntityTooLarge)
		return
	}

	http.Error(responseWriter, err.Error(), http.StatusBadRequest)
}
