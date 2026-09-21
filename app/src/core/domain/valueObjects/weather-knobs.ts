/**
 * The knobs a weather motion and a weather layer can carry, with what each one means.
 *
 * **Enumerated deliberately, and kept in step by hand.** The plugin reads whatever a motion
 * happens to declare, so a list here is a second copy of something that lives elsewhere — but the
 * alternative is showing an author twenty-odd bare numbers with no indication of what any of them
 * do, and offering no way at all to add a knob a motion does not yet carry. The trade is worth it
 * as long as this list is treated as part of the contract: a knob added to
 * `weather/core/core/WeatherMotion.js` and copied through `WeatherPresets.resolveStage` belongs
 * here the same day.
 *
 * The descriptions are written for somebody tuning a look, not somebody reading the emitter.
 */

/** How a single knob is presented and what it means. */
type WeatherKnob = {
  key: string;
  label: string;
  help: string;
  kind: 'number' | 'text' | 'edge' | 'blend' | 'motion' | 'colour';
};

/**
 * Every knob a motion can declare.
 *
 * Grouped by what an author is thinking about rather than alphabetically: where it comes from,
 * how it moves, how long it lasts, and how it varies from itself.
 */
const MOTION_KNOBS: WeatherKnob[] = [
  {
    key: 'edge',
    label: 'Enters from',
    help: 'Which side of the screen particles come in by. Leading means the side you are walking toward.',
    kind: 'edge',
  },
  {
    key: 'margin',
    label: 'Starts off-screen by',
    help: 'How far outside the screen a particle begins, so nothing pops into existence in view.',
    kind: 'number',
  },
  {
    key: 'entryDepth',
    label: 'Queue depth',
    help: 'How far back beyond that the waiting particles are spread.',
    kind: 'number',
  },
  {
    key: 'speedX',
    label: 'Sideways speed',
    help: 'Pixels per frame across. Negative goes the other way.',
    kind: 'number',
  },
  {
    key: 'speedY',
    label: 'Vertical speed',
    help: 'Pixels per frame down. Negative rises.',
    kind: 'number',
  },
  {
    key: 'jitterX',
    label: 'Sideways variation',
    help: 'How much faster than each other particles travel across. Zero makes them a rigid sheet.',
    kind: 'number',
  },
  {
    key: 'jitterY',
    label: 'Vertical variation',
    help: 'The same, up and down. Keep it well under the speed or particles stall in mid-air.',
    kind: 'number',
  },
  {
    key: 'drag',
    label: 'Slows by',
    help: 'A share of its speed shed every frame. For things burning up rather than falling.',
    kind: 'number',
  },
  {
    key: 'sway',
    label: 'Weaves by',
    help: 'How far off its path a particle wanders. A distance, so it does not change with speed.',
    kind: 'number',
  },
  {
    key: 'swayRate',
    label: 'Weave pace',
    help: 'How quickly it works through that wander.',
    kind: 'number',
  },
  {
    key: 'roll',
    label: 'Spins by',
    help: 'How fast it turns in the picture plane, in radians a frame.',
    kind: 'number',
  },
  {
    key: 'growth',
    label: 'Grows by',
    help: 'How fast it swells as it lives. A ripple spreading is this and nothing else.',
    kind: 'number',
  },
  {
    key: 'life',
    label: 'Lives for',
    help: 'Frames before it is gone. Leave empty for things that simply leave the screen instead.',
    kind: 'number',
  },
  {
    key: 'lifeJitter',
    label: 'Lifetime variation',
    help: 'How much lifetimes differ. Without it, everything falling lands along one line.',
    kind: 'number',
  },
  {
    key: 'fadeIn',
    label: 'Fades in over',
    help: 'Frames spent arriving.',
    kind: 'number',
  },
  {
    key: 'fadeOut',
    label: 'Fades out over',
    help: 'Frames spent leaving, counted back from the end of its life.',
    kind: 'number',
  },
  {
    key: 'staggerFrames',
    label: 'First arrival spread',
    help: 'How long the opening population takes to all turn up, so a heavy look does not land at once.',
    kind: 'number',
  },
  {
    key: 'lean',
    label: 'Shared angle',
    help: 'How far the whole population is tilted. Light shafts lean together because they share a sun.',
    kind: 'number',
  },
  {
    key: 'tilt',
    label: 'Angle variation',
    help: 'How far each one is allowed to differ from that shared angle.',
    kind: 'number',
  },
  {
    key: 'stretch',
    label: 'Shape variation',
    help: 'How much the two axes are scaled apart, so one picture reads as a variety of shapes.',
    kind: 'number',
  },
  {
    key: 'flip',
    label: 'Turns over at',
    help: 'How fast it rotates through facing the other way. Leaves and petals do this; rain does not.',
    kind: 'number',
  },
  {
    key: 'pulse',
    label: 'Dims by',
    help: 'How deeply it darkens as it blinks. One is a full blackout, which reads as a switch.',
    kind: 'number',
  },
  {
    key: 'pulseRate',
    label: 'Blink pace',
    help: 'How quickly it blinks.',
    kind: 'number',
  },
  {
    key: 'becomes',
    label: 'Turns into',
    help: 'What it becomes when its life runs out. A raindrop becomes a ripple this way.',
    kind: 'motion',
  },
];

