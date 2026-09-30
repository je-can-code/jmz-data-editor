package placements

import (
	"encoding/json"
	"errors"
	"testing"
)

// enemyOnPage owes the placements list the game's own reading of a page, because the list is only as
// true as the rule under it. A line J-ABS would drop must name nobody here, or an enemy shows up on maps
// where the game never spawns it; a line J-ABS would read must name its enemy here, or a real placement
// goes missing. The cases below are the ways a line can look like the tag and not be it, each beside the
// line that is.

// TestEnemyOnPageReadsEachLineAsTheGameDoes runs one comment line at a time through the rule.
func TestEnemyOnPageReadsEachLineAsTheGameDoes(t *testing.T) {
	cases := []struct {
		name     string
		line     string
		expected int
	}{
		{name: "the tag", line: "<enemyId:5>", expected: 5},
		{name: "one space after the colon", line: "<enemyId: 5>", expected: 5},
		{name: "the tag in capitals", line: "<ENEMYID:5>", expected: 5},
		{name: "a leading zero", line: "<enemyId:05>", expected: 5},
		{name: "two spaces after the colon", line: "<enemyId:  5>", expected: 0},
		{name: "words after the tag", line: "<enemyId:5> the big one", expected: 0},
		{name: "a space before the tag", line: " <enemyId:5>", expected: 0},
		{name: "two tags on one line", line: "<enemyId:5><sight:3>", expected: 0},
		{name: "another tag", line: "<sight:5>", expected: 0},
		{name: "a longer tag ending in the name", line: "<bossEnemyId:5>", expected: 0},
		{name: "a fraction", line: "<enemyId:5.5>", expected: 0},
		{name: "no brackets", line: "enemyId:5", expected: 0},
		{name: "an id too long for any row", line: "<enemyId:99999999999999999999>", expected: 0},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			// Arrange- a page holding only that line.
			list := []json.RawMessage{commentOf(t, testCase.line), endOfList()}

			// Act.
			enemyId, err := enemyOnPage(list)

			// Assert.
			if err != nil {
				t.Fatal(err)
			}
			if enemyId != testCase.expected {
				t.Errorf("%q named enemy %d, expected %d", testCase.line, enemyId, testCase.expected)
			}
		})
	}
}

// TestEnemyOnPageLetsTheLastTagWin covers a page naming two enemies: the game keeps the last.
func TestEnemyOnPageLetsTheLastTagWin(t *testing.T) {
	// Arrange.
	list := []json.RawMessage{commentOf(t, "<enemyId:5>"), commentOf(t, "<enemyId:7>"), endOfList()}

	// Act.
	enemyId, err := enemyOnPage(list)

	// Assert- the first tag does not survive the second.
	if err != nil || enemyId != 7 {
		t.Errorf("named enemy %d (%v), expected 7", enemyId, err)
	}
}

// TestEnemyOnPageKeepsATagWhenALaterLineIsDropped is the near miss for the last tag winning: a later
// line the game drops, for carrying words after its tag, does not win.
func TestEnemyOnPageKeepsATagWhenALaterLineIsDropped(t *testing.T) {
	// Arrange.
	list := []json.RawMessage{commentOf(t, "<enemyId:5>"), commentOf(t, "<enemyId:7> the boss"), endOfList()}

	// Act.
	enemyId, err := enemyOnPage(list)

	// Assert.
	if err != nil || enemyId != 5 {
		t.Errorf("named enemy %d (%v), expected 5", enemyId, err)
	}
}

// TestEnemyOnPageReadsEveryLineOfAComment covers a tag on a comment's second line, which MZ stores as a
// command of its own.
func TestEnemyOnPageReadsEveryLineOfAComment(t *testing.T) {
	// Arrange.
	list := []json.RawMessage{
		commentOf(t, "<sight:3>"),
		commandOf(t, commentNextLine, 0, "<enemyId:5>"),
		endOfList(),
	}

	// Act.
	enemyId, err := enemyOnPage(list)

	// Assert.
	if err != nil || enemyId != 5 {
		t.Errorf("named enemy %d (%v), expected 5", enemyId, err)
	}
}

