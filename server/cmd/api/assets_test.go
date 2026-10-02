package main

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"testing"
)

// The asset routes owe the editor the project's images, sounds and plugin sources, and nothing else
// on the machine. Go's router decodes %2F, %5C, %2E and %00 inside a path segment before a handler
// sees it, so an encoded traversal arrives looking like a file name; each case below sends one the
// way a browser would and expects it refused without a byte of the file it aimed at. A plain `..`
// never reaches a handler at all, because the router redirects to the cleaned path first.

// TestGetImageServesTheImage covers an ordinary image, and a name with the punctuation character
// sheets really use.
func TestGetImageServesTheImage(t *testing.T) {
	cases := []struct {
		target  string
		content string
	}{
		{target: "/api/img/characters/Actor1", content: "\x89PNG-actor"},
		{target: "/api/img/faces/%21%24Door%20%28open%29", content: "\x89PNG-door"},
	}

	for _, testCase := range cases {
		t.Run(testCase.target, func(t *testing.T) {
			// Arrange.
			current := newProject(t)

			// Act.
			response := current.call(t, http.MethodGet, testCase.target, "")

			// Assert.
			assertStatus(t, response, http.StatusOK)
			if response.Header().Get("Content-Type") != "image/png" || response.Body.String() != testCase.content {
				t.Errorf("served %q as %q", response.Body.String(), response.Header().Get("Content-Type"))
			}
		})
	}
}

// TestGetAudioServesTheSoundInRanges covers a sound, including the range request a browser makes to
// seek within it.
func TestGetAudioServesTheSoundInRanges(t *testing.T) {
	// Arrange.
	current := newProject(t)

	// Act.
	whole := current.call(t, http.MethodGet, "/api/audio/se/Cursor", "")
	part := current.call(t, http.MethodGet, "/api/audio/se/Cursor", "", "Range", "bytes=0-3")

	// Assert.
	assertStatus(t, whole, http.StatusOK)
	if whole.Header().Get("Content-Type") != "audio/ogg" || whole.Body.String() != "OggS-cursor-sound" {
		t.Errorf("served %q as %q", whole.Body.String(), whole.Header().Get("Content-Type"))
	}
	assertStatus(t, part, http.StatusPartialContent)
	if part.Body.String() != "OggS" {
		t.Errorf("a range served %q", part.Body.String())
	}
}

// TestGetPluginSourceServesTheScript covers a plugin at the top of js/plugins and one in a subfolder,
// named the way plugins.js names it.
func TestGetPluginSourceServesTheScript(t *testing.T) {
	cases := []struct {
		target  string
		content string
	}{
		{target: "/api/plugin-source/Hello", content: "console.log('hello');"},
		{target: "/api/plugin-source/others/PluginCommonBase", content: "// common base"},
	}

	for _, testCase := range cases {
		t.Run(testCase.target, func(t *testing.T) {
			// Arrange.
			current := newProject(t)

			// Act.
			response := current.call(t, http.MethodGet, testCase.target, "")

			// Assert.
			assertStatus(t, response, http.StatusOK)
			if response.Header().Get("Content-Type") != "application/javascript" || response.Body.String() != testCase.content {
				t.Errorf("served %q as %q", response.Body.String(), response.Header().Get("Content-Type"))
			}
		})
	}
}

// TestAssetRoutesAnswer404ForMissingFiles covers each route asked for a file that is not there.
func TestAssetRoutesAnswer404ForMissingFiles(t *testing.T) {
	targets := []string{
		"/api/img/characters/Nobody",
		"/api/img/pictures/Anything",
		"/api/audio/bgm/Silence",
		"/api/plugin-source/Missing",
		"/api/plugin-source/others/Missing",
	}

	for _, target := range targets {
		t.Run(target, func(t *testing.T) {
			// Arrange.
			current := newProject(t)

			// Act.
			response := current.call(t, http.MethodGet, target, "")

			// Assert.
			assertStatus(t, response, http.StatusNotFound)
		})
	}
}

// TestAssetRoutesRefuseTraversal sends every escape a browser could encode, at every route.
func TestAssetRoutesRefuseTraversal(t *testing.T) {
	cases := []struct {
		name     string
		target   string
		expected int
	}{
		{name: "an image folder off the list", target: "/api/img/hud/Gauge", expected: http.StatusBadRequest},
		{name: "an image folder that climbs", target: "/api/img/%2E%2E/secret", expected: http.StatusBadRequest},
		{name: "an image name with encoded slashes", target: "/api/img/faces/..%2F..%2Fdata%2FSystem", expected: http.StatusBadRequest},
		{name: "an image name that is dots", target: "/api/img/faces/%2E%2E", expected: http.StatusBadRequest},
		{name: "an image name with backslashes", target: "/api/img/faces/..%5C..%5Csecret", expected: http.StatusBadRequest},
		{name: "an image name with a null", target: "/api/img/faces/Actor1%00", expected: http.StatusBadRequest},
		{name: "an image name with a drive colon", target: "/api/img/faces/C:secret", expected: http.StatusBadRequest},
		{name: "an image traversal the router cleans", target: "/api/img/faces/../../secret.txt", expected: http.StatusTemporaryRedirect},
		{name: "an audio folder off the list", target: "/api/audio/img/Cursor", expected: http.StatusBadRequest},
		{name: "an audio name with encoded slashes", target: "/api/audio/se/..%2F..%2F..%2Fsecret", expected: http.StatusBadRequest},
		{name: "a plugin path with encoded slashes", target: "/api/plugin-source/..%2F..%2Fdata%2FSystem", expected: http.StatusBadRequest},
		{name: "a plugin path with dot segments", target: "/api/plugin-source/others/%2E%2E/%2E%2E/%2E%2E/secret", expected: http.StatusBadRequest},
		{name: "a plugin path that is absolute", target: "/api/plugin-source/%2Fetc%2Fpasswd", expected: http.StatusBadRequest},
		{name: "a plugin path with backslashes", target: "/api/plugin-source/others%5C..%5C..%5Csecret", expected: http.StatusBadRequest},
		{name: "a plugin path with a null", target: "/api/plugin-source/Hello%00", expected: http.StatusBadRequest},
		{name: "a plugin traversal the router cleans", target: "/api/plugin-source/a/../../../secret", expected: http.StatusTemporaryRedirect},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			// Arrange.
			current := newProject(t)

			// Act.
			response := current.call(t, http.MethodGet, testCase.target, "")

			// Assert.
			assertRefused(t, response, testCase.expected)
		})
	}
}

