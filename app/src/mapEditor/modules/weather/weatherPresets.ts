import type { JsonValue } from '../../core/model/json.ts';
import { pulseRateOf, swayRateOf } from './weatherMotion.ts';

/**
 * One motion or one authored layer as config.weather.json holds it: plain knobs by name. Nothing here is checked against
 * a shape, because J-Weather checks nothing either: it reads each knob as it finds it, and an absent one reads as
 * undefined, so the arithmetic below meets the same values the plugin's does.
 */
type RawKnobs = Readonly<Record<string, JsonValue | undefined>>;

/**
 * J-Weather's config as the server serves it, as far as drawing goes: every motion by name, and every look by name,
 * each with its ladder of intensities.
 */
type WeatherConfigFile = {
  readonly motions: Readonly<Record<string, RawKnobs>>;
  readonly presets: Readonly<Record<string, { readonly stops: Readonly<Record<string, readonly RawKnobs[]>> }>>;
};

/**
 * One layer of a look, folded together with the motion it names, as WeatherPresets#resolveStage builds it: everything a
 * population of particles is built and moved from. The optional knobs are those a motion may leave out, which the motion
 * arithmetic reads as their defaults.
 */
type WeatherLayer = {
  readonly edge: string;
  readonly speedX: number;
  readonly speedY: number;
  readonly jitterX: number;
  readonly jitterY: number;
  readonly roll: number;
  readonly growth: number;
  readonly fadeIn: number;
  readonly staggerFrames: number;
  readonly margin?: number;
  readonly entryDepth?: number;
  readonly sway?: number;
  readonly swayRate?: number;
  readonly life?: number;
  readonly lifeJitter?: number;
  readonly fadeOut?: number;
  readonly drag?: number;
  readonly tilt?: number;
  readonly stretch?: number;
  readonly lean?: number;
  readonly flip?: number;
  readonly pulse?: number;
  readonly pulseRate?: number;
  readonly scale: number;
  readonly scaleJitter: number;
  readonly peakOpacity?: number;
  readonly tint?: number;
  readonly asset: string;
  readonly density: number;
  readonly blend: string;

  /**
   * What these particles turn into at the end of their lives, or null for nothing: one stage deep, never further.
   */
  readonly becomes: WeatherLayer | null;
};

/**
 * The layers that draw a look at one strength, or why there are none: a look the config does not know, or a strength
 * its ladder has no rung for, each of which J-Weather reports and answers with no layers at all.
 */
type PresetLayers = {
  readonly layers: readonly WeatherLayer[];
  readonly problem: string | null;
};

/**
 * How a layer's authored speed and scale are read: as percentages (WeatherPresets.PercentBase).
 */
const PERCENT_BASE = 100;

/**
 * A fully opaque particle, in the units the renderer draws with (WeatherPresets.FullOpacity).
 */
const FULL_OPACITY = 255;

/**
 * The tint that leaves a picture exactly as it was painted (WeatherPresets.NoTint).
 */
const NO_TINT = 0xffffff;

/**
 * Reads one knob of a motion or a layer as J-Weather reads it: whatever is there, a number in a well-formed file, and
 * undefined when it is absent, which the arithmetic then carries exactly as the plugin's does.
 * @param {RawKnobs} knobs The motion or the layer.
 * @param {string} name The knob.
 * @returns {number} The knob's value, typed as the number it holds in a well-formed file.
 */
const knob = (knobs: RawKnobs, name: string): number =>
{
  return knobs[name] as number;
};

/**
 * Reads one optional knob, kept absent when it is, so the motion arithmetic falls back to its own default for it.
 * @param {RawKnobs} knobs The motion or the layer.
 * @param {string} name The knob.
 * @returns {number | undefined} The knob's value, or undefined when it is absent.
 */
const optionalKnob = (knobs: RawKnobs, name: string): number | undefined =>
{
  return knobs[name] as number | undefined;
};

/**
 * Finds an entry of a config table by name, as J-Weather's plain property read finds it, minus what every object holds
 * by birth: a look named "constructor" is no look, where the plugin would find the object's own constructor and fail.
 * @param {Readonly<Record<string, T>>} table The table.
 * @param {string} name The entry's name.
 * @returns {T | undefined} The entry, or undefined when the table has none by that name.
 */
const entryOf = <T>(table: Readonly<Record<string, T>>, name: string): T | undefined =>
{
  return Object.hasOwn(table, name)
    ? table[name]
    : undefined;
};

