// Package blueprintwrites reads and applies one change to a blueprint as the map editor writes it to disk, in one act:
// the blueprints' own file, jmz-editor/blueprints.json, given whole, and the patches every map file the change reached
// takes, the copies of the blueprint on that map following it.
//
// A map's patches are applied to its file as it stands at that moment, never to a copy the editor read earlier, and each
// is checked first against what the file holds where it lands: a tile's old value, or the whole value a path held. So a
// map's unsaved edits never reach its file this way, since the editor plans the file's patches against the file, and a
// file changed since the editor last read it, by MZ or by hand, is refused rather than written over: nothing of the act
// is written, and the editor hears which map no longer held what the change replaced.
//
// The patches are the editor's own (see the map editor's patches.ts): "tiles", naming flat cells of the map's tile data
// with their values before and after, and "set", naming a path into the map and the whole value there before and after.
// A value set is written with the key order of the value it replaces, so writing a change and taking it back leaves the
// file byte for byte as it was.
package blueprintwrites

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"reflect"
	"strconv"
	"strings"

	"jmz-data-editor/server/internal/models/db"
	"jmz-data-editor/server/internal/mzjson"
)

// typeOfMap is the model every map file must still decode into once a change is written into it.
var typeOfMap = reflect.TypeFor[*db.RpgMap]()

// PathSegment is one step of a set patch's path: an object's key, or an array's index.
type PathSegment struct {
	Key     string
	Index   int
	IsIndex bool
}

// Patch is one change to a map file: tiles, or a value set at a path.
type Patch struct {
	// Kind is "tiles" or "set".
	Kind string

	// Indices, Before and After are a tiles patch's cells and their values on either side.
	Indices []int
	Before  []int
	After   []int

	// Path, Was and Becomes are a set patch's path and the values there on either side.
	Path    []PathSegment
	Was     *mzjson.Value
	Becomes *mzjson.Value
}

// MapWrite is every patch one map's file takes, in the order they go.
type MapWrite struct {
	MapID   int
	Patches []Patch
}

// Changes is one act: the blueprints given whole, or nil to leave their file alone, and every map's patches, each map
// named once. Check asks for every patch to be tried and nothing written.
type Changes struct {
	Check      bool
	Blueprints *mzjson.Value
	Maps       []MapWrite
}

// ChangesError is a body that is not a change to a blueprint, refused before anything touches the disk.
type ChangesError struct {
	reason string
}

// Error words what is wrong with the body.
func (err ChangesError) Error() string {
	return err.reason
}

// MismatchError is a map file no longer holding what a patch replaces, which nothing writes over.
type MismatchError struct {
	MapID  int
	reason string
}

// Error words where the file differs.
func (err MismatchError) Error() string {
	return fmt.Sprintf("Map %03d no longer holds what the change replaced: %s", err.MapID, err.reason)
}

//region reading the body

// Parse reads one act from a request body, strictly: every key is one the act knows, every map named once by a whole
// id from 1, and every patch whole. Anything else is a ChangesError naming what is wrong.
func Parse(body []byte) (Changes, error) {
	root, err := mzjson.Parse(body)
	if err != nil {
		return Changes{}, ChangesError{reason: "the body is not JSON (" + err.Error() + ")"}
	}
	if err := requireMembers(root, "the body", nil, []string{"check", "blueprints", "maps"}); err != nil {
		return Changes{}, err
	}

	changes := Changes{}
	if check := root.Member("check"); check != nil {
		if check.Kind != mzjson.Bool {
			return Changes{}, ChangesError{reason: "check must be true or false"}
		}
		changes.Check = check.Text == "true"
	}
	if blueprints := root.Member("blueprints"); blueprints != nil {
		if blueprints.Kind != mzjson.Object || blueprints.Member("schemaVersion") == nil || blueprints.Member("data") == nil {
			return Changes{}, ChangesError{reason: "blueprints must be the blueprints' whole document, its version beside its data"}
		}
		changes.Blueprints = blueprints
	}
	if maps := root.Member("maps"); maps != nil {
		if changes.Maps, err = parseMaps(maps); err != nil {
			return Changes{}, err
		}
	}

	if changes.Blueprints == nil && len(changes.Maps) == 0 {
		return Changes{}, ChangesError{reason: "the body changes nothing"}
	}

	return changes, nil
}

