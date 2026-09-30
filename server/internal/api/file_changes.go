package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"jmz-data-editor/server/internal/watch"
)

// KeepAliveInterval is how often an idle change stream sends a comment line, so nothing between the
// server and the window mistakes a quiet stream for a dead one.
const KeepAliveInterval = 15 * time.Second

// StreamFileChanges serves GET /api/file-changes as a server-sent event stream. Each change to a file
// in data/ or the editor's own folder arrives as one event:
//
//	event: change
//	data: {"path":"data/Map012.json","kind":"write","client":""}
//
// A comment line opens the stream once it is listening, and another follows every keepAlive while it
// is idle. When the server drops the stream (the window fell far behind, or the system lost events),
// the browser's EventSource reconnects on its own, and the window should reload what it holds.
func StreamFileChanges(hub *watch.Hub, keepAlive time.Duration) http.HandlerFunc {
	return func(responseWriter http.ResponseWriter, httpRequest *http.Request) {
		root, pathErr := GetProjectPath()
		if pathErr != nil {
			http.Error(responseWriter, pathErr.Error(), http.StatusBadRequest)
			return
		}

		subscription, err := hub.Subscribe(root)
		if err != nil {
			http.Error(responseWriter, err.Error(), http.StatusInternalServerError)
			return
		}
		defer subscription.Close()

		// open the stream; the first comment tells the window the subscription is live.
		controller := http.NewResponseController(responseWriter)
		headers := responseWriter.Header()
		headers.Set("Content-Type", "text/event-stream")
		headers.Set("Cache-Control", "no-cache")
		headers.Set("Connection", "keep-alive")
		headers.Set("X-Accel-Buffering", "no")
		responseWriter.WriteHeader(http.StatusOK)
		if writeEvent(responseWriter, controller, ": listening\n\n") != nil {
			return
		}

		ticker := time.NewTicker(keepAlive)
		defer ticker.Stop()

		for {
			select {
			case <-httpRequest.Context().Done():
				return
			case change, open := <-subscription.Changes():
				if open == false {
					return
				}
				payload, _ := json.Marshal(change)
				if writeEvent(responseWriter, controller, fmt.Sprintf("event: change\ndata: %s\n\n", payload)) != nil {
					return
				}
			case <-ticker.C:
				if writeEvent(responseWriter, controller, ": keep-alive\n\n") != nil {
					return
				}
			}
		}
	}
}

// writeEvent writes one block of the stream and pushes it to the window straight away.
func writeEvent(responseWriter http.ResponseWriter, controller *http.ResponseController, block string) error {
	if _, err := responseWriter.Write([]byte(block)); err != nil {
		return err
	}

	return controller.Flush()
}
