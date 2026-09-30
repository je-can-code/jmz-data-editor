package main

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"jmz-data-editor/server/internal/watch"
)

// The delete route owes the map tree one promise: MapInfos.json never names a map whose file is gone.
// So DELETE removes a map's file only once the tree no longer lists it, refusing a map the tree still
// holds with a 409 and touching nothing, and answers 404 for a map with no file, as GET does. Like
// every route that writes, it refuses ids that are not map ids, pages from other sites, and requests
// addressed to a name the server does not go by, all before anything is removed. These run through
// the real route table, so a route missing from main or registered under the wrong method fails here.

// writeOrphan puts a map file the tree does not list into the project, as data/Map003.json: what the
// tree leaves behind once the editor has taken a deleted map's row out and is about to remove its file.
func writeOrphan(t *testing.T, current *project) {
	t.Helper()

	full := filepath.Join(current.root, "data", "Map003.json")
	if err := os.WriteFile(full, []byte(mapFixture), 0644); err != nil {
		t.Fatal(err)
	}
}

// TestDeleteMapRemovesAMapTheTreeNoLongerLists covers the removal itself: 204 with no body, the file
// gone, and its neighbours and the tree exactly as they were.
func TestDeleteMapRemovesAMapTheTreeNoLongerLists(t *testing.T) {
	// Arrange.
	current := newProject(t)
	writeOrphan(t, current)

	// Act.
	response := current.call(t, http.MethodDelete, "/api/maps/3", "")

	// Assert.
	assertStatus(t, response, http.StatusNoContent)
	if response.Body.Len() != 0 {
		t.Errorf("a 204 carried a body: %q", response.Body.String())
	}
	if current.exists("data/Map003.json") {
		t.Error("the map's file is still there")
	}
	if current.read(t, "data/Map001.json") != mapFixture || current.read(t, "data/MapInfos.json") != mapInfosFixture {
		t.Error("the delete touched a file it was not asked to remove")
	}
}

// TestDeleteMapRefusesAMapTheTreeStillLists is the promise itself: a map the tree lists keeps its file,
// with a 409 saying why, whether or not the file exists.
func TestDeleteMapRefusesAMapTheTreeStillLists(t *testing.T) {
	cases := []struct {
		name   string
		target string
		id     string
	}{
		{name: "a listed map with a file", target: "/api/maps/1", id: "1"},
		{name: "a listed map without a file", target: "/api/maps/2", id: "2"},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			// Arrange.
			current := newProject(t)

			// Act.
			response := current.call(t, http.MethodDelete, testCase.target, "")

			// Assert.
			assertStatus(t, response, http.StatusConflict)
			expected := "map " + testCase.id + " is still in the map tree; remove its row from MapInfos.json first"
			if message := strings.TrimSpace(response.Body.String()); message != expected {
				t.Errorf("said %q, expected %q", message, expected)
			}
			if current.read(t, "data/Map001.json") != mapFixture {
				t.Error("a refused delete still changed the map")
			}
		})
	}
}

// TestDeleteMapAnswers404ForAMapWithNoFile covers an id with nothing behind it, which the tree does not
// list either.
func TestDeleteMapAnswers404ForAMapWithNoFile(t *testing.T) {
	// Arrange.
	current := newProject(t)

	// Act.
	response := current.call(t, http.MethodDelete, "/api/maps/999", "")

	// Assert.
	assertStatus(t, response, http.StatusNotFound)
	if message := strings.TrimSpace(response.Body.String()); message != "data/Map999.json does not exist" {
		t.Errorf("said %q", message)
	}
}

// TestDeleteMapRefusesIdsThatAreNotMapIds covers the id guard. Being digits only is what keeps a delete
// from naming anything outside data/.
func TestDeleteMapRefusesIdsThatAreNotMapIds(t *testing.T) {
	targets := map[string]string{
		"a word":               "/api/maps/abc",
		"a negative id":        "/api/maps/-1",
		"map zero":             "/api/maps/0",
		"an encoded traversal": "/api/maps/..%2F..%2Fsecret.txt",
		"a traversal to data":  "/api/maps/..%2FSystem",
	}

	for name, target := range targets {
		t.Run(name, func(t *testing.T) {
			// Arrange.
			current := newProject(t)
			writeOrphan(t, current)

			// Act.
			response := current.call(t, http.MethodDelete, target, "")

			// Assert: refused, and every file still there.
			assertRefused(t, response, http.StatusBadRequest)
			if current.exists("secret.txt") == false || current.exists("data/System.json") == false || current.exists("data/Map003.json") == false {
				t.Error("a refused delete still removed a file")
			}
		})
	}
}

