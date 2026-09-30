package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"jmz-data-editor/server/internal/watch"
)

// StreamTiming sets the change stream's two clocks.
type StreamTiming struct {
	// KeepAlive is how often an idle stream sends a comment line, so nothing between the server and
	// the window mistakes a quiet stream for a dead one.
	KeepAlive time.Duration

	// WriteTimeout is how long one write may wait on a window that has stopped reading before the
	// stream is dropped. Without it, a frozen window would hold its stream, and the file watcher
	// behind it, open for as long as the connection stayed up.
	WriteTimeout time.Duration
}

// DefaultStreamTiming is the timing the server runs with.
var DefaultStreamTiming = StreamTiming{KeepAlive: 15 * time.Second, WriteTimeout: 10 * time.Second}

// StreamFileChanges serves GET /api/file-changes as a server-sent event stream. Each change to a file
// in data/ or the editor's own folder arrives as one event:
//
//	event: change
//	data: {"path":"data/Map012.json","kind":"write","client":""}
//
// A comment line opens the stream once it is listening, and another follows every KeepAlive while it
// is idle. When the server drops the stream (the window stopped reading, fell far behind, or the
// system lost events), the browser's EventSource reconnects on its own, and the window should reload
// what it holds.
func StreamFileChanges(hub *watch.Hub, timing StreamTiming) http.HandlerFunc {
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
		stream := eventWriter{
			responseWriter: responseWriter,
			controller:     http.NewResponseController(responseWriter),
			timeout:        timing.WriteTimeout,
		}
		headers := responseWriter.Header()
		headers.Set("Content-Type", "text/event-stream")
		headers.Set("Cache-Control", "no-cache")
		headers.Set("Connection", "keep-alive")
		headers.Set("X-Accel-Buffering", "no")
		responseWriter.WriteHeader(http.StatusOK)
		if stream.write(": listening\n\n") != nil {
			return
		}

		ticker := time.NewTicker(timing.KeepAlive)
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
				if stream.write(fmt.Sprintf("event: change\ndata: %s\n\n", payload)) != nil {
					return
				}
			case <-ticker.C:
				if stream.write(": keep-alive\n\n") != nil {
					return
				}
			}
		}
	}
}

// eventWriter writes blocks of the stream, each with its own deadline.
type eventWriter struct {
	responseWriter http.ResponseWriter
	controller     *http.ResponseController
	timeout        time.Duration
}

// write sends one block and pushes it to the window straight away, failing once the write has waited
// longer than the timeout. The deadline is set afresh before every write, since it is a moment in
// time rather than a length: one left over from the last write would already have passed.
func (stream eventWriter) write(block string) error {
	err := stream.controller.SetWriteDeadline(time.Now().Add(stream.timeout))
	if err != nil && errors.Is(err, http.ErrNotSupported) == false {
		return err
	}

	if _, err := stream.responseWriter.Write([]byte(block)); err != nil {
		return err
	}

	return stream.controller.Flush()
}
