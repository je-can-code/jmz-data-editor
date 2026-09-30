package mzjson

import "testing"

// The encoder owes its callers JavaScript's JSON.stringify, byte for byte, because that is how MZ
// writes its data files and how every tool around the game writes them too. Anything it escapes
// that JavaScript would not, or any number it spells differently, turns a save with no changes into
// a diff. Every expected value below was observed from JSON.stringify itself, not reasoned out.

// TestCompactEscapesStringsLikeJavaScript pins the escaping rules, including the characters Go
// escapes and JavaScript leaves alone.
func TestCompactEscapesStringsLikeJavaScript(t *testing.T) {
	cases := []struct {
		name     string
		text     string
		expected string
	}{
		{name: "quote and backslash", text: `a"b\c`, expected: `"a\"b\\c"`},
		{name: "the five short escapes", text: "\b\f\n\r\t", expected: `"\b\f\n\r\t"`},
		{name: "other control characters in lowercase hex", text: "\x00\x01\x1f", expected: `"\u0000\u0001\u001f"`},
		{name: "html characters stay raw", text: "<a>&", expected: `"<a>&"`},
		{name: "line and paragraph separators stay raw", text: "  ", expected: "\"  \""},
		{name: "non-ascii stays raw", text: "café 日本", expected: `"café 日本"`},
		{name: "delete stays raw", text: "\x7f", expected: "\"\x7f\""},
		{name: "slash stays raw", text: "a/b", expected: `"a/b"`},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			// Arrange.
			value := &Value{Kind: String, Text: testCase.text}

			// Act.
			actual := string(Compact(value))

			// Assert.
			if actual != testCase.expected {
				t.Errorf("wrote %q, JSON.stringify writes %q", actual, testCase.expected)
			}
		})
	}
}

// TestCompactWritesNumbersLikeJavaScript pins number spelling: literals JavaScript would never write
// are rewritten, and everything else passes through untouched.
func TestCompactWritesNumbersLikeJavaScript(t *testing.T) {
	cases := []struct {
		literal  string
		expected string
	}{
		{literal: "0", expected: "0"},
		{literal: "-0", expected: "0"},
		{literal: "-0.0", expected: "0"},
		{literal: "42", expected: "42"},
		{literal: "-7", expected: "-7"},
		{literal: "100", expected: "100"},
		{literal: "123456789012345", expected: "123456789012345"},
		{literal: "1234567890123456", expected: "1234567890123456"},
		{literal: "9007199254740993", expected: "9007199254740992"},
		{literal: "1.0", expected: "1"},
		{literal: "1.50", expected: "1.5"},
		{literal: "0.1", expected: "0.1"},
		{literal: "123.456", expected: "123.456"},
		{literal: "1200.4444444444443", expected: "1200.4444444444443"},
		{literal: "1E3", expected: "1000"},
		{literal: "1e20", expected: "100000000000000000000"},
		{literal: "1e21", expected: "1e+21"},
		{literal: "2.5e21", expected: "2.5e+21"},
		{literal: "-1.25e+30", expected: "-1.25e+30"},
		{literal: "1.7976931348623157e308", expected: "1.7976931348623157e+308"},
		{literal: "1e-6", expected: "0.000001"},
		{literal: "0.000001", expected: "0.000001"},
		{literal: "0.0000001", expected: "1e-7"},
		{literal: "1.5e-7", expected: "1.5e-7"},
		{literal: "123e-20", expected: "1.23e-18"},
		{literal: "5e-324", expected: "5e-324"},
		{literal: "1e400", expected: "null"},
	}

	for _, testCase := range cases {
		t.Run(testCase.literal, func(t *testing.T) {
			// Arrange.
			value := &Value{Kind: Number, Text: testCase.literal}

			// Act.
			actual := string(Compact(value))

			// Assert.
			if actual != testCase.expected {
				t.Errorf("wrote %s, JSON.stringify writes %s", actual, testCase.expected)
			}
		})
	}
}

// TestCompactKeepsTheOrderItWasGiven checks that objects come out in their members' order, with no
// sorting, and that arrays, literals and nesting all come out compact.
func TestCompactKeepsTheOrderItWasGiven(t *testing.T) {
	// Arrange- keys deliberately out of alphabetical order.
	value, err := Parse([]byte(`{ "z": 1, "a": [ true, false, null ], "m": { "y": "", "b": {} } }`))
	if err != nil {
		t.Fatal(err)
	}

	// Act.
	actual := string(Compact(value))

	// Assert.
	expected := `{"z":1,"a":[true,false,null],"m":{"y":"","b":{}}}`
	if actual != expected {
		t.Errorf("wrote %s, expected %s", actual, expected)
	}
}
