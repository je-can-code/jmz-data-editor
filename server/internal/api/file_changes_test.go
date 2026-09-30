package api

import (
	"bufio"
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"jmz-data-editor/server/internal/watch"
)

// An idle change stream owes the window a comment line at a steady interval, so a proxy, the browser
// or the window itself never takes a quiet stream for a dead one. The route runs at fifteen seconds;
// this test runs the same handler at a few milliseconds.

// TestStreamFileChangesKeepsAnIdleStreamAlive listens to a stream nothing changes on.
func TestStreamFileChangesKeepsAnIdleStreamAlive(t *testing.T) {
	// Arrange- a throwaway project, and the stream on a very short keep-alive.
	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, "data"), 0755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("JMZ_PROJECT_ROOT", root)
	server := httptest.NewServer(StreamFileChanges(watch.NewHub("data"), 20*time.Millisecond))
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
	t.Cleanup(func() {
		cancel()
		response.Body.Close()
	})
	lines := make(chan string, 8)
	go func() {
		reader := bufio.NewReader(response.Body)
		for {
			line, readErr := reader.ReadString('\n')
			if readErr != nil {
				close(lines)
				return
			}
			lines <- line
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