/**
 * How much a layer's particles vary in size, as a percentage (WeatherPresets#jitterOf): none when it says nothing.
 * @param {RawKnobs} layer The authored layer.
 * @returns {number} The jitter.
 */
const jitterOf = (layer: RawKnobs): number =>
{
  return layer['scaleJitter'] === undefined
    ? 0
    : knob(layer, 'scaleJitter');
};

/**
 * The colour a layer multiplies its picture by, as a packed number (WeatherPresets#tintOf): untinted when it says
 * nothing, and otherwise its hex text read past its first hash.
 * @param {RawKnobs} layer The authored layer.
 * @returns {number} The tint.
 */
const tintOf = (layer: RawKnobs): number =>
{
  if (layer['tint'] === undefined)
  {
    return NO_TINT;
  }

  const digits = String(layer['tint']).replace('#', '');
  return Number.parseInt(digits, 16);
};

/**
 * How strongly a layer draws at its fullest, out of 255 (WeatherPresets#opacityOf): full strength when it says nothing,
 * and otherwise its percentage of full, rounded.
 * @param {RawKnobs} layer The authored layer.
 * @returns {number} The opacity.
 */
const opacityOf = (layer: RawKnobs): number =>
{
  if (layer['opacity'] === undefined)
  {
    return FULL_OPACITY;
  }

  const share = knob(layer, 'opacity') / PERCENT_BASE;
  return Math.round(FULL_OPACITY * share);
};

/**
 * How big a layer's successor draws, as a percentage (WeatherPresets#stageScaleOf): the layer's own size unless it names
 * one for the stage.
 * @param {RawKnobs} layer The authored layer.
 * @returns {number} The stage's size.
 */
const stageScaleOf = (layer: RawKnobs): number =>
{
  return layer['becomesScale'] === undefined
    ? knob(layer, 'scale')
    : knob(layer, 'becomesScale');
};

/**
 * A layer that draws nothing, for one naming a motion the config does not know (WeatherPresets#inertLayer): no density,
 * so the population it builds is empty, and the same shape as any other layer.
 * @param {RawKnobs} layer The authored layer.
 * @returns {WeatherLayer} The inert layer.
 */
const inertLayer = (layer: RawKnobs): WeatherLayer =>
{
  return {
    edge: 'top',
    speedX: 0,
    speedY: 0,
    jitterX: 0,
    jitterY: 0,
    roll: 0,
    growth: 0,
    fadeIn: 0,
    staggerFrames: 0,
    scale: 1,
    scaleJitter: 0,
    asset: String(layer['asset']),
    density: 0,
    blend: String(layer['blend']),
    becomes: null,
  };
};

/**
 * Folds one authored layer, or one stage of one, together with its motion, without following it anywhere
 * (WeatherPresets#resolveStage): the motion supplies the shape of the movement, scaled by the layer's speed, and the
 * layer supplies how much of it, how big, how strong, in what colour and with which picture.
 * @param {WeatherConfigFile} config The config.
 * @param {RawKnobs} layer The authored layer or stage.
 * @returns {WeatherLayer} The layer, with no successor attached.
 */
const resolveStage = (config: WeatherConfigFile, layer: RawKnobs): WeatherLayer =>
{
  const motion = entryOf(config.motions, String(layer['motion']));
  if (motion === undefined)
  {
    return inertLayer(layer);
  }

  const rate = knob(layer, 'speed') / PERCENT_BASE;
  return {
    edge: String(motion['edge']),
    speedX: knob(motion, 'speedX') * rate,
    speedY: knob(motion, 'speedY') * rate,
    jitterX: knob(motion, 'jitterX') * rate,
    jitterY: knob(motion, 'jitterY') * rate,
    roll: knob(motion, 'roll'),
    growth: knob(motion, 'growth'),
    fadeIn: knob(motion, 'fadeIn'),
    staggerFrames: knob(motion, 'staggerFrames'),
    margin: optionalKnob(motion, 'margin'),
    entryDepth: optionalKnob(motion, 'entryDepth'),

    // a wander's reach is a distance and stays one; how fast it is worked through rides the layer's speed.
    sway: optionalKnob(motion, 'sway'),
    swayRate: swayRateOf({ swayRate: optionalKnob(motion, 'swayRate') }) * rate,

    // a lifetime is a duration and stays one, however fast the layer runs.
    life: optionalKnob(motion, 'life'),
    lifeJitter: optionalKnob(motion, 'lifeJitter'),
    fadeOut: optionalKnob(motion, 'fadeOut'),
    drag: optionalKnob(motion, 'drag'),
    tilt: optionalKnob(motion, 'tilt'),
    stretch: optionalKnob(motion, 'stretch'),
    lean: optionalKnob(motion, 'lean'),
    flip: optionalKnob(motion, 'flip'),
    pulse: optionalKnob(motion, 'pulse'),
    pulseRate: pulseRateOf({ pulseRate: optionalKnob(motion, 'pulseRate') }) * rate,
    scale: knob(layer, 'scale') / PERCENT_BASE,
    scaleJitter: jitterOf(layer) / PERCENT_BASE,
    peakOpacity: opacityOf(layer),
    tint: tintOf(layer),
    asset: String(layer['asset']),
    density: knob(layer, 'density'),
    blend: String(layer['blend']),
    becomes: null,
  };
};

