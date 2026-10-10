package mzjson

import (
	"bytes"
	"encoding/json"
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

// CompactLayout arranges a document all on one line, exactly as JSON.stringify(value) writes it,
// with no newline after it: the way MZ writes System.json, a single object holding the game's
// settings, its switch and variable names among them.
//
//	{"advanced":{...},"airship":{...},...,"switches":["","Door open"],...,"windowTone":[0,0,0,0]}
func CompactLayout(root *Value) ([]byte, error) {
	return Compact(root), nil
}

// goEscapes are the six-character escapes Go's encoder writes for `<`, `>`, `&` and the two line
// separators, U+2028 and U+2029, all of which JSON.stringify writes as themselves. A file holding any
// of them had its strings written by Go.
var goEscapes = [][]byte{
	[]byte("\\u003c"),
	[]byte("\\u003e"),
	[]byte("\\u0026"),
	[]byte("\\u2028"),
	[]byte("\\u2029"),
}

// fileStyle is how a file on disk is laid out, as far as writing it again the same way needs.
type fileStyle struct {
	// indent is one level of the file's indent; empty for a file on one line.
	indent string

	// newline ends each line: "\n", or "\r\n" for a file written with Windows line endings.
	newline string

	// closingNewline is whether the file ends with a newline after its last line.
	closingNewline bool

	// escapeHTML is whether the file's strings spell `<`, `>`, `&` and the line separators as Go does.
	escapeHTML bool
}

// styleOf reads how a file is laid out. A file over several lines is indented by whatever starts its
// second line, two spaces where nothing does; nil, an empty file, and a file on one line are on one line.
func styleOf(template []byte) fileStyle {
	style := fileStyle{newline: "\n"}
	if bytes.Contains(template, []byte("\r\n")) {
		style.newline = "\r\n"
	}

	// the closing newline is set aside first, so a file on one line that ends with one stays on one line.
	body := bytes.TrimSuffix(template, []byte(style.newline))
	style.closingNewline = len(body) < len(template)

	for _, escape := range goEscapes {
		if bytes.Contains(body, escape) {
			style.escapeHTML = true
			break
		}
	}

	// one level of indent is what the second line starts with, the first being the opening bracket alone.
	if lineEnd := bytes.IndexByte(body, '\n'); lineEnd >= 0 {
		secondLine := body[lineEnd+1:]
		width := len(secondLine) - len(bytes.TrimLeft(secondLine, " \t"))
		style.indent = string(secondLine[:width])
		if style.indent == "" {
			style.indent = "  "
		}
	}

	return style
}

// LayoutLike answers the layout of the file a document is about to be written over, so a save never
// reformats a file some other tool keeps another way. System.json is the file it serves: MZ writes it
// on one line, the data editor writes it indented, which reads better by hand, and an app saving it
// in a layout of its own would turn every rename into a rewrite of the whole file.
//
// A file on one line, and a new file, is written on one line exactly as CompactLayout writes it. A
// file over several lines is written indented the way JSON.stringify(value, null, indent) and Go's
// MarshalIndent both write it, by the file's own indent, with its own line endings. Either keeps a
// closing newline only where the file has one, and a file whose strings spell `<`, `>` and `&` the
// way Go escapes them has every string spelled that way again, as Go's encoder would write it.
//
//	{
//	  "advanced": {
//	    "gameId": 52400363,
//	    ...
//	  },
//	  "switches": [
//	    "",
//	    "Door open"
//	  ],
//	  ...
//	}
func LayoutLike(template []byte) Layout {
	style := styleOf(template)

	return func(root *Value) ([]byte, error) {
		out := Compact(root)

		// Go's escapes are the only difference between its strings and JSON.stringify's.
		if style.escapeHTML {
			var escaped bytes.Buffer
			json.HTMLEscape(&escaped, out)
			out = escaped.Bytes()
		}

		// indenting the one line lays it out exactly as Go's MarshalIndent and JSON.stringify do.
		if style.indent != "" {
			var indented bytes.Buffer
			if err := json.Indent(&indented, out, "", style.indent); err != nil {
				return nil, err
			}
			out = indented.Bytes()

			// a newline only ever ends a line here, since the one line escapes every newline in a string.
			if style.newline != "\n" {
				out = bytes.ReplaceAll(out, []byte("\n"), []byte(style.newline))
			}
		}

		if style.closingNewline {
			out = append(out, style.newline...)
		}

		return out, nil
	}
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