// TestDeleteMapNeedsAProjectAndATree covers the two ways a delete cannot be checked: no project, and a
// tree that cannot be read, where nothing can say the map is safe to remove.
func TestDeleteMapNeedsAProjectAndATree(t *testing.T) {
	cases := []struct {
		name     string
		arrange  func(t *testing.T, current *project)
		expected int
	}{
		{name: "no project root", arrange: func(t *testing.T, current *project) { t.Setenv("JMZ_PROJECT_ROOT", "") }, expected: http.StatusBadRequest},
		{name: "no map tree", arrange: func(t *testing.T, current *project) { removeFile(t, current, "data/MapInfos.json") }, expected: http.StatusInternalServerError},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			// Arrange.
			current := newProject(t)
			writeOrphan(t, current)
			testCase.arrange(t, current)

			// Act.
			response := current.call(t, http.MethodDelete, "/api/maps/3", "")

			// Assert.
			assertStatus(t, response, testCase.expected)
			if current.exists("data/Map003.json") == false {
				t.Error("an unchecked delete still removed the map")
			}
		})
	}
}

// TestPreflightAllowsTheMapEditorsDeletes covers the browser's check before a DELETE carrying the
// client header, which would otherwise stop every map removal from the UI's page.
func TestPreflightAllowsTheMapEditorsDeletes(t *testing.T) {
	// Arrange.
	current := newProject(t)

	// Act.
	response := current.call(t, http.MethodOptions, "/api/maps/3", "",
		"Origin", "http://127.0.0.1:3000",
		"Access-Control-Request-Method", "DELETE",
		"Access-Control-Request-Headers", "x-jmz-client")

	// Assert.
	assertStatus(t, response, http.StatusNoContent)
	if methods := response.Header().Get("Access-Control-Allow-Methods"); strings.Contains(methods, "DELETE") == false {
		t.Errorf("the preflight allowed methods %q", methods)
	}
}

// TestOtherSitesCannotDeleteMaps sends a delete the route would carry out from pages and hosts that are
// not the UI's, and expects each refused with the file still there.
func TestOtherSitesCannotDeleteMaps(t *testing.T) {
	cases := []struct {
		name    string
		headers []string
	}{
		{name: "another site's page", headers: []string{"Origin", "http://evil.example"}},
		{name: "the right host on the wrong port", headers: []string{"Origin", "http://127.0.0.1:5173"}},
		{name: "a rebinding host", headers: []string{"Host", "evil.example:8080"}},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			// Arrange.
			current := newProject(t)
			writeOrphan(t, current)

			// Act.
			response := current.call(t, http.MethodDelete, "/api/maps/3", "", testCase.headers...)

			// Assert.
			assertStatus(t, response, http.StatusForbidden)
			if current.exists("data/Map003.json") == false {
				t.Error("a refused delete still removed the map")
			}
		})
	}
}

// TestDeleteMapIsAnnouncedToEveryWindow covers the change stream: the removal arrives as a remove with no
// client, even though the request named one, so every window holding the map learns its file is gone.
func TestDeleteMapIsAnnouncedToEveryWindow(t *testing.T) {
	// Arrange: the orphan exists before the stream opens, so the watcher knows it was there.
	current, server := serve(t)
	writeOrphan(t, current)
	stream := openStream(t, server.URL)
	request, err := http.NewRequest(http.MethodDelete, server.URL+"/api/maps/3", nil)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("X-Jmz-Client", "window-a")

	// Act.
	response, err := http.DefaultClient.Do(asTheUi(request))
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()

	// Assert.
	if response.StatusCode != http.StatusNoContent {
		t.Fatalf("the delete answered %d", response.StatusCode)
	}
	assertEvent(t, stream.next(t), watch.Change{Path: "data/Map003.json", Kind: watch.KindRemove, Client: ""})
}
