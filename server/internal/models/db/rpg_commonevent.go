package db

import "encoding/json"

// RpgCommonEventCommand is one line in the MZ event command stack ("Show Text", branch, etc.).
// Parameters are polymorphic per code; RawMessage preserves bytes exactly on round-trip.
type RpgCommonEventCommand struct {
	Code       int               `json:"code"`
	Indent     int               `json:"indent"`
	Parameters []json.RawMessage `json:"parameters"`

	// Collapsed is the MZ editor's own memory of whether this branch is folded shut, and it is
	// written only onto the commands that have been folded. A pointer so that all three states -
	// absent, false, true - survive a round-trip as themselves rather than collapsing into two.
	Collapsed *bool `json:"collapsed,omitempty"`
}

// RpgCommonEvent is one row from CommonEvents.json.
type RpgCommonEvent struct {
	Id       int                     `json:"id"`
	List     []RpgCommonEventCommand `json:"list"`
	Name     string                  `json:"name"`
	SwitchId int                     `json:"switchId"`
	Trigger  int                     `json:"trigger"`
}
