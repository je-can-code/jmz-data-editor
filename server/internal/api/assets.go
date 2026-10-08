package api

import (
	"errors"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// imageFolders are the folders under img/ that RPG Maker MZ's ImageManager loads from, and weather,
// where J-Weather's ImageManager.loadWeather finds the pictures its particles are drawn with.
var imageFolders = map[string]bool{
	"animations":   true,
	"battlebacks1": true,
	"battlebacks2": true,
	"characters":   true,
	"enemies":      true,
	"faces":        true,
	"parallaxes":   true,
	"pictures":     true,
	"sv_actors":    true,
	"sv_enemies":   true,
	"system":       true,
	"tilesets":     true,
	"titles1":      true,
	"titles2":      true,
	"weather":      true,
}

// audioFolders are the folders under audio/ that RPG Maker MZ's AudioManager plays from.
var audioFolders = map[string]bool{
	"bgm": true,
	"bgs": true,
	"me":  true,
	"se":  true,
}

// LoadImage serves GET /api/img/{folder}/{name}: img/{folder}/{name}.png, where the folder is one of
// MZ's image folders and the name holds no path separators.
func LoadImage(responseWriter http.ResponseWriter, httpRequest *http.Request) {
	serveAsset(responseWriter, httpRequest, "img", imageFolders, ".png", "image/png")
}

// ListImages serves GET /api/img/{folder}: the names of the images in img/{folder}, without .png and
// sorted, for pickers such as the face picker. It lists only what LoadImage would serve: plain .png
// files whose names are safe, never a folder or a link. A folder the project does not have lists
// nothing, since a young project may not have made it yet. An empty list leaves "data" out of the
// envelope, as every empty answer does.
func ListImages(responseWriter http.ResponseWriter, httpRequest *http.Request) {
	var req RestRequest
	if req.ToRestRequest(responseWriter, httpRequest) != nil {
		return
	}

	folder := httpRequest.PathValue("folder")
	if imageFolders[folder] == false {
		http.Error(responseWriter, "folder must be one of: "+strings.Join(sortedKeys(imageFolders), ", "), http.StatusBadRequest)
		return
	}

	names, err := listAssetNames(filepath.Join(req.ProjectPath, "img", folder), ".png")
	statusCode := http.StatusOK
	errMsg := ""
	if err != nil {
		statusCode = http.StatusInternalServerError
		errMsg = err.Error()
	}

	var res RestResponse[[]string]
	res.ToRestResponse(responseWriter, req.ProjectPath, errMsg, names, statusCode)
}

// listAssetNames lists the plain files in a folder with an extension, by name without it, sorted. A
// missing folder lists nothing.
func listAssetNames(folder string, extension string) ([]string, error) {
	entries, err := os.ReadDir(folder)
	if errors.Is(err, fs.ErrNotExist) {
		return []string{}, nil
	}
	if err != nil {
		return nil, err
	}

	names := []string{}
	for _, entry := range entries {
		name, isAsset := strings.CutSuffix(entry.Name(), extension)
		if isAsset && entry.Type().IsRegular() && IsSafeName(name) {
			names = append(names, name)
		}
	}
	sort.Strings(names)

	return names, nil
}

// LoadAudio serves GET /api/audio/{folder}/{name}: audio/{folder}/{name}.ogg, where the folder is one
// of bgm, bgs, me and se.
func LoadAudio(responseWriter http.ResponseWriter, httpRequest *http.Request) {
	serveAsset(responseWriter, httpRequest, "audio", audioFolders, ".ogg", "audio/ogg")
}

// LoadPluginSource serves GET /api/plugin-source/{path...}: js/plugins/{path}.js as text. The path
// may name subfolders, as plugins.js does ("others/PluginCommonBase"), but can never leave
// js/plugins.
func LoadPluginSource(responseWriter http.ResponseWriter, httpRequest *http.Request) {
	root, pathErr := GetProjectPath()
	if pathErr != nil {
		http.Error(responseWriter, pathErr.Error(), http.StatusBadRequest)
		return
	}

	pluginPath := httpRequest.PathValue("path")
	if IsSafeRelativePath(pluginPath) == false {
		http.Error(responseWriter, "path must name a plugin inside js/plugins", http.StatusBadRequest)
		return
	}

	serveFile(responseWriter, httpRequest, filepath.Join(root, "js", "plugins"), pluginPath+".js", "application/javascript")
}

// serveAsset answers one asset request: the folder must be on the allowed list and the name a plain
// file name, and the file is then served from inside that folder.
func serveAsset(responseWriter http.ResponseWriter, httpRequest *http.Request, base string, folders map[string]bool, extension string, contentType string) {
	root, pathErr := GetProjectPath()
	if pathErr != nil {
		http.Error(responseWriter, pathErr.Error(), http.StatusBadRequest)
		return
	}

	folder := httpRequest.PathValue("folder")
	if folders[folder] == false {
		http.Error(responseWriter, "folder must be one of: "+strings.Join(sortedKeys(folders), ", "), http.StatusBadRequest)
		return
	}

	name := httpRequest.PathValue("name")
	if IsSafeName(name) == false {
		http.Error(responseWriter, "name must be a file name without a folder", http.StatusBadRequest)
		return
	}

	serveFile(responseWriter, httpRequest, filepath.Join(root, base, folder), name+extension, contentType)
}

// serveFile serves relativePath from inside folder and nowhere else.
//
// The file is opened through an os.Root on the folder, which refuses any path that would resolve
// outside it, symbolic links included. The name has already been checked by the caller; this is the
// second lock on the same door, so a gap in the first cannot become a way out of the project.
// http.ServeContent answers range requests, which is how a browser seeks and streams audio.
func serveFile(responseWriter http.ResponseWriter, httpRequest *http.Request, folder string, relativePath string, contentType string) {
	folderRoot, err := os.OpenRoot(folder)
	if err != nil {
		answerOpenError(responseWriter, err)
		return
	}
	defer folderRoot.Close()

	file, err := folderRoot.Open(filepath.FromSlash(relativePath))
	if err != nil {
		answerOpenError(responseWriter, err)
		return
	}
	defer file.Close()

	info, err := file.Stat()
	if err != nil || info.Mode().IsRegular() == false {
		http.Error(responseWriter, "not found", http.StatusNotFound)
		return
	}

	// revalidate on every use, so an image repainted outside the editor is never shown stale; an
	// unchanged file still costs only a 304.
	responseWriter.Header().Set("Content-Type", contentType)
	responseWriter.Header().Set("Cache-Control", "no-cache")
	http.ServeContent(responseWriter, httpRequest, info.Name(), info.ModTime(), file)
}

// answerOpenError turns a failure to open an asset into its answer: 404 when it does not exist, 500
// for anything else, such as a path the folder's root refused to follow.
func answerOpenError(responseWriter http.ResponseWriter, err error) {
	if errors.Is(err, fs.ErrNotExist) {
		http.Error(responseWriter, "not found", http.StatusNotFound)
		return
	}

	http.Error(responseWriter, err.Error(), http.StatusInternalServerError)
}

// IsSafeName reports whether name is a plain file name that stays inside the folder it is joined to:
// not empty, not made only of dots, and holding no path separator of either platform, no drive or
// stream colon, and no control character. Encoded forms such as %2F arrive here already decoded, so
// this is where they are caught.
func IsSafeName(name string) bool {
	if name == "" || strings.Trim(name, ".") == "" {
		return false
	}

	for _, character := range name {
		if character < 0x20 || character == 0x7f || strings.ContainsRune(`/\:`, character) {
			return false
		}
	}

	return filepath.IsLocal(name)
}

// IsSafeRelativePath reports whether path is a forward-slash path of one or more safe names (see
// IsSafeName): subfolders are allowed, but no empty segment, no dot segment, no leading slash, and so
// nothing that could climb out of the folder it is joined to.
func IsSafeRelativePath(path string) bool {
	if path == "" {
		return false
	}

	for _, segment := range strings.Split(path, "/") {
		if IsSafeName(segment) == false {
			return false
		}
	}

	return filepath.IsLocal(filepath.FromSlash(path))
}

// sortedKeys lists a set's members alphabetically, for error messages that read the same every time.
func sortedKeys(set map[string]bool) []string {
	keys := make([]string, 0, len(set))
	for key := range set {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	return keys
}