// TestAssetRoutesRefuseALinkOutOfTheirFolder covers the second lock: a name that passes every check
// but is a symbolic link pointing out of the folder is still not followed.
func TestAssetRoutesRefuseALinkOutOfTheirFolder(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symbolic links need extra privileges on Windows")
	}

	// Arrange- a character sheet that is really a link to the secret.
	current := newProject(t)
	link := filepath.Join(current.root, "img", "characters", "Escape.png")
	if err := os.Symlink(filepath.Join(current.root, "secret.txt"), link); err != nil {
		t.Fatal(err)
	}

	// Act.
	response := current.call(t, http.MethodGet, "/api/img/characters/Escape", "")

	// Assert.
	assertRefused(t, response, http.StatusInternalServerError)
}

// TestListImagesListsWhatTheImageRouteServes covers the face picker's list: every plain .png in the
// folder, by the name the image route takes, sorted; never a file of another kind, a folder, or a
// link, since the image route would refuse to serve any of them.
func TestListImagesListsWhatTheImageRouteServes(t *testing.T) {
	// Arrange- beside the fixture's face, another face, a note, a folder and a link.
	current := newProject(t)
	faces := filepath.Join(current.root, "img", "faces")
	for _, name := range []string{"Actor2.png", "notes.txt"} {
		if err := os.WriteFile(filepath.Join(faces, name), []byte("\x89PNG"), 0644); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.Mkdir(filepath.Join(faces, "folder.png"), 0755); err != nil {
		t.Fatal(err)
	}
	if runtime.GOOS != "windows" {
		if err := os.Symlink(filepath.Join(current.root, "secret.txt"), filepath.Join(faces, "Escape.png")); err != nil {
			t.Fatal(err)
		}
	}

	// Act.
	response := current.call(t, http.MethodGet, "/api/img/faces", "")

	// Assert.
	assertStatus(t, response, http.StatusOK)
	var names []string
	if err := json.Unmarshal(readEnvelope(t, response).Data, &names); err != nil {
		t.Fatal(err)
	}
	if expected := []string{"!$Door (open)", "Actor2"}; reflect.DeepEqual(names, expected) == false {
		t.Errorf("listed %q, expected %q", names, expected)
	}
}

// TestListImagesListsNothingForAMissingFolder covers an image folder the project has not made yet.
func TestListImagesListsNothingForAMissingFolder(t *testing.T) {
	// Arrange.
	current := newProject(t)

	// Act.
	response := current.call(t, http.MethodGet, "/api/img/pictures", "")

	// Assert: an empty list, which the envelope leaves out.
	assertStatus(t, response, http.StatusOK)
	if listed := readEnvelope(t, response); listed.Error != "" || len(listed.Data) != 0 {
		t.Errorf("listed %s with error %q", listed.Data, listed.Error)
	}
}

// TestListImagesRefusesAFolderOffTheList covers a folder MZ never loads images from, and one that
// tries to climb out.
func TestListImagesRefusesAFolderOffTheList(t *testing.T) {
	for _, target := range []string{"/api/img/hud", "/api/img/%2E%2E"} {
		t.Run(target, func(t *testing.T) {
			// Arrange.
			current := newProject(t)

			// Act.
			response := current.call(t, http.MethodGet, target, "")

			// Assert.
			assertRefused(t, response, http.StatusBadRequest)
		})
	}
}

// TestAssetRoutesNeedAProjectRoot covers a server started without one.
func TestAssetRoutesNeedAProjectRoot(t *testing.T) {
	targets := []string{"/api/img/characters/Actor1", "/api/img/faces", "/api/audio/se/Cursor", "/api/plugin-source/Hello"}

	for _, target := range targets {
		t.Run(target, func(t *testing.T) {
			// Arrange.
			current := newProject(t)
			t.Setenv("JMZ_PROJECT_ROOT", "")

			// Act.
			response := current.call(t, http.MethodGet, target, "")

			// Assert.
			assertStatus(t, response, http.StatusBadRequest)
		})
	}
}
