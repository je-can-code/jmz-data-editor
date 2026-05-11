package db

import "encoding/json"

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

	// Slices must not use omitempty: MZ runtime concatenates / iterates these and
	// expects the keys to exist (empty [] is fine; missing keys are not).
	FlashTimings []RpgAnimationFlashTiming `json:"flashTimings"`
	SoundTimings []RpgAnimationSoundTiming `json:"soundTimings"`
	Timings      []RpgAnimationTiming      `json:"timings"`

	OffsetX int `json:"offsetX"`
	OffsetY int `json:"offsetY"`

	Rotation *RpgAnimationRotation `json:"rotation,omitempty"`
	Scale    int                   `json:"scale,omitempty"`
	Speed    int                   `json:"speed,omitempty"`

	Animation1Hue  int        `json:"animation1Hue,omitempty"`
	Animation1Name string     `json:"animation1Name,omitempty"`
	Animation2Hue  int        `json:"animation2Hue,omitempty"`
	Animation2Name string     `json:"animation2Name,omitempty"`
	Frames         [][][8]int `json:"frames"`
	Position       int        `json:"position,omitempty"`
}

// MarshalJSON forces MZ-required slice fields to JSON [] instead of null when Go holds nil.
func (a RpgAnimation) MarshalJSON() ([]byte, error) {
	type animJSON RpgAnimation
	aux := animJSON(a)
	if aux.FlashTimings == nil {
		aux.FlashTimings = []RpgAnimationFlashTiming{}
	}
	if aux.SoundTimings == nil {
		aux.SoundTimings = []RpgAnimationSoundTiming{}
	}
	if aux.Timings == nil {
		aux.Timings = []RpgAnimationTiming{}
	}
	if aux.Frames == nil {
		aux.Frames = [][][8]int{}
	}
	return json.Marshal(aux)
}

// UnmarshalJSON normalizes omitted or null slice fields to empty slices for stable round-trips.
func (a *RpgAnimation) UnmarshalJSON(data []byte) error {
	type animJSON RpgAnimation
	var tmp animJSON
	if err := json.Unmarshal(data, &tmp); err != nil {
		return err
	}
	*a = RpgAnimation(tmp)
	if a.FlashTimings == nil {
		a.FlashTimings = []RpgAnimationFlashTiming{}
	}
	if a.SoundTimings == nil {
		a.SoundTimings = []RpgAnimationSoundTiming{}
	}
	if a.Timings == nil {
		a.Timings = []RpgAnimationTiming{}
	}
	if a.Frames == nil {
		a.Frames = [][][8]int{}
	}
	return nil
}
