package main

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

// The day and night curve's route owes the map editor J-Lighting-Time's curve, read strictly, so it draws the sky at
// its clock's hour with what the game reads. It only reads: nothing in the editors writes the file. A project without
// the file answers with an error, which the map editor says over its maps.

// lightingTimeConfigFixture is a config.lighting-time.json in the shape the game ships it.
const lightingTimeConfigFixture = `{
  "phases": {
    "Moontide":  { "tone": [-30, -18, 34, 170], "darkness": 0.72 },
    "Dawn":      { "tone": [30, 6, -12, 40],    "darkness": 0.30 },
    "Morning":   { "tone": [0, 0, 0, 0],        "darkness": 0 },
    "Afternoon": { "tone": [12, 8, -4, 0],      "darkness": 0 },
    "Evening":   { "tone": [26, 0, -34, 22],    "darkness": 0.08 },
    "Night":     { "tone": [-34, -14, 40, 95],  "darkness": 0.55 }
  },
  "sequence": [ "Moontide", "Dawn", "Morning", "Afternoon", "Evening", "Night", "Moontide" ]
}`

// writeLightingTimeConfig puts a day and night curve into the throwaway project.
func writeLightingTimeConfig(t *testing.T, current *project, content string) {
	t.Helper()

	if err := os.WriteFile(filepath.Join(current.root, "data", "config.lighting-time.json"), []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
}

// TestLightingTimeConfigServesTheFile covers the read: the file's values, in the API's envelope.
func TestLightingTimeConfigServesTheFile(t *testing.T) {
	// Arrange.
	current := newProject(t)
	writeLightingTimeConfig(t, current, lightingTimeConfigFixture)

	// Act.
	response := current.call(t, http.MethodGet, "/api/config/lighting-time", "")

	// Assert.
	assertStatus(t, response, http.StatusOK)
	var served, expected any
	if err := json.Unmarshal(readEnvelope(t, response).Data, &served); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal([]byte(lightingTimeConfigFixture), &expected); err != nil {
		t.Fatal(err)
	}
	if reflect.DeepEqual(served, expected) == false {
		t.Errorf("served %v, the file holds %v", served, expected)
	}
}

// TestLightingTimeConfigWritesNothing covers the route being a read alone: a POST is refused and the file is untouched.
func TestLightingTimeConfigWritesNothing(t *testing.T) {
	// Arrange.
	current := newProject(t)
	writeLightingTimeConfig(t, current, lightingTimeConfigFixture)

	// Act.
	response := current.call(t, http.MethodPost, "/api/config/lighting-time", `{"sequence":[]}`, "Content-Type", "application/json")

	// Assert.
	assertStatus(t, response, http.StatusMethodNotAllowed)
	if written := current.read(t, "data/config.lighting-time.json"); written != lightingTimeConfigFixture {
		t.Errorf("the file changed:\n%s", written)
	}
}

// TestLightingTimeConfigAnswersAnErrorWithoutTheFile covers a project that has no day and night curve at all.
func TestLightingTimeConfigAnswersAnErrorWithoutTheFile(t *testing.T) {
	// Arrange- the fixtures carry no curve.
	current := newProject(t)

	// Act.
	response := current.call(t, http.MethodGet, "/api/config/lighting-time", "")

	// Assert.
	assertStatus(t, response, http.StatusInternalServerError)
	if message := readEnvelope(t, response).Error; strings.Contains(message, "config.lighting-time.json") == false {
		t.Errorf("said %q", message)
	}
}

// TestLightingTimeConfigRefusesAFieldItDoesNotDeclare covers the strict read: a curve holding a field the model has not
// learned is refused by name rather than served without it.
func TestLightingTimeConfigRefusesAFieldItDoesNotDeclare(t *testing.T) {
	// Arrange- the shipped shape with one field more, beside the sequence.
	current := newProject(t)
	writeLightingTimeConfig(t, current, strings.Replace(lightingTimeConfigFixture, `"sequence":`, `"speed": 2, "sequence":`, 1))

	// Act.
	response := current.call(t, http.MethodGet, "/api/config/lighting-time", "")

	// Assert.
	assertStatus(t, response, http.StatusInternalServerError)
	if message := readEnvelope(t, response).Error; strings.Contains(message, `"speed"`) == false {
		t.Errorf("said %q", message)
	}
}
