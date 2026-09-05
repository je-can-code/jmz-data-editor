package plugins

import "encoding/json"

// MotionConfiguration is the root shape of data/config.motion.json — the defaults every motion type
// falls back to when a `<motion:[...]>` notetag omits a parameter, plus the pacing sections owned by
// J-Motion's extensions.
//
// Every block that exists on disk must appear here, including blocks this server never interprets.
// Go's encoding/json silently discards fields a struct does not declare, and because a save decodes
// the request body into this type and then re-marshals it, an unmodeled block is not merely ignored:
// it is erased from the file. That erasure is not cosmetic — the plugins destructure these blocks at
// boot, so a lost section is a crash on next launch rather than a missing default.
//
// Every field is json.RawMessage because none of these shapes mean anything to the server. It moves
// them between disk and the editor untouched; what they contain is a contract between the editor's
// own typed value objects and the plugins that read them.
type MotionConfiguration struct {
	Breathe json.RawMessage `json:"breathe,omitempty"`
	Stretch json.RawMessage `json:"stretch,omitempty"`
	Pulse   json.RawMessage `json:"pulse,omitempty"`
	Float   json.RawMessage `json:"float,omitempty"`
	Sway    json.RawMessage `json:"sway,omitempty"`
	Swing   json.RawMessage `json:"swing,omitempty"`
	Spin    json.RawMessage `json:"spin,omitempty"`
	Ghost   json.RawMessage `json:"ghost,omitempty"`
	Flicker json.RawMessage `json:"flicker,omitempty"`
	Shake   json.RawMessage `json:"shake,omitempty"`
	Hop     json.RawMessage `json:"hop,omitempty"`
	Throb   json.RawMessage `json:"throb,omitempty"`
	Flash   json.RawMessage `json:"flash,omitempty"`
	Scale   json.RawMessage `json:"scale,omitempty"`
	Angle   json.RawMessage `json:"angle,omitempty"`
	Fade    json.RawMessage `json:"fade,omitempty"`
	Hue     json.RawMessage `json:"hue,omitempty"`
	Tint    json.RawMessage `json:"tint,omitempty"`

	// Collapse is the death animation's own motion type, declared by J-Motion-ABS rather than core.
	Collapse json.RawMessage `json:"collapse,omitempty"`

	// Death is how long each death style holds a corpse open for, and which style is the default.
	Death json.RawMessage `json:"death,omitempty"`

	// Loot is when an expiring loot drop starts blinking, when it starts dissolving, and the shape
	// of that blink.
	Loot json.RawMessage `json:"loot,omitempty"`
}
