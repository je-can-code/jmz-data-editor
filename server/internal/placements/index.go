package placements

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"sync"

	"jmz-data-editor/server/internal/models/db"
	"jmz-data-editor/server/internal/store"
	"jmz-data-editor/server/internal/watch"
)

// mapInfosPath is the map tree's file, named the way the change stream names files.
const mapInfosPath = "data/MapInfos.json"

// mapFilePattern is the rough shape of a map file's name; mapIdOfFile checks the rest.
var mapFilePattern = regexp.MustCompile(`^Map(\d{3,})\.json$`)

// Placement is one map event standing as a battler of the enemy asked about.
type Placement struct {
	MapId int `json:"mapId"`

	// MapName is the map's name in the map tree, or empty for a map file the tree has no row for.
	MapName string `json:"mapName"`

	EventId   int    `json:"eventId"`
	EventName string `json:"eventName"`
	X         int    `json:"x"`
	Y         int    `json:"y"`

	// PageIndexes are the event's pages naming the enemy, counted from 0 in page order. The event is
	// that enemy only while the game has it on one of them.
	PageIndexes []int `json:"pageIndexes"`

	// PageCount is how many pages the event has in all.
	PageCount int `json:"pageCount"`
}

// BattlerPage is one map event standing as a battler of the enemy asked about, with the first of its pages naming
// that enemy, whole: its picture, its settings and its comments, which is what the map editor shapes a new battler of
// the enemy after.
type BattlerPage struct {
	MapId     int    `json:"mapId"`
	EventId   int    `json:"eventId"`
	EventName string `json:"eventName"`

	// Page is the first of the event's pages naming the enemy, exactly as the map file holds it.
	Page db.RpgMapEventPage `json:"page"`
}

// Arrival is one transfer, on any map, that names outright a tile of the map asked about as where it lands.
type Arrival struct {
	// MapId is the map the transfer is on, which may be the map asked about itself.
	MapId int `json:"mapId"`

	// MapName is that map's name in the map tree, or empty for a map file the tree has no row for.
	MapName string `json:"mapName"`

	EventId   int    `json:"eventId"`
	EventName string `json:"eventName"`

	// PageIndex is the event page holding the transfer, counted from 0.
	PageIndex int `json:"pageIndex"`

	// X and Y are the tile it lands on.
	X int `json:"x"`
	Y int `json:"y"`
}

// mapFacts is what the index keeps of one map once read: its battlers, the transfers on it, and the notes its events
// hold.
type mapFacts struct {
	battlers  []battler
	transfers []transfer
	notes     []eventNote
}

// Subscriber is where an index hears that files changed: the server's change stream, a *watch.Hub.
type Subscriber interface {
	Subscribe(root string) (*watch.Subscription, error)
}

// Index answers where an enemy is placed, which transfers land on a map, and what the events' notes hold, from a
// scan of every map that it keeps until a map changes.
//
// Finding any of them means decoding every map, far too slow to repeat for each answer, so each map's battlers,
// transfers and notes are kept once found and forgotten when the change stream says that map changed. To hear
// every change, the index listens for as long as it lives, and starts before it reads anything, which
// keeps the stream's watcher running from the first answer on. It applies what it heard at the start
// of each answer rather than as changes arrive, so no answer given after a change was announced can
// come from before it, whichever window asks and however quickly.
type Index struct {
	changes Subscriber

	// readMap reads and strictly decodes one map file.
	readMap func(path string) (*db.RpgMap, error)

	mu sync.Mutex

	// root is the project the cache describes.
	root string

	// subscription is the feed of changes to root's files, or nil before the first answer and after
	// the stream dropped the index.
	subscription *watch.Subscription

	// mapIds are the maps in the data folder, in id order, or nil when the folder must be listed again.
	mapIds []int

	// names are the map tree's names by map id, or nil when MapInfos.json must be read again.
	names map[int]string

	// scanned holds the battlers, transfers and notes of every map read since it last changed, by map id.
	scanned map[int]mapFacts
}

// NewIndex makes an index that hears about changed files from changes.
func NewIndex(changes Subscriber) *Index {
	return &Index{
		changes: changes,
		readMap: store.Load[*db.RpgMap],
		scanned: map[int]mapFacts{},
	}
}

// Placements answers every map event in the project at root that stands as a battler of an enemy, by
// map id and then event, each carrying its map's name from the map tree. The list is empty, never nil,
// when there are none.
//
// A map that cannot be read strictly fails the whole answer, naming its file, rather than leaving its
// battlers out of a list that would look complete.
func (index *Index) Placements(root string, enemyId int) ([]Placement, error) {
	index.mu.Lock()
	defer index.mu.Unlock()

	found := []Placement{}
	err := index.eachMap(root, func(mapId int, mapName string, facts mapFacts) {
		for _, standing := range facts.battlers {
			if standing.enemyId == enemyId {
				found = append(found, placementOf(mapId, mapName, standing))
			}
		}
	})
	if err != nil {
		return nil, err
	}

	return found, nil
}

