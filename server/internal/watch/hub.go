// Package watch announces changes to a project's files, so that every open editor window hears about
// a save made in any other window, in MZ, or by a script.
package watch

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
)

// The kinds of change a Change can announce.
const (
	// KindWrite is a file that existed before and still does, with new content.
	KindWrite = "write"

	// KindCreate is a file that did not exist before.
	KindCreate = "create"

	// KindRemove is a file that no longer exists.
	KindRemove = "remove"
)

const (
	// defaultSettle is how long a file must stay quiet before its change is announced. One save is
	// often several events (a truncate, some writes, a rename), and they should reach a window as one.
	defaultSettle = 100 * time.Millisecond

	// defaultMaxWait caps how long a file that never stops changing waits for its announcement.
	defaultMaxWait = time.Second

	// defaultExpectFor is how long a write the server announced in advance may take to show up.
	defaultExpectFor = 5 * time.Second

	// subscriberBuffer is how many changes a subscriber may fall behind by before it is dropped.
	subscriberBuffer = 256
)

// Change is one file that changed, as the stream announces it.
type Change struct {
	// Path is relative to the project root, with forward slashes: "data/Map012.json".
	Path string `json:"path"`

	// Kind is KindWrite, KindCreate or KindRemove.
	Kind string `json:"kind"`

	// Client is the X-Jmz-Client of the request whose write caused the change, or empty when the change
	// came from anywhere else, so a window can recognise and skip its own saves.
	Client string `json:"client"`
}

// Hub watches the files of one project and fans every change out to its subscribers.
//
// It watches only while somebody is listening: the first subscriber starts the watcher and the last
// one to leave stops it. Watching uses the operating system's own notifications (inotify on Linux),
// which hold no file open, so nothing the hub does can stand in the way of MZ, a script or the
// server itself writing to the files it watches.
type Hub struct {
	// folders are the project-relative folders whose JSON files are announced, one level deep.
	folders []string

	settle    time.Duration
	maxWait   time.Duration
	expectFor time.Duration

	mu          sync.Mutex
	subscribers map[*Subscription]struct{}
	running     *session
	expected    map[string][]*expectation
}

// session is one run of the watcher, from the first subscriber to the last.
type session struct {
	root    string
	watcher *fsnotify.Watcher
	stop    chan struct{}
	done    chan struct{}
}

// expectation is a write the server announced before making it.
type expectation struct {
	client     string
	registered time.Time
	deadline   time.Time
}

// burst gathers the raw events of one file until it goes quiet.
type burst struct {
	first time.Time
	last  time.Time
}

// Subscription is one listener's feed of changes.
type Subscription struct {
	hub     *Hub
	changes chan Change
	once    sync.Once
}

// NewHub makes a hub that announces changes to the JSON files directly inside the given folders,
// each relative to the project root: "data", say, and the editor's own folder.
func NewHub(folders ...string) *Hub {
	return &Hub{
		folders:     folders,
		settle:      defaultSettle,
		maxWait:     defaultMaxWait,
		expectFor:   defaultExpectFor,
		subscribers: map[*Subscription]struct{}{},
		expected:    map[string][]*expectation{},
	}
}

// Changes is the feed itself. It is closed when the hub drops the subscription, which happens when
// the subscriber falls too far behind or the watcher lost events; either way the listener should
// reconnect and reload rather than trust what it has.
func (subscription *Subscription) Changes() <-chan Change {
	return subscription.changes
}

// Close ends the subscription, and stops the watcher when it was the last one.
func (subscription *Subscription) Close() {
	subscription.once.Do(func() {
		subscription.hub.unsubscribe(subscription)
	})
}

