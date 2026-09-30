package watch

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"jmz-data-editor/server/internal/store"
)

// The hub owes every open window one announcement per change to a file in data/ or the editor's
// folder: the right path, the right kind, a burst of writes folded into one, and the name of the
// client whose save it was, so that client can skip it. Getting the kind wrong for an atomic save is
// the easy mistake here, since the operating system reports the rename as a brand-new file. Each test
// runs against a throwaway project in a temporary folder.

// waitFor bounds how long a test waits for an announcement that should come.
const waitFor = 3 * time.Second

// quietFor is how long a test listens to be sure nothing more is coming. It is several times the
// settle window, so a straggling announcement would have arrived.
const quietFor = 500 * time.Millisecond

// TestHubAnnouncesANewFileAsACreate covers a file that did not exist.
func TestHubAnnouncesANewFileAsACreate(t *testing.T) {
	// Arrange.
	root := newProject(t)
	subscription := subscribe(t, NewHub("data", store.EditorDataFolder), root)

	// Act.
	writeFile(t, root, "data/Map002.json", "{}")

	// Assert.
	assertChange(t, receive(t, subscription), Change{Path: "data/Map002.json", Kind: KindCreate})
	assertNothingMore(t, subscription)
}

// TestHubAnnouncesAnAtomicSaveAsAWrite covers the way the server itself saves: a temporary file
// renamed over the old one. The system reports a new file; the hub must still say "write".
func TestHubAnnouncesAnAtomicSaveAsAWrite(t *testing.T) {
	// Arrange- a map that exists before anyone subscribes.
	root := newProject(t)
	writeFile(t, root, "data/Map001.json", "{}")
	subscription := subscribe(t, NewHub("data", store.EditorDataFolder), root)

	// Act.
	if err := store.WriteFileAtomic(filepath.Join(root, "data", "Map001.json"), []byte(`{"a":1}`)); err != nil {
		t.Fatal(err)
	}

	// Assert- one write, and nothing about the temporary file.
	assertChange(t, receive(t, subscription), Change{Path: "data/Map001.json", Kind: KindWrite})
	assertNothingMore(t, subscription)
}

// TestHubAnnouncesARemovedFile covers a deletion.
func TestHubAnnouncesARemovedFile(t *testing.T) {
	// Arrange.
	root := newProject(t)
	writeFile(t, root, "data/Map001.json", "{}")
	subscription := subscribe(t, NewHub("data", store.EditorDataFolder), root)

	// Act.
	if err := os.Remove(filepath.Join(root, "data", "Map001.json")); err != nil {
		t.Fatal(err)
	}

	// Assert.
	assertChange(t, receive(t, subscription), Change{Path: "data/Map001.json", Kind: KindRemove})
	assertNothingMore(t, subscription)
}

// TestHubFoldsABurstIntoOneChange writes the same file five times in quick succession, the way one
// save can arrive as a truncate and several writes, and expects a single announcement.
func TestHubFoldsABurstIntoOneChange(t *testing.T) {
	// Arrange.
	root := newProject(t)
	writeFile(t, root, "data/Map001.json", "{}")
	subscription := subscribe(t, NewHub("data", store.EditorDataFolder), root)

	// Act- five writes, far closer together than the settle window.
	for round := 0; round < 5; round++ {
		writeFile(t, root, "data/Map001.json", `{"round":`+string(rune('0'+round))+`}`)
		time.Sleep(5 * time.Millisecond)
	}

	// Assert.
	assertChange(t, receive(t, subscription), Change{Path: "data/Map001.json", Kind: KindWrite})
	assertNothingMore(t, subscription)
}

// TestHubKeepsSeparateFilesSeparate is the near miss for the burst: two files changed together are
// two announcements, not one.
func TestHubKeepsSeparateFilesSeparate(t *testing.T) {
	// Arrange.
	root := newProject(t)
	subscription := subscribe(t, NewHub("data", store.EditorDataFolder), root)

	// Act.
	writeFile(t, root, "data/Map001.json", "{}")
	writeFile(t, root, "data/Map002.json", "{}")

	// Assert- both, in the order they happened.
	assertChange(t, receive(t, subscription), Change{Path: "data/Map001.json", Kind: KindCreate})
	assertChange(t, receive(t, subscription), Change{Path: "data/Map002.json", Kind: KindCreate})
	assertNothingMore(t, subscription)
}

