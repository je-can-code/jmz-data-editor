package plugins

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
)

// decodeOmniStrictly reads the Omnipedia's configuration the way the API's read does (store.Load): a field the model
// does not declare, at any depth, is an error rather than something quietly dropped.
func decodeOmniStrictly(t *testing.T, raw []byte) (OmniConfiguration, error) {
	t.Helper()

	var config OmniConfiguration
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	err := decoder.Decode(&config)
	return config, err
}

// TestOmniConfigurationRoundTripPreservesEveryField holds the promise OmniConfiguration's doc comment makes: every field
// the file carries is declared, so reading the file and writing the model back out gives the same pages, in the same
// order, which is the order the game flips between them.
func TestOmniConfigurationRoundTripPreservesEveryField(t *testing.T) {
	// Arrange- three pages unlike each other, in an order that is not alphabetical, and not all showing stats.
	original := []byte(`{
		"monsterTypes": [
			{ "key": "enemy",        "name": "Monsterpedia",   "iconIndex": 14,  "showsStats": true },
			{ "key": "destructible", "name": "Destructapedia", "iconIndex": 216, "showsStats": false },
			{ "key": "boss-add",     "name": "Summons",        "iconIndex": 0,   "showsStats": true }
		]
	}`)

	// Act- the strict read, then the model written back out.
	config, err := decodeOmniStrictly(t, original)
	if err != nil {
		t.Fatal(err)
	}

	written, err := json.Marshal(config)
	if err != nil {
		t.Fatal(err)
	}

	// Assert- the same document, value for value, compared decoded so the source's spacing and key order do not count.
	if decodeBlock(t, written) != decodeBlock(t, original) {
		t.Errorf("the round trip changed the pages:\n got %s\nwant %s", decodeBlock(t, written), decodeBlock(t, original))
	}
}

// TestOmniConfigurationRefusesAFieldItDoesNotDeclare holds the other half of that promise: a field the model has not
// learned, inside a page, is refused rather than ignored, so the editor never saves a page without something the game
// reads.
func TestOmniConfigurationRefusesAFieldItDoesNotDeclare(t *testing.T) {
	// Arrange- a near miss of the shipped file: one page carrying a field the model does not declare.
	original := []byte(`{
		"monsterTypes": [
			{ "key": "enemy", "name": "Monsterpedia", "iconIndex": 14, "showsStats": true, "color": "red" }
		]
	}`)

	// Act.
	_, err := decodeOmniStrictly(t, original)

	// Assert- refused, naming the field.
	if err == nil || strings.Contains(err.Error(), `"color"`) == false {
		t.Errorf("expected the unknown field to be refused by name, got %v", err)
	}
}