// Subscribe starts listening for changes in the project at root, starting the watcher if nobody was
// listening yet.
func (hub *Hub) Subscribe(root string) (*Subscription, error) {
	absolute, err := filepath.Abs(root)
	if err != nil {
		return nil, err
	}

	hub.mu.Lock()
	defer hub.mu.Unlock()

	// one hub watches one project; the server only ever has one.
	if hub.running != nil && hub.running.root != absolute {
		return nil, fmt.Errorf("already watching %s", hub.running.root)
	}

	if hub.running == nil {
		running, err := hub.start(absolute)
		if err != nil {
			return nil, err
		}
		hub.running = running
	}

	subscription := &Subscription{hub: hub, changes: make(chan Change, subscriberBuffer)}
	hub.subscribers[subscription] = struct{}{}
	return subscription, nil
}

// unsubscribe removes a subscription and stops the watcher once nobody is left.
func (hub *Hub) unsubscribe(subscription *Subscription) {
	hub.mu.Lock()
	delete(hub.subscribers, subscription)

	var stopping *session
	if len(hub.subscribers) == 0 && hub.running != nil {
		stopping = hub.running
		hub.running = nil
	}
	hub.mu.Unlock()

	// wait for the loop outside the lock, since the loop takes the lock to deliver changes.
	if stopping != nil {
		close(stopping.stop)
		<-stopping.done
		_ = stopping.watcher.Close()
	}
}

// Expect records that the server is about to write the file at path (project-relative, forward
// slashes) on behalf of client, so the change it causes can say who asked for it. Call it before the
// write starts, and call the returned function if the write fails, so the expectation cannot be
// pinned on somebody else's change.
func (hub *Hub) Expect(path string, client string) func() {
	hub.mu.Lock()
	defer hub.mu.Unlock()

	now := time.Now()
	hub.forgetExpired(now)

	expected := &expectation{client: client, registered: now, deadline: now.Add(hub.expectFor)}
	hub.expected[path] = append(hub.expected[path], expected)

	return func() {
		hub.mu.Lock()
		defer hub.mu.Unlock()
		hub.expected[path] = withoutExpectation(hub.expected[path], expected)
		if len(hub.expected[path]) == 0 {
			delete(hub.expected, path)
		}
	}
}

// forgetExpired drops every expectation whose write never showed up in time. The caller holds mu.
func (hub *Hub) forgetExpired(now time.Time) {
	for path, list := range hub.expected {
		kept := list[:0]
		for _, expected := range list {
			if now.After(expected.deadline) == false {
				kept = append(kept, expected)
			}
		}
		if len(kept) == 0 {
			delete(hub.expected, path)
			continue
		}
		hub.expected[path] = kept
	}
}

// withoutExpectation returns the list with one expectation taken out.
func withoutExpectation(list []*expectation, removed *expectation) []*expectation {
	kept := []*expectation{}
	for _, expected := range list {
		if expected != removed {
			kept = append(kept, expected)
		}
	}

	return kept
}

// start begins watching the project at root. The caller holds mu.
func (hub *Hub) start(root string) (*session, error) {
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, err
	}

	// the project root is watched too, only so a folder created after the watcher started (the
	// editor's own, on its first save) is noticed and picked up.
	if err := watcher.Add(root); err != nil {
		_ = watcher.Close()
		return nil, fmt.Errorf("watching %s: %w", root, err)
	}

	// the first folder is the one the project cannot do without, so its absence is an error; the
	// others are picked up whenever they appear.
	for index, folder := range hub.folders {
		err := watcher.Add(filepath.Join(root, folder))
		if err != nil && index == 0 {
			_ = watcher.Close()
			return nil, fmt.Errorf("watching %s: %w", filepath.Join(root, folder), err)
		}
	}

	// note what exists now, after the watches are in place, so that no change can slip between the
	// two; a file created in that instant is at worst announced as a write rather than missed.
	known := map[string]bool{}
	for _, folder := range hub.folders {
		for _, path := range hub.listFolder(root, folder) {
			known[path] = true
		}
	}

	running := &session{root: root, watcher: watcher, stop: make(chan struct{}), done: make(chan struct{})}
	go hub.run(running, known)
	return running, nil
}

