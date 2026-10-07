package mzjson

import "testing"

// Each layout owes its callers one file shape exactly: MZ's table shape for MapInfos.json and
// Tilesets.json, MZ's map shape for Map###.json, MZ's single line for System.json, and
// JSON.stringify's two-space indentation for the editor's own documents. The shapes are fixed by what is already on disk, so every expected value
// here is a literal copy of that shape rather than something derived from the code under test.

// TestTableLayoutPutsEachRowOnItsOwnLine covers the database-table shape.
func TestTableLayoutPutsEachRowOnItsOwnLine(t *testing.T) {
	cases := []struct {
		name     string
		document string
		expected string
	}{
		{name: "rows", document: `[null,{"id":1,"name":"A"},{"id":2,"name":"B"}]`, expected: "[\nnull,\n{\"id\":1,\"name\":\"A\"},\n{\"id\":2,\"name\":\"B\"}\n]"},
		{name: "no rows", document: `[]`, expected: "[\n]"},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			// Arrange.
			value := mustParse(t, testCase.document)

			// Act.
			actual, err := TableLayout(value)

			// Assert.
			if err != nil {
				t.Fatal(err)
			}
			if string(actual) != testCase.expected {
				t.Errorf("wrote %q, expected %q", actual, testCase.expected)
			}
		})
	}
}

// TestTableLayoutRefusesAnythingButAnArray keeps a table from being written as something else.
func TestTableLayoutRefusesAnythingButAnArray(t *testing.T) {
	// Arrange.
	value := mustParse(t, `{"id":1}`)

	// Act.
	_, err := TableLayout(value)

	// Assert.
	if err == nil {
		t.Error("expected a non-array table to be refused")
	}
}

// TestMapLayoutMatchesMzsMapFiles covers the map shape, including the corners MZ's own files show:
// `meta` staying on the properties line wherever it sits, and an event list with nothing in it.
func TestMapLayoutMatchesMzsMapFiles(t *testing.T) {
	cases := []struct {
		name     string
		document string
		expected string
	}{
		{
			name:     "a map with events",
			document: `{"autoplayBgm":false,"width":2,"data":[1,2],"events":[null,{"id":1,"x":0}]}`,
			expected: "{\n\"autoplayBgm\":false,\"width\":2,\n\"data\":[1,2],\n\"events\":[\nnull,\n{\"id\":1,\"x\":0}\n]\n}",
		},
		{
			name:     "an empty event list",
			document: `{"width":0,"data":[],"events":[]}`,
			expected: "{\n\"width\":0,\n\"data\":[],\n\"events\":[\n]\n}",
		},
		{
			name:     "meta stays where the properties put it",
			document: `{"width":1,"meta":{},"data":[5],"events":[null]}`,
			expected: "{\n\"width\":1,\"meta\":{},\n\"data\":[5],\n\"events\":[\nnull\n]\n}",
		},
		{
			name:     "tiles and events always come last",
			document: `{"data":[5],"events":[null],"width":1}`,
			expected: "{\n\"width\":1,\n\"data\":[5],\n\"events\":[\nnull\n]\n}",
		},
		{
			name:     "no properties besides tiles and events",
			document: `{"data":[],"events":[]}`,
			expected: "{\n\"data\":[],\n\"events\":[\n]\n}",
		},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			// Arrange.
			value := mustParse(t, testCase.document)

			// Act.
			actual, err := MapLayout(value)

			// Assert.
			if err != nil {
				t.Fatal(err)
			}
			if string(actual) != testCase.expected {
				t.Errorf("wrote %q, expected %q", actual, testCase.expected)
			}
		})
	}
}

// TestMapLayoutRefusesMapsTheEngineCannotEnter keeps a map without tiles or events, or one that is
// not an object at all, from ever being laid out into a file.
func TestMapLayoutRefusesMapsTheEngineCannotEnter(t *testing.T) {
	documents := map[string]string{
		"not an object":    `[1,2]`,
		"null events":      `{"width":1,"data":[],"events":null}`,
		"no events":        `{"width":1,"data":[]}`,
		"null tiles":       `{"width":1,"data":null,"events":[]}`,
		"no tiles":         `{"width":1,"events":[]}`,
		"events an object": `{"width":1,"data":[],"events":{}}`,
	}

	for name, document := range documents {
		t.Run(name, func(t *testing.T) {
			// Arrange.
			value := mustParse(t, document)

			// Act.
			_, err := MapLayout(value)

			// Assert.
			if err == nil {
				t.Errorf("expected %s to be refused", document)
			}
		})
	}
}

// TestCompactLayoutWritesTheWholeDocumentOnOneLine covers System.json's shape: JSON.stringify's own
// one line, with nothing after it, and a `<` and an `&` written as MZ writes them rather than as Go
// escapes them.
func TestCompactLayoutWritesTheWholeDocumentOnOneLine(t *testing.T) {
	cases := []struct {
		name     string
		document string
		expected string
	}{
		{
			name:     "an object over several lines",
			document: "{\n  \"gameTitle\": \"<Chef> & Co\",\n  \"switches\": [\"\", \"Door open\"],\n  \"windowTone\": [0, 0, 0, 0]\n}\n",
			expected: `{"gameTitle":"<Chef> & Co","switches":["","Door open"],"windowTone":[0,0,0,0]}`,
		},
		{name: "an empty object", document: `{}`, expected: `{}`},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			// Arrange.
			value := mustParse(t, testCase.document)

			// Act.
			actual, err := CompactLayout(value)

			// Assert.
			if err != nil {
				t.Fatal(err)
			}
			if string(actual) != testCase.expected {
				t.Errorf("wrote %q, expected %q", actual, testCase.expected)
			}
		})
	}
}

// TestIndentedLayoutMatchesJsonStringify covers the editor's own documents. The expected text is
// what JSON.stringify(value, null, 2) produced for the same value, plus the closing newline.
func TestIndentedLayoutMatchesJsonStringify(t *testing.T) {
	cases := []struct {
		name     string
		document string
		expected string
	}{
		{
			name:     "nesting",
			document: `{"b":[1,{"c":[],"d":{}},"x"],"a":null,"e":true}`,
			expected: "{\n  \"b\": [\n    1,\n    {\n      \"c\": [],\n      \"d\": {}\n    },\n    \"x\"\n  ],\n  \"a\": null,\n  \"e\": true\n}\n",
		},
		{name: "an empty array", document: `[]`, expected: "[]\n"},
		{name: "an empty object", document: `{}`, expected: "{}\n"},
		{name: "a bare string", document: `"s"`, expected: "\"s\"\n"},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			// Arrange.
			value := mustParse(t, testCase.document)

			// Act.
			actual, err := IndentedLayout(value)

			// Assert.
			if err != nil {
				t.Fatal(err)
			}
			if string(actual) != testCase.expected {
				t.Errorf("wrote %q, expected %q", actual, testCase.expected)
			}
		})
	}
}

// mustParse parses a test document or stops the test.
func mustParse(t *testing.T, document string) *Value {
	t.Helper()

	value, err := Parse([]byte(document))
	if err != nil {
		t.Fatal(err)
	}

	return value
}