// BattlerPages answers every map event in the project at root that stands as a battler of an enemy, by map id
// and then event, each with the first of its pages naming the enemy, whole. The list is empty, never nil, when
// there are none. The map editor shapes a new battler of the enemy after the ones already placed.
//
// A map that cannot be read strictly fails the whole answer, naming its file, as the placements do.
func (index *Index) BattlerPages(root string, enemyId int) ([]BattlerPage, error) {
	index.mu.Lock()
	defer index.mu.Unlock()

	found := []BattlerPage{}
	err := index.eachMap(root, func(mapId int, _ string, facts mapFacts) {
		for _, standing := range facts.battlers {
			if standing.enemyId == enemyId {
				found = append(found, BattlerPage{
					MapId:     mapId,
					EventId:   standing.eventId,
					EventName: standing.eventName,
					Page:      standing.firstPage,
				})
			}
		}
	})
	if err != nil {
		return nil, err
	}

	return found, nil
}

// Arrivals answers every transfer in the project at root that names outright a tile of the map asked about
// as where it lands, on any map, that one included: by map id, then event, page and command order, each
// carrying its map's name from the map tree. The list is empty, never nil, when there are none. This is what
// a resize of that map must warn about, since moving the map's tiles leaves every such transfer pointing at
// the old spot.
//
// A map that cannot be read strictly fails the whole answer, naming its file, rather than leaving its
// transfers out of a list that would look complete.
func (index *Index) Arrivals(root string, targetMapId int) ([]Arrival, error) {
	index.mu.Lock()
	defer index.mu.Unlock()

	found := []Arrival{}
	err := index.eachMap(root, func(mapId int, mapName string, facts mapFacts) {
		for _, landing := range facts.transfers {
			if landing.targetMapId == targetMapId {
				found = append(found, Arrival{
					MapId:     mapId,
					MapName:   mapName,
					EventId:   landing.eventId,
					EventName: landing.eventName,
					PageIndex: landing.pageIndex,
					X:         landing.x,
					Y:         landing.y,
				})
			}
		}
	})
	if err != nil {
		return nil, err
	}

	return found, nil
}

// EventNotes answers every event note in the project at root that holds anything, by map id and then event, each
// exactly as its map file holds it. Nearly every event's note is empty, and those are left out. The list is empty,
// never nil, when there are none. The map editor counts the copies of each blueprint from these, since a copy's note
// is where its link to the blueprint lives.
//
// A map that cannot be read strictly fails the whole answer, naming its file, rather than leaving its notes out of a
// list that would look complete: a blueprint whose copies on that map went uncounted could be deleted from under them.
func (index *Index) EventNotes(root string) ([]EventNote, error) {
	index.mu.Lock()
	defer index.mu.Unlock()

	found := []EventNote{}
	err := index.eachMap(root, func(mapId int, _ string, facts mapFacts) {
		for _, held := range facts.notes {
			found = append(found, EventNote{MapId: mapId, EventId: held.eventId, Note: held.note})
		}
	})
	if err != nil {
		return nil, err
	}

	return found, nil
}

// eachMap brings the cache up to date with the project at root and hands over what it knows of every map,
// in id order, with the map's name from the map tree. The caller holds the lock.
func (index *Index) eachMap(root string, visit func(mapId int, mapName string, facts mapFacts)) error {
	if err := index.follow(root); err != nil {
		return err
	}
	mapIds, err := index.listMaps()
	if err != nil {
		return err
	}
	names, err := index.mapNames()
	if err != nil {
		return err
	}

	for _, mapId := range mapIds {
		facts, err := index.scan(mapId)

		// a map removed since the folder was listed is gone, and the change saying so is on its way.
		if errors.Is(err, fs.ErrNotExist) {
			continue
		}
		if err != nil {
			return err
		}

		visit(mapId, names[mapId], facts)
	}

	return nil
}

// follow brings the cache up to date with the project at root: it starts listening when it is not yet,
// before anything is read, and otherwise applies every change heard since the last answer.
func (index *Index) follow(root string) error {
	// a different project shares nothing with the one cached.
	if index.subscription != nil && index.root != root {
		index.stopListening()
	}

	// whatever is cached was read while nobody listened for changes to it, so it all goes.
	if index.subscription == nil {
		subscription, err := index.changes.Subscribe(root)
		if err != nil {
			return err
		}
		index.subscription = subscription
		index.root = root
		index.forgetEverything()
		return nil
	}

	for {
		select {
		case change, open := <-index.subscription.Changes():
			// the stream dropped the index, so some changes went unheard: start again from nothing.
			if open == false {
				index.stopListening()
				return index.follow(root)
			}
			index.apply(change)
		default:
			return nil
		}
	}
}

