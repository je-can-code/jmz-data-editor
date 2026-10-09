// Package blueprintuses merges changes into the map editor's record of where blueprints are placed,
// jmz-editor/blueprint-uses.json: per map, by id, and per blueprint on it, every placement of the
// blueprint's tiles, by the cell its top-left corner was put down at and, for a placement cut off by
// the map's edge, the part of the blueprint that went down.
//
//	{
//	  "schemaVersion": 2,
//	  "data": {
//	    "maps": {
//	      "16": {
//	        "k3x9q2mf": [
//	          { "x": 4, "y": 7 },
//	          { "x": 18, "y": 3, "placed": { "x": 0, "y": 0, "width": 2, "height": 6 } }
//	        ]
//	      }
//	    }
//	  }
//	}
//
// The record describes the maps on disk, so a map's part of it reaches the disk only when that map's
// file does, from whichever window wrote the map, and two windows writing two maps at the same moment
// must both land. The editor therefore never writes the record whole: it hands over only the parts it
// changed, and they are merged here into the file as it stands, every other map's part staying exactly
// as the file holds it, the way a rename of a switch goes into System.json and nothing else does.
package blueprintuses

import (
	"bytes"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strconv"

	"jmz-data-editor/server/internal/mzjson"
)

// Key is the record's name among the editor's own documents, which it is read by and never written by
// whole.
const Key = "blueprint-uses"

// File is where the record lives inside the project, relative to its root.
const File = "jmz-editor/" + Key + ".json"

// mapKey is the shape of a map's key in the record: its id, written as the file writes numbers.
var mapKey = regexp.MustCompile(`^[1-9][0-9]*$`)

// blueprintID is the shape of a blueprint's id: lowercase letters and digits, at least one.
var blueprintID = regexp.MustCompile(`^[a-z0-9]+$`)

// Part is the part of a blueprint a placement put down, counted from the blueprint's own top-left
// corner: what is left of it once the map's edge cut the rest off.
type Part struct {
	X      int
	Y      int
	Width  int
	Height int
}

// Placement is one placement of a blueprint's tiles on one map: the cell its corner was put down at,
// and the part that went down, or nil for the whole blueprint.
type Placement struct {
	MapID     int
	Blueprint string
	X         int
	Y         int
	Placed    *Part
}

// MapEntry is one map's placements given whole: an object of blueprint ids to lists of placements, as
// the record holds it, or nil for a map holding none, whose entry goes.
type MapEntry struct {
	MapID int
	Entry *mzjson.Value
}

// Changes is one merge, applied in this order: the maps given whole, then the single placements taken
// out, then the single placements put in. Whole maps are what a map's save and the map tree write;
// single placements are what forgetting one writes, without touching anything else of its map.
type Changes struct {
	// SchemaVersion is the version of the record's shape the editor writes. A record of a newer one is
	// never written over, and an older one is raised to it.
	SchemaVersion int

	// Maps are the maps whose placements are given whole, in the order given.
	Maps []MapEntry

	// Remove are placements taken out of their maps, wherever the file holds them.
	Remove []Placement

	// Add are placements put in their maps, each in place of its blueprint's at the same corner.
	Add []Placement
}

// ChangesError is a body that is not a merge of placements, refused before anything touches the disk.
type ChangesError struct {
	reason string
}

// Error words what is wrong with the body.
func (err ChangesError) Error() string {
	return err.reason
}

// RecordError is a file that is not a record of placements. It is never written over, since whatever
// it holds could not be carried over.
type RecordError struct {
	reason string
}

// Error words what is wrong with the file.
func (err RecordError) Error() string {
	return File + " " + err.reason + ", so it is never written over"
}

// NewerRecordError is a record written by a newer editor than the one asking to change it, which
// could not tell what of it a merge would lose.
type NewerRecordError struct {
	version int
}

// Error words the refusal.
func (err NewerRecordError) Error() string {
	return fmt.Sprintf("%s was written by a newer editor (version %d)", File, err.version)
}

// errNothing is a body that names nothing to change.
var errNothing = ChangesError{reason: "the body changes no placements"}

//region reading the body

