package db

// RpgSoundEffect matches MZ SE blobs embedded in animations (and elsewhere).
type RpgSoundEffect struct {
	Name   string `json:"name"`
	Pan    int    `json:"pan"`
	Pitch  int    `json:"pitch"`
	Volume int    `json:"volume"`
}

// RpgAnimationRotation is the editor rotation payload (ints).
type RpgAnimationRotation struct {
	X int `json:"x"`
	Y int `json:"y"`
	Z int `json:"z"`
}

// RpgAnimationFlashTiming is one flash strip entry on the animation timeline.
type RpgAnimationFlashTiming struct {
	Frame    int    `json:"frame"`
	Duration int    `json:"duration"`
	Color    [4]int `json:"color"` // RGBA
}

// RpgAnimationSoundTiming pairs a frame with an SE cue.
type RpgAnimationSoundTiming struct {
	Frame int            `json:"frame"`
	Se    RpgSoundEffect `json:"se"`
}

// RpgAnimationTiming is one row in the MZ "timings" array (battle-style frame strips).
type RpgAnimationTiming struct {
	Frame         int            `json:"frame"`
	Se            RpgSoundEffect `json:"se"`
	FlashScope    int            `json:"flashScope"`
	FlashColor    [4]int         `json:"flashColor"`
	FlashDuration int            `json:"flashDuration"`
}

// RpgAnimation is one row from Animations.json (slot 0 is often null at the API layer).
//
// MZ stores two families of animations on the same table:
// - Particle / effect animations: effectName + flashTimings + soundTimings + rotation + scale + speed …
// - Battle frame animations: animation1/2 hue+name + frames + position; often omit rotation/effect fields.
//
// Rotation uses a pointer so rows without a rotation object (battle strips) do not gain a fake {"x":0,...} on marshal.
type RpgAnimation struct {
	Id   int    `json:"id"`
	Name string `json:"name"`

	DisplayType *int `json:"displayType,omitempty"`

	AlignBottom bool `json:"alignBottom,omitempty"`

	EffectName string `json:"effectName,omitempty"`

	FlashTimings []RpgAnimationFlashTiming `json:"flashTimings,omitempty"`
	SoundTimings []RpgAnimationSoundTiming `json:"soundTimings,omitempty"`
	Timings      []RpgAnimationTiming      `json:"timings,omitempty"`

	OffsetX int `json:"offsetX"`
	OffsetY int `json:"offsetY"`

	Rotation *RpgAnimationRotation `json:"rotation,omitempty"`
	Scale    int                   `json:"scale,omitempty"`
	Speed    int                   `json:"speed,omitempty"`

	Animation1Hue  int        `json:"animation1Hue,omitempty"`
	Animation1Name string     `json:"animation1Name,omitempty"`
	Animation2Hue  int        `json:"animation2Hue,omitempty"`
	Animation2Name string     `json:"animation2Name,omitempty"`
	Frames         [][][8]int `json:"frames,omitempty"`
	Position       int        `json:"position,omitempty"`
}