// apply forgets whatever one change makes stale: the map tree's names, or what one map holds along
// with the list of maps, since a map file that changed may also be one that appeared or went away.
func (index *Index) apply(change watch.Change) {
	if change.Path == mapInfosPath {
		index.names = nil
		return
	}

	folder, name, _ := strings.Cut(change.Path, "/")
	mapId, isMap := mapIdOfFile(name)
	if folder != "data" || isMap == false {
		return
	}

	delete(index.scanned, mapId)
	index.mapIds = nil
}

// stopListening ends the subscription, which stops the watcher when nothing else is listening.
func (index *Index) stopListening() {
	index.subscription.Close()
	index.subscription = nil
}

// forgetEverything empties the cache.
func (index *Index) forgetEverything() {
	index.mapIds = nil
	index.names = nil
	index.scanned = map[int]mapFacts{}
}

// listMaps returns the id of every map file in the data folder, in id order, listing the folder only
// when the last list has gone stale.
func (index *Index) listMaps() ([]int, error) {
	if index.mapIds != nil {
		return index.mapIds, nil
	}

	entries, err := os.ReadDir(filepath.Join(index.root, "data"))
	if err != nil {
		return nil, err
	}

	mapIds := []int{}
	for _, entry := range entries {
		mapId, isMap := mapIdOfFile(entry.Name())
		if isMap && entry.Type().IsRegular() {
			mapIds = append(mapIds, mapId)
		}
	}

	// the folder lists names, and Map1000.json sorts before Map101.json by name.
	slices.Sort(mapIds)
	index.mapIds = mapIds
	return mapIds, nil
}

// mapNames returns the map tree's name for each map id, reading MapInfos.json only when the names
// have gone stale.
func (index *Index) mapNames() (map[int]string, error) {
	if index.names != nil {
		return index.names, nil
	}

	infos, err := store.Load[[]*db.RpgMapInfo](filepath.Join(index.root, filepath.FromSlash(mapInfosPath)))
	if err != nil {
		return nil, err
	}

	// the tree is indexed by map id, so every deleted map leaves a null behind.
	names := map[int]string{}
	for _, info := range infos {
		if info != nil {
			names[info.Id] = info.Name
		}
	}

	index.names = names
	return names, nil
}

// scan returns a map's battlers, transfers and notes, reading the map only when they are not already known.
// Only a clean read is kept, so a map that failed is read afresh next time rather than failing from
// memory.
func (index *Index) scan(mapId int) (mapFacts, error) {
	if facts, known := index.scanned[mapId]; known {
		return facts, nil
	}

	relativePath := "data/" + mapFileName(mapId)
	gameMap, err := index.readMap(filepath.Join(index.root, filepath.FromSlash(relativePath)))
	if err != nil {
		return mapFacts{}, err
	}
	battlers, err := scanMap(gameMap)
	if err != nil {
		return mapFacts{}, fmt.Errorf("%s: %w", relativePath, err)
	}

	// a map the battler scan accepted holds a map, so its transfers and notes can be read from it.
	facts := mapFacts{battlers: battlers, transfers: transfersOnMap(gameMap), notes: notesOnMap(gameMap)}
	index.scanned[mapId] = facts
	return facts, nil
}

// placementOf is one battler as the answer carries it, with its own copy of the page list so that
// nothing done with the answer can reach into the cache.
func placementOf(mapId int, mapName string, standing battler) Placement {
	return Placement{
		MapId:       mapId,
		MapName:     mapName,
		EventId:     standing.eventId,
		EventName:   standing.eventName,
		X:           standing.x,
		Y:           standing.y,
		PageIndexes: slices.Clone(standing.pageIndexes),
		PageCount:   standing.pageCount,
	}
}

// mapIdOfFile returns the map a data file holds, when its name is one MZ gives a map. The game loads
// map 7 from Map007.json and from nothing else, so the name must be exactly that padded one: Map7.json,
// or a copy such as Map007 (2).json, holds nothing the game will ever load. Map ids start at 1.
func mapIdOfFile(name string) (int, bool) {
	match := mapFilePattern.FindStringSubmatch(name)
	if match == nil {
		return 0, false
	}

	mapId, err := strconv.Atoi(match[1])
	if err != nil || mapId < 1 || mapFileName(mapId) != name {
		return 0, false
	}

	return mapId, true
}

// mapFileName is a map's file name, padded the way MZ pads it.
func mapFileName(mapId int) string {
	return fmt.Sprintf("Map%03d.json", mapId)
}
