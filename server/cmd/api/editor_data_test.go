package main

import (
	"encoding/json"
	"net/http"
	"reflect"
	"strings"
	"testing"
)

// The editor-data routes owe the map editor a place in the project for its own documents
// (blueprints, tileset marks, saved layouts), one JSON file per key under jmz-editor/. Any JSON is
// accepted, keys are held to lowercase letters, digits and hyphens so a key can never be a path, and
// documents are written indented so they diff well in the game's history.

// TestEditorDataIsAbsentUntilSaved covers the first read, before anything has been saved.
func TestEditorDataIsAbsentUntilSaved(t *testing.T) {
	// Arrange.
	current := newProject(t)

	// Act.
	response := current.call(t, http.MethodGet, "/api/editor-data/blueprints", "")

	// Assert.
	assertStatus(t, response, http.StatusNotFound)
	if message := readEnvelope(t, response).Error; message != "jmz-editor/blueprints.json does not exist" {
		t.Errorf("said %q", message)
	}
}

// TestEditorDataSavesAndReadsBack covers a save, the file it writes, and reading it back.
func TestEditorDataSavesAndReadsBack(t *testing.T) {
	// Arrange- keys out of order, and characters Go would escape.
	current := newProject(t)
	document := `{"tiles":[3,1],"name":"<corner> & ledge","nested":{"z":true,"a":null},"empty":[]}`

	// Act.
	saved := current.call(t, http.MethodPut, "/api/editor-data/tileset-marks", document)
	loaded := current.call(t, http.MethodGet, "/api/editor-data/tileset-marks", "")

	// Assert- 204, the file indented with its order kept, and the same document read back.
	assertStatus(t, saved, http.StatusNoContent)
	expected := "{\n" +
		"  \"tiles\": [\n    3,\n    1\n  ],\n" +
		"  \"name\": \"<corner> & ledge\",\n" +
		"  \"nested\": {\n    \"z\": true,\n    \"a\": null\n  },\n" +
		"  \"empty\": []\n" +
		"}\n"
	if written := current.read(t, "jmz-editor/tileset-marks.json"); written != expected {
		t.Errorf("wrote:\n%s\nexpected:\n%s", written, expected)
	}
	assertStatus(t, loaded, http.StatusOK)
	var sent, readBack any
	if err := json.Unmarshal([]byte(document), &sent); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(readEnvelope(t, loaded).Data, &readBack); err != nil {
		t.Fatal(err)
	}
	if reflect.DeepEqual(readBack, sent) == false {
		t.Errorf("read back %v, saved %v", readBack, sent)
	}
}

// TestEditorDataResavesUnchangedDocumentsExactly covers a save of what was just read: the same bytes.
func TestEditorDataResavesUnchangedDocumentsExactly(t *testing.T) {
	// Arrange.
	current := newProject(t)
	assertStatus(t, current.call(t, http.MethodPut, "/api/editor-data/layouts", `{"panes":["map","palette"]}`), http.StatusNoContent)
	first := current.read(t, "jmz-editor/layouts.json")
	body := string(readEnvelope(t, current.call(t, http.MethodGet, "/api/editor-data/layouts", "")).Data)

	// Act.
	response := current.call(t, http.MethodPut, "/api/editor-data/layouts", body)

	// Assert.
	assertStatus(t, response, http.StatusNoContent)
	if second := current.read(t, "jmz-editor/layouts.json"); second != first {
		t.Errorf("an unchanged save rewrote the document:\n%s\nwas:\n%s", second, first)
	}
}

// TestEditorDataAcceptsAnyJson covers documents that are not objects.
func TestEditorDataAcceptsAnyJson(t *testing.T) {
	cases := []struct {
		document string
		expected string
	}{
		{document: `[1,"two"]`, expected: "[\n  1,\n  \"two\"\n]\n"},
		{document: `"just text"`, expected: "\"just text\"\n"},
		{document: `42`, expected: "42\n"},
	}

	for _, testCase := range cases {
		t.Run(testCase.document, func(t *testing.T) {
			// Arrange.
			current := newProject(t)

			// Act.
			response := current.call(t, http.MethodPut, "/api/editor-data/misc", testCase.document)

			// Assert.
			assertStatus(t, response, http.StatusNoContent)
			if written := current.read(t, "jmz-editor/misc.json"); written != testCase.expected {
				t.Errorf("wrote %q, expected %q", written, testCase.expected)
			}
		})
	}
}

// TestEditorDataRefusesWhatIsNotOneJsonDocument is the strict decode for documents with no model:
// the body must parse, and must be one document.
func TestEditorDataRefusesWhatIsNotOneJsonDocument(t *testing.T) {
	bodies := []string{`{"a":`, `{"a":1} {"b":2}`, `not json`, ``}

	for _, body := range bodies {
		t.Run(body, func(t *testing.T) {
			// Arrange.
			current := newProject(t)

			// Act.
			response := current.call(t, http.MethodPut, "/api/editor-data/blueprints", body)

			// Assert- refused, and no folder or file created.
			assertStatus(t, response, http.StatusBadRequest)
			if current.exists("jmz-editor") {
				t.Error("a refused save still created the editor's folder")
			}
		})
	}
}

// TestEditorDataRefusesKeysThatAreNotKeys covers the key rule on both methods, traversal included.
func TestEditorDataRefusesKeysThatAreNotKeys(t *testing.T) {
	keys := []string{"Blueprints", "tile_marks", "a.b", "%2E%2E", "..%2Fdata%2FSystem", "..%5Csecret", "marks%00"}

	for _, key := range keys {
		for _, method := range []string{http.MethodGet, http.MethodPut} {
			t.Run(method+" "+key, func(t *testing.T) {
				// Arrange.
				current := newProject(t)

				// Act.
				response := current.call(t, method, "/api/editor-data/"+key, `{"a":1}`)

				// Assert.
				assertRefused(t, response, http.StatusBadRequest)
				if current.exists("jmz-editor") || current.read(t, "data/System.json") != secret {
					t.Error("a refused request still wrote something")
				}
			})
		}
	}
}

// TestPreflightAllowsTheMapEditorsSaves covers the browser's CORS check before a PUT carrying the
// client header, which would otherwise stop every save from a window on another origin.
func TestPreflightAllowsTheMapEditorsSaves(t *testing.T) {
	// Arrange.
	current := newProject(t)

	// Act.
	response := current.call(t, http.MethodOptions, "/api/maps/1", "",
		"Origin", "http://127.0.0.1:5173",
		"Access-Control-Request-Method", "PUT",
		"Access-Control-Request-Headers", "content-type, x-jmz-client")

	// Assert.
	assertStatus(t, response, http.StatusNoContent)
	methods := response.Header().Get("Access-Control-Allow-Methods")
	headers := response.Header().Get("Access-Control-Allow-Headers")
	if strings.Contains(methods, "PUT") == false || strings.Contains(headers, "X-Jmz-Client") == false {
		t.Errorf("the preflight allowed methods %q and headers %q", methods, headers)
	}
}
