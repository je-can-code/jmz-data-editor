package mzjson

import (
	"errors"
)

// Layout arranges a whole document into the bytes of a file.
type Layout func(root *Value) ([]byte, error)

// TableLayout arranges an array the way MZ writes its database tables (MapInfos.json, Tilesets.json
// and the rest): the opening bracket alone on the first line, then one element per line, and the
// closing bracket on the last line with no newline after it.
//
//	[
//	null,
//	{"id":1,...},
//	{"id":2,...}
//	]
func TableLayout(root *Value) ([]byte, error) {
	if root.Kind != Array {
		return nil, errors.New("a table must be a JSON array")
	}

	return appendLines(nil, root.Items), nil
}

// MapLayout arranges a map document the way MZ writes Map###.json: every property but the tiles
// and the events on the second line, the tiles on the third, and one event per line after that.
//
//	{
//	"autoplayBgm":false,...,"width":45,
//	"data":[...],
//	"events":[
//	null,
//	{"id":1,...}
//	]
//	}
//
// The properties keep their own order, `meta` included where a file carries one. An empty event
// list is written as an opening and closing bracket on consecutive lines, which is what MZ does
// for a map it has never placed an event on. A map without an array of tiles and an array of events
// is refused: the engine cannot enter one, so no file should ever hold it.
func MapLayout(root *Value) ([]byte, error) {
	if root.Kind != Object {
		return nil, errors.New("a map must be a JSON object")
	}
	data, events := root.Member("data"), root.Member("events")
	if data == nil || data.Kind != Array || events == nil || events.Kind != Array {
		return nil, errors.New("a map must hold its tiles and its events as arrays")
	}

	// the properties MZ writes on one line are every member but the two it gives lines of their own.
	properties := &Value{Kind: Object}
	for _, member := range root.Members {
		if member.Key != "data" && member.Key != "events" {
			properties.Members = append(properties.Members, member)
		}
	}

	// gather the lines between the braces: properties, then tiles, then events.
	var lines [][]byte
	if len(properties.Members) > 0 {
		compact := Compact(properties)
		lines = append(lines, compact[1:len(compact)-1])
	}
	lines = append(lines, append([]byte(`"data":`), Compact(data)...))
	lines = append(lines, appendLines([]byte(`"events":`), events.Items))

	out := []byte("{\n")
	for index, line := range lines {
		if index > 0 {
			out = append(out, ",\n"...)
		}
		out = append(out, line...)
	}

	return append(out, "\n}"...), nil
}

// appendLines appends an array with each element on its own line, as MZ writes its tables and a
// map's events.
func appendLines(out []byte, items []*Value) []byte {
	out = append(out, "[\n"...)
	for index, item := range items {
		if index > 0 {
			out = append(out, ",\n"...)
		}
		out = appendCompact(out, item)
	}
	if len(items) > 0 {
		out = append(out, '\n')
	}

	return append(out, ']')
}

// IndentedLayout arranges any document the way JSON.stringify(value, null, 2) does, followed by a
// closing newline. It is the layout for the editor's own files, which nothing but the editor reads:
// indented so that a change to one of them reads as a small diff in the game's history.
func IndentedLayout(root *Value) ([]byte, error) {
	out := appendIndented(nil, root, 0)
	return append(out, '\n'), nil
}

// appendIndented appends the value at the given nesting depth, two spaces per level.
func appendIndented(out []byte, value *Value, depth int) []byte {
	switch value.Kind {
	case Array:
		if len(value.Items) == 0 {
			return append(out, "[]"...)
		}
		out = append(out, '[')
		for index, item := range value.Items {
			if index > 0 {
				out = append(out, ',')
			}
			out = appendIndent(out, depth+1)
			out = appendIndented(out, item, depth+1)
		}
		out = appendIndent(out, depth)
		return append(out, ']')
	case Object:
		if len(value.Members) == 0 {
			return append(out, "{}"...)
		}
		out = append(out, '{')
		for index, member := range value.Members {
			if index > 0 {
				out = append(out, ',')
			}
			out = appendIndent(out, depth+1)
			out = appendString(out, member.Key)
			out = append(out, ':', ' ')
			out = appendIndented(out, member.Value, depth+1)
		}
		out = appendIndent(out, depth)
		return append(out, '}')
	}

	return appendCompact(out, value)
}

// appendIndent starts a new line indented to the given depth.
func appendIndent(out []byte, depth int) []byte {
	out = append(out, '\n')
	for level := 0; level < depth; level++ {
		out = append(out, ' ', ' ')
	}

	return out
}