// Parse reads one merge from a request body, strictly: every key is one the merge knows, every number
// a whole one, and every placement whole. Anything else is a ChangesError naming what is wrong.
func Parse(body []byte) (Changes, error) {
	root, err := mzjson.Parse(body)
	if err != nil {
		return Changes{}, ChangesError{reason: "the body is not JSON (" + err.Error() + ")"}
	}
	if err := requireMembers(root, "the body", []string{"schemaVersion"}, []string{"maps", "remove", "add"}); err != nil {
		return Changes{}, err
	}

	version, ok := wholeNumber(root.Member("schemaVersion"))
	if ok == false || version < 1 {
		return Changes{}, ChangesError{reason: "schemaVersion must be a whole number from 1 up"}
	}

	changes := Changes{SchemaVersion: version}
	if maps := root.Member("maps"); maps != nil {
		if changes.Maps, err = parseMaps(maps); err != nil {
			return Changes{}, err
		}
	}
	if remove := root.Member("remove"); remove != nil {
		if changes.Remove, err = parsePlacements(remove, "remove", false); err != nil {
			return Changes{}, err
		}
	}
	if add := root.Member("add"); add != nil {
		if changes.Add, err = parsePlacements(add, "add", true); err != nil {
			return Changes{}, err
		}
	}

	if len(changes.Maps) == 0 && len(changes.Remove) == 0 && len(changes.Add) == 0 {
		return Changes{}, errNothing
	}

	return changes, nil
}

// parseMaps reads the maps given whole: each map's key and its entry, or null for none.
func parseMaps(maps *mzjson.Value) ([]MapEntry, error) {
	if maps.Kind != mzjson.Object {
		return nil, ChangesError{reason: "maps must be an object of map ids"}
	}
	if err := requireUniqueKeys(maps, "maps"); err != nil {
		return nil, err
	}

	entries := []MapEntry{}
	for _, member := range maps.Members {
		if mapKey.MatchString(member.Key) == false {
			return nil, ChangesError{reason: fmt.Sprintf("maps holds %q, which is no map's id", member.Key)}
		}
		mapID, _ := strconv.Atoi(member.Key)
		if member.Value.Kind == mzjson.Null {
			entries = append(entries, MapEntry{MapID: mapID})
			continue
		}
		if err := checkEntry(member.Value, "map "+member.Key, ChangesError{}); err != nil {
			return nil, err
		}
		entries = append(entries, MapEntry{MapID: mapID, Entry: member.Value})
	}

	return entries, nil
}

// parsePlacements reads a list of single placements, each naming its map and its blueprint; those put
// in may say the part that went down, and those taken out are named by their corner alone.
func parsePlacements(list *mzjson.Value, name string, withPart bool) ([]Placement, error) {
	if list.Kind != mzjson.Array {
		return nil, ChangesError{reason: name + " must be a list of placements"}
	}

	optional := []string{}
	if withPart {
		optional = append(optional, "placed")
	}

	placements := []Placement{}
	for index, item := range list.Items {
		where := fmt.Sprintf("%s[%d]", name, index)
		if err := requireMembers(item, where, []string{"map", "blueprint", "x", "y"}, optional); err != nil {
			return nil, err
		}

		mapID, ok := wholeNumber(item.Member("map"))
		if ok == false || mapID < 1 {
			return nil, ChangesError{reason: where + ".map must be a map's id"}
		}
		blueprint := item.Member("blueprint")
		if blueprint.Kind != mzjson.String || blueprintID.MatchString(blueprint.Text) == false {
			return nil, ChangesError{reason: where + ".blueprint must be a blueprint's id"}
		}
		x, xOk := wholeNumber(item.Member("x"))
		y, yOk := wholeNumber(item.Member("y"))
		if xOk == false || yOk == false {
			return nil, ChangesError{reason: where + " must name its corner in whole numbers"}
		}

		placement := Placement{MapID: mapID, Blueprint: blueprint.Text, X: x, Y: y}
		if placed := item.Member("placed"); placed != nil {
			part, err := readPart(placed, where+".placed", ChangesError{})
			if err != nil {
				return nil, err
			}
			placement.Placed = &part
		}
		placements = append(placements, placement)
	}

	return placements, nil
}

//endregion reading the body

//region checking shapes

// checkEntry checks one map's entry: an object of blueprint ids, each a list of placements, no two of
// a blueprint's at one corner. A problem comes back as the kind of error the caller passes, worded with
// where it was found.
func checkEntry(entry *mzjson.Value, where string, kind error) error {
	if entry.Kind != mzjson.Object {
		return wrongShape(kind, where+" must be an object of blueprint ids")
	}
	if err := requireUniqueKeys(entry, where); err != nil {
		return wrongShape(kind, err.Error())
	}

	for _, member := range entry.Members {
		if blueprintID.MatchString(member.Key) == false {
			return wrongShape(kind, fmt.Sprintf("%s holds %q, which is no blueprint's id", where, member.Key))
		}
		if member.Value.Kind != mzjson.Array {
			return wrongShape(kind, fmt.Sprintf("%s.%s must be a list of placements", where, member.Key))
		}

		corners := map[[2]int]bool{}
		for index, spot := range member.Value.Items {
			corner, err := readSpot(spot, fmt.Sprintf("%s.%s[%d]", where, member.Key, index), kind)
			if err != nil {
				return err
			}
			if corners[corner] {
				return wrongShape(kind, fmt.Sprintf("%s.%s holds two placements at %d, %d", where, member.Key, corner[0], corner[1]))
			}
			corners[corner] = true
		}
	}

	return nil
}

