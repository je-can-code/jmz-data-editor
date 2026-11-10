package plugins

import (
	"encoding/json"
	"testing"
)

// TestBossParticipantRoundTripKeepsItsTile guards where a body appears through a save. A save decodes
// the request body into BossParticipant and re-marshals it, and a field the struct does not declare is
// erased rather than ignored, so a tile lost here is a boss that spawns in the arena's top-left corner.
func TestBossParticipantRoundTripKeepsItsTile(t *testing.T) {
	// Arrange- one body exactly as J-ABS-Boss reads it.
	original := []byte(`{ "key": "mayor", "enemyId": 581, "expect": "Gluttonwolf Mayor", "x": 8, "y": 14 }`)

	// Act- the decode/encode pair a save performs.
	var participant BossParticipant
	if err := json.Unmarshal(original, &participant); err != nil {
		t.Fatal(err)
	}

	saved, err := json.Marshal(participant)
	if err != nil {
		t.Fatal(err)
	}

	var reloaded map[string]any
	if err := json.Unmarshal(saved, &reloaded); err != nil {
		t.Fatal(err)
	}

	// Assert- the tile survives, and no event id is written back, since bodies no longer name one.
	if reloaded["x"] != float64(8) || reloaded["y"] != float64(14) {
		t.Errorf("the tile did not survive a save: got x=%v y=%v", reloaded["x"], reloaded["y"])
	}

	if _, ok := reloaded["eventId"]; ok {
		t.Errorf("a save wrote an eventId back out; bodies are spawned now and name no event")
	}
}

// TestBossEncounterRoundTripKeepsItsDefeatSwitch guards the switch an encounter turns on when won through
// a save. A field the struct does not declare is erased rather than ignored, so a switch lost here is a
// boss that falls while the story waits on it forever.
func TestBossEncounterRoundTripKeepsItsDefeatSwitch(t *testing.T) {
	// Arrange- one encounter exactly as J-ABS-Boss reads it.
	original := []byte(`{ "key": "gluttonwolf", "map": 75, "defeatSwitch": 24, "participants": [], "aiControl": "shared", "routines": [] }`)

	// Act- the decode/encode pair a save performs.
	var encounter BossEncounter
	if err := json.Unmarshal(original, &encounter); err != nil {
		t.Fatal(err)
	}

	saved, err := json.Marshal(encounter)
	if err != nil {
		t.Fatal(err)
	}

	var reloaded map[string]any
	if err := json.Unmarshal(saved, &reloaded); err != nil {
		t.Fatal(err)
	}

	// Assert
	if reloaded["defeatSwitch"] != float64(24) {
		t.Errorf("the defeat switch did not survive a save: got %v", reloaded["defeatSwitch"])
	}
}

// roundTrip performs the decode/encode pair a save performs on one value, and hands back what was
// written as plain JSON, so a test can see exactly which fields reached the disk.
func roundTrip[T any](t *testing.T, original []byte) map[string]any {
	t.Helper()

	var decoded T
	if err := json.Unmarshal(original, &decoded); err != nil {
		t.Fatal(err)
	}

	saved, err := json.Marshal(decoded)
	if err != nil {
		t.Fatal(err)
	}

	var reloaded map[string]any
	if err := json.Unmarshal(saved, &reloaded); err != nil {
		t.Fatal(err)
	}

	return reloaded
}

// TestBossParticipantRoundTripKeepsItsTemplate guards the clone map event a body is dressed from through a
// save. A template lost here is a guardian that spawns as its plain self, with none of its fight's prefix,
// role or level.
func TestBossParticipantRoundTripKeepsItsTemplate(t *testing.T) {
	// Arrange- one body dressed from a template of its own.
	original := []byte(`{ "key": "golemWest", "enemyId": 501, "expect": "Golem", "x": 4, "y": 3, "template": 601 }`)

	// Act
	reloaded := roundTrip[BossParticipant](t, original)

	// Assert
	if reloaded["template"] != float64(601) {
		t.Errorf("the template did not survive a save: got %v", reloaded["template"])
	}
}