// listFolder returns the project-relative path of every announced file directly inside a folder.
func (hub *Hub) listFolder(root string, folder string) []string {
	entries, err := os.ReadDir(filepath.Join(root, folder))
	if err != nil {
		return nil
	}

	paths := []string{}
	for _, entry := range entries {
		path := folder + "/" + entry.Name()
		if entry.Type().IsRegular() && hub.isAnnounced(path) {
			paths = append(paths, path)
		}
	}

	return paths
}

// isAnnounced reports whether a project-relative path is one the stream announces: a JSON file sitting
// directly inside one of the hub's folders, and not a hidden file. Hidden covers the temporary files a
// save writes before renaming them into place, which are nobody's business but the saver's.
func (hub *Hub) isAnnounced(path string) bool {
	folder, name, found := strings.Cut(path, "/")
	if found == false || strings.Contains(name, "/") {
		return false
	}
	if strings.HasPrefix(name, ".") || strings.HasSuffix(name, ".json") == false {
		return false
	}

	for _, watched := range hub.folders {
		if folder == watched {
			return true
		}
	}

	return false
}

// run is the watcher's loop: it gathers raw events into bursts, one per file, and announces each
// burst once its file has settled. Everything it touches besides the subscribers and expectations
// belongs to this goroutine alone.
func (hub *Hub) run(running *session, known map[string]bool) {
	defer close(running.done)

	bursts := map[string]*burst{}
	timer := time.NewTimer(time.Hour)
	timer.Stop()

	for {
		select {
		case <-running.stop:
			timer.Stop()
			return
		case event, open := <-running.watcher.Events:
			if open == false {
				return
			}
			hub.observe(running, event, bursts, time.Now())
		case err, open := <-running.watcher.Errors:
			if open == false {
				return
			}
			// the system dropped events, so nobody can trust what they have; make them reload.
			if errors.Is(err, fsnotify.ErrEventOverflow) {
				hub.dropSubscribers()
			}
		case now := <-timer.C:
			hub.announceSettled(running, bursts, known, now)
		}

		hub.rearm(timer, bursts, time.Now())
	}
}

// observe folds one raw event into the burst for its file.
func (hub *Hub) observe(running *session, event fsnotify.Event, bursts map[string]*burst, now time.Time) {
	// attribute changes alone say nothing about content; Linux also sends one alongside a removal,
	// which arrives as its own event anyway.
	if event.Op == fsnotify.Chmod {
		return
	}

	relative, err := filepath.Rel(running.root, event.Name)
	if err != nil {
		return
	}
	relative = filepath.ToSlash(relative)

	// a folder of ours appearing in the project root: start watching it, and treat whatever is
	// already inside as new, since it may have been written before the watch was in place.
	if hub.isWatchedFolder(relative) {
		if event.Has(fsnotify.Create) && running.watcher.Add(event.Name) == nil {
			for _, path := range hub.listFolder(running.root, relative) {
				noteEvent(bursts, path, now)
			}
		}
		return
	}

	if hub.isAnnounced(relative) {
		noteEvent(bursts, relative, now)
	}
}

// isWatchedFolder reports whether a project-relative path is one of the hub's folders itself.
func (hub *Hub) isWatchedFolder(relative string) bool {
	for _, folder := range hub.folders {
		if relative == folder {
			return true
		}
	}

	return false
}

// noteEvent records a raw event against a file's burst, starting the burst if there is none.
func noteEvent(bursts map[string]*burst, path string, now time.Time) {
	current := bursts[path]
	if current == nil {
		current = &burst{first: now}
		bursts[path] = current
	}
	current.last = now
}

// dueAt is when a burst is announced: once its file has been quiet for settle, or once it has run for
// maxWait, whichever comes first.
func (hub *Hub) dueAt(current *burst) time.Time {
	quiet := current.last.Add(hub.settle)
	capped := current.first.Add(hub.maxWait)
	if capped.Before(quiet) {
		return capped
	}

	return quiet
}