// parseMaps reads each map's patches, each map named once.
func parseMaps(maps *mzjson.Value) ([]MapWrite, error) {
	if maps.Kind != mzjson.Array {
		return nil, ChangesError{reason: "maps must be a list of maps"}
	}

	writes := []MapWrite{}
	named := map[int]bool{}
	for index, item := range maps.Items {
		where := fmt.Sprintf("maps[%d]", index)
		if err := requireMembers(item, where, []string{"map", "patches"}, nil); err != nil {
			return nil, err
		}
		mapID, ok := wholeNumber(item.Member("map"))
		if ok == false || mapID < 1 {
			return nil, ChangesError{reason: where + ".map must be a map's id"}
		}
		if named[mapID] {
			return nil, ChangesError{reason: fmt.Sprintf("map %d is named twice", mapID)}
		}
		named[mapID] = true

		list := item.Member("patches")
		if list.Kind != mzjson.Array {
			return nil, ChangesError{reason: where + ".patches must be a list of patches"}
		}
		patches := []Patch{}
		for patchIndex, patchValue := range list.Items {
			patch, err := parsePatch(patchValue, fmt.Sprintf("%s.patches[%d]", where, patchIndex))
			if err != nil {
				return nil, err
			}
			patches = append(patches, patch)
		}
		writes = append(writes, MapWrite{MapID: mapID, Patches: patches})
	}

	return writes, nil
}

// parsePatch reads one patch: tiles, or a value set at a path.
func parsePatch(value *mzjson.Value, where string) (Patch, error) {
	if value.Kind != mzjson.Object || value.Member("kind") == nil || value.Member("kind").Kind != mzjson.String {
		return Patch{}, ChangesError{reason: where + " must be a patch naming its kind"}
	}

	switch value.Member("kind").Text {
	case "tiles":
		return parseTiles(value, where)
	case "set":
		return parseSet(value, where)
	default:
		return Patch{}, ChangesError{reason: fmt.Sprintf("%s is a %q patch, which a blueprint's change never writes", where, value.Member("kind").Text)}
	}
}

// parseTiles reads a tiles patch: as many cells as values on either side, each a whole number.
func parseTiles(value *mzjson.Value, where string) (Patch, error) {
	if err := requireMembers(value, where, []string{"kind", "indices", "before", "after"}, nil); err != nil {
		return Patch{}, err
	}

	indices, indicesOk := wholeNumbers(value.Member("indices"))
	before, beforeOk := wholeNumbers(value.Member("before"))
	after, afterOk := wholeNumbers(value.Member("after"))
	if indicesOk == false || beforeOk == false || afterOk == false || len(before) != len(indices) || len(after) != len(indices) {
		return Patch{}, ChangesError{reason: where + " must name as many cells as values on either side, all whole numbers"}
	}

	return Patch{Kind: "tiles", Indices: indices, Before: before, After: after}, nil
}

// parseSet reads a set patch: a path of keys and indexes, at least one step long, and the value on either side.
func parseSet(value *mzjson.Value, where string) (Patch, error) {
	if err := requireMembers(value, where, []string{"kind", "path", "before", "after"}, nil); err != nil {
		return Patch{}, err
	}

	pathValue := value.Member("path")
	if pathValue.Kind != mzjson.Array || len(pathValue.Items) == 0 {
		return Patch{}, ChangesError{reason: where + ".path must be a list of keys and indexes, at least one long"}
	}
	path := []PathSegment{}
	for _, step := range pathValue.Items {
		if step.Kind == mzjson.String {
			path = append(path, PathSegment{Key: step.Text})
			continue
		}
		index, ok := wholeNumber(step)
		if ok == false || index < 0 {
			return Patch{}, ChangesError{reason: where + ".path must hold keys and indexes from 0 only"}
		}
		path = append(path, PathSegment{Index: index, IsIndex: true})
	}

	return Patch{Kind: "set", Path: path, Was: value.Member("before"), Becomes: value.Member("after")}, nil
}

//endregion reading the body

//region applying patches

// ApplyToMap applies a map's patches to its file as it stands, in order, each checked first against what the file
// holds where it lands, and lays the result out the way MZ writes a map. The result must still be a whole map, every key
// its model declares spelled out and none it does not; anything else is refused, and so is a file no longer holding
// what a patch replaces (MismatchError).
func ApplyToMap(mapID int, file []byte, patches []Patch) ([]byte, error) {
	root, err := mzjson.Parse(file)
	if err != nil {
		return nil, fmt.Errorf("Map %03d is not JSON: %w", mapID, err)
	}

	for _, patch := range patches {
		if patch.Kind == "tiles" {
			err = applyTiles(mapID, root, patch)
		} else {
			err = applySet(mapID, root, patch)
		}
		if err != nil {
			return nil, err
		}
	}

	laid, err := mzjson.MapLayout(root)
	if err != nil {
		return nil, err
	}
	if err := requireWholeMap(laid); err != nil {
		return nil, ChangesError{reason: fmt.Sprintf("the change would leave Map %03d no whole map: %s", mapID, err.Error())}
	}

	return laid, nil
}

