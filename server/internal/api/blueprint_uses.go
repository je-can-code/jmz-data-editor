package api

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"path/filepath"

	"jmz-data-editor/server/internal/blueprintuses"
	"jmz-data-editor/server/internal/store"
)

// MergeBlueprintUses serves PUT /api/editor-data/blueprint-uses/maps: the body names some maps'
// placements of blueprints, given whole, and single placements taken out or put in, and they are merged
// into jmz-editor/blueprint-uses.json as it stands on disk at that moment, every map the body does not
// name staying exactly as the file holds it (see blueprintuses.Apply). It answers 204.
//
// The record describes the maps on disk, so the map editor writes a map's part of it only with that
// map's file, and only that part: never another map's placements, saved or not. Two windows saving two
// maps at the same moment therefore both land, since each merge reads the file and writes it back as
// one step, under the lock every write of the editor's own files takes, the whole-document save of the
// editor-data route included.
//
// A body that is not a merge is refused with a 400 naming what is wrong, before anything touches the
// disk. A file that is not a record of placements is never written over (500), and neither is one an
// editor newer than the one asking wrote (409), since a merge could not tell what of it would be lost.
// A record of an older shape is raised to the body's. The write reaches the change stream carrying the
// saving window's id.
func MergeBlueprintUses(announcer WriteAnnouncer) http.HandlerFunc {
	return func(responseWriter http.ResponseWriter, httpRequest *http.Request) {
		projectPath, pathErr := GetProjectPath()
		if pathErr != nil {
			http.Error(responseWriter, pathErr.Error(), http.StatusBadRequest)
			return
		}

		// read and check the merge before anything touches the disk.
		body, err := io.ReadAll(http.MaxBytesReader(responseWriter, httpRequest.Body, maxBodyBytes))
		if err != nil {
			refuseBody(responseWriter, err)
			return
		}
		changes, err := blueprintuses.Parse(body)
		if err != nil {
			refuseBody(responseWriter, err)
			return
		}

		// announce the exact bytes just before they land, so the change they cause carries the client's name.
		withdraw := func() {}
		announce := func(content []byte) {
			withdraw = announcer.Expect(blueprintuses.File, httpRequest.Header.Get(ClientHeader), content)
		}
		merge := func(current []byte) ([]byte, error) {
			return blueprintuses.Apply(current, changes)
		}
		writeErr := store.UpdateFile(filepath.Join(projectPath, filepath.FromSlash(blueprintuses.File)), merge, announce)
		if writeErr == nil {
			responseWriter.WriteHeader(http.StatusNoContent)
			return
		}

		// a write that failed after its announcement takes the announcement back.
		withdraw()
		status := http.StatusInternalServerError
		var newer blueprintuses.NewerRecordError
		if errors.As(writeErr, &newer) {
			status = http.StatusConflict
		}
		var res RestResponse[json.RawMessage]
		res.ToRestResponse(responseWriter, projectPath, writeErr.Error(), nil, status)
	}
}
