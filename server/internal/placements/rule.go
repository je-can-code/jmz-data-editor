// Package placements finds where each enemy stands on the game's maps: every map event whose comments
// make it a battler of that enemy, in the way J-ABS reads them. From the same reading of every map it
// also finds where each transfer lands, so a map can be told which transfers point into it.
package placements

import (
	"encoding/json"
	"errors"
	"regexp"
	"strconv"
)

const (
	// commentFirstLine is the command code of a comment's first line.
	commentFirstLine = 108

	// commentNextLine is the command code of every line of a comment after its first.
	commentNextLine = 408
)

// parsableComment is the shape a comment line must have before any J plugin is offered it: the whole
// line is one tag, from `<` to `>`, holding nothing but these characters. It is J-Base's
// ParsableComment (rmmz-plugins, src/plugins/_base/core/_metadata/initialization.js), carried over from
// JavaScript unchanged in meaning: `\w` is ASCII letters, digits and the underscore in both, and neither
// `^` nor `$` reaches past a line break in either. Since `<` and `>` are not among the characters
// allowed inside, a line holding two tags fails it, and so does a tag with words after it; the game
// drops such a line before J-ABS ever reads it.
var parsableComment = regexp.MustCompile(`(?i)^<[[\]\w :"',.!?+\-*/\\#~%=();]+>$`)

// enemyIdTag is J-ABS's EnemyId (rmmz-plugins, src/plugins/abs/core/_metadata/initialization.js): the
// tag naming the enemy an event is a battler of, in any case, with at most one space after the colon.
var enemyIdTag = regexp.MustCompile(`(?i)<enemyId:[ ]?(\d+)>`)

// errCommentNotText is a comment line whose text is not a string, which MZ never writes.
var errCommentNotText = errors.New("a comment line's text is not a string")

// command is the part of an event command the rule reads.
type command struct {
	Code       int               `json:"code"`
	Parameters []json.RawMessage `json:"parameters"`
}

// enemyOnPage returns the enemy a page's comments make its event a battler of, or 0 when they make it
// a battler of none.
//
// It reads a page exactly as J-ABS reads the page an event is on (Game_Event.getBattlerIdOverrides,
// over J-Base's Game_Event.getValidCommentCommands). Every comment line on the page counts, first
// lines and later lines alike and at any indent, so a comment inside a conditional branch still names
// the enemy. A line counts only when it is a whole parsable tag. When several lines name an enemy,
// the last one wins. An id too long to be any enemy's still wins over the lines before it, as it does
// in the game, and names no enemy that could be listed.
func enemyOnPage(list []json.RawMessage) (int, error) {
	enemyId := 0
	for _, raw := range list {
		comment, isComment, err := commentLine(raw)
		if err != nil {
			return 0, err
		}
		if isComment == false || parsableComment.MatchString(comment) == false {
			continue
		}

		match := enemyIdTag.FindStringSubmatch(comment)
		if match == nil {
			continue
		}

		// the digits always parse unless there are too many of them for any row to carry.
		id, err := strconv.Atoi(match[1])
		if err != nil {
			id = 0
		}
		enemyId = id
	}

	return enemyId, nil
}

// commentLine returns a command's text when the command is a line of a comment. Any other command is
// not a comment and has no text to read. A command that is not a command at all, or a comment whose
// text is not a string, is an error: MZ writes neither, so either means the file is not what it seems.
func commentLine(raw json.RawMessage) (string, bool, error) {
	var decoded command
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return "", false, err
	}
	if decoded.Code != commentFirstLine && decoded.Code != commentNextLine {
		return "", false, nil
	}

	var text string
	if len(decoded.Parameters) == 0 || json.Unmarshal(decoded.Parameters[0], &text) != nil {
		return "", false, errCommentNotText
	}

	return text, true, nil
}