/**
 * Resolves what a layer's particles turn into at the end of their lives (WeatherPresets#successorFor): nothing unless
 * its motion names a motion it becomes, and then that motion carrying the layer's stage picture, size, strength and
 * colour, at the layer's own speed and blend. One stage deep, so no chain of stages can loop.
 * @param {WeatherConfigFile} config The config.
 * @param {RawKnobs} layer The authored layer.
 * @returns {WeatherLayer | null} The successor, or null when there is none.
 */
const successorFor = (config: WeatherConfigFile, layer: RawKnobs): WeatherLayer | null =>
{
  const motion = entryOf(config.motions, String(layer['motion']));
  if (motion === undefined || motion['becomes'] === undefined)
  {
    return null;
  }

  const staged: RawKnobs = {
    motion: motion['becomes'],
    asset: layer['becomesAsset'],
    density: layer['density'],
    speed: layer['speed'],
    scale: stageScaleOf(layer),
    scaleJitter: layer['becomesScaleJitter'],
    opacity: layer['becomesOpacity'],
    tint: layer['becomesTint'],
    blend: layer['blend'],
  };
  return resolveStage(config, staged);
};

/**
 * Folds one authored layer together with the motion it names and the one stage it becomes, if any
 * (WeatherPresets#resolveLayer).
 * @param {WeatherConfigFile} config The config.
 * @param {RawKnobs} layer The authored layer.
 * @returns {WeatherLayer} The layer.
 */
const resolveLayer = (config: WeatherConfigFile, layer: RawKnobs): WeatherLayer =>
{
  return { ...resolveStage(config, layer), becomes: successorFor(config, layer) };
};

/**
 * The layers that draw a named look at one strength, as WeatherPresets#layersFor builds them: a look the config does not
 * know, or a strength its ladder lacks, draws nothing, which is what the game shows after warning of it.
 * @param {WeatherConfigFile} config The config.
 * @param {string} presetName The look, as the map names it.
 * @param {string} intensity The strength.
 * @returns {PresetLayers} The layers, or none with the reason.
 */
const layersFor = (config: WeatherConfigFile, presetName: string, intensity: string): PresetLayers =>
{
  const preset = entryOf(config.presets, presetName);
  if (preset === undefined)
  {
    return { layers: [], problem: `no weather preset named ${presetName}` };
  }

  const stop = entryOf(preset.stops, intensity);
  if (stop === undefined)
  {
    return { layers: [], problem: `preset ${presetName} has no intensity ${intensity}` };
  }

  return { layers: stop.map(layer => resolveLayer(config, layer)), problem: null };
};

/**
 * Reads J-Weather's config as the server served it, for drawing: the file holds a table of motions and a table of
 * looks, or it cannot be drawn from at all, as J-Weather could not start from it.
 * @param {JsonValue | null} config The config as the server served it, or null when it could not be read.
 * @returns {WeatherConfigFile | null} The config, or null when it holds no motions or no looks to draw.
 */
const weatherConfigFrom = (config: JsonValue | null): WeatherConfigFile | null =>
{
  const isTable = (value: JsonValue | undefined): boolean => value !== null && typeof value === 'object' && Array.isArray(value) === false;
  if (config === null || isTable(config) === false)
  {
    return null;
  }

  const { motions, presets } = config as Readonly<Record<string, JsonValue>>;
  return isTable(motions) && isTable(presets)
    ? config as unknown as WeatherConfigFile
    : null;
};

export { FULL_OPACITY, layersFor, NO_TINT, PERCENT_BASE, resolveLayer, resolveStage, successorFor, weatherConfigFrom };
export type { PresetLayers, RawKnobs, WeatherConfigFile, WeatherLayer };
