package main

import (
	"bufio"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"jmz-data-editor/server/internal/watch"
)

// The change stream owes every open window one event per changed file, with the saving window's
// client id echoed back so it can skip its own saves. These run the real route table on a real HTTP
// server, because a stream is exactly the kind of thing a recorded response cannot show: it has to
// arrive, flushed, while the connection stays open.

// streamWait bounds how long a test waits for an event that should come.
const streamWait = 3 * time.Second

// streamQuiet is how long a test listens to be sure no further event is coming.
const streamQuiet = 500 * time.Millisecond

// TestFileChangesEchoesTheClientOfASave covers the echo: a PUT carrying X-Jmz-Client produces an event
// carrying the same id.
func TestFileChangesEchoesTheClientOfASave(t *testing.T) {
	// Arrange.
	current, server := serve(t)
	stream := openStream(t, server.URL)
	body := mapBody(t, server.URL)

	// Act.
	put(t, server.URL+"/api/maps/1", body, "window-a")

	// Assert.
	assertEvent(t, stream.next(t), watch.Change{Path: "data/Map001.json", Kind: watch.KindWrite, Client: "window-a"})
	if current.read(t, "data/Map001.json") != mapFixture {
		t.Error("the save changed an unchanged map")
	}
}

// TestFileChangesAnnouncesOutsideEditsWithNoClient covers a change made by anything other than this
// server, such as MZ or a script, which every window must act on.
func TestFileChangesAnnouncesOutsideEditsWithNoClient(t *testing.T) {
	// Arrange.
	current, server := serve(t)
	stream := openStream(t, server.URL)

	// Act.
	if err := os.WriteFile(filepath.Join(current.root, "data", "MapInfos.json"), []byte(mapInfosFixture), 0644); err != nil {
		t.Fatal(err)
	}

	// Assert.
	assertEvent(t, stream.next(t), watch.Change{Path: "data/MapInfos.json", Kind: watch.KindWrite, Client: ""})
}

// TestFileChangesFoldsRepeatedSavesIntoOneEvent covers a burst: three saves of one map in quick
// succession reach the window as a single event.
func TestFileChangesFoldsRepeatedSavesIntoOneEvent(t *testing.T) {
	// Arrange.
	_, server := serve(t)
	stream := openStream(t, server.URL)
	body := mapBody(t, server.URL)

	// Act.
	for round := 0; round < 3; round++ {
		put(t, server.URL+"/api/maps/1", body, "window-a")
	}

	// Assert- one event, then silence.
	assertEvent(t, stream.next(t), watch.Change{Path: "data/Map001.json", Kind: watch.KindWrite, Client: "window-a"})
	stream.assertQuiet(t)
}

// TestFileChangesAnnouncesTheEditorsOwnDocuments covers the editor's folder, which does not exist
// when the stream opens and appears with the first document saved.
func TestFileChangesAnnouncesTheEditorsOwnDocuments(t *testing.T) {
	// Arrange.
	current, server := serve(t)
	stream := openStream(t, server.URL)

	// Act.
	put(t, server.URL+"/api/editor-data/blueprints", `{"stamps":[]}`, "window-b")

	// Assert.
	assertEvent(t, stream.next(t), watch.Change{Path: "jmz-editor/blueprints.json", Kind: watch.KindCreate, Client: "window-b"})
	if current.exists("jmz-editor/blueprints.json") == false {
		t.Error("the document was not written")
	}
}

// TestFileChangesNeedsAProjectWithData covers the two ways a stream cannot start.
func TestFileChangesNeedsAProjectWithData(t *testing.T) {
	cases := []struct {
		name     string
		root     func(current *project) string
		expected int
	}{
		{name: "no project root", root: func(current *project) string { return "" }, expected: http.StatusBadRequest},
		{name: "a root with no data folder", root: func(current *project) string { return filepath.Join(current.root, "img") }, expected: http.StatusInternalServerError},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			// Arrange.
			current := newProject(t)
			t.Setenv("JMZ_PROJECT_ROOT", testCase.root(current))

			// Act.
			response := current.call(t, http.MethodGet, "/api/file-changes", "")

			// Assert.
			assertStatus(t, response, testCase.expected)
		})
	}
}