// TestEnemyOnPageReadsCommentsInsideABranch covers a comment nested in a conditional branch: the game
// never looks at indents, so it still counts.
func TestEnemyOnPageReadsCommentsInsideABranch(t *testing.T) {
	// Arrange- if switch 1 is on, a comment one level in.
	list := []json.RawMessage{
		commandOf(t, 111, 0, 0, 1, 0),
		commandOf(t, commentFirstLine, 1, "<enemyId:5>"),
		commandOf(t, 0, 1),
		commandOf(t, 412, 0),
		endOfList(),
	}

	// Act.
	enemyId, err := enemyOnPage(list)

	// Assert.
	if err != nil || enemyId != 5 {
		t.Errorf("named enemy %d (%v), expected 5", enemyId, err)
	}
}

// TestEnemyOnPageReadsOnlyComments covers the tag appearing in text that is not a comment, a line of
// dialogue and a script, after a comment naming another enemy: neither is read, so neither wins.
func TestEnemyOnPageReadsOnlyComments(t *testing.T) {
	// Arrange.
	list := []json.RawMessage{
		commentOf(t, "<enemyId:7>"),
		commandOf(t, 101, 0, "", 0, 0, 2, ""),
		commandOf(t, 401, 0, "<enemyId:5>"),
		commandOf(t, 355, 0, "<enemyId:5>"),
		endOfList(),
	}

	// Act.
	enemyId, err := enemyOnPage(list)

	// Assert.
	if err != nil || enemyId != 7 {
		t.Errorf("named enemy %d (%v), expected 7", enemyId, err)
	}
}

// TestEnemyOnPageNamesNobodyOnAnEmptyPage covers a page with no commands but the one closing it.
func TestEnemyOnPageNamesNobodyOnAnEmptyPage(t *testing.T) {
	// Arrange.
	list := []json.RawMessage{endOfList()}

	// Act.
	enemyId, err := enemyOnPage(list)

	// Assert.
	if err != nil || enemyId != 0 {
		t.Errorf("named enemy %d (%v), expected none", enemyId, err)
	}
}

// TestEnemyOnPageRefusesCommandsMzNeverWrites covers commands that cannot be what they claim. Skipping
// them quietly would hide a damaged file behind a list that looks complete.
func TestEnemyOnPageRefusesCommandsMzNeverWrites(t *testing.T) {
	cases := []struct {
		name    string
		command string
	}{
		{name: "a comment whose text is a number", command: `{"code":108,"indent":0,"parameters":[5]}`},
		{name: "a later comment line with no text", command: `{"code":408,"indent":0,"parameters":[]}`},
		{name: "a command that is a string", command: `"<enemyId:5>"`},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			// Arrange- the bad command after a good tag, which must not be answered in its place.
			list := []json.RawMessage{commentOf(t, "<enemyId:5>"), json.RawMessage(testCase.command), endOfList()}

			// Act.
			enemyId, err := enemyOnPage(list)

			// Assert.
			if err == nil {
				t.Errorf("expected an error, named enemy %d", enemyId)
			}
		})
	}
}

// TestEnemyOnPageNamesTheTextOfAComment is the near miss for the refusal above: the error says what was
// wrong rather than only that something was.
func TestEnemyOnPageNamesTheTextOfAComment(t *testing.T) {
	// Arrange.
	list := []json.RawMessage{json.RawMessage(`{"code":108,"indent":0,"parameters":[true]}`), endOfList()}

	// Act.
	_, err := enemyOnPage(list)

	// Assert.
	if errors.Is(err, errCommentNotText) == false {
		t.Errorf("answered %v, expected %v", err, errCommentNotText)
	}
}

// commandOf builds one event command the way MZ writes it.
func commandOf(t *testing.T, code int, indent int, parameters ...any) json.RawMessage {
	t.Helper()

	if parameters == nil {
		parameters = []any{}
	}
	raw, err := json.Marshal(map[string]any{"code": code, "indent": indent, "parameters": parameters})
	if err != nil {
		t.Fatal(err)
	}

	return raw
}

// commentOf builds the first line of a comment.
func commentOf(t *testing.T, text string) json.RawMessage {
	t.Helper()

	return commandOf(t, commentFirstLine, 0, text)
}

// endOfList builds the empty command MZ closes every command list with.
func endOfList() json.RawMessage {
	return json.RawMessage(`{"code":0,"indent":0,"parameters":[]}`)
}
