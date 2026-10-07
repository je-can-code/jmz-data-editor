package main

import (
	"net/http"
	"strings"
	"testing"

	"jmz-data-editor/server/internal/watch"
)

// System.json holds the game's settings, its switch and variable names among them, and the map
// editor renames those names. So the route owes the editor what every other map editor save owes it:
// GET hands the file out, PUT takes the whole of it back and writes it in the key order of the file it
// replaces, and a rename changes that name and no other byte. The names are all PUT takes from the
// body: they go into the file as it stands, so a window's older copy of the other settings never puts
// back what MZ or the data editor saved since, and a file nothing can carry over is never written.
// Two apps write the file in two layouts, MZ on one line and the data editor indented, so PUT writes
// whichever the file already has, its strings spelled the way that file spells them. Whatever the
// model cannot account for, or leaves out, is refused with a 400 naming it, before anything touches
// the disk, and the save reaches the change stream carrying the saving window's id.

// systemFixture is a small System.json in MZ's own layout. It carries what a careless writer would
// change: a `<`, an `&` and quotes in the title, which Go escapes and MZ does not; message keys out of
// alphabetical order, which Go's map would sort; and a test battler whose equips come before its
// level, against the model's own order.
const systemFixture = `{"advanced":{"gameId":7,"screenWidth":816,"screenHeight":624,"uiAreaWidth":816,"uiAreaHeight":624,` +
	`"numberFontFilename":"","fallbackFonts":"Verdana, sans-serif","fontSize":26,"mainFontFilename":"","windowOpacity":192,` +
	`"screenScale":1,"picturesUpperLimit":100},` +
	`"airship":{"bgm":{"name":"Ship3","pan":0,"pitch":100,"volume":90},"characterIndex":3,"characterName":"Vehicle","startMapId":0,"startX":0,"startY":0},` +
	`"armorTypes":["","General Armor"],"attackMotions":[{"type":0,"weaponImageId":0}],` +
	`"battleBgm":{"name":"Battle1","pan":0,"pitch":100,"volume":90},"battleSystem":0,"battleback1Name":"","battleback2Name":"",` +
	`"battlerHue":0,"battlerName":"",` +
	`"boat":{"bgm":{"name":"Ship1","pan":0,"pitch":100,"volume":90},"characterIndex":0,"characterName":"Vehicle","startMapId":0,"startX":0,"startY":0},` +
	`"currencyUnit":"G","defeatMe":{"name":"Defeat1","pan":0,"pitch":100,"volume":90},"editMapId":1,` +
	`"editor":{"messageWidth1":816,"messageWidth2":672,"jsonFormatLevel":0},"elements":["","Physical"],"equipTypes":["","Weapon"],` +
	`"faceSize":144,"gameTitle":"<Chef> & \"Co\"","gameoverMe":{"name":"Gameover1","pan":0,"pitch":100,"volume":90},"iconSize":32,` +
	`"itemCategories":[true,true,true,true],"locale":"en_US","magicSkills":[1],"menuCommands":[true,true,true,true,true,true],` +
	`"optAutosave":true,"optDisplayTp":true,"optDrawTitle":true,"optExtraExp":false,"optFloorDeath":false,"optFollowers":true,` +
	`"optKeyItemsNumber":false,"optMessageSkip":true,"optSideView":false,"optSlipDeath":false,"optSplashScreen":true,` +
	`"optTransparent":false,"partyMembers":[1,2],` +
	`"ship":{"bgm":{"name":"Ship2","pan":0,"pitch":100,"volume":90},"characterIndex":1,"characterName":"Vehicle","startMapId":0,"startX":0,"startY":0},` +
	`"skillTypes":["","Magic"],"sounds":[{"name":"Cursor3","pan":0,"pitch":100,"volume":90}],"startMapId":1,"startX":8,"startY":6,` +
	`"switches":["","Door open","after the vampire",""],` +
	`"terms":{"basic":["Level"],"commands":["Fight"],"params":["Max HP"],"messages":{"alwaysDash":"Always Dash","actionFailure":"There was no effect on %1!"}},` +
	`"testBattlers":[{"actorId":1,"equips":[1,1,2,3,0],"level":1}],"testTroopId":4,"tileSize":48,"title1Name":"Castle","title2Name":"",` +
	`"titleBgm":{"name":"Theme1","pan":0,"pitch":100,"volume":90},"titleCommandWindow":{"offsetX":0,"offsetY":0,"background":0},` +
	`"variables":["","Gold found","Parries"],"versionId":1,"victoryMe":{"name":"Victory1","pan":0,"pitch":100,"volume":90},` +
	`"weaponTypes":["","Dagger"],"windowTone":[0,0,0,0]}`

