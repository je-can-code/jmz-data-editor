// Package commandlist answers what the map editor's command list needs from a whole project at once: how
// often the project uses each command, which ranks its search, and the names of database rows, which its
// rows read as sentences with.
package commandlist

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"sync"
	"time"
)

// pluginCommandCode is the code MZ writes for a plugin command, whose first two parameters name the
// plugin and the command.
const pluginCommandCode = 357

// commonEventsFile is the file holding the common events, inside the data folder.
const commonEventsFile = "CommonEvents.json"

// countedFilePattern is the files usage is counted over: every map, and the common events.
var countedFilePattern = regexp.MustCompile(`^(Map\d{3,}|CommonEvents)\.json$`)

// Usage is how often a project uses each command, counted by events: a map event, whatever its pages,
// or a common event counts once for each command it uses at least once. How many events need a command
// says more about reaching for it than how often one long cutscene repeats it.
type Usage struct {
	// Events is how many events were counted.
	Events int `json:"events"`

	// Codes is the events using each command code, by the code written as text.
	Codes map[string]int `json:"codes"`

	// PluginCommands is the events using each plugin command, most used first: an empty list, never
	// null, when the project uses none.
	PluginCommands []PluginCommandUsage `json:"pluginCommands"`
}

// PluginCommandUsage is the events using one plugin command.
type PluginCommandUsage struct {
	// Plugin is the plugin as js/plugins.js names it, folders included ("j/abs/J-ABS").
	Plugin string `json:"plugin"`

	// Command is the command's name within its plugin.
	Command string `json:"command"`

	Events int `json:"events"`
}

// command is an event command as usage reads it: its code, and its parameters left undecoded until a
// plugin command needs its first two.
type command struct {
	Code       int               `json:"code"`
	Parameters []json.RawMessage `json:"parameters"`
}

// commandPage is an event page as usage reads it.
type commandPage struct {
	List []command `json:"list"`
}

// commandEvent is a map event as usage reads it.
type commandEvent struct {
	Pages []commandPage `json:"pages"`
}

// commandMap is a map file as usage reads it.
type commandMap struct {
	Events []*commandEvent `json:"events"`
}

// commandCommonEvent is a common event as usage reads it.
type commandCommonEvent struct {
	List []command `json:"list"`
}

// pluginKey names one plugin command.
type pluginKey struct {
	plugin  string
	command string
}

// eventUsage is what one event uses: each code once, and each plugin command once.
type eventUsage struct {
	codes   map[int]bool
	plugins map[pluginKey]bool
}

// countedFile is one file's events as last read, kept with the modification time and size it had then.
type countedFile struct {
	modTime time.Time
	size    int64
	events  []eventUsage
}

// Counter counts command usage across a project's maps and common events. It keeps each file's counts
// and reads a file again only when its modification time or size changed, so asking again costs a look
// at the data folder and nothing more.
type Counter struct {
	mu sync.Mutex

	// root is the project the kept counts belong to.
	root string

	// files are the kept counts, by file name inside the data folder.
	files map[string]countedFile
}

// NewCounter makes a counter holding nothing yet.
func NewCounter() *Counter {
	return &Counter{files: map[string]countedFile{}}
}

// Count answers the usage of every command in the project at root, across every map file and the common
// events. A file that is not valid JSON fails the whole answer, naming the file, rather than leaving its
// events out of counts that would look complete.
func (counter *Counter) Count(root string) (*Usage, error) {
	counter.mu.Lock()
	defer counter.mu.Unlock()

	// counts kept for another project say nothing about this one.
	if counter.root != root {
		counter.root = root
		counter.files = map[string]countedFile{}
	}

	dataDir := filepath.Join(root, "data")
	entries, err := os.ReadDir(dataDir)
	if err != nil {
		return nil, err
	}

	events := []eventUsage{}
	seen := map[string]bool{}
	for _, entry := range entries {
		if entry.IsDir() || countedFilePattern.MatchString(entry.Name()) == false {
			continue
		}

		counted, err := counter.read(dataDir, entry)
		if err != nil {
			return nil, err
		}
		seen[entry.Name()] = true
		events = append(events, counted...)
	}

	// a file gone from the folder takes its counts with it.
	for name := range counter.files {
		if seen[name] == false {
			delete(counter.files, name)
		}
	}

	return summarize(events), nil
}