// readSpot checks one placement inside an entry, {x, y} and maybe the part placed, and reads its
// corner.
func readSpot(spot *mzjson.Value, where string, kind error) ([2]int, error) {
	if err := requireMembers(spot, where, []string{"x", "y"}, []string{"placed"}); err != nil {
		return [2]int{}, wrongShape(kind, err.Error())
	}

	x, xOk := wholeNumber(spot.Member("x"))
	y, yOk := wholeNumber(spot.Member("y"))
	if xOk == false || yOk == false {
		return [2]int{}, wrongShape(kind, where+" must name its corner in whole numbers")
	}
	if placed := spot.Member("placed"); placed != nil {
		if _, err := readPart(placed, where+".placed", kind); err != nil {
			return [2]int{}, err
		}
	}

	return [2]int{x, y}, nil
}

// readPart reads the part of a blueprint a placement put down: a rectangle inside the blueprint, from
// its corner, at least one tile each way.
func readPart(placed *mzjson.Value, where string, kind error) (Part, error) {
	if err := requireMembers(placed, where, []string{"x", "y", "width", "height"}, nil); err != nil {
		return Part{}, wrongShape(kind, err.Error())
	}

	x, xOk := wholeNumber(placed.Member("x"))
	y, yOk := wholeNumber(placed.Member("y"))
	width, widthOk := wholeNumber(placed.Member("width"))
	height, heightOk := wholeNumber(placed.Member("height"))
	if xOk == false || yOk == false || widthOk == false || heightOk == false || x < 0 || y < 0 || width < 1 || height < 1 {
		return Part{}, wrongShape(kind, where+" must be a rectangle inside the blueprint, from 0 and at least 1 by 1")
	}

	return Part{X: x, Y: y, Width: width, Height: height}, nil
}

// requireMembers checks an object holds every required key, nothing outside the required and optional
// ones, and no key twice.
func requireMembers(value *mzjson.Value, where string, required []string, optional []string) error {
	if value.Kind != mzjson.Object {
		return ChangesError{reason: where + " must be an object"}
	}
	if err := requireUniqueKeys(value, where); err != nil {
		return err
	}

	known := map[string]bool{}
	for _, key := range append(append([]string{}, required...), optional...) {
		known[key] = true
	}
	for _, member := range value.Members {
		if known[member.Key] == false {
			return ChangesError{reason: fmt.Sprintf("%s holds %q, which a record of placements has no use for", where, member.Key)}
		}
	}
	for _, key := range required {
		if value.Member(key) == nil {
			return ChangesError{reason: fmt.Sprintf("%s has no %q", where, key)}
		}
	}

	return nil
}

// requireUniqueKeys refuses an object naming one key twice, which would read one way here and another
// way in the editor.
func requireUniqueKeys(value *mzjson.Value, where string) error {
	seen := map[string]bool{}
	for _, member := range value.Members {
		if seen[member.Key] {
			return ChangesError{reason: fmt.Sprintf("%s names %q twice", where, member.Key)}
		}
		seen[member.Key] = true
	}

	return nil
}

// wrongShape words a problem as the kind of error the caller asked for: a body that is no merge, or a
// file that is no record.
func wrongShape(kind error, reason string) error {
	var record RecordError
	if errors.As(kind, &record) {
		return RecordError{reason: "holds something that is not a placement: " + reason}
	}

	return ChangesError{reason: reason}
}

// wholeNumber reads a whole number, written as JSON writes one; anything else is not one.
func wholeNumber(value *mzjson.Value) (int, bool) {
	if value == nil || value.Kind != mzjson.Number {
		return 0, false
	}
	number, err := strconv.Atoi(value.Text)
	if err != nil {
		return 0, false
	}

	return number, true
}

//endregion checking shapes

//region merging

