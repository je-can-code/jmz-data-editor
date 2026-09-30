package main

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"jmz-data-editor/server/internal/watch"
)

// Deleting a map keeps its file's exact bytes with the undo step, and undoing the delete puts those very bytes
// back, so a delete that was undone leaves no trace in the game's history. These routes carry that promise:
// GET /api/maps/{id}/file hands out a map file byte for byte, with no envelope, and PUT /api/maps/{id}/file
// restores a removed map's file from that text, held to every check a map save gets, then written verbatim and
// never re-rendered. A restore never lands on a file that is there. Like every route that writes, both refuse ids
// that are not map ids and pages from other sites before anything is read or written.

// toolWrittenMap is a map file as a tool rather than MZ might have written it: its display name spells `<` and
// `>` as escapes, and its event image keeps its keys in alphabetical order, where MZ puts tileId first. Writing it
// in MZ's layout would change both, so a restore that re-rendered would be caught.
var toolWrittenMap = strings.Replace(mapFixture, `"displayName":"<b>Cellar</b>"`, `"displayName":"<b>Cellar</b>"`, 1)

// TestGetMapFileAnswersTheFileByteForByte covers the read: the exact bytes, `<`, `&`, quotes, newlines and key
// order untouched, as JSON with no envelope.
func TestGetMapFileAnswersTheFileByteForByte(t *testing.T) {
	// Arrange.
	current := newProject(t)

	// Act.
	response := current.call(t, http.MethodGet, "/api/maps/1/file", "")

	// Assert.
	assertStatus(t, response, http.StatusOK)
	if contentType := response.Header().Get("Content-Type"); contentType != "application/json; charset=utf-8" {
		t.Errorf("answered as %q", contentType)
	}
	if response.Body.String() != mapFixture {
		t.Errorf("the file came back changed:\n%s", response.Body.String())
	}
}

// TestGetMapFileAnswers404ForAMapWithNoFile covers an id with nothing behind it.
func TestGetMapFileAnswers404ForAMapWithNoFile(t *testing.T) {
	// Arrange.
	current := newProject(t)

	// Act.
	response := current.call(t, http.MethodGet, "/api/maps/2/file", "")

	// Assert.
	assertStatus(t, response, http.StatusNotFound)
	if message := strings.TrimSpace(response.Body.String()); message != "data/Map002.json does not exist" {
		t.Errorf("said %q", message)
	}
}

// TestRestoreMapFileWritesTheFormerTextVerbatim is the promise itself: the text comes back byte for byte, its
// escapes and its key order included, where MZ's layout would have changed both.
func TestRestoreMapFileWritesTheFormerTextVerbatim(t *testing.T) {
	// Arrange: map 2 is listed in the tree but has no file, as after a delete's row came back and before its file.
	current := newProject(t)

	// Act.
	response := current.call(t, http.MethodPut, "/api/maps/2/file", toolWrittenMap)

	// Assert.
	assertStatus(t, response, http.StatusNoContent)
	if written := current.read(t, "data/Map002.json"); written != toolWrittenMap {
		t.Errorf("the restore rewrote the file:\n%s", written)
	}
}

// TestRestoreMapFileRefusesAMapWhoseFileExists covers the one place a restore never lands: over a file that is
// there, which would throw its content away.
func TestRestoreMapFileRefusesAMapWhoseFileExists(t *testing.T) {
	// Arrange.
	current := newProject(t)

	// Act.
	response := current.call(t, http.MethodPut, "/api/maps/1/file", toolWrittenMap)

	// Assert.
	assertStatus(t, response, http.StatusConflict)
	if message := strings.TrimSpace(response.Body.String()); message != "data/Map001.json already exists; only a removed map can be restored" {
		t.Errorf("said %q", message)
	}
	if current.read(t, "data/Map001.json") != mapFixture {
		t.Error("a refused restore still changed the map")
	}
}

// TestRestoreMapFileHoldsTheBodyToEveryMapCheck covers the strict checks a map save makes, each refused with a
// 400 and nothing written: a field no model declares, a key left out, a body that is not JSON, and a second
// document after the first.
func TestRestoreMapFileHoldsTheBodyToEveryMapCheck(t *testing.T) {
	cases := []struct {
		name     string
		body     string
		fragment string
	}{
		{name: "an unknown field", body: strings.Replace(mapFixture, `"directionFix":false`, `"directionFix":false,"sparkle":true`, 1), fragment: `unknown field "sparkle"`},
		{name: "a missing key", body: strings.Replace(mapFixture, `"bgm":{"name":"","pan":0,"pitch":100,"volume":90}`, `"bgm":{"name":"","pan":0,"pitch":100}`, 1), fragment: `missing key "volume" in bgm`},
		{name: "not JSON", body: `{"autoplayBgm":`, fragment: ""},
		{name: "two documents", body: mapFixture + "{}", fragment: ""},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			// Arrange.
			current := newProject(t)

			// Act.
			response := current.call(t, http.MethodPut, "/api/maps/2/file", testCase.body)

			// Assert.
			assertStatus(t, response, http.StatusBadRequest)
			assertBodyContains(t, response, testCase.fragment)
			if current.exists("data/Map002.json") {
				t.Error("a refused restore still wrote the file")
			}
		})
	}
}

