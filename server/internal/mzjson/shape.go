package mzjson

import (
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"strings"
)

// rawMessageType is carried verbatim by the models, so nothing about its shape is checked.
var rawMessageType = reflect.TypeFor[json.RawMessage]()

// RequireEveryKey checks that value spells out every key the model type declares, at every depth,
// and holds null only where the model can.
//
// Strict decoding catches a key the model does not know; this catches the opposite. Go fills a key
// that is missing, or null, with its zero value and says nothing, and the zero value then reaches
// the game's files: a map saved without its tiles crashes the engine when the player walks in, and a
// sound saved without its volume plays silent. So a document must arrive whole. Keys a model marks
// omitempty are optional, since MZ writes them only on some rows, and raw JSON (a command list) is
// carried as it came.
func RequireEveryKey(value *Value, model reflect.Type) error {
	return requireShape(value, model, "", false)
}

// RequireTable checks a document that stands for one of MZ's tables (MapInfos.json, Tilesets.json):
// an array whose index 0 is null, as every MZ table's is, holding at least one row, where each row
// after the first is null or spells out every key of row, the element type.
func RequireTable(value *Value, row reflect.Type) error {
	if value.Kind != Array {
		return errors.New("the body must be a JSON array")
	}
	if len(value.Items) == 0 || value.Items[0].Kind != Null {
		return errors.New("the body must start with null, as MZ's tables do")
	}
	if len(value.Items) == 1 {
		return errors.New("the body holds no rows after the leading null")
	}

	for index, item := range value.Items[1:] {
		if err := requireShape(item, row, fmt.Sprintf("[%d]", index+1), true); err != nil {
			return err
		}
	}

	return nil
}

// requireShape checks one value against the type that will hold it. nullable is true only where
// null is itself a meaningful value: an element of a sparse array, such as a deleted event.
func requireShape(value *Value, model reflect.Type, path string, nullable bool) error {
	if model == rawMessageType {
		return nil
	}

	if value.Kind == Null {
		if nullable && model.Kind() == reflect.Pointer {
			return nil
		}
		return fmt.Errorf("%s must not be null", describe(path))
	}

	switch model.Kind() {
	case reflect.Pointer:
		return requireShape(value, model.Elem(), path, false)
	case reflect.Struct:
		if value.Kind != Object {
			return fmt.Errorf("%s must be an object", describe(path))
		}
		return requireFields(value, model, path)
	case reflect.Slice:
		if value.Kind != Array {
			return fmt.Errorf("%s must be an array", describe(path))
		}
		for index, item := range value.Items {
			if err := requireShape(item, model.Elem(), fmt.Sprintf("%s[%d]", path, index), true); err != nil {
				return err
			}
		}
	case reflect.Map:
		if value.Kind != Object {
			return fmt.Errorf("%s must be an object", describe(path))
		}
		for _, member := range value.Members {
			if err := requireShape(member.Value, model.Elem(), joinPath(path, member.Key), false); err != nil {
				return err
			}
		}
	}

	return nil
}

// requireFields checks an object against a struct: every key present unless the field is optional,
// and every present key's value in turn.
func requireFields(value *Value, model reflect.Type, path string) error {
	for index := 0; index < model.NumField(); index++ {
		// encoding/json ignores unexported fields, except that an embedded struct of unexported type
		// still promotes its exported fields.
		field := model.Field(index)
		embeddedStruct := field.Anonymous && field.Type.Kind() == reflect.Struct
		if field.IsExported() == false && embeddedStruct == false {
			continue
		}

		name, optional, skip := jsonName(field)
		if skip {
			continue
		}

		// an embedded struct with no name of its own contributes its keys to this object.
		if name == "" {
			if err := requireFields(value, indirect(field.Type), path); err != nil {
				return err
			}
			continue
		}

		member := value.Member(name)
		if member == nil {
			if optional {
				continue
			}
			if path == "" {
				return fmt.Errorf("missing key %q", name)
			}
			return fmt.Errorf("missing key %q in %s", name, path)
		}

		if err := requireShape(member, field.Type, joinPath(path, name), false); err != nil {
			return err
		}
	}

	return nil
}

// jsonName reads a field's key the way encoding/json does: the tag's name, or the field's own name,
// or empty for an embedded struct that flattens into its parent. optional is true for omitempty and
// omitzero, and skip for a field the tag hides.
func jsonName(field reflect.StructField) (name string, optional bool, skip bool) {
	tag := field.Tag.Get("json")
	if tag == "-" {
		return "", false, true
	}

	name, options, _ := strings.Cut(tag, ",")
	for _, option := range strings.Split(options, ",") {
		if option == "omitempty" || option == "omitzero" {
			optional = true
		}
	}

	if name == "" && field.Anonymous && indirect(field.Type).Kind() == reflect.Struct {
		return "", optional, false
	}
	if name == "" {
		name = field.Name
	}

	return name, optional, false
}

// indirect is a type with any pointer taken off.
func indirect(model reflect.Type) reflect.Type {
	if model.Kind() == reflect.Pointer {
		return model.Elem()
	}

	return model
}

// joinPath names a member below path, the way a script would write it: events[1].pages[0].image.
func joinPath(path string, key string) string {
	if path == "" {
		return key
	}

	return path + "." + key
}

// describe names a path in an error, with the whole body standing for the empty path.
func describe(path string) string {
	if path == "" {
		return "the body"
	}

	return path
}
