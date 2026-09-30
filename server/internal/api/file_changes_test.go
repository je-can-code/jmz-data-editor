package api

import (
	"bufio"
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"jmz-data-editor/server/internal/watch"
)

// A change stream owes the window two things beyond its events: a comment line at a steady interval
// while idle, so nothing takes a quiet stream for a dead one, and an end, when the window stops
// reading, so a frozen window cannot hold the stream and the file watcher open forever. The route runs
// at fifteen and ten seconds; these tests run the same handler at a few milliseconds.

// TestStreamFileChangesKeepsAnIdleStreamAlive listens to a stream nothing changes on.
func TestStreamFileChangesKeepsAnIdleStreamAlive(t *testing.T) {
	// Arrange- a throwaway project, and the stream on a very short keep-alive.
	root := newStreamProject(t)
	t.Setenv("JMZ_PROJECT_ROOT", root)
	timing := StreamTiming{KeepAlive: 20 * time.Millisecond, WriteTimeout: time.Second}
	server := httptest.NewServer(StreamFileChanges(watch.NewHub("data"), timing))
	t.Cleanup(server.Close)

	ctx, cancel := context.WithCancel(context.Background())
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, server.URL, nil)
	if err != nil {
		t.Fatal(err)
	}

	// Act.
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	done := make(chan struct{})
	t.Cleanup(func() {
		close(done)
		cancel()
		response.Body.Close()
	})
	lines := make(chan string, 8)
	go func() {
		reader := bufio.NewReader(response.Body)
		for {
			line, readErr := reader.ReadString('\n')
			if readErr != nil {
				return
			}
			select {
			case lines <- line:
			case <-done:
				return
			}
		}
	}()

	// Assert- the opening comment and its blank line, then a keep-alive comment.
	expected := []string{": listening\n", "\n", ": keep-alive\n"}
	for _, want := range expected {
		select {
		case line := <-lines:
			if line != want {
				t.Fatalf("read %q, expected %q", line, want)
			}
		case <-time.After(2 * time.Second):
			t.Fatalf("waited for %q in vain", want)
		}
	}
}

// TestStreamFileChangesDropsAWindowThatStoppedReading stands a frozen window up against the stream: its
// writes block the way a write to a full connection does. The stream must give up once a write has
// waited its timeout, and leave the hub with nobody to watch for.
func TestStreamFileChangesDropsAWindowThatStoppedReading(t *testing.T) {
	// Arrange.
	root := newStreamProject(t)
	t.Setenv("JMZ_PROJECT_ROOT", root)
	hub := watch.NewHub("data")
	handler := StreamFileChanges(hub, StreamTiming{KeepAlive: time.Hour, WriteTimeout: 50 * time.Millisecond})
	frozen := newStalledWriter()
	t.Cleanup(frozen.release)
	request := httptest.NewRequest(http.MethodGet, "/api/file-changes", nil)

	// Act.
	finished := make(chan struct{})
	go func() {
		handler(frozen, request)
		close(finished)
	}()

	// Assert- the stream ends on its own, and the watcher behind it with it.
	select {
	case <-finished:
	case <-time.After(3 * time.Second):
		t.Fatal("the stream kept waiting on a window that had stopped reading")
	}
	if subscribers := hub.Subscribers(); subscribers != 0 {
		t.Errorf("the hub still feeds %d subscribers", subscribers)
	}
}

// stalledWriter is a response that never drains: each write blocks until the write deadline passes,
// and forever when no deadline was ever set, the way writes to a window that has stopped reading
// block once the connection's buffers fill.
type stalledWriter struct {
	header  http.Header
	mu      sync.Mutex
	until   time.Time
	changed chan struct{}
}

// newStalledWriter makes a response that no write will get through.
func newStalledWriter() *stalledWriter {
	return &stalledWriter{header: http.Header{}, changed: make(chan struct{}, 1)}
}

// Header is the response's headers, which nothing reads.
func (writer *stalledWriter) Header() http.Header {
	return writer.header
}

// WriteHeader accepts the status line, which is never the part that blocks.
func (writer *stalledWriter) WriteHeader(int) {}

// Write blocks until the deadline, then fails the way a timed-out connection write does.
func (writer *stalledWriter) Write([]byte) (int, error) {
	for {
		writer.mu.Lock()
		until := writer.until
		writer.mu.Unlock()

		// no deadline: wait for one, however long that takes.
		if until.IsZero() {
			<-writer.changed
			continue
		}
		if time.Now().After(until) {
			return 0, os.ErrDeadlineExceeded
		}
		select {
		case <-time.After(time.Until(until)):
		case <-writer.changed:
		}
	}
}

// SetWriteDeadline is what http.ResponseController reaches for to bound a write.
func (writer *stalledWriter) SetWriteDeadline(until time.Time) error {
	writer.mu.Lock()
	writer.until = until
	writer.mu.Unlock()

	select {
	case writer.changed <- struct{}{}:
	default:
	}
	return nil
}

// FlushError is what http.ResponseController reaches for to flush.
func (writer *stalledWriter) FlushError() error {
	return nil
}

// release lets any blocked write fail, so a test that failed leaves no goroutine behind.
func (writer *stalledWriter) release() {
	_ = writer.SetWriteDeadline(time.Unix(1, 0))
}

// newStreamProject makes a throwaway project holding an empty data/ folder.
func newStreamProject(t *testing.T) string {
	t.Helper()

	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, "data"), 0755); err != nil {
		t.Fatal(err)
	}

	return root
}