// Apply merges the changes into the record as the file holds it, and lays the result out the way the
// editor's own files are, indented. current is the file's content, or nil when there is no record yet,
// which starts empty at the changes' version.
//
// Only what the changes name moves. A map given whole takes exactly the entry given, put among the
// others in the order of their ids; a placement taken out goes from its map wherever the file holds it,
// and its map's entry goes with its last placement; a placement put in takes the place of any of its
// blueprint's at the same corner, its blueprint kept among the others by id and its placements row by
// row. Every other map, and every other byte of the record's own, stays exactly as the file holds it.
//
// A merge leaving nothing to write hands back nil: one that leaves the record byte for byte as the file
// holds it, and one that would start a record holding no placements at all. The editor sends a map's
// placements with every save of the map, since only the file knows what another window wrote there
// since, so saving a map whose placements did not change never touches the file, and a project that
// places no blueprints never gains one.
func Apply(current []byte, changes Changes) ([]byte, error) {
	root, maps, err := openRecord(current, changes.SchemaVersion)
	if err != nil {
		return nil, err
	}

	for _, given := range changes.Maps {
		if given.Entry == nil || len(given.Entry.Members) == 0 {
			removeMember(maps, strconv.Itoa(given.MapID))
			continue
		}
		setMapMember(maps, given.MapID, given.Entry)
	}

	for _, placement := range changes.Remove {
		if err := removePlacement(maps, placement); err != nil {
			return nil, err
		}
	}

	for _, placement := range changes.Add {
		if err := addPlacement(maps, placement); err != nil {
			return nil, err
		}
	}

	// a project with no record is given none while there is nothing to record.
	if current == nil && len(maps.Members) == 0 {
		return nil, nil
	}

	content, err := mzjson.IndentedLayout(root)
	if err != nil {
		return nil, err
	}

	// a record the merge leaves as the file holds it is not written again.
	if bytes.Equal(content, current) {
		return nil, nil
	}

	return content, nil
}

// openRecord reads the record a merge changes, or starts an empty one at the given version when there
// is no file, and raises an older record to that version. It hands back the record and its maps.
func openRecord(current []byte, version int) (*mzjson.Value, *mzjson.Value, error) {
	if current == nil {
		maps := &mzjson.Value{Kind: mzjson.Object}
		data := &mzjson.Value{Kind: mzjson.Object, Members: []mzjson.Member{{Key: "maps", Value: maps}}}
		root := &mzjson.Value{Kind: mzjson.Object, Members: []mzjson.Member{
			{Key: "schemaVersion", Value: numberValue(version)},
			{Key: "data", Value: data},
		}}
		return root, maps, nil
	}

	root, err := mzjson.Parse(current)
	if err != nil {
		return nil, nil, RecordError{reason: "is not JSON (" + err.Error() + ")"}
	}
	if root.Kind != mzjson.Object {
		return nil, nil, RecordError{reason: "is not a record of placements"}
	}

	saved, ok := wholeNumber(root.Member("schemaVersion"))
	data := root.Member("data")
	if ok == false || data == nil || data.Kind != mzjson.Object {
		return nil, nil, RecordError{reason: "is not a record of placements"}
	}
	maps := data.Member("maps")
	if maps == nil || maps.Kind != mzjson.Object {
		return nil, nil, RecordError{reason: "is not a record of placements"}
	}
	if err := requireUniqueKeys(maps, "its maps"); err != nil {
		return nil, nil, RecordError{reason: "holds something that is not a placement: " + err.Error()}
	}
	for _, member := range maps.Members {
		if mapKey.MatchString(member.Key) == false {
			return nil, nil, RecordError{reason: fmt.Sprintf("holds %q, which is no map's id", member.Key)}
		}
	}

	if saved > version {
		return nil, nil, NewerRecordError{version: saved}
	}
	if saved < version {
		setMember(root, "schemaVersion", numberValue(version))
	}

	return root, maps, nil
}

// removePlacement takes one placement out of its map, wherever the file holds it: a map or a blueprint
// the file does not hold it under is left as it is. A blueprint left with no placements goes, and so
// does a map left with no blueprints.
func removePlacement(maps *mzjson.Value, placement Placement) error {
	key := strconv.Itoa(placement.MapID)
	entry := maps.Member(key)
	if entry == nil {
		return nil
	}
	if err := checkEntry(entry, "map "+key, RecordError{}); err != nil {
		return err
	}

	list := entry.Member(placement.Blueprint)
	if list == nil {
		return nil
	}

	list.Items = withoutCorner(list.Items, placement.X, placement.Y)
	if len(list.Items) == 0 {
		removeMember(entry, placement.Blueprint)
	}
	if len(entry.Members) == 0 {
		removeMember(maps, key)
	}

	return nil
}