// TestHubNamesTheClientWhoseSaveItWas covers the echo a window uses to skip its own saves.
func TestHubNamesTheClientWhoseSaveItWas(t *testing.T) {
	// Arrange.
	root := newProject(t)
	writeFile(t, root, "data/Map001.json", "{}")
	hub := NewHub("data", store.EditorDataFolder)
	subscription := subscribe(t, hub, root)

	// Act- announce the save, then make it, as the server's PUT does.
	hub.Expect("data/Map001.json", "window-a")
	if err := store.WriteFileAtomic(filepath.Join(root, "data", "Map001.json"), []byte(`{"a":1}`)); err != nil {
		t.Fatal(err)
	}

	// Assert.
	assertChange(t, receive(t, subscription), Change{Path: "data/Map001.json", Kind: KindWrite, Client: "window-a"})
}

// TestHubNamesNobodyWhenTwoClientsSaveInOneBurst makes sure neither window skips a change the other
// one also made.
func TestHubNamesNobodyWhenTwoClientsSaveInOneBurst(t *testing.T) {
	// Arrange.
	root := newProject(t)
	writeFile(t, root, "data/Map001.json", "{}")
	hub := NewHub("data", store.EditorDataFolder)
	subscription := subscribe(t, hub, root)

	// Act- two saves of one file from two windows, inside one settle window.
	hub.Expect("data/Map001.json", "window-a")
	writeFile(t, root, "data/Map001.json", `{"a":1}`)
	hub.Expect("data/Map001.json", "window-b")
	writeFile(t, root, "data/Map001.json", `{"b":1}`)

	// Assert.
	assertChange(t, receive(t, subscription), Change{Path: "data/Map001.json", Kind: KindWrite, Client: ""})
}

// TestHubForgetsAWithdrawnExpectation covers a save that failed: its client must not be pinned on the
// next change somebody else makes.
func TestHubForgetsAWithdrawnExpectation(t *testing.T) {
	// Arrange.
	root := newProject(t)
	writeFile(t, root, "data/Map001.json", "{}")
	hub := NewHub("data", store.EditorDataFolder)
	subscription := subscribe(t, hub, root)
	withdraw := hub.Expect("data/Map001.json", "window-a")

	// Act- the save fails and is withdrawn; then something else writes the file.
	withdraw()
	writeFile(t, root, "data/Map001.json", `{"a":1}`)

	// Assert.
	assertChange(t, receive(t, subscription), Change{Path: "data/Map001.json", Kind: KindWrite, Client: ""})
}

// TestHubClaimsOnlyExpectationsOlderThanTheChange covers the race the registration time exists for:
// a change that happened before a save was announced is not that save.
func TestHubClaimsOnlyExpectationsOlderThanTheChange(t *testing.T) {
	// Arrange- an expectation registered after the burst's last event.
	hub := NewHub("data")
	lastEvent := time.Now()
	time.Sleep(2 * time.Millisecond)
	hub.Expect("data/Map001.json", "window-a")

	// Act.
	client := hub.claim("data/Map001.json", lastEvent, time.Now())

	// Assert- not claimed, and still waiting for the save it belongs to.
	if client != "" {
		t.Errorf("claimed %q for a change that predates the save", client)
	}
	if len(hub.expected["data/Map001.json"]) != 1 {
		t.Errorf("expected the expectation to wait for its own change, have %d", len(hub.expected["data/Map001.json"]))
	}
}

// TestHubIgnoresHiddenAndOtherFiles covers the temporary files a save writes, and anything that is not
// JSON. A real change afterwards proves the stream was listening the whole time.
func TestHubIgnoresHiddenAndOtherFiles(t *testing.T) {
	// Arrange.
	root := newProject(t)
	subscription := subscribe(t, NewHub("data", store.EditorDataFolder), root)

	// Act.
	writeFile(t, root, "data/.Map001.json.123.tmp", "{}")
	writeFile(t, root, "data/notes.txt", "hello")
	writeFile(t, root, "index.html", "<html>")
	time.Sleep(quietFor)
	writeFile(t, root, "data/Map003.json", "{}")

	// Assert- the only announcement is the real one.
	assertChange(t, receive(t, subscription), Change{Path: "data/Map003.json", Kind: KindCreate})
	assertNothingMore(t, subscription)
}