// serve starts a real HTTP server on the project's route table.
func serve(t *testing.T) (*project, *httptest.Server) {
	t.Helper()

	current := newProject(t)
	server := httptest.NewServer(current.handler)
	t.Cleanup(server.Close)

	return current, server
}

// asTheUi dresses a request the way the UI's own page sends it: from the UI's origin, addressed to the
// API by the name it listens on, whatever port the test server really has.
func asTheUi(request *http.Request) *http.Request {
	request.Host = listenAddress
	request.Header.Set("Origin", "http://127.0.0.1:3000")
	return request
}

// mapBody fetches map 1 the way the editor would, and returns the map inside the envelope.
func mapBody(t *testing.T, base string) string {
	t.Helper()

	request, err := http.NewRequest(http.MethodGet, base+"/api/maps/1", nil)
	if err != nil {
		t.Fatal(err)
	}
	response, err := http.DefaultClient.Do(asTheUi(request))
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()

	var decoded envelope
	if err := json.NewDecoder(response.Body).Decode(&decoded); err != nil {
		t.Fatal(err)
	}

	return string(decoded.Data)
}

// put sends a save the way the editor does, naming the window it comes from.
func put(t *testing.T, target string, body string, client string) {
	t.Helper()

	request, err := http.NewRequest(http.MethodPut, target, strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Jmz-Client", client)

	response, err := http.DefaultClient.Do(asTheUi(request))
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if response.StatusCode != http.StatusNoContent {
		t.Fatalf("the save answered %d", response.StatusCode)
	}
}

// eventStream is an open change stream, read in the background.
type eventStream struct {
	changes chan watch.Change
}

// openStream connects to the change stream and waits for its opening comment, so the test knows the
// subscription is live before it changes anything.
func openStream(t *testing.T, base string) *eventStream {
	t.Helper()

	ctx, cancel := context.WithCancel(context.Background())
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, base+"/api/file-changes", nil)
	if err != nil {
		t.Fatal(err)
	}
	response, err := http.DefaultClient.Do(asTheUi(request))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		cancel()
		response.Body.Close()
	})

	if response.StatusCode != http.StatusOK || response.Header.Get("Content-Type") != "text/event-stream" {
		t.Fatalf("the stream answered %d as %q", response.StatusCode, response.Header.Get("Content-Type"))
	}

	// the first block is the comment that says the subscription is in place.
	reader := bufio.NewReader(response.Body)
	opening, err := reader.ReadString('\n')
	if err != nil || opening != ": listening\n" {
		t.Fatalf("the stream opened with %q (%v)", opening, err)
	}

	stream := &eventStream{changes: make(chan watch.Change, 16)}
	go stream.read(reader)
	return stream
}

// read parses change events off the stream until it closes, skipping comments.
func (stream *eventStream) read(reader *bufio.Reader) {
	defer close(stream.changes)

	name := ""
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			return
		}
		line = strings.TrimSuffix(line, "\n")

		switch {
		case strings.HasPrefix(line, "event: "):
			name = strings.TrimPrefix(line, "event: ")
		case strings.HasPrefix(line, "data: ") && name == "change":
			var change watch.Change
			if json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &change) == nil {
				stream.changes <- change
			}
		case line == "":
			name = ""
		}
	}
}

// next waits for the next change event.
func (stream *eventStream) next(t *testing.T) watch.Change {
	t.Helper()

	select {
	case change, open := <-stream.changes:
		if open == false {
			t.Fatal("the stream closed")
		}
		return change
	case <-time.After(streamWait):
		t.Fatal("no change arrived on the stream")
	}

	return watch.Change{}
}

// assertQuiet listens long enough to be sure no further change is coming.
func (stream *eventStream) assertQuiet(t *testing.T) {
	t.Helper()

	select {
	case change := <-stream.changes:
		t.Errorf("expected silence, then heard %+v", change)
	case <-time.After(streamQuiet):
	}
}

// assertEvent compares an event with the one expected.
func assertEvent(t *testing.T, actual watch.Change, expected watch.Change) {
	t.Helper()

	if actual != expected {
		t.Errorf("heard %+v, expected %+v", actual, expected)
	}
}
