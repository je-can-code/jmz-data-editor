package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
)

// RestRequest is the generic envelope for any non-body resource in this API.
// This is just the DTO we use, the query params are derived from the path.
type RestRequest struct {
	ProjectPath string
}

// RestRequestSave is the generic envelope for any bodyful resource in this API.
// This is just the DTO we use, the query params have the path, while the body is simply the array.
type RestRequestSave[T any] struct {
	ProjectPath string
	Data        T
}

// ToRestRequest converts a request to the non-body version of the request contract.
func (request *RestRequest) ToRestRequest(responseWriter http.ResponseWriter, httpRequest *http.Request) error {
	projectPath, pathErr := GetProjectPath()
	if pathErr != nil {
		http.Error(responseWriter, pathErr.Error(), http.StatusBadRequest)
		return errors.New(pathErr.Error())
	}

	request.ProjectPath = projectPath

	return nil
}

// ToRestRequestSave converts a request to the bodyful version of the request contract.
func (request *RestRequestSave[T]) ToRestRequestSave(responseWriter http.ResponseWriter, httpRequest *http.Request) error {
	projectPath, pathErr := GetProjectPath()
	if pathErr != nil {
		http.Error(responseWriter, pathErr.Error(), http.StatusBadRequest)
		return errors.New(pathErr.Error())
	}

	// strict for the same reason the file read is: whatever this decodes into is what gets written
	// back to disk, so a field the model does not declare would be dropped here and then absent
	// from the saved file. A 400 naming the field is a worse afternoon than a silent save, and a
	// far better week.
	var updatedData T
	decoder := json.NewDecoder(httpRequest.Body)
	decoder.DisallowUnknownFields()

	decodeErr := decoder.Decode(&updatedData)
	if decodeErr != nil {
		http.Error(responseWriter, decodeErr.Error(), http.StatusBadRequest)
		return errors.New(decodeErr.Error())
	}

	request.ProjectPath = projectPath
	request.Data = updatedData

	return nil
}

// GetProjectPath extracts the project path from its source.
func GetProjectPath() (string, error) {
	projectPath := os.Getenv("JMZ_PROJECT_ROOT")
	if projectPath == "" {
		return "", errors.New("projectPath is required")
	}

	return projectPath, nil
}
