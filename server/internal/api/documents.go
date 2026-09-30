package api

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"reflect"
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

// WriteAnnouncer is told about each write the server is about to make, with the exact bytes it will
// write, so that the change the write causes can say which client asked for it. The server's change
// stream (a *watch.Hub) is the one in use; the returned function withdraws the announcement when the
// write fails.
type WriteAnnouncer interface {
	Expect(path string, client string, content []byte) func()
}

// LoadMapInfos serves GET /api/mapinfos: the map tree, as MapInfos.json stores it (index 0 is null).
func LoadMapInfos(responseWriter http.ResponseWriter, httpRequest *http.Request) {
	loadDocument[[]*db.RpgMapInfo](responseWriter, httpRequest, "data/MapInfos.json")
}

// SaveMapInfos serves PUT /api/mapinfos: the body is the complete map tree.
func SaveMapInfos(announcer WriteAnnouncer) http.HandlerFunc {
	return func(responseWriter http.ResponseWriter, httpRequest *http.Request) {
		saveDocument[[]*db.RpgMapInfo](responseWriter, httpRequest, announcer, "data/MapInfos.json", mzjson.TableLayout, wholeTable[[]*db.RpgMapInfo])
	}
}

// LoadTilesets serves GET /api/tilesets: every tileset, as Tilesets.json stores them (index 0 is null).
func LoadTilesets(responseWriter http.ResponseWriter, httpRequest *http.Request) {
	loadDocument[[]*db.RpgTileset](responseWriter, httpRequest, "data/Tilesets.json")
}

// SaveTilesets serves PUT /api/tilesets: the body is the complete tileset table.
func SaveTilesets(announcer WriteAnnouncer) http.HandlerFunc {
	return func(responseWriter http.ResponseWriter, httpRequest *http.Request) {
		saveDocument[[]*db.RpgTileset](responseWriter, httpRequest, announcer, "data/Tilesets.json", mzjson.TableLayout, wholeTable[[]*db.RpgTileset])
	}
}

// SaveCommonEvents serves PUT /api/common-events: the body is the complete common event table. It is
// the map editor's save, held to the same rules as its maps: strict, written atomically in MZ's own
// layout, and announced on the change stream with the saving window's id, so the window that saved
// knows the change for its own. The data editor keeps its POST route to the same file.
func SaveCommonEvents(announcer WriteAnnouncer) http.HandlerFunc {
	return func(responseWriter http.ResponseWriter, httpRequest *http.Request) {
		saveDocument[[]*db.RpgCommonEvent](responseWriter, httpRequest, announcer, "data/CommonEvents.json", mzjson.TableLayout, wholeTable[[]*db.RpgCommonEvent])
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

		saveDocument[*db.RpgMap](responseWriter, httpRequest, announcer, mapFileName(id), mzjson.MapLayout, wholeObject[*db.RpgMap])
	}
}

