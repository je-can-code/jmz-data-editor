package store

import (
	"encoding/json"
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
func load[T any](path string) (T, error) {
	// declare the config to be returned.
	var data T

	// read the file.
	fileBytes, err := os.ReadFile(path)
	if err != nil {
		return data, err
	}

	// parse the bytes into data.
	err = json.Unmarshal(fileBytes, &data)
	return data, err
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
