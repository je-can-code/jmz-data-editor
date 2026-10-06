package plugins

// LightingConfiguration is the root shape of data/config.lighting.json: the defaults J-Lighting falls back to for
// whatever a `<light:[...]>` or `<ambient:[...]>` tag leaves out, read once when the game boots
// (J_LIGHTING_PluginMetadata#initializeLightingDefaults, in rmmz-plugins/src/plugins/lighting/core).
//
// Unlike the configs the data editor's boards save, which pass their blocks through untouched as raw JSON, every
// field here is declared, all the way down. The map editor reads this file to draw lights the way the game draws
// them, so a field it has not learned is a default it would be drawing without; the strict read refuses the file
// instead, which says so at once. Nothing saves it: the route is a GET alone, and the file is edited by hand.
//
// Fields are declared in the order the file carries them.
type LightingConfiguration struct {
	// Light is what a light falls back to.
	Light LightingLightDefaults `json:"light"`

	// Ambient is what a map's darkness falls back to.
	Ambient LightingAmbientDefaults `json:"ambient"`
}

// LightingLightDefaults is what a `<light:[...]>` tag falls back to for what it leaves out.
type LightingLightDefaults struct {
	// Radius is how far a light reaches, in tiles. J-Lighting's tag always writes a reach, so the game itself
	// never falls back to this one; it is declared because the file carries it.
	Radius float64 `json:"radius"`

	// Color is the colour of a light whose tag names none, as a hex string such as #ffffff.
	Color string `json:"color"`

	// Intensity is how evenly a light whose tag gives no intensity fills its circle, from 0 (a soft pool) to 1 (a
	// flat disc). Tags write 0 to 100; this file writes the fraction.
	Intensity float64 `json:"intensity"`

	// Effects tunes each way a light can animate.
	Effects LightingEffects `json:"effects"`
}

// LightingEffects tunes the three effects a tag can name. A steady light has no tuning, so it has no entry.
type LightingEffects struct {
	// Flicker is the restless dance of a flame.
	Flicker LightingEffectTuning `json:"flicker"`

	// Pulse is a clean, regular swell and fade.
	Pulse LightingEffectTuning `json:"pulse"`

	// Glitch is long steady stretches broken by a stutter.
	Glitch LightingEffectTuning `json:"glitch"`
}

// LightingEffectTuning is how strongly and how fast one effect runs. Every effect is tuned by the same numbers, so
// retuning one is the same job as retuning another.
type LightingEffectTuning struct {
	// Depth is how much brightness the effect may take away at its worst, from 0 to 1.
	Depth float64 `json:"depth"`

	// Period is how many frames one cycle takes.
	Period float64 `json:"period"`

	// Chance is how likely a cycle is to fault at all; only glitch reads it.
	Chance float64 `json:"chance"`

	// Variance is how far either side of the period one light may sit, so a room of lights never beats as one.
	Variance float64 `json:"variance"`
}

// LightingAmbientDefaults is what an `<ambient:[...]>` tag falls back to for what it leaves out.
type LightingAmbientDefaults struct {
	// Color is the colour of the dark when a map names none, as a hex string such as #000000.
	Color string `json:"color"`
}
