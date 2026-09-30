package mzjson

import (
	"encoding/json"
	"testing"
)

// Parse owes its callers exactly one JSON value, with every object's key order and every number's
// literal text intact, and a refusal for anything else. The refusals matter because Parse is also
// what validates the editor's own documents before they are written into the project.

// TestParseRefusesWhatIsNotOneDocument covers the inputs a body must never be accepted as.
func TestParseRefusesWhatIsNotOneDocument(t *testing.T) {
	cases := []struct {
		name  string
		input string
	}{
		{name: "two documents", input: `{} {}`},
		{name: "trailing text", input: `{}x`},
		{name: "a truncated document", input: `{"a":`},
		{name: "not JSON", input: `hello`},
		{name: "nothing", input: ``},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			// Arrange- the input alone.

			// Act.
			_, err := Parse([]byte(testCase.input))

			// Assert.
			if err == nil {
				t.Errorf("expected %q to be refused", testCase.input)
			}
		})
	}
}

// TestParseAcceptsSurroundingWhitespace keeps a trailing newline, which most editors add, from
// counting as trailing content.
func TestParseAcceptsSurroundingWhitespace(t *testing.T) {
	// Arrange.
	input := []byte("\n  {\"a\": 1}\n\n")

	// Act.
	value, err := Parse(input)

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	if actual := string(Compact(value)); actual != `{"a":1}` {
		t.Errorf("parsed %s", actual)
	}
}

// TestParseKeepsNumbersAsTheirLiteralText keeps an integer too large for a double from being rounded
// on the way in; only the encoder decides how a number is finally spelled.
func TestParseKeepsNumbersAsTheirLiteralText(t *testing.T) {
	// Arrange.
	input := []byte(`[12345678901234567890, 1.50]`)

	// Act.
	value, err := Parse(input)

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	if value.Items[0].Text != "12345678901234567890" || value.Items[1].Text != "1.50" {
		t.Errorf("numbers changed on the way in: %q, %q", value.Items[0].Text, value.Items[1].Text)
	}
}

// TestMemberFindsAKey covers the lookup the map layout uses to find the tiles and events.
func TestMemberFindsAKey(t *testing.T) {
	// Arrange.
	value := mustParse(t, `{"a":1,"b":2}`)

	// Act.
	found := value.Member("b")
	missing := value.Member("c")

	// Assert.
	if found == nil || found.Text != "2" {
		t.Errorf("expected b to be 2, found %v", found)
	}
	if missing != nil {
		t.Errorf("expected no c, found %v", missing)
	}
}

// renderSample is a stand-in model for Render's tests.
type renderSample struct {
	Name  string `json:"name"`
	Level int    `json:"level"`
}

// TestRenderWritesTheModelNotTheBody shows why Render encodes the model: Go decodes keys
// case-insensitively, so a body can reach the model under a spelling the game would not read.
func TestRenderWritesTheModelNotTheBody(t *testing.T) {
	// Arrange- a body that spells both keys differently from the model.
	var sample renderSample
	if err := json.Unmarshal([]byte(`{"NAME":"Slime","Level":3}`), &sample); err != nil {
		t.Fatal(err)
	}

	// Act.
	rendered, err := Render(sample, nil, oneLineLayout)

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	if string(rendered) != `{"name":"Slime","level":3}` {
		t.Errorf("rendered %s", rendered)
	}
}

// TestRenderKeepsTheTemplatesOrder shows the file being replaced lending its key order.
func TestRenderKeepsTheTemplatesOrder(t *testing.T) {
	// Arrange- a file that lists the keys the other way round from the model.
	template := []byte(`{"level":1,"name":"Bat"}`)

	// Act.
	rendered, err := Render(renderSample{Name: "Slime", Level: 3}, template, oneLineLayout)

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	if string(rendered) != `{"level":3,"name":"Slime"}` {
		t.Errorf("rendered %s", rendered)
	}
}

// TestRenderIgnoresATemplateThatIsNotJson keeps a damaged file from blocking the save that would
// replace it.
func TestRenderIgnoresATemplateThatIsNotJson(t *testing.T) {
	// Arrange.
	template := []byte(`{"level":1,`)

	// Act.
	rendered, err := Render(renderSample{Name: "Slime", Level: 3}, template, oneLineLayout)

	// Assert.
	if err != nil {
		t.Fatal(err)
	}
	if string(rendered) != `{"name":"Slime","level":3}` {
		t.Errorf("rendered %s", rendered)
	}
}

// oneLineLayout is a pass-through layout for Render's tests: one compact line.
func oneLineLayout(root *Value) ([]byte, error) {
	return Compact(root), nil
}