// applyTiles writes a tiles patch into the map's tile data, every cell checked before any is written.
func applyTiles(mapID int, root *mzjson.Value, patch Patch) error {
	data := root.Member("data")
	if data == nil || data.Kind != mzjson.Array {
		return MismatchError{MapID: mapID, reason: "it holds no tiles"}
	}

	for position, index := range patch.Indices {
		if index < 0 || index >= len(data.Items) {
			return MismatchError{MapID: mapID, reason: "it is not the size it was"}
		}
		held, ok := wholeNumber(data.Items[index])
		if ok == false || held != patch.Before[position] {
			return MismatchError{MapID: mapID, reason: describeCell(root, index) + " changed"}
		}
	}

	for position, index := range patch.Indices {
		data.Items[index] = &mzjson.Value{Kind: mzjson.Number, Text: strconv.Itoa(patch.After[position])}
	}

	return nil
}

// applySet replaces the value at a path, once the value there is found to be the one the patch replaces; the new value
// takes the replaced one's key order, so taking the change back writes the old value exactly as it was.
func applySet(mapID int, root *mzjson.Value, patch Patch) error {
	parent := root
	for _, step := range patch.Path[:len(patch.Path)-1] {
		parent = childAt(parent, step)
		if parent == nil {
			return MismatchError{MapID: mapID, reason: spotWords(patch.Path, true)}
		}
	}

	// an event deleted in MZ leaves null in its slot, which is as gone as a slot that is not there.
	last := patch.Path[len(patch.Path)-1]
	held := childAt(parent, last)
	if held == nil || (held.Kind == mzjson.Null && patch.Was.Kind != mzjson.Null) {
		return MismatchError{MapID: mapID, reason: spotWords(patch.Path, true)}
	}
	if sameValue(held, patch.Was) == false {
		return MismatchError{MapID: mapID, reason: spotWords(patch.Path, false)}
	}

	becomes := cloneValue(patch.Becomes)
	mzjson.OrderLike(becomes, held)
	if last.IsIndex {
		parent.Items[last.Index] = becomes
		return nil
	}
	for index := range parent.Members {
		if parent.Members[index].Key == last.Key {
			parent.Members[index].Value = becomes
		}
	}

	return nil
}

// childAt finds the value one step of a path reaches: a member of an object by key, an item of an array by index.
func childAt(value *mzjson.Value, step PathSegment) *mzjson.Value {
	if step.IsIndex {
		if value.Kind != mzjson.Array || step.Index >= len(value.Items) {
			return nil
		}
		return value.Items[step.Index]
	}
	if value.Kind != mzjson.Object {
		return nil
	}

	return value.Member(step.Key)
}

// sameValue reports whether two values are the same JSON value: numbers by what they are worth, whatever their
// spelling, objects by their keys and values, whatever their order.
func sameValue(left *mzjson.Value, right *mzjson.Value) bool {
	if left.Kind != right.Kind {
		return false
	}

	switch left.Kind {
	case mzjson.Number:
		leftNumber, leftErr := strconv.ParseFloat(left.Text, 64)
		rightNumber, rightErr := strconv.ParseFloat(right.Text, 64)
		return leftErr == nil && rightErr == nil && (leftNumber == rightNumber || (math.IsNaN(leftNumber) && math.IsNaN(rightNumber)))
	case mzjson.Array:
		if len(left.Items) != len(right.Items) {
			return false
		}
		for index := range left.Items {
			if sameValue(left.Items[index], right.Items[index]) == false {
				return false
			}
		}
		return true
	case mzjson.Object:
		if len(left.Members) != len(right.Members) {
			return false
		}
		for _, member := range left.Members {
			other := right.Member(member.Key)
			if other == nil || sameValue(member.Value, other) == false {
				return false
			}
		}
		return true
	default:
		return left.Text == right.Text
	}
}

// cloneValue copies a value whole, so ordering its keys never reaches the body it came from.
func cloneValue(value *mzjson.Value) *mzjson.Value {
	copied := &mzjson.Value{Kind: value.Kind, Text: value.Text}
	for _, item := range value.Items {
		copied.Items = append(copied.Items, cloneValue(item))
	}
	for _, member := range value.Members {
		copied.Members = append(copied.Members, mzjson.Member{Key: member.Key, Value: cloneValue(member.Value)})
	}

	return copied
}

