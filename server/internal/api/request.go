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

	var updatedData T
	decodeErr := json.NewDecoder(httpRequest.Body).Decode(&updatedData)
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
