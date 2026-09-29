package plugins

// NotetagLineTemplate is one entry in data/config.notetag-lines.json: the sentence an effect is described with
// wherever a screen lists what a state does, read at runtime by J-Base's NotetagDescriber
// (rmmz-plugins/src/plugins/_base/core/managers/NotetagDescriber.js).
//
// The key is the name the effect's describer asks for its sentence by. The template is plain words with tokens
// in braces: {value} is the amount the screen colors by whether it helps or hurts, and every other {name} is
// filled in by the describer from the effect itself. A template written empty says, on purpose, that the effect
// says nothing; a key with no entry at all has simply not been written yet.
type NotetagLineTemplate struct {
	Key      string `json:"key"`
	Template string `json:"template"`
}

// NotetagLinesConfiguration is the root shape of data/config.notetag-lines.json: a bare array of templates, with
// no wrapping object.
type NotetagLinesConfiguration []NotetagLineTemplate
