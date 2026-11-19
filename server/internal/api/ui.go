package api

import (
	"net/http"
	"path"
	"strings"
)

// ServeUI serves the UI's built pages from folder, for a server that is also the UI's own, as the API
// is in the bundled editor. It answers GET and HEAD for the plain files inside the folder and nothing
// more: the site's root is the data editor's index.html, a folder is never listed, and a path that
// would leave the folder, encoded or not, is not found. Each file's type comes from its extension.
func ServeUI(folder string) http.HandlerFunc {
	return func(responseWriter http.ResponseWriter, httpRequest *http.Request) {
		// the pages are only ever read.
		if httpRequest.Method != http.MethodGet && httpRequest.Method != http.MethodHead {
			responseWriter.Header().Set("Allow", "GET, HEAD")
			http.Error(responseWriter, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// the site's root is the data editor; every other page, map.html among them, is asked for by name.
		relativePath := strings.TrimPrefix(httpRequest.URL.Path, "/")
		if relativePath == "" {
			relativePath = "index.html"
		}

		// the path arrives decoded, so an encoded slash or dot segment shows up here as the climb it is.
		if IsSafeRelativePath(relativePath) == false {
			http.Error(responseWriter, "not found", http.StatusNotFound)
			return
		}

		file, info, err := openPlainFile(folder, relativePath)
		if err != nil {
			answerOpenError(responseWriter, err)
			return
		}
		defer file.Close()

		responseWriter.Header().Set("Cache-Control", uiCacheControl(relativePath))
		http.ServeContent(responseWriter, httpRequest, info.Name(), info.ModTime(), file)
	}
}

// uiCacheControl says how long a browser may keep one of the UI's files. Vite writes what it builds
// straight into assets/, each file named after a hash of its content, so a changed file always arrives
// under a new name and the old one may be kept for good. Everything else is asked about again on every
// use, so an update is never masked by a copy the browser kept: the pages above all, and the files
// public/ copies in under the same names every build, one folder down in assets/ included.
func uiCacheControl(relativePath string) string {
	if path.Dir(relativePath) == "assets" {
		return "public, max-age=31536000, immutable"
	}

	return "no-cache"
}