// addPlacement puts one placement in its map, in place of its blueprint's at the same corner, the map's
// entry and the blueprint's list made when the file holds neither.
func addPlacement(maps *mzjson.Value, placement Placement) error {
	key := strconv.Itoa(placement.MapID)
	entry := maps.Member(key)
	if entry == nil {
		entry = &mzjson.Value{Kind: mzjson.Object}
		setMapMember(maps, placement.MapID, entry)
	}
	if err := checkEntry(entry, "map "+key, RecordError{}); err != nil {
		return err
	}

	list := entry.Member(placement.Blueprint)
	if list == nil {
		list = &mzjson.Value{Kind: mzjson.Array}
		setSortedMember(entry, placement.Blueprint, list)
	}

	// the record lists each blueprint's placements row by row, and so does this one's.
	list.Items = append(withoutCorner(list.Items, placement.X, placement.Y), spotValue(placement))
	sort.SliceStable(list.Items, func(left int, right int) bool {
		leftX, _ := wholeNumber(list.Items[left].Member("x"))
		leftY, _ := wholeNumber(list.Items[left].Member("y"))
		rightX, _ := wholeNumber(list.Items[right].Member("x"))
		rightY, _ := wholeNumber(list.Items[right].Member("y"))
		if leftY != rightY {
			return leftY < rightY
		}
		return leftX < rightX
	})

	return nil
}

// withoutCorner lists the placements not at a corner, in their order.
func withoutCorner(items []*mzjson.Value, x int, y int) []*mzjson.Value {
	kept := []*mzjson.Value{}
	for _, item := range items {
		itemX, _ := wholeNumber(item.Member("x"))
		itemY, _ := wholeNumber(item.Member("y"))
		if itemX != x || itemY != y {
			kept = append(kept, item)
		}
	}

	return kept
}

// spotValue builds a placement as an entry lists it: its corner, and the part placed when it is not the
// whole blueprint.
func spotValue(placement Placement) *mzjson.Value {
	spot := &mzjson.Value{Kind: mzjson.Object, Members: []mzjson.Member{
		{Key: "x", Value: numberValue(placement.X)},
		{Key: "y", Value: numberValue(placement.Y)},
	}}
	if placement.Placed != nil {
		part := placement.Placed
		spot.Members = append(spot.Members, mzjson.Member{Key: "placed", Value: &mzjson.Value{Kind: mzjson.Object, Members: []mzjson.Member{
			{Key: "x", Value: numberValue(part.X)},
			{Key: "y", Value: numberValue(part.Y)},
			{Key: "width", Value: numberValue(part.Width)},
			{Key: "height", Value: numberValue(part.Height)},
		}}})
	}

	return spot
}

// setMapMember gives a map its entry: in place of the one the record holds, or among the others in the
// order of their ids, which is the order the editor writes them in.
func setMapMember(maps *mzjson.Value, mapID int, entry *mzjson.Value) {
	key := strconv.Itoa(mapID)
	if maps.Member(key) != nil {
		setMember(maps, key, entry)
		return
	}

	at := len(maps.Members)
	for index, member := range maps.Members {
		other, _ := strconv.Atoi(member.Key)
		if other > mapID {
			at = index
			break
		}
	}
	insertMember(maps, at, mzjson.Member{Key: key, Value: entry})
}

// setSortedMember adds a member to an object kept in the order of its keys.
func setSortedMember(object *mzjson.Value, key string, value *mzjson.Value) {
	at := len(object.Members)
	for index, member := range object.Members {
		if member.Key > key {
			at = index
			break
		}
	}
	insertMember(object, at, mzjson.Member{Key: key, Value: value})
}

// insertMember puts a member at a place among an object's members.
func insertMember(object *mzjson.Value, at int, member mzjson.Member) {
	object.Members = append(object.Members, mzjson.Member{})
	copy(object.Members[at+1:], object.Members[at:])
	object.Members[at] = member
}

// setMember replaces the value of a member an object holds.
func setMember(object *mzjson.Value, key string, value *mzjson.Value) {
	for index := range object.Members {
		if object.Members[index].Key == key {
			object.Members[index].Value = value
			return
		}
	}
}

// removeMember takes a member out of an object, when it holds it.
func removeMember(object *mzjson.Value, key string) {
	kept := object.Members[:0]
	for _, member := range object.Members {
		if member.Key != key {
			kept = append(kept, member)
		}
	}
	object.Members = kept
}

// numberValue builds a whole number as JSON writes it.
func numberValue(number int) *mzjson.Value {
	return &mzjson.Value{Kind: mzjson.Number, Text: strconv.Itoa(number)}
}

//endregion merging
