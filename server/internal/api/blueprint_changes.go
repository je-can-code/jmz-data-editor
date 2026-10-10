package api

import (
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"

	"jmz-data-editor/server/internal/blueprintwrites"
	"jmz-data-editor/server/internal/store"
)

// blueprintsFile is where the blueprints live inside the project.
const blueprintsFile = store.EditorDataFolder + "/blueprints.json"

// missingMapError is a map file the change reaches that is not there.
type missingMapError struct {
	path string
}

// Error names the missing file.
func (err missingMapError) Error() string {
	return err.path + " does not exist"
}

// WriteBlueprintChanges serves PUT /api/blueprint-changes: one change to a blueprint, made, undone or redone, written in
// one act. The body gives the blueprints' whole document, and, for every map the change reached, the patches its file
// takes (see blueprintwrites). Every map's patches go into its file as it stands at that moment, each checked against
// what the file holds where it lands, and the blueprints are laid out as the editor's own files are; only once every one
// of those has worked out is anything written, every file at once (see store.WriteFilesAtomic), under the locks every
// other write takes, so no save of any of those files lands between the check and the write. It answers 204.
//
// So the blueprint and its copies on disk never part: a map file no longer holding what a patch replaces, changed by MZ
// or by hand since the editor read it, refuses the whole act with a 409 naming it, and nothing is written; a map whose
// file is gone is a 404, and a body that is not a change, or a patch leaving a map that is no whole map, is a 400. With
// "check" set, every patch is tried the same way and nothing is written, which is how an undo learns before it moves
// that the files still hold what it would take back. Every write reaches the change stream carrying the saving window's
// id.
func WriteBlueprintChanges(announcer WriteAnnouncer) http.HandlerFunc {
	return writeChanges(announcer, false)
}

// WriteMapChanges serves PUT /api/map-changes: one change written to several maps' files in one act, made, undone or
// redone, which no save of one map could keep together: a transfer pair, whose two ends stand on two maps. It is the act
// WriteBlueprintChanges writes, naming no blueprints, and a body naming them is refused with a 400: every map's patches go
// into its file as it stands, each checked first, and nothing is written unless every one fits, so the two ends on disk
// never part. A map changed on disk since refuses the whole act with a 409 naming it, and a map whose file is gone is a
// 404. It answers 204.
func WriteMapChanges(announcer WriteAnnouncer) http.HandlerFunc {
	return writeChanges(announcer, true)
}

// writeChanges serves one act (see WriteBlueprintChanges), refusing a body naming the blueprints when it writes maps
// alone.
func writeChanges(announcer WriteAnnouncer, mapsAlone bool) http.HandlerFunc {
	return func(responseWriter http.ResponseWriter, httpRequest *http.Request) {
		projectPath, pathErr := GetProjectPath()
		if pathErr != nil {
			http.Error(responseWriter, pathErr.Error(), http.StatusBadRequest)
			return
		}

		// read and check the act before anything touches the disk.
		body, err := io.ReadAll(http.MaxBytesReader(responseWriter, httpRequest.Body, maxBodyBytes))
		if err != nil {
			refuseBody(responseWriter, err)
			return
		}
		changes, err := blueprintwrites.Parse(body)
		if err != nil {
			refuseBody(responseWriter, err)
			return
		}
		if mapsAlone && changes.Blueprints != nil {
			http.Error(responseWriter, "a change to maps alone names no blueprints", http.StatusBadRequest)
			return
		}

		client := httpRequest.Header.Get(ClientHeader)
		writeErr := store.WithEveryWriteLock(func() error {
			files, prepareErr := prepareBlueprintChanges(projectPath, changes)
			if prepareErr != nil || changes.Check {
				return prepareErr
			}

			// announce the exact bytes of every file just before they land, so each change they cause carries the client.
			withdrawals := []func(){}
			for _, file := range files {
				relative, _ := filepath.Rel(projectPath, file.Path)
				withdrawals = append(withdrawals, announcer.Expect(filepath.ToSlash(relative), client, file.Content))
			}
			if writeErr := store.WriteFilesAtomic(files); writeErr != nil {
				for _, withdraw := range withdrawals {
					withdraw()
				}
				return writeErr
			}

			return nil
		})

		answerBlueprintChanges(responseWriter, projectPath, writeErr)
	}
}

// prepareBlueprintChanges works out every file an act writes, from the files as they stand: each map with its patches
// applied, then the blueprints laid out. The caller holds every write lock.
func prepareBlueprintChanges(projectPath string, changes blueprintwrites.Changes) ([]store.FileWrite, error) {
	files := []store.FileWrite{}
	for _, write := range changes.Maps {
		relative := mapFileName(write.MapID)
		path := filepath.Join(projectPath, filepath.FromSlash(relative))
		current, readErr := os.ReadFile(path)
		if errors.Is(readErr, fs.ErrNotExist) {
			return nil, missingMapError{path: relative}
		}
		if readErr != nil {
			return nil, readErr
		}

		patched, applyErr := blueprintwrites.ApplyToMap(write.MapID, current, write.Patches)
		if applyErr != nil {
			return nil, applyErr
		}
		files = append(files, store.FileWrite{Path: path, Content: patched})
	}

	if changes.Blueprints != nil {
		laid, layErr := blueprintwrites.Blueprints(changes.Blueprints)
		if layErr != nil {
			return nil, layErr
		}
		files = append(files, store.FileWrite{Path: filepath.Join(projectPath, filepath.FromSlash(blueprintsFile)), Content: laid})
	}

	return files, nil
}

// answerBlueprintChanges answers an act by what became of it: 204 once written, or checked; 409 for a map no longer
// holding what the change replaced; 404 for a map that is gone; 400 for a change that would leave a map no whole map;
// and 500 for anything else, each in the envelope with its words.
func answerBlueprintChanges(responseWriter http.ResponseWriter, projectPath string, err error) {
	if err == nil {
		responseWriter.WriteHeader(http.StatusNoContent)
		return
	}

	status := http.StatusInternalServerError
	var mismatch blueprintwrites.MismatchError
	var missing missingMapError
	var refused blueprintwrites.ChangesError
	switch {
	case errors.As(err, &mismatch):
		status = http.StatusConflict
	case errors.As(err, &missing):
		status = http.StatusNotFound
	case errors.As(err, &refused):
		status = http.StatusBadRequest
	}

	var res RestResponse[json.RawMessage]
	res.ToRestResponse(responseWriter, projectPath, err.Error(), nil, status)
}
