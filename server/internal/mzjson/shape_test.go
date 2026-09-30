package mzjson

import (
	"encoding/json"
	"reflect"
	"testing"
)

// RequireEveryKey and RequireTable owe the save routes a refusal, naming the key, for any document
// that would otherwise reach the game's files with a zero value where data belonged: a missing key,
// a null where the model holds none, or a table without the null MZ keeps at index 0. And they owe
// the opposite for every document the game's own files show is fine: optional keys left out, raw
// command lists holding anything, deleted rows left null.

// shapeSound is a nested object in the sample model.
type shapeSound struct {
	Name   string `json:"name"`
	Volume int    `json:"volume"`
}

// shapeRow is a row that can be absent from a sparse list.
type shapeRow struct {
	Id    int    `json:"id"`
	Label string `json:"label"`
}

// shapeBase is embedded, the way the database models embed their shared fields.
type shapeBase struct {
	Note string `json:"note"`
}

// shapeSample has one field of every kind the check treats differently.
type shapeSample struct {
	shapeBase
	Width   int               `json:"width"`
	Sound   shapeSound        `json:"sound"`
	Tiles   []int             `json:"tiles"`
	Rows    []*shapeRow       `json:"rows"`
	Pages   []shapeRow        `json:"pages"`
	List    []json.RawMessage `json:"list"`
	Quick   *bool             `json:"quick,omitempty"`
	Meta    json.RawMessage   `json:"meta,omitempty"`
	Names   map[string]string `json:"names"`
	Skipped int               `json:"-"`
}

// wholeSample is a complete sample document, leaving out only what is optional.
const wholeSample = `{"note":"","width":1,"sound":{"name":"a","volume":90},"tiles":[1,2],` +
	`"rows":[null,{"id":1,"label":"x"}],"pages":[{"id":1,"label":"p"}],"list":[{"anything":null},null,3],"names":{"a":"b"}}`

// TestRequireEveryKeyAcceptsAWholeDocument is the case every real file must pass.
func TestRequireEveryKeyAcceptsAWholeDocument(t *testing.T) {
	// Arrange.
	value := mustParse(t, wholeSample)

	// Act.
	err := RequireEveryKey(value, reflect.TypeFor[*shapeSample]())

	// Assert.
	if err != nil {
		t.Errorf("refused a whole document: %v", err)
	}
}

// TestRequireEveryKeyNamesWhatIsMissingOrNull covers each way a document can fall short, with the
// message a front end would show for it.
func TestRequireEveryKeyNamesWhatIsMissingOrNull(t *testing.T) {
	cases := []struct {
		name     string
		document string
		expected string
	}{
		{name: "a missing key", document: `{"note":"","sound":{"name":"a","volume":90},"tiles":[],"rows":[],"pages":[],"list":[],"names":{}}`, expected: `missing key "width"`},
		{name: "a missing nested key", document: `{"note":"","width":1,"sound":{"name":"a"},"tiles":[],"rows":[],"pages":[],"list":[],"names":{}}`, expected: `missing key "volume" in sound`},
		{name: "a missing embedded key", document: `{"width":1,"sound":{"name":"a","volume":90},"tiles":[],"rows":[],"pages":[],"list":[],"names":{}}`, expected: `missing key "note"`},
		{name: "a missing key in a sparse row", document: `{"note":"","width":1,"sound":{"name":"a","volume":90},"tiles":[],"rows":[null,{"id":1}],"pages":[],"list":[],"names":{}}`, expected: `missing key "label" in rows[1]`},
		{name: "a null number", document: `{"note":"","width":null,"sound":{"name":"a","volume":90},"tiles":[],"rows":[],"pages":[],"list":[],"names":{}}`, expected: `width must not be null`},
		{name: "a null object", document: `{"note":"","width":1,"sound":null,"tiles":[],"rows":[],"pages":[],"list":[],"names":{}}`, expected: `sound must not be null`},
		{name: "a null list", document: `{"note":"","width":1,"sound":{"name":"a","volume":90},"tiles":null,"rows":[],"pages":[],"list":[],"names":{}}`, expected: `tiles must not be null`},
		{name: "a null in a list of numbers", document: `{"note":"","width":1,"sound":{"name":"a","volume":90},"tiles":[1,null],"rows":[],"pages":[],"list":[],"names":{}}`, expected: `tiles[1] must not be null`},
		{name: "a null in a list of objects", document: `{"note":"","width":1,"sound":{"name":"a","volume":90},"tiles":[],"rows":[],"pages":[null],"list":[],"names":{}}`, expected: `pages[0] must not be null`},
		{name: "a null optional flag", document: `{"note":"","width":1,"sound":{"name":"a","volume":90},"tiles":[],"rows":[],"pages":[],"list":[],"names":{},"quick":null}`, expected: `quick must not be null`},
		{name: "a null map value", document: `{"note":"","width":1,"sound":{"name":"a","volume":90},"tiles":[],"rows":[],"pages":[],"list":[],"names":{"a":null}}`, expected: `names.a must not be null`},
		{name: "a null body", document: `null`, expected: `the body must not be null`},
		{name: "an array body", document: `[]`, expected: `the body must be an object`},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			// Arrange.
			value := mustParse(t, testCase.document)

			// Act.
			err := RequireEveryKey(value, reflect.TypeFor[*shapeSample]())

			// Assert.
			if err == nil || err.Error() != testCase.expected {
				t.Errorf("said %v, expected %q", err, testCase.expected)
			}
		})
	}
}

// TestRequireTableAcceptsMzsTableShape covers a table as MZ writes one, deleted rows included.
func TestRequireTableAcceptsMzsTableShape(t *testing.T) {
	// Arrange.
	value := mustParse(t, `[null,{"id":1,"label":"x"},null,{"id":3,"label":"z"}]`)

	// Act.
	err := RequireTable(value, reflect.TypeFor[*shapeRow]())

	// Assert.
	if err != nil {
		t.Errorf("refused a table: %v", err)
	}
}

// TestRequireTableRefusesWhatIsNotATable covers the tables that would wipe or corrupt a file.
func TestRequireTableRefusesWhatIsNotATable(t *testing.T) {
	cases := []struct {
		name     string
		document string
		expected string
	}{
		{name: "an empty array", document: `[]`, expected: "the body must start with null, as MZ's tables do"},
		{name: "no leading null", document: `[{"id":1,"label":"x"}]`, expected: "the body must start with null, as MZ's tables do"},
		{name: "no rows", document: `[null]`, expected: "the body holds no rows after the leading null"},
		{name: "an object", document: `{}`, expected: "the body must be a JSON array"},
		{name: "null", document: `null`, expected: "the body must be a JSON array"},
		{name: "a row missing a key", document: `[null,{"id":1}]`, expected: `missing key "label" in [1]`},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			// Arrange.
			value := mustParse(t, testCase.document)

			// Act.
			err := RequireTable(value, reflect.TypeFor[*shapeRow]())

			// Assert.
			if err == nil || err.Error() != testCase.expected {
				t.Errorf("said %v, expected %q", err, testCase.expected)
			}
		})
	}
}
