// Package mzjson writes JSON the way RPG Maker MZ writes its data files, so a file the editor saves
// without changing reads back byte for byte the same.
//
// Two things stand between Go's encoder and that goal. MZ escapes strings the way JavaScript's
// JSON.stringify does, where Go escapes `<`, `>`, `&` and the line separators on top. And MZ keeps
// each object's keys in the order they arrived in, which is not one fixed order: the same kind of
// object lists its keys three different ways inside a single map file, depending on which editor
// version or tool last wrote it. Go's structs and maps both forget order, so this package carries
// JSON as a Value that remembers it.
package mzjson

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
)

// Kind names the shape a JSON value takes.
type Kind int

const (
	// Null is the JSON literal null.
	Null Kind = iota

	// Bool is true or false.
	Bool

	// Number is any JSON number, kept as its literal text.
	Number

	// String is a JSON string, kept decoded.
	String

	// Array is an ordered list of values.
	Array

	// Object is an ordered list of keyed values.
	Object
)

// Member is one key and its value inside an object.
type Member struct {
	Key   string
	Value *Value
}

// Value is one JSON value with the key order of every object inside it preserved.
type Value struct {
	Kind Kind

	// Text is the literal of a Bool or Number, and the decoded contents of a String.
	Text string

	// Items holds an Array's elements.
	Items []*Value

	// Members holds an Object's entries, in the order the object listed them.
	Members []Member
}

// Parse reads exactly one JSON value, refusing anything that follows it.
func Parse(input []byte) (*Value, error) {
	// keep numbers as their literal text; converting them to float64 here would round large integers.
	decoder := json.NewDecoder(bytes.NewReader(input))
	decoder.UseNumber()

	value, err := parseValue(decoder)
	if err != nil {
		return nil, err
	}

	// a second value, or any other content after the first, means the input was not one document.
	_, err = decoder.Token()
	if err == nil {
		return nil, errors.New("unexpected content after the JSON value")
	}
	if errors.Is(err, io.EOF) == false {
		return nil, err
	}

	return value, nil
}

// parseValue reads the next complete value from the decoder.
func parseValue(decoder *json.Decoder) (*Value, error) {
	token, err := decoder.Token()
	if err != nil {
		return nil, err
	}

	return parseToken(decoder, token)
}

// parseToken builds the value that begins with the token just read.
func parseToken(decoder *json.Decoder, token json.Token) (*Value, error) {
	switch typed := token.(type) {
	case nil:
		return &Value{Kind: Null}, nil
	case bool:
		if typed {
			return &Value{Kind: Bool, Text: "true"}, nil
		}
		return &Value{Kind: Bool, Text: "false"}, nil
	case json.Number:
		return &Value{Kind: Number, Text: string(typed)}, nil
	case string:
		return &Value{Kind: String, Text: typed}, nil
	case json.Delim:
		if typed == '[' {
			return parseArray(decoder)
		}
		if typed == '{' {
			return parseObject(decoder)
		}
	}

	return nil, fmt.Errorf("unexpected JSON token %v", token)
}

// parseArray reads the elements of an array whose opening bracket was just read.
func parseArray(decoder *json.Decoder) (*Value, error) {
	array := &Value{Kind: Array}
	for decoder.More() {
		item, err := parseValue(decoder)
		if err != nil {
			return nil, err
		}
		array.Items = append(array.Items, item)
	}

	// consume the closing bracket; the decoder has already checked it matches.
	if _, err := decoder.Token(); err != nil {
		return nil, err
	}

	return array, nil
}

// parseObject reads the members of an object whose opening brace was just read, in order.
func parseObject(decoder *json.Decoder) (*Value, error) {
	object := &Value{Kind: Object}
	for decoder.More() {
		keyToken, err := decoder.Token()
		if err != nil {
			return nil, err
		}

		// the decoder only ever hands back a string in key position.
		key := keyToken.(string)
		value, err := parseValue(decoder)
		if err != nil {
			return nil, err
		}
		object.Members = append(object.Members, Member{Key: key, Value: value})
	}

	// consume the closing brace.
	if _, err := decoder.Token(); err != nil {
		return nil, err
	}

	return object, nil
}

// Member returns the value stored under key, or nil when the object has no such key.
func (value *Value) Member(key string) *Value {
	for _, member := range value.Members {
		if member.Key == key {
			return member.Value
		}
	}

	return nil
}