// TestHubPicksUpTheEditorFolderWhenItAppears covers the editor's folder, which does not exist until
// its first document is saved and must be watched from then on.
func TestHubPicksUpTheEditorFolderWhenItAppears(t *testing.T) {
	// Arrange- a project with no editor folder yet.
	root := newProject(t)
	subscription := subscribe(t, NewHub("data", store.EditorDataFolder), root)

	// Act- the first save creates the folder and the file together, then a second save follows.
	if err := os.MkdirAll(filepath.Join(root, store.EditorDataFolder), 0755); err != nil {
		t.Fatal(err)
	}
	writeFile(t, root, store.EditorDataFolder+"/blueprints.json", "{}")
	first := receive(t, subscription)
	writeFile(t, root, store.EditorDataFolder+"/blueprints.json", `{"a":1}`)
	second := receive(t, subscription)

	// Assert.
	assertChange(t, first, Change{Path: store.EditorDataFolder + "/blueprints.json", Kind: KindCreate})
	assertChange(t, second, Change{Path: store.EditorDataFolder + "/blueprints.json", Kind: KindWrite})
}

// TestHubRefusesAProjectWithoutData keeps a wrong project root from looking like a quiet one.
func TestHubRefusesAProjectWithoutData(t *testing.T) {
	// Arrange- a folder with no data/ inside.
	root := t.TempDir()

	// Act.
	_, err := NewHub("data", store.EditorDataFolder).Subscribe(root)

	// Assert.
	if err == nil {
		t.Error("expected a project without data/ to be refused")
	}
}

// TestHubStopsWatchingWhenTheLastSubscriberLeaves keeps an idle server from watching for nobody,
// and shows the next subscriber starts it again.
func TestHubStopsWatchingWhenTheLastSubscriberLeaves(t *testing.T) {
	// Arrange.
	root := newProject(t)
	hub := NewHub("data", store.EditorDataFolder)
	first, err := hub.Subscribe(root)
	if err != nil {
		t.Fatal(err)
	}
	second, err := hub.Subscribe(root)
	if err != nil {
		t.Fatal(err)
	}

	// Act.
	first.Close()
	stillRunning := hub.running != nil
	second.Close()
	stoppedRunning := hub.running == nil
	third := subscribe(t, hub, root)
	writeFile(t, root, "data/Map001.json", "{}")

	// Assert.
	if stillRunning == false || stoppedRunning == false {
		t.Errorf("expected the watcher to outlive the first subscriber (%v) and stop with the last (%v)", stillRunning, stoppedRunning)
	}
	assertChange(t, receive(t, third), Change{Path: "data/Map001.json", Kind: KindCreate})
}

// newProject makes a throwaway project holding an empty data/ folder.
func newProject(t *testing.T) string {
	t.Helper()

	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, "data"), 0755); err != nil {
		t.Fatal(err)
	}

	return root
}

// subscribe subscribes for the rest of the test.
func subscribe(t *testing.T, hub *Hub, root string) *Subscription {
	t.Helper()

	subscription, err := hub.Subscribe(root)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(subscription.Close)

	return subscription
}

// writeFile writes a project-relative file in place, the way most tools do.
func writeFile(t *testing.T, root string, path string, content string) {
	t.Helper()

	if err := os.WriteFile(filepath.Join(root, filepath.FromSlash(path)), []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
}

// receive waits for the next announcement.
func receive(t *testing.T, subscription *Subscription) Change {
	t.Helper()

	select {
	case change, open := <-subscription.Changes():
		if open == false {
			t.Fatal("the subscription was dropped")
		}
		return change
	case <-time.After(waitFor):
		t.Fatal("no change was announced")
	}

	return Change{}
}

// assertNothingMore listens long enough to be sure no further announcement is coming.
func assertNothingMore(t *testing.T, subscription *Subscription) {
	t.Helper()

	select {
	case change := <-subscription.Changes():
		t.Errorf("expected nothing more, then heard %+v", change)
	case <-time.After(quietFor):
	}
}

// assertChange compares an announcement with the one expected.
func assertChange(t *testing.T, actual Change, expected Change) {
	t.Helper()

	if actual != expected {
		t.Errorf("announced %+v, expected %+v", actual, expected)
	}
}