// TestBossEncounterRoundTripKeepsItsReactions guards every part of a reaction through a save: the moment
// it answers, the bodies it waits on, and the fields each of its steps reads. A reaction lost here is a seal
// that never breaks, or a fight that never gets faster.
func TestBossEncounterRoundTripKeepsItsReactions(t *testing.T) {
	// Arrange- a seal as the fight opens, and a reaction to a guardian falling.
	original := []byte(`{
		"key": "earthie", "map": 172, "defeatSwitch": 64, "participants": [], "aiControl": "shared", "routines": [],
		"reactions": [
			{ "key": "seal", "on": "start", "steps": [
				{ "verb": "addState", "skill": 0, "expect": "Sealed", "cast": true, "participant": "earthie", "state": 2072 },
				{ "verb": "changeImage", "skill": 0, "expect": "", "cast": true, "participant": "earthie",
					"image": "$m_elemental-earthie-sealed", "index": 2 }
			] },
			{ "key": "west-falls", "on": "fallen", "participants": [ "golemWest" ], "steps": [
				{ "verb": "quickenRoutine", "skill": 0, "expect": "", "cast": true, "routine": "rockfall", "seconds": 1.5 }
			] }
		]
	}`)

	// Act
	reloaded := roundTrip[BossEncounter](t, original)

	// Assert
	reactions, ok := reloaded["reactions"].([]any)
	if !ok || len(reactions) != 2 {
		t.Fatalf("the reactions did not survive a save: got %v", reloaded["reactions"])
	}

	seal := reactions[0].(map[string]any)
	sealSteps := seal["steps"].([]any)
	addState := sealSteps[0].(map[string]any)
	changeImage := sealSteps[1].(map[string]any)
	if seal["on"] != "start" || addState["participant"] != "earthie" || addState["state"] != float64(2072) {
		t.Errorf("the seal did not survive a save: got %v", seal)
	}

	if changeImage["image"] != "$m_elemental-earthie-sealed" || changeImage["index"] != float64(2) {
		t.Errorf("the change of look did not survive a save: got %v", changeImage)
	}

	falls := reactions[1].(map[string]any)
	quicken := falls["steps"].([]any)[0].(map[string]any)
	waitsOn := falls["participants"].([]any)
	if falls["on"] != "fallen" || len(waitsOn) != 1 || waitsOn[0] != "golemWest" {
		t.Errorf("the fallen trigger did not survive a save: got %v", falls)
	}

	if quicken["routine"] != "rockfall" || quicken["seconds"] != 1.5 {
		t.Errorf("the quickening did not survive a save: got %v", quicken)
	}
}

// TestBossStepRoundTripLeavesUnusedFieldsOff guards the shape a forced skill keeps on disk. Steps carry
// every field any verb reads, and the newer ones sit empty on most steps, so a save writing them all out
// would bury every routine in the config under fields it never uses.
func TestBossStepRoundTripLeavesUnusedFieldsOff(t *testing.T) {
	// Arrange- a forced skill exactly as J-ABS-Boss reads it.
	original := []byte(`{ "verb": "forceSkill", "skill": 2584, "expect": "Devour", "cast": true }`)

	// Act
	reloaded := roundTrip[BossStep](t, original)

	// Assert- the skill survives, and nothing it does not use was written beside it.
	if reloaded["skill"] != float64(2584) {
		t.Errorf("the skill did not survive a save: got %v", reloaded["skill"])
	}

	unusedFields := []string{
		"participant", "state", "image", "index", "routine", "seconds",
		"enemyId", "template", "x", "y", "direction", "tone", "animation", "face", "faceIndex", "speaker", "lines",
	}
	for _, unused := range unusedFields {
		if _, written := reloaded[unused]; written {
			t.Errorf("a save wrote %q onto a forced skill that does not use it", unused)
		}
	}
}

// TestBossReactionRoundTripKeepsItsHealthPercent guards the percent a health reaction waits for through a
// save. A percent lost here reads as zero, which the plugin refuses, so the fight would never start.
func TestBossReactionRoundTripKeepsItsHealthPercent(t *testing.T) {
	// Arrange- a reaction to the boss being worn down to two thirds.
	original := []byte(`{ "key": "two-thirds", "on": "health", "below": 66, "steps": [] }`)

	// Act
	reloaded := roundTrip[BossReaction](t, original)

	// Assert
	if reloaded["on"] != "health" || reloaded["below"] != float64(66) {
		t.Errorf("the health trigger did not survive a save: got %v", reloaded)
	}
}

