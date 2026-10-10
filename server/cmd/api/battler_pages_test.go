package main

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

// The battler pages route owes the map editor's battler brush every map event standing as the enemy it is
// about to place, each with the first of its pages naming the enemy, whole, inside the usual envelope and
// always as a list, so the brush can shape a new battler after the ones already placed and fall back when
// there are none. It refuses an enemy id that could not be one. These run through the real route table.

// battlerPagesAnswer is the route's answer, decoded.
type battlerPagesAnswer struct {
	EnemyId  int `json:"enemyId"`
	Battlers []struct {
		MapId     int    `json:"mapId"`
		EventId   int    `json:"eventId"`
		EventName string `json:"eventName"`
		Page      struct {
			List []struct {
				Code       int      `json:"code"`
				Parameters []string `json:"parameters"`
			} `json:"list"`
		} `json:"page"`
	} `json:"battlers"`
}

// TestEnemyBattlerPagesAnswersWithEachBattlersPage covers the answer's shape: the slime with its page, and
// not the bat beside it, which stands as another enemy.
func TestEnemyBattlerPagesAnswersWithEachBattlersPage(t *testing.T) {
	// Arrange.
	current := newProject(t)
	writeProjectFile(t, current, "data/Map002.json", battlersFixture)

	// Act.
	response := current.call(t, http.MethodGet, "/api/enemies/5/battler-pages", "")

	// Assert.
	assertStatus(t, response, http.StatusOK)
	var answer battlerPagesAnswer
	if err := json.Unmarshal(readEnvelope(t, response).Data, &answer); err != nil {
		t.Fatal(err)
	}
	if answer.EnemyId != 5 || len(answer.Battlers) != 1 {
		t.Fatalf("answered %+v", answer)
	}
	slime := answer.Battlers[0]
	if slime.MapId != 2 || slime.EventId != 1 || slime.EventName != "Slime" || len(slime.Page.List) != 2 || slime.Page.List[0].Parameters[0] != "<enemyId:5>" {
		t.Errorf("answered %+v", slime)
	}
}

// TestEnemyBattlerPagesAnswersAnEmptyListForAnEnemyPlacedNowhere covers an enemy no event names.
func TestEnemyBattlerPagesAnswersAnEmptyListForAnEnemyPlacedNowhere(t *testing.T) {
	// Arrange.
	current := newProject(t)
	writeProjectFile(t, current, "data/Map002.json", battlersFixture)

	// Act.
	response := current.call(t, http.MethodGet, "/api/enemies/9/battler-pages", "")

	// Assert- a list, not null and not missing.
	assertStatus(t, response, http.StatusOK)
	if data := string(readEnvelope(t, response).Data); data != `{"enemyId":9,"battlers":[]}` {
		t.Errorf("answered %s", data)
	}
}

// TestEnemyBattlerPagesRefusesIdsThatAreNotEnemyIds covers the id guard.
func TestEnemyBattlerPagesRefusesIdsThatAreNotEnemyIds(t *testing.T) {
	for _, id := range []string{"abc", "0", "-3", "1.5"} {
		t.Run(id, func(t *testing.T) {
			// Arrange.
			current := newProject(t)

			// Act.
			response := current.call(t, http.MethodGet, "/api/enemies/"+id+"/battler-pages", "")

			// Assert.
			assertStatus(t, response, http.StatusBadRequest)
			if message := strings.TrimSpace(response.Body.String()); message != "enemyId must be an integer of at least 1" {
				t.Errorf("said %q", message)
			}
		})
	}
}

// TestEnemyBattlerPagesNamesAMapTheModelsCannotRead covers a map carrying a field no model declares: a 500
// whose envelope says which file, rather than a list missing that map's battlers.
func TestEnemyBattlerPagesNamesAMapTheModelsCannotRead(t *testing.T) {
	// Arrange.
	current := newProject(t)
	writeProjectFile(t, current, "data/Map002.json", `{"events":[null],"sparkle":true}`)

	// Act.
	response := current.call(t, http.MethodGet, "/api/enemies/5/battler-pages", "")

	// Assert.
	assertStatus(t, response, http.StatusInternalServerError)
	answer := readEnvelope(t, response)
	if strings.Contains(answer.Error, "Map002.json") == false || answer.Data != nil {
		t.Errorf("said %q with %s", answer.Error, answer.Data)
	}
}