/**
 * Every knob one layer of a look can declare.
 *
 * A layer is one picture travelling one way. Anything more complicated than that is two layers,
 * which is why a look carries a list of them per strength rather than one description.
 */
const LAYER_KNOBS: WeatherKnob[] = [
  {
    key: 'motion',
    label: 'Moves like',
    help: 'Which motion carries this picture.',
    kind: 'motion',
  },
  {
    key: 'asset',
    label: 'Picture',
    help: 'The file in img/weather, without the extension.',
    kind: 'text',
  },
  {
    key: 'density',
    label: 'How many',
    help: 'How thick this layer is, counted against a default-sized window and scaled to the real one.',
    kind: 'number',
  },
  {
    key: 'speed',
    label: 'Speed',
    help: 'A percentage of whatever the motion moves at. 100 leaves it alone.',
    kind: 'number',
  },
  {
    key: 'scale',
    label: 'Size',
    help: 'A percentage of the picture own size.',
    kind: 'number',
  },
  {
    key: 'scaleJitter',
    label: 'Size variation',
    help: 'How much sizes differ. A field of identical copies reads as a repeated sprite.',
    kind: 'number',
  },
  {
    key: 'opacity',
    label: 'Strength',
    help: 'How strongly it draws at its fullest, as a percentage.',
    kind: 'number',
  },
  {
    key: 'tint',
    label: 'Colour',
    help: 'A colour to multiply the picture by, so one drawing can be warm at noon and cold at night.',
    kind: 'colour',
  },
  {
    key: 'blend',
    label: 'Blending',
    help: 'Additive glows against dark; multiply darkens; normal draws as painted.',
    kind: 'blend',
  },
];

/**
 * The knobs describing what a layer's particles turn into, which only matter when its motion
 * names a successor.
 */
const STAGE_KNOBS: WeatherKnob[] = [
  {
    key: 'becomesAsset',
    label: 'Then draws',
    help: 'The picture it changes to.',
    kind: 'text',
  },
  {
    key: 'becomesScale',
    label: 'Then sized',
    help: 'A percentage. Left empty it keeps the size it had.',
    kind: 'number',
  },
  {
    key: 'becomesScaleJitter',
    label: 'Then varying by',
    help: 'How much those sizes differ.',
    kind: 'number',
  },
  {
    key: 'becomesOpacity',
    label: 'Then at strength',
    help: 'How strongly the second stage draws, as a percentage.',
    kind: 'number',
  },
  {
    key: 'becomesTint',
    label: 'Then coloured',
    help: 'A colour for the second stage.',
    kind: 'colour',
  },
];

/** Which side of the screen a motion can enter from. */
const EDGES = [ 'top', 'bottom', 'left', 'right', 'leading', 'anywhere' ];

/** How a layer is blended onto what is behind it. */
const BLENDS = [ 'normal', 'additive', 'multiply' ];

/** The three rungs of the strength ladder, weakest first. */
const INTENSITIES = [ 'light', 'moderate', 'heavy' ];

export {
  BLENDS,
  EDGES,
  INTENSITIES,
  LAYER_KNOBS,
  MOTION_KNOBS,
  STAGE_KNOBS,
  type WeatherKnob,
};