// newSystemProject is a project whose System.json is the fixture above, in place of the secret every
// other project keeps there.
func newSystemProject(t *testing.T) *project {
	t.Helper()

	current := newProject(t)
	writeProjectFile(t, current, "data/System.json", systemFixture)
	return current
}

// TestPutSystemWritesBackWhatGetAnswered is the round trip a rename rests on: whatever GET hands out,
// Go's own escaping and key order included, PUT takes back, and an unchanged file stays byte for byte.
func TestPutSystemWritesBackWhatGetAnswered(t *testing.T) {
	// Arrange.
	current := newSystemProject(t)
	body := string(readEnvelope(t, current.call(t, http.MethodGet, "/api/system", "")).Data)

	// Act.
	response := current.call(t, http.MethodPut, "/api/system", body)

	// Assert.
	assertStatus(t, response, http.StatusNoContent)
	if written := current.read(t, "data/System.json"); written != systemFixture {
		t.Errorf("an unchanged save rewrote System.json:\n%s", written)
	}
}

// TestPutSystemRenamesOnlyTheSwitch is the near miss for the round trip: a rename reaches the file,
// spelled the way MZ spells it, and nothing else in the file moves, the variable of a neighbouring
// name included.
func TestPutSystemRenamesOnlyTheSwitch(t *testing.T) {
	// Arrange- switch 2 renamed in what GET handed out, with characters Go escapes.
	current := newSystemProject(t)
	body := string(readEnvelope(t, current.call(t, http.MethodGet, "/api/system", "")).Data)
	body = strings.Replace(body, `"after the vampire"`, `"after the <vampire> & co"`, 1)

	// Act.
	response := current.call(t, http.MethodPut, "/api/system", body)

	// Assert.
	assertStatus(t, response, http.StatusNoContent)
	expected := strings.Replace(systemFixture, `"after the vampire"`, `"after the <vampire> & co"`, 1)
	if written := current.read(t, "data/System.json"); written != expected {
		t.Errorf("the rename wrote:\n%s\nexpected:\n%s", written, expected)
	}
}

// TestPutSystemRaisesTheVariableMaximum covers a longer list, as a raised maximum sends: the new slots
// arrive with no names, at the end of the list, and nothing else changes.
func TestPutSystemRaisesTheVariableMaximum(t *testing.T) {
	// Arrange- two more variables, both unnamed.
	current := newSystemProject(t)
	body := string(readEnvelope(t, current.call(t, http.MethodGet, "/api/system", "")).Data)
	body = strings.Replace(body, `"variables":["","Gold found","Parries"]`, `"variables":["","Gold found","Parries","",""]`, 1)

	// Act.
	response := current.call(t, http.MethodPut, "/api/system", body)

	// Assert.
	assertStatus(t, response, http.StatusNoContent)
	expected := strings.Replace(systemFixture, `"variables":["","Gold found","Parries"]`, `"variables":["","Gold found","Parries","",""]`, 1)
	if written := current.read(t, "data/System.json"); written != expected {
		t.Errorf("the longer list wrote:\n%s\nexpected:\n%s", written, expected)
	}
}