// TestBossRoutineRoundTripKeepsItDormant guards a routine that waits to be started through a save. A routine
// that lost the flag would start with the fight, so a summoner meant for the last third would run from the first.
func TestBossRoutineRoundTripKeepsItDormant(t *testing.T) {
	// Arrange- a tour of the room that waits for a turning point to start it.
	original := []byte(`{ "key": "waves", "cadence": 15, "dormant": true, "steps": [] }`)

	// Act
	reloaded := roundTrip[BossRoutine](t, original)

	// Assert
	if reloaded["dormant"] != true || reloaded["cadence"] != float64(15) {
		t.Errorf("the dormant routine did not survive a save: got %v", reloaded)
	}
}

// TestBossStepRoundTripKeepsWhereABlinkLandsAndWhoseFaceSpeaks guards a blink's tile and facing, and a line's
// face, through a save. A facing lost here leaves a boss firing its next wave the wrong way.
func TestBossStepRoundTripKeepsWhereABlinkLandsAndWhoseFaceSpeaks(t *testing.T) {
	// Arrange- one step carrying everything a blink and a faced line read, so one save proves both.
	original := []byte(`{ "verb": "blink", "skill": 0, "expect": "", "cast": true,
		"x": 8, "y": 19, "direction": 6, "animation": 40, "face": "KH06-2_faces_MV_07", "faceIndex": 3 }`)

	// Act
	reloaded := roundTrip[BossStep](t, original)

	// Assert
	if reloaded["x"] != float64(8) || reloaded["y"] != float64(19) || reloaded["direction"] != float64(6) {
		t.Errorf("the blink did not survive a save: got %v", reloaded)
	}

	if reloaded["face"] != "KH06-2_faces_MV_07" || reloaded["faceIndex"] != float64(3) {
		t.Errorf("the face did not survive a save: got face %v index %v", reloaded["face"], reloaded["faceIndex"])
	}
}

// TestBossStepRoundTripKeepsWhatItSpawns guards a spawn's enemy, template and tile through a save. A field
// lost here is a hazard that wakes as the wrong enemy, or in the arena's top-left corner.
func TestBossStepRoundTripKeepsWhatItSpawns(t *testing.T) {
	// Arrange- a hazard waking on its tile, dressed from a template of its own.
	original := []byte(`{ "verb": "spawn", "skill": 0, "expect": "Ignihazard", "cast": true,
		"enemyId": 511, "template": 605, "x": 44, "y": 16 }`)

	// Act
	reloaded := roundTrip[BossStep](t, original)

	// Assert
	spawned := reloaded["enemyId"] == float64(511) && reloaded["template"] == float64(605)
	if !spawned || reloaded["x"] != float64(44) || reloaded["y"] != float64(16) {
		t.Errorf("the spawn did not survive a save: got %v", reloaded)
	}
}

// TestBossStepRoundTripKeepsItsTintAnimationAndLine guards the tone a tint settles on, the animation played
// over a body, and the line a body says through a save. A tone short of a channel is refused by the plugin,
// and a line lost here is a box with nothing in it.
func TestBossStepRoundTripKeepsItsTintAnimationAndLine(t *testing.T) {
	// Arrange- one step carrying everything the three verbs read, so one save proves all of them.
	original := []byte(`{ "verb": "dialogue", "skill": 0, "expect": "", "cast": true, "seconds": 2,
		"tone": [ 17, -68, -68, 0 ], "animation": 56,
		"speaker": "\\C[10]Cynder\\C[0]", "lines": [ "\\pop[self]BRING IT" ] }`)

	// Act
	reloaded := roundTrip[BossStep](t, original)

	// Assert
	tone, ok := reloaded["tone"].([]any)
	if !ok || len(tone) != 4 || tone[0] != float64(17) || tone[1] != float64(-68) || tone[3] != float64(0) {
		t.Errorf("the tone did not survive a save: got %v", reloaded["tone"])
	}

	if reloaded["seconds"] != float64(2) || reloaded["animation"] != float64(56) {
		t.Errorf("the tint's time or the animation did not survive a save: got %v", reloaded)
	}

	lines, ok := reloaded["lines"].([]any)
	if reloaded["speaker"] != `\C[10]Cynder\C[0]` || !ok || len(lines) != 1 || lines[0] != `\pop[self]BRING IT` {
		t.Errorf("the line did not survive a save: got speaker %v lines %v", reloaded["speaker"], reloaded["lines"])
	}
}