// TestMapFileRoutesRefuseIdsThatAreNotMapIds covers the id guard on both methods.
func TestMapFileRoutesRefuseIdsThatAreNotMapIds(t *testing.T) {
	cases := []struct {
		name   string
		method string
		target string
	}{
		{name: "a word", method: http.MethodGet, target: "/api/maps/abc/file"},
		{name: "map zero", method: http.MethodGet, target: "/api/maps/0/file"},
		{name: "an encoded traversal", method: http.MethodGet, target: "/api/maps/..%2F..%2Fsecret.txt/file"},
		{name: "a negative id on a restore", method: http.MethodPut, target: "/api/maps/-1/file"},
		{name: "an encoded traversal on a restore", method: http.MethodPut, target: "/api/maps/..%2FSystem/file"},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			// Arrange.
			current := newProject(t)

			// Act.
			response := current.call(t, testCase.method, testCase.target, toolWrittenMap)

			// Assert: refused, nothing leaked, nothing written.
			assertRefused(t, response, http.StatusBadRequest)
			if current.read(t, "data/System.json") != secret {
				t.Error("a refused restore still wrote a file")
			}
		})
	}
}

// TestMapFileRoutesNeedAProjectRoot covers a server started without one.
func TestMapFileRoutesNeedAProjectRoot(t *testing.T) {
	for _, method := range []string{http.MethodGet, http.MethodPut} {
		t.Run(method, func(t *testing.T) {
			// Arrange.
			current := newProject(t)
			t.Setenv("JMZ_PROJECT_ROOT", "")

			// Act.
			response := current.call(t, method, "/api/maps/2/file", toolWrittenMap)

			// Assert.
			assertStatus(t, response, http.StatusBadRequest)
		})
	}
}

// TestOtherSitesCannotReadOrRestoreMapFiles sends both requests from a page that is not the UI's, and expects
// each refused before anything is read or written.
func TestOtherSitesCannotReadOrRestoreMapFiles(t *testing.T) {
	cases := []struct {
		method string
		target string
	}{
		{method: http.MethodGet, target: "/api/maps/1/file"},
		{method: http.MethodPut, target: "/api/maps/2/file"},
	}

	for _, testCase := range cases {
		t.Run(testCase.method, func(t *testing.T) {
			// Arrange.
			current := newProject(t)

			// Act.
			response := current.call(t, testCase.method, testCase.target, toolWrittenMap, "Origin", "http://evil.example")

			// Assert.
			assertStatus(t, response, http.StatusForbidden)
			if strings.Contains(response.Body.String(), "Cellar") || current.exists("data/Map002.json") {
				t.Error("a refused request still read or wrote a map")
			}
		})
	}
}

// TestRestoreMapFileIsCreditedToItsWindow covers the change stream: the restored file arrives as a create
// carrying the restoring window's id, like any save's echo.
func TestRestoreMapFileIsCreditedToItsWindow(t *testing.T) {
	// Arrange.
	current, server := serve(t)
	stream := openStream(t, server.URL)
	request, err := http.NewRequest(http.MethodPut, server.URL+"/api/maps/2/file", strings.NewReader(toolWrittenMap))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Jmz-Client", "window-a")

	// Act.
	response, err := http.DefaultClient.Do(asTheUi(request))
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()

	// Assert.
	if response.StatusCode != http.StatusNoContent {
		t.Fatalf("the restore answered %d", response.StatusCode)
	}
	assertEvent(t, stream.next(t), watch.Change{Path: "data/Map002.json", Kind: watch.KindCreate, Client: "window-a"})
	if current.read(t, "data/Map002.json") != toolWrittenMap {
		t.Error("the restore rewrote the file")
	}
}

// TestRestoreMapFileSaysWhyWhenTheWriteFails covers a restore the disk refuses (here, the data folder is gone): a
// 500 whose envelope carries the reason, rather than a claim that the map is back.
func TestRestoreMapFileSaysWhyWhenTheWriteFails(t *testing.T) {
	// Arrange.
	current := newProject(t)
	if err := os.RemoveAll(filepath.Join(current.root, "data")); err != nil {
		t.Fatal(err)
	}

	// Act.
	response := current.call(t, http.MethodPut, "/api/maps/2/file", toolWrittenMap)

	// Assert.
	assertStatus(t, response, http.StatusInternalServerError)
	if message := readEnvelope(t, response).Error; message == "" {
		t.Error("a failed restore should say why in the envelope")
	}
}