// TestPutSystemKeepsTheDataEditorsIndent covers the file as the data editor leaves it: its POST
// route writes System.json indented, with `<` and `&` spelled as Go escapes them. The map editor's
// save writes it back indented, so an unchanged save leaves every byte alone, and a rename changes
// that one line, its new name spelled the way the rest of the file spells its strings.
func TestPutSystemKeepsTheDataEditorsIndent(t *testing.T) {
	// Arrange- System.json as the data editor's own save writes it, and the body the map editor holds.
	current := newSystemProject(t)
	assertStatus(t, current.call(t, http.MethodPost, "/api/system", systemFixture, "Content-Type", "application/json"), http.StatusOK)
	indented := current.read(t, "data/System.json")
	for _, fragment := range []string{
		"{\n  \"advanced\": {\n    \"gameId\": 7,",
		"\n  \"gameTitle\": \"\\u003cChef\\u003e \\u0026 \\\"Co\\\"\",\n",
		"\n  \"switches\": [\n    \"\",\n    \"Door open\",\n    \"after the vampire\",\n    \"\"\n  ],\n",
	} {
		if strings.Contains(indented, fragment) == false {
			t.Fatalf("the data editor no longer writes System.json indented as this test expects; missing %q in:\n%s", fragment, indented)
		}
	}
	body := string(readEnvelope(t, current.call(t, http.MethodGet, "/api/system", "")).Data)

	// Act- saved unchanged, then saved with switch 2 renamed to a name holding `<` and `&`.
	unchanged := current.call(t, http.MethodPut, "/api/system", body)
	afterUnchanged := current.read(t, "data/System.json")
	renamed := current.call(t, http.MethodPut, "/api/system", strings.Replace(body, `"after the vampire"`, `"after the <vampire> & co"`, 1))

	// Assert- the file as the data editor wrote it, and then with that one name changed, in Go's spelling.
	assertStatus(t, unchanged, http.StatusNoContent)
	assertStatus(t, renamed, http.StatusNoContent)
	if afterUnchanged != indented {
		t.Errorf("an unchanged save reformatted the data editor's System.json:\n%s", afterUnchanged)
	}
	expected := strings.Replace(indented, "    \"after the vampire\",\n", "    \"after the \\u003cvampire\\u003e \\u0026 co\",\n", 1)
	if written := current.read(t, "data/System.json"); written != expected {
		t.Errorf("the rename wrote:\n%s\nexpected:\n%s", written, expected)
	}
}

// TestPutSystemWritesOnlyTheNames covers a window whose copy of the settings is older than the file:
// it read System.json, then MZ saved the file with another title and a switch renamed, and then the
// window saved a rename of its own. The window's names go into the file as MZ left it; the title MZ
// gave stays, and nothing else the window's older copy holds is put back. The names are taken as the
// window holds them, its own list whole, so MZ's rename of a switch is the window's to have kept.
func TestPutSystemWritesOnlyTheNames(t *testing.T) {
	// Arrange- the body read before MZ's save, with variable 2 renamed in it; then MZ's save.
	current := newSystemProject(t)
	body := string(readEnvelope(t, current.call(t, http.MethodGet, "/api/system", "")).Data)
	body = strings.Replace(body, `"Parries"`, `"Parries (all kinds)"`, 1)
	savedByMz := strings.Replace(systemFixture, `"gameTitle":"<Chef> & \"Co\""`, `"gameTitle":"Chef Adventure"`, 1)
	savedByMz = strings.Replace(savedByMz, `"Door open"`, `"Door ajar"`, 1)
	writeProjectFile(t, current, "data/System.json", savedByMz)

	// Act.
	response := current.call(t, http.MethodPut, "/api/system", body)

	// Assert- MZ's file, with the window's names in place of its own.
	assertStatus(t, response, http.StatusNoContent)
	expected := strings.Replace(savedByMz, `"variables":["","Gold found","Parries"]`, `"variables":["","Gold found","Parries (all kinds)"]`, 1)
	expected = strings.Replace(expected, `"Door ajar"`, `"Door open"`, 1)
	if written := current.read(t, "data/System.json"); written != expected {
		t.Errorf("the save wrote:\n%s\nexpected:\n%s", written, expected)
	}
}

