package store

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
)

// LoadSlice reads a file at the given path and returns a collection of the typed data.
func LoadSlice[T any](path string) ([]T, error) {
	return load[[]T](path)
}

// Load reads a file at the given path and returns the entirety of the data as typed.
func Load[T any](path string) (T, error) {
	return load[T](path)
}

// load executes the loading of whatever type T is back to the caller.
//
// Decoding is strict: a field in the file that the model does not declare is an error rather than
// something quietly dropped. This matters because reading is one half of a round-trip. A field that
// decodes into nothing is not merely ignored - it is absent from the struct when the editor saves,
// so the save writes the file back without it and the data is gone. That failure has no symptom at
// the moment it happens; it surfaces later as a game that has stopped doing something, with a diff
// nobody was watching.
//
// So the trade is deliberate: a model that has fallen behind the data refuses to load, loudly and
// immediately, instead of erasing the part it did not understand. The fix is to declare the field.
func load[T any](path string) (T, error) {
	// declare the config to be returned.
	var data T

	// read the file.
	fileBytes, err := os.ReadFile(path)
	if err != nil {
		return data, err
	}

	// parse the bytes into data, refusing anything the model cannot account for.
	decoder := json.NewDecoder(bytes.NewReader(fileBytes))
	decoder.DisallowUnknownFields()

	if err := decoder.Decode(&data); err != nil {
		return data, fmt.Errorf("decoding %s: %w", path, err)
	}

	return data, nil
}

// SaveSlice saves a collection of data object to disk at the designated location.
func SaveSlice[T any](data []T, path string) error {
	return save[[]T](data, path)
}

// Save saves a single configuration-like object to disk at the designated location.
func Save[T any](data T, path string) error {
	return save[T](data, path)
}

// save executes the saving of whatever type T is on behalf of the caller.
func save[T any](data T, path string) error {
	bytes, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(path, bytes, 0644)
}