// DeleteMap serves DELETE /api/maps/{mapId}: removes data/Map###.json, answering 204 with no body.
//
// A map leaves the project in two writes, its row in MapInfos.json and its file, and the tree must
// never name a map that has no file, since MZ and the game both trust the tree. So a map the tree
// still lists is refused with a 409 and nothing is removed: the editor takes the row out first, then
// the file. A map with no file is a 404, the same answer GET gives it, and a tree that cannot be read
// is a 500, because without it nothing can say the map is safe to remove.
//
// The tree is read and the file removed under the lock every write in MZ's layout takes, so a save of
// the tree that lists the map again, or a save or restore of the map's own file, lands wholly before the
// check or wholly after the removal, never between them. The removal is a single unlink, which no reader
// can ever see half done. It reaches the change stream with no client, even when the request names one:
// the stream credits a change to a save only when the file settles holding the bytes that save announced,
// and a removed file holds nothing. That is the answer every window needs anyway, since any window still
// holding the map must learn its file is gone, and the window that removed it has already let it go.
func DeleteMap(responseWriter http.ResponseWriter, httpRequest *http.Request) {
	// map ids start at 1, and being digits only, a valid id can never name a file outside data/.
	id, ok := mapIdFromPath(responseWriter, httpRequest, 1)
	if ok == false {
		return
	}

	projectPath, pathErr := GetProjectPath()
	if pathErr != nil {
		http.Error(responseWriter, pathErr.Error(), http.StatusBadRequest)
		return
	}

	// the tree is the authority on which maps exist, so it is read before anything is removed.
	relativePath := mapFileName(id)
	removeErr := store.RemoveFile(filepath.Join(projectPath, filepath.FromSlash(relativePath)), func() error {
		infos, readErr := store.Load[[]*db.RpgMapInfo](filepath.Join(projectPath, "data", "MapInfos.json"))
		if readErr != nil {
			return unreadableTreeError{cause: readErr}
		}
		if id < len(infos) && infos[id] != nil {
			return errStillListed
		}

		return nil
	})

	var unreadable unreadableTreeError
	switch {
	case removeErr == nil:
		responseWriter.WriteHeader(http.StatusNoContent)
	case errors.As(removeErr, &unreadable):
		var res RestResponse[*db.RpgMapInfo]
		res.ToRestResponse(responseWriter, projectPath, unreadable.Error(), nil, http.StatusInternalServerError)
	case errors.Is(removeErr, errStillListed):
		http.Error(responseWriter, fmt.Sprintf("map %d is still in the map tree; remove its row from MapInfos.json first", id), http.StatusConflict)
	case errors.Is(removeErr, fs.ErrNotExist):
		http.Error(responseWriter, relativePath+" does not exist", http.StatusNotFound)
	default:
		var res RestResponse[*db.RpgMapInfo]
		res.ToRestResponse(responseWriter, projectPath, removeErr.Error(), nil, http.StatusInternalServerError)
	}
}

// errStillListed is a delete's refusal of a map the tree still lists, whose file must stay.
var errStillListed = errors.New("the map is still in the map tree")

// unreadableTreeError is a map tree a delete could not read, so nothing can say the map is safe to remove.
type unreadableTreeError struct {
	cause error
}

// Error words the failure the way the delete answers it.
func (err unreadableTreeError) Error() string {
	return "the map tree cannot be read: " + err.cause.Error()
}

// LoadMapFile serves GET /api/maps/{mapId}/file: the map's file exactly as it sits on disk, byte for byte and
// with no envelope, the way plugin sources are served. Deleting a map keeps these bytes with the step, so undoing
// the delete can put the very same file back; a map decoded and encoded again would come back in a key order
// and spelling of the server's choosing. A file that does not exist is a 404.
func LoadMapFile(responseWriter http.ResponseWriter, httpRequest *http.Request) {
	id, ok := mapIdFromPath(responseWriter, httpRequest, 1)
	if ok == false {
		return
	}

	projectPath, pathErr := GetProjectPath()
	if pathErr != nil {
		http.Error(responseWriter, pathErr.Error(), http.StatusBadRequest)
		return
	}

	relativePath := mapFileName(id)
	content, readErr := os.ReadFile(filepath.Join(projectPath, filepath.FromSlash(relativePath)))
	if errors.Is(readErr, fs.ErrNotExist) {
		http.Error(responseWriter, relativePath+" does not exist", http.StatusNotFound)
		return
	}
	if readErr != nil {
		http.Error(responseWriter, readErr.Error(), http.StatusInternalServerError)
		return
	}

	responseWriter.Header().Set("Content-Type", "application/json; charset=utf-8")
	responseWriter.WriteHeader(http.StatusOK)
	_, _ = responseWriter.Write(content)
}