// rearm points the timer at the next burst due, or stops it when there are none.
func (hub *Hub) rearm(timer *time.Timer, bursts map[string]*burst, now time.Time) {
	if len(bursts) == 0 {
		timer.Stop()
		return
	}

	next := time.Time{}
	for _, current := range bursts {
		due := hub.dueAt(current)
		if next.IsZero() || due.Before(next) {
			next = due
		}
	}
	timer.Reset(max(0, next.Sub(now)))
}

// announceSettled announces every burst that is due, oldest first.
func (hub *Hub) announceSettled(running *session, bursts map[string]*burst, known map[string]bool, now time.Time) {
	due := []string{}
	for path, current := range bursts {
		if now.Before(hub.dueAt(current)) == false {
			due = append(due, path)
		}
	}
	sort.Slice(due, func(left, right int) bool {
		leftFirst, rightFirst := bursts[due[left]].first, bursts[due[right]].first
		if leftFirst.Equal(rightFirst) {
			return due[left] < due[right]
		}
		return leftFirst.Before(rightFirst)
	})

	for _, path := range due {
		settled := bursts[path]
		delete(bursts, path)

		// the kind comes from what existed before and what exists now, not from the raw events: an
		// atomic save arrives as a create even though the file was there all along.
		info, err := os.Stat(filepath.Join(running.root, filepath.FromSlash(path)))
		exists := err == nil && info.Mode().IsRegular()
		kind := changeKind(known[path], exists)
		if exists {
			known[path] = true
		} else {
			delete(known, path)
		}

		client := hub.claim(path, settled.last, now)
		if kind != "" {
			hub.broadcast(Change{Path: path, Kind: kind, Client: client})
		}
	}
}

// changeKind names what happened to a file from whether it existed before and whether it does now,
// or returns empty for a file that came and went within one burst.
func changeKind(existedBefore bool, existsNow bool) string {
	switch {
	case existedBefore && existsNow:
		return KindWrite
	case existsNow:
		return KindCreate
	case existedBefore:
		return KindRemove
	}

	return ""
}

// claim takes the expectations a burst accounts for and says whose write it was: the client every
// one of them names, or nobody when there were none or they disagree, so that a window never skips
// a change somebody else also made. Only expectations registered before the burst's last event count;
// a later one belongs to a write that has not landed yet.
func (hub *Hub) claim(path string, lastEvent time.Time, now time.Time) string {
	hub.mu.Lock()
	defer hub.mu.Unlock()

	client := ""
	claimed := 0
	agreed := true
	remaining := []*expectation{}
	for _, expected := range hub.expected[path] {
		if now.After(expected.deadline) {
			continue
		}
		if expected.registered.After(lastEvent) {
			remaining = append(remaining, expected)
			continue
		}
		if claimed > 0 && expected.client != client {
			agreed = false
		}
		client = expected.client
		claimed++
	}

	if len(remaining) == 0 {
		delete(hub.expected, path)
	} else {
		hub.expected[path] = remaining
	}

	if agreed == false {
		return ""
	}

	return client
}

// broadcast hands a change to every subscriber, dropping any that has fallen too far behind.
func (hub *Hub) broadcast(change Change) {
	hub.mu.Lock()
	defer hub.mu.Unlock()

	for subscription := range hub.subscribers {
		select {
		case subscription.changes <- change:
		default:
			close(subscription.changes)
			delete(hub.subscribers, subscription)
		}
	}
}

// dropSubscribers closes every feed, so each listener reconnects and reloads.
func (hub *Hub) dropSubscribers() {
	hub.mu.Lock()
	defer hub.mu.Unlock()

	for subscription := range hub.subscribers {
		close(subscription.changes)
		delete(hub.subscribers, subscription)
	}
}
