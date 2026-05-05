package api

import (
	"encoding/json"
	"fmt"
	"net/http"
)

// RestResponse is the generic envelope for any response from this API.
type RestResponse[T any] struct {
	Path  string `json:"path"`
	Error string `json:"error,omitempty"`
	Data  T      `json:"data,omitempty"`
}

// ToRestResponse compiles the data into the response contract.
func (request *RestResponse[T]) ToRestResponse(w http.ResponseWriter, path string, errMsg string, data T, code int) {
	request.Path = path
	request.Error = errMsg
	request.Data = data

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)

	if err := json.NewEncoder(w).Encode(request); err != nil {
		// At this point, headers are sent, so we just log the failure
		fmt.Printf("Encoding failure: %v\n", err)
	}
}