// read answers one file's events, from what was kept when the file is unchanged since.
func (counter *Counter) read(dataDir string, entry os.DirEntry) ([]eventUsage, error) {
	info, err := entry.Info()
	if err != nil {
		return nil, err
	}

	kept, found := counter.files[entry.Name()]
	if found && kept.modTime.Equal(info.ModTime()) && kept.size == info.Size() {
		return kept.events, nil
	}

	content, err := os.ReadFile(filepath.Join(dataDir, entry.Name()))
	if err != nil {
		return nil, err
	}

	events, err := eventsOf(entry.Name(), content)
	if err != nil {
		return nil, fmt.Errorf("data/%s: %w", entry.Name(), err)
	}

	counter.files[entry.Name()] = countedFile{modTime: info.ModTime(), size: info.Size(), events: events}
	return events, nil
}

// eventsOf reads what each event in one file uses: each map event across all its pages, or each common
// event. Empty slots, which deleted events leave behind, are skipped.
func eventsOf(name string, content []byte) ([]eventUsage, error) {
	events := []eventUsage{}
	if name == commonEventsFile {
		var commonEvents []*commandCommonEvent
		if err := json.Unmarshal(content, &commonEvents); err != nil {
			return nil, err
		}
		for _, commonEvent := range commonEvents {
			if commonEvent != nil {
				events = append(events, usageOf(commonEvent.List))
			}
		}
		return events, nil
	}

	var gameMap *commandMap
	if err := json.Unmarshal(content, &gameMap); err != nil {
		return nil, err
	}
	if gameMap == nil {
		return events, nil
	}

	for _, event := range gameMap.Events {
		if event == nil {
			continue
		}
		lists := [][]command{}
		for _, page := range event.Pages {
			lists = append(lists, page.List)
		}
		events = append(events, usageOf(lists...))
	}

	return events, nil
}

// usageOf reads what one event uses across its command lists.
func usageOf(lists ...[]command) eventUsage {
	usage := eventUsage{codes: map[int]bool{}, plugins: map[pluginKey]bool{}}
	for _, list := range lists {
		for _, each := range list {
			usage.codes[each.Code] = true
			if key, ok := pluginKeyOf(each); ok {
				usage.plugins[key] = true
			}
		}
	}

	return usage
}

// pluginKeyOf names the plugin command a command calls, when it is one whose first two parameters are
// both text.
func pluginKeyOf(each command) (pluginKey, bool) {
	if each.Code != pluginCommandCode || len(each.Parameters) < 2 {
		return pluginKey{}, false
	}

	var key pluginKey
	if json.Unmarshal(each.Parameters[0], &key.plugin) != nil || json.Unmarshal(each.Parameters[1], &key.command) != nil {
		return pluginKey{}, false
	}

	return key, true
}

// summarize adds every event's usage up.
func summarize(events []eventUsage) *Usage {
	codes := map[string]int{}
	plugins := map[pluginKey]int{}
	for _, event := range events {
		for code := range event.codes {
			codes[strconv.Itoa(code)]++
		}
		for key := range event.plugins {
			plugins[key]++
		}
	}

	pluginCommands := []PluginCommandUsage{}
	for key, count := range plugins {
		pluginCommands = append(pluginCommands, PluginCommandUsage{Plugin: key.plugin, Command: key.command, Events: count})
	}

	// most used first, then by name, so the answer never shuffles between asks.
	sort.Slice(pluginCommands, func(left int, right int) bool {
		a, b := pluginCommands[left], pluginCommands[right]
		if a.Events != b.Events {
			return a.Events > b.Events
		}
		if a.Plugin != b.Plugin {
			return a.Plugin < b.Plugin
		}
		return a.Command < b.Command
	})

	return &Usage{Events: len(events), Codes: codes, PluginCommands: pluginCommands}
}