// TestPutSystemNeverWritesOverAFileItCannotRead covers a System.json holding a setting the model does
// not know, as a newer MZ might write: the names cannot go into a file nothing can carry over, so the
// save is refused with the reason, and the file stays byte for byte.
func TestPutSystemNeverWritesOverAFileItCannotRead(t *testing.T) {
	// Arrange- the body as GET answered, then the file given a setting the model lacks.
	current := newSystemProject(t)
	body := string(readEnvelope(t, current.call(t, http.MethodGet, "/api/system", "")).Data)
	unreadable := strings.Replace(systemFixture, `"windowTone"`, `"optNewFeature":true,"windowTone"`, 1)
	writeProjectFile(t, current, "data/System.json", unreadable)

	// Act.
	response := current.call(t, http.MethodPut, "/api/system", strings.Replace(body, `"Door open"`, `"Door shut"`, 1))

	// Assert.
	assertStatus(t, response, http.StatusInternalServerError)
	assertBodyContains(t, response, `unknown field`)
	assertBodyContains(t, response, `optNewFeature`)
	if current.read(t, "data/System.json") != unreadable {
		t.Error("a refused save still changed System.json")
	}
}

// TestPutSystemRefusesWhatTheModelCannotAccountFor keeps a field the model does not declare from being
// dropped, and a field the body leaves out from being written as nothing, the switches above all.
func TestPutSystemRefusesWhatTheModelCannotAccountFor(t *testing.T) {
	cases := []struct {
		name     string
		body     string
		fragment string
	}{
		{name: "an unknown field", body: strings.Replace(systemFixture, `"windowTone"`, `"sparkle":true,"windowTone"`, 1), fragment: `unknown field "sparkle"`},
		{name: "no switches", body: strings.Replace(systemFixture, `"switches":["","Door open","after the vampire",""],`, ``, 1), fragment: `missing key "switches"`},
		{name: "a switch name that is not text", body: strings.Replace(systemFixture, `"Door open"`, `7`, 1), fragment: "RpgSystem.switches"},
		{name: "null", body: `null`, fragment: "the body must not be null"},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			// Arrange.
			current := newSystemProject(t)

			// Act.
			response := current.call(t, http.MethodPut, "/api/system", testCase.body)

			// Assert- a 400 naming what is wrong, and the file as it was.
			assertStatus(t, response, http.StatusBadRequest)
			assertBodyContains(t, response, testCase.fragment)
			if current.read(t, "data/System.json") != systemFixture {
				t.Error("a refused save still changed System.json")
			}
		})
	}
}

// TestPutSystemIsCreditedToItsWindow covers the change stream: a rename saved by a window comes back
// carrying that window's id, so the window that saved never takes its own save for an outside change.
func TestPutSystemIsCreditedToItsWindow(t *testing.T) {
	// Arrange- System.json as the data editor's GET hands it out, with switch 1 renamed.
	current, server := serve(t)
	writeProjectFile(t, current, "data/System.json", systemFixture)
	stream := openStream(t, server.URL)
	body := strings.Replace(envelopeData(t, server.URL+"/api/system"), `"Door open"`, `"Door shut"`, 1)

	// Act.
	put(t, server.URL+"/api/system", body, "window-a")

	// Assert.
	assertEvent(t, stream.next(t), watch.Change{Path: "data/System.json", Kind: watch.KindWrite, Client: "window-a"})
	if current.read(t, "data/System.json") != strings.Replace(systemFixture, `"Door open"`, `"Door shut"`, 1) {
		t.Error("the save did not write the rename")
	}
}
