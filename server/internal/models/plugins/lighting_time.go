package plugins

// LightingTimeConfiguration is the root shape of data/config.lighting-time.json: J-Lighting-Time's day and night curve,
// read once when the game boots (J_LIGHTING_TIME_PluginMetadata#initializeCurve, in
// rmmz-plugins/src/plugins/lighting/ext/time). The day is six four-hour phases, and each says what colour the light is
// and how much of it there is; the sequence lists them in the order a day cycles through them.
//
// Every field is declared, as in LightingConfiguration: the map editor reads this file to draw the sky the way the game
// draws it, so a field it has not learned is refused by the strict read rather than quietly left out. Nothing saves it:
// the route is a GET alone, and the file is edited by hand.
//
// Fields are declared in the order the file carries them.
type LightingTimeConfiguration struct {
	// Phases is what each phase of the day settles on, by the name the sequence calls it.
	Phases map[string]LightingTimePhase `json:"phases"`

	// Sequence is the phases in the order a day cycles through them. It names the same phase at both ends on purpose:
	// a day opens partway through the fade into its first phase and closes having just arrived back at it, so one
	// lookup serves every hour with no wraparound.
	Sequence []string `json:"sequence"`
}

// LightingTimePhase is what one phase of the day settles on.
type LightingTimePhase struct {
	// Tone is the colour cast over everything the game tones, as the engine's screen tone takes it: red, green and
	// blue, each added to every pixel's own on a scale of 255, then grey, how much of each pixel's colour is drained
	// away, 0 to 255. A list rather than four named fields, because the plugin hands it to the engine as one.
	Tone []float64 `json:"tone"`

	// Darkness is how much light the phase takes away, from 0 (none) to 1 (pitch black).
	Darkness float64 `json:"darkness"`
}
