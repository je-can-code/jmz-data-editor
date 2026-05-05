package store

import (
	"path/filepath"
)

type DataRepository[T any] interface {
	ReadAll() ([]T, error)
	WriteAll([]T) error
}

type ConfigRepository[T any] interface {
	Read() (T, error)
	Write(T) error
}

type BaseRepository[T any] struct {
	ProjectPath string
	FileName    string
}

// makeFullPath just concats the project path, the data folder, and the filename all together as one.
func (repo *BaseRepository[T]) makeFullPath() string {
	return filepath.Join(repo.ProjectPath, repo.FileName)
}

// ReadAll handles "array object" files (like Skills.json).
func (repo *BaseRepository[T]) ReadAll() ([]T, error) {
	fullPath := repo.makeFullPath()

	return LoadSlice[T](fullPath)
}

// Read handles "single object" configuration files (like System.json).
func (repo *BaseRepository[T]) Read() (T, error) {
	fullPath := repo.makeFullPath()
	return Load[T](fullPath)
}

// Write handles the writing of a "single object" configuration file (like System.json).
func (repo *BaseRepository[T]) Write(data T) error {
	fullPath := repo.makeFullPath()
	return Save(data, fullPath)
}

// WriteAll handles the writing of "array object" files (like Skills.json).
func (repo *BaseRepository[T]) WriteAll(data []T) error {
	fullPath := repo.makeFullPath()
	return SaveSlice(data, fullPath)
}
