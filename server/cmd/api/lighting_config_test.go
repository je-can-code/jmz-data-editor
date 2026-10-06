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

// The lighting config route owes the map editor J-Lighting's defaults, read strictly, so it draws lights with what
// the game reads. It only reads: nothing in the editors writes the file. A project without the file answers with an
// error, which the map editor takes as a project whose lights fall back to white.

// lightingConfigFixture is a config.lighting.json in the shape the game ships it.
const lightingConfigFixture = `{
  "light": {
    "radius": 5,
    "color": "#FFBB73",
    "intensity": 0.3,
    "effects": {
      "flicker": { "depth": 0.2, "period": 40, "chance": 0, "variance": 0.18 },
      "pulse":   { "depth": 0.45, "period": 165, "chance": 0, "variance": 0.22 },
      "glitch":  { "depth": 0.85, "period": 55, "chance": 0.28, "variance": 0.12 }
    }
  },
  "ambient": { "color": "#000000" }
}`

// writeLightingConfig puts a lighting config into the throwaway project.
func writeLightingConfig(t *testing.T, current *project, content string) {
	t.Helper()

	if err := os.WriteFile(filepath.Join(current.root, "data", "config.lighting.json"), []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
}

// TestLightingConfigServesTheFile covers the read: the file's values, in the API's envelope.
func TestLightingConfigServesTheFile(t *testing.T) {
	// Arrange.
	current := newProject(t)
	writeLightingConfig(t, current, lightingConfigFixture)

	// Act.
	response := current.call(t, http.MethodGet, "/api/config/lighting", "")

	// Assert.
	assertStatus(t, response, http.StatusOK)
	var served, expected any
	if err := json.Unmarshal(readEnvelope(t, response).Data, &served); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal([]byte(lightingConfigFixture), &expected); err != nil {
		t.Fatal(err)
	}
	if reflect.DeepEqual(served, expected) == false {
		t.Errorf("served %v, the file holds %v", served, expected)
	}
}

// TestLightingConfigWritesNothing covers the route being a read alone: a POST is refused and the file is untouched.
func TestLightingConfigWritesNothing(t *testing.T) {
	// Arrange.
	current := newProject(t)
	writeLightingConfig(t, current, lightingConfigFixture)

	// Act.
	response := current.call(t, http.MethodPost, "/api/config/lighting", `{"light":{"color":"#000000"}}`, "Content-Type", "application/json")

	// Assert.
	assertStatus(t, response, http.StatusMethodNotAllowed)
	if written := current.read(t, "data/config.lighting.json"); written != lightingConfigFixture {
		t.Errorf("the file changed:\n%s", written)
	}
}

// TestLightingConfigAnswersAnErrorWithoutTheFile covers a project that has no lighting config at all.
func TestLightingConfigAnswersAnErrorWithoutTheFile(t *testing.T) {
	// Arrange- the fixtures carry no lighting config.
	current := newProject(t)

	// Act.
	response := current.call(t, http.MethodGet, "/api/config/lighting", "")

	// Assert.
	assertStatus(t, response, http.StatusInternalServerError)
	if message := readEnvelope(t, response).Error; strings.Contains(message, "config.lighting.json") == false {
		t.Errorf("said %q", message)
	}
}

// TestLightingConfigRefusesAFieldItDoesNotDeclare covers the strict read: a config holding a field the model has not
// learned is refused by name rather than served without it.
func TestLightingConfigRefusesAFieldItDoesNotDeclare(t *testing.T) {
	// Arrange- the shipped shape with one field more, in the ambient block.
	current := newProject(t)
	writeLightingConfig(t, current, strings.Replace(lightingConfigFixture, `"color": "#000000"`, `"color": "#000000", "tint": 1`, 1))

	// Act.
	response := current.call(t, http.MethodGet, "/api/config/lighting", "")

	// Assert.
	assertStatus(t, response, http.StatusInternalServerError)
	if message := readEnvelope(t, response).Error; strings.Contains(message, `"tint"`) == false {
		t.Errorf("said %q", message)
	}
}