// RestoreMapFile serves PUT /api/maps/{mapId}/file: brings a removed map's file back exactly as it was. The body
// is the file's former text, as GET /api/maps/{mapId}/file handed it out; it is held to every check a map save
// is (one JSON document, no key the model cannot account for, none of its keys missing) and then written byte for
// byte, never re-rendered, so a delete that is undone leaves no trace in the game's history. It answers 204.
//
// Only a removed map can be restored: a map whose file exists is refused with a 409, and nothing is written.
func RestoreMapFile(announcer WriteAnnouncer) http.HandlerFunc {
	return func(responseWriter http.ResponseWriter, httpRequest *http.Request) {
		id, ok := mapIdFromPath(responseWriter, httpRequest, 1)
		if ok == false {
			return
		}

		projectPath, pathErr := GetProjectPath()
		if pathErr != nil {
			http.Error(responseWriter, pathErr.Error(), http.StatusBadRequest)
			return
		}

		// the body gets every check a map save gets, before anything touches the disk.
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
		var data db.RpgMap
		decoder := json.NewDecoder(bytes.NewReader(body))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&data); err != nil {
			refuseBody(responseWriter, err)
			return
		}
		if err := wholeObject[*db.RpgMap](document); err != nil {
			refuseBody(responseWriter, err)
			return
		}

		relativePath := mapFileName(id)
		withdraw := func() {}
		announce := func(content []byte) {
			withdraw = announcer.Expect(relativePath, httpRequest.Header.Get(ClientHeader), content)
		}
		writeErr := store.RestoreFile(filepath.Join(projectPath, filepath.FromSlash(relativePath)), body, announce)
		if errors.Is(writeErr, fs.ErrExist) {
			http.Error(responseWriter, relativePath+" already exists; only a removed map can be restored", http.StatusConflict)
			return
		}
		if writeErr != nil {
			withdraw()
			var res RestResponse[*db.RpgMap]
			res.ToRestResponse(responseWriter, projectPath, writeErr.Error(), nil, http.StatusInternalServerError)
			return
		}

		responseWriter.WriteHeader(http.StatusNoContent)
	}
}

// wholeObject checks that a body spells out every key of its model, T.
func wholeObject[T any](document *mzjson.Value) error {
	return mzjson.RequireEveryKey(document, reflect.TypeFor[T]())
}

// wholeTable checks that a body is one of MZ's tables of T's rows: null first, then whole rows.
func wholeTable[T any](document *mzjson.Value) error {
	return mzjson.RequireTable(document, reflect.TypeFor[T]().Elem())
}

// mapIdFromPath reads the {mapId} path value, answering 400 itself when it is not an integer of at
// least minimum. Being digits only, a valid id can never reach outside data/.
func mapIdFromPath(responseWriter http.ResponseWriter, httpRequest *http.Request, minimum int) (int, bool) {
	return idFromPath(responseWriter, httpRequest, "mapId", minimum)
}

// idFromPath reads the path value called name as an id, answering 400 itself when it is not an
// integer of at least minimum.
func idFromPath(responseWriter http.ResponseWriter, httpRequest *http.Request, name string, minimum int) (int, bool) {
	raw := httpRequest.PathValue(name)
	id, err := strconv.Atoi(raw)
	if err != nil || id < minimum {
		http.Error(responseWriter, fmt.Sprintf("%s must be an integer of at least %d", name, minimum), http.StatusBadRequest)
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
// Strict in both directions, because whatever this decodes into is what reaches the disk. A key the
// model does not declare would be dropped from the file without a word; a key the body leaves out,
// or sends as null, would be written as a zero value just as quietly, and a map written without its
// tiles crashes the engine. Either is refused with a 400 naming the key, before anything is written.
// The body must also be exactly one JSON value; anything after it is refused rather than ignored.
func saveDocument[T any](responseWriter http.ResponseWriter, httpRequest *http.Request, announcer WriteAnnouncer, relativePath string, layout mzjson.Layout, whole func(*mzjson.Value) error) {
	projectPath, pathErr := GetProjectPath()
	if pathErr != nil {
		http.Error(responseWriter, pathErr.Error(), http.StatusBadRequest)
		return
	}

	// read the body once, as one JSON document with nothing after it.
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

	// refuse any key the model cannot account for...
	var data T
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&data); err != nil {
		refuseBody(responseWriter, err)
		return
	}

	// ...and any key of the model's the body left out or sent as null.
	if err := whole(document); err != nil {
		refuseBody(responseWriter, err)
		return
	}

	// write it where MZ keeps it, in MZ's layout, announcing the exact bytes just before they land so
	// the change they cause can carry the client's name.
	client := httpRequest.Header.Get(ClientHeader)
	withdraw := func() {}
	announce := func(content []byte) {
		withdraw = announcer.Expect(relativePath, client, content)
	}
	writeErr := store.SaveInMzLayout(data, filepath.Join(projectPath, filepath.FromSlash(relativePath)), layout, announce)
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
