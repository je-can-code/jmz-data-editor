package plugins

import "encoding/json"

// WeatherConfiguration is the root shape of data/config.weather.json — every look the game can
// draw, the motions those looks are built from, and the sky that decides which of them is happening
// over Erocia right now.
//
// Every block that exists on disk must appear here, including the ones this server never interprets
// and including the `_comment_*` blocks. Go's encoding/json silently discards fields a struct does
// not declare, and because a save decodes the request body into this type and then re-marshals it,
// an unmodeled block is not merely ignored: it is erased from the file. For the authoring comments
// that is a quiet loss of the only documentation an author has while editing by hand; for anything
// else it is a crash at boot, because the plugins destructure these blocks on load.
//
// Fields are declared in the order the file carries them, because marshalling follows struct order
// and a different order would rewrite the whole file on the first save.
//
// Every field is json.RawMessage because none of these shapes mean anything to the server. It moves
// them between disk and the editor untouched; what they contain is a contract between the editor's
// own typed value objects and the plugins that read them.
type WeatherConfiguration struct {
	// Motions are the physics each look is drawn with - how a particle enters, travels, sways,
	// turns over, and ends.
	Motions json.RawMessage `json:"motions,omitempty"`

	// Presets are the named looks themselves, each carrying a ladder of three intensities.
	Presets json.RawMessage `json:"presets,omitempty"`

	CommentIds json.RawMessage `json:"_comment_ids,omitempty"`

	// PresetIds and IntensityIds are the numbers events branch on. They are declared rather than
	// derived from position, so inserting a preset never renumbers the ones after it.
	PresetIds    json.RawMessage `json:"presetIds,omitempty"`
	IntensityIds json.RawMessage `json:"intensityIds,omitempty"`

	// Variables are the two game variables the current weather is mirrored into.
	Variables json.RawMessage `json:"variables,omitempty"`

	CommentLabels json.RawMessage `json:"_comment_labels,omitempty"`

	// Labels are the words weather is written with, wherever it is written down - a forecast row
	// or a text code in somebody's dialogue.
	Labels json.RawMessage `json:"labels,omitempty"`

	CommentSky json.RawMessage `json:"_comment_sky,omitempty"`

	// Sky is everything J-Weather-Time owns: the conditions, the per-season graphs, the per-month
	// bias, the forecast horizon, the voices, and the destinations the diagnostic screen reports on.
	Sky json.RawMessage `json:"sky,omitempty"`

	CommentClimates json.RawMessage `json:"_comment_climates,omitempty"`

	// Climates are how one kind of place answers the sky rather than following it.
	Climates json.RawMessage `json:"climates,omitempty"`
}