// requireWholeMap checks a map as it would be written decodes into the map model strictly and spells out every key the
// model declares, as every save of a map is held to.
func requireWholeMap(laid []byte) error {
	var data db.RpgMap
	decoder := json.NewDecoder(bytes.NewReader(laid))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&data); err != nil {
		return err
	}

	value, err := mzjson.Parse(laid)
	if err != nil {
		return err
	}

	return mzjson.RequireEveryKey(value, typeOfMap)
}

// describeCell words one cell of a map's tile data the way an author finds it, for a refusal the author reads: its column
// and row, then its layer as the layer strip names it, the four tile layers by number from 1, then the shadows and the
// regions. A map whose size cannot be read gives no place to name.
func describeCell(root *mzjson.Value, index int) string {
	width, widthOk := wholeNumber(root.Member("width"))
	height, heightOk := wholeNumber(root.Member("height"))
	if widthOk == false || heightOk == false || width < 1 || height < 1 {
		return "one of its tiles"
	}

	plane := width * height
	inLayer := index % plane
	layer := "layer " + strconv.Itoa(index/plane+1)
	switch index / plane {
	case 4:
		layer = "the shadows"
	case 5:
		layer = "the regions"
	}

	return fmt.Sprintf("the tile at %d, %d on %s", inLayer%width, inLayer/width, layer)
}

// spotWords words what a set patch found where it lands, the way an author knows a map, for a refusal the author reads:
// the event a path into the event list reaches, by its id, gone or changed; the events as a whole; or else the map's own
// settings, changed.
func spotWords(path []PathSegment, gone bool) string {
	inEvents := path[0].IsIndex == false && path[0].Key == "events"
	if inEvents && len(path) >= 2 && path[1].IsIndex {
		if gone {
			return fmt.Sprintf("event %d is gone", path[1].Index)
		}
		return fmt.Sprintf("event %d changed", path[1].Index)
	}

	if inEvents {
		return "its events changed"
	}

	return "its map settings changed"
}

// describePath words a path the way the editor's patches spell it, its steps joined with slashes.
func describePath(path []PathSegment) string {
	steps := []string{}
	for _, step := range path {
		if step.IsIndex {
			steps = append(steps, strconv.Itoa(step.Index))
			continue
		}
		steps = append(steps, step.Key)
	}

	return strings.Join(steps, "/")
}

//endregion applying patches

//region checking shapes

// requireMembers checks an object holds every required key, nothing outside the required and optional ones, and no key
// twice.
func requireMembers(value *mzjson.Value, where string, required []string, optional []string) error {
	if value.Kind != mzjson.Object {
		return ChangesError{reason: where + " must be an object"}
	}

	known := map[string]bool{}
	for _, key := range append(append([]string{}, required...), optional...) {
		known[key] = true
	}
	seen := map[string]bool{}
	for _, member := range value.Members {
		if seen[member.Key] {
			return ChangesError{reason: fmt.Sprintf("%s names %q twice", where, member.Key)}
		}
		seen[member.Key] = true
		if known[member.Key] == false {
			return ChangesError{reason: fmt.Sprintf("%s holds %q, which a change to a blueprint has no use for", where, member.Key)}
		}
	}
	for _, key := range required {
		if value.Member(key) == nil {
			return ChangesError{reason: fmt.Sprintf("%s has no %q", where, key)}
		}
	}

	return nil
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

// wholeNumbers reads a list of whole numbers.
func wholeNumbers(value *mzjson.Value) ([]int, bool) {
	if value == nil || value.Kind != mzjson.Array {
		return nil, false
	}

	numbers := []int{}
	for _, item := range value.Items {
		number, ok := wholeNumber(item)
		if ok == false {
			return nil, false
		}
		numbers = append(numbers, number)
	}

	return numbers, true
}

// errNoBlueprints is a document handed over as the blueprints that cannot be laid out.
var errNoBlueprints = errors.New("the blueprints cannot be laid out")

// Blueprints lays the blueprints' whole document out the way the editor's own files are written, indented, as the
// editor-data route writes it.
func Blueprints(document *mzjson.Value) ([]byte, error) {
	laid, err := mzjson.IndentedLayout(document)
	if err != nil {
		return nil, errors.Join(errNoBlueprints, err)
	}

	return laid, nil
}

//endregion checking shapes
