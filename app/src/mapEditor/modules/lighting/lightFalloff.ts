import { rgbOf } from './lightingComposition.ts';
import { normalizeHex } from './lightTags.ts';

/**
 * One stop of a light's radial gradient: how far out it sits, from the light's heart (0) to its rim (1), and its colour
 * as a canvas reads one.
 */
type FalloffStop = {
  readonly offset: number;
  readonly color: string;
};

/**
 * Where the middle stop sits on the softest light (LightTextureCache.SOFT_MIDPOINT): bending the gradient there gives
 * the pooled falloff of an open flame.
 */
const SOFT_MIDPOINT = 0.45;

/**
 * How much of its colour the softest light keeps at its middle stop (LightTextureCache.SOFT_MIDPOINT_STRENGTH).
 */
const SOFT_MIDPOINT_STRENGTH = 0.35;

/**
 * Where the middle stop sits on the hardest light (LightTextureCache.HARD_MIDPOINT): just short of the rim, so an even
 * disc keeps a sliver of gradient rather than an aliased edge.
 */
const HARD_MIDPOINT = 0.97;

/**
 * How much of its colour the hardest light keeps at its middle stop (LightTextureCache.HARD_MIDPOINT_STRENGTH): all of
 * it, so the disc burns evenly out to there.
 */
const HARD_MIDPOINT_STRENGTH = 1;

/**
 * The colour at a light's rim and beyond it: black, which adds nothing where lights are added together, so the square
 * corners of a light's picture take nothing away from the dark around them.
 */
const RIM_COLOR = '#000000';

/**
 * Slides a value between its softest and hardest settings, as LightTextureCache#between does.
 * @param {number} soft The value at an intensity of 0.
 * @param {number} hard The value at an intensity of 1.
 * @param {number} intensity Where between them to land, 0 to 1.
 * @returns {number} The value.
 */
const between = (soft: number, hard: number, intensity: number): number =>
{
  return soft + ((hard - soft) * intensity);
};

/**
 * Scales a colour toward black, as LightTextureCache#dim does, written as a canvas reads it.
 * @param {string} hex The colour, a hex colour.
 * @param {number} strength How much of it survives, 0 to 1.
 * @returns {string} The dimmed colour, such as {@code rgb(89,65,40)}.
 */
const dim = (hex: string, strength: number): string =>
{
  const [ red, green, blue ] = rgbOf(hex).map(channel => Math.round(channel * strength));
  return `rgb(${red},${green},${blue})`;
};

/**
 * Lays out a light's falloff as J-Lighting draws it (LightTextureCache#generate): its own colour at its heart, black at
 * its rim, and one stop between whose place and strength its intensity decides. At 0 the stop sits not quite halfway out
 * and keeps a third of the colour, so the light is brightest at its heart and fades away, a flame in the open; at 1 it
 * sits at the rim at full colour, so the whole circle burns evenly and stops dead, a spotlight.
 * @param {string} color The light's colour, a hex colour.
 * @param {number} intensity How evenly the circle is filled, 0 to 1.
 * @returns {FalloffStop[]} The three stops, heart to rim.
 */
const falloffStops = (color: string, intensity: number): FalloffStop[] =>
{
  const hex = normalizeHex(color);
  const midpoint = between(SOFT_MIDPOINT, HARD_MIDPOINT, intensity);
  const strength = between(SOFT_MIDPOINT_STRENGTH, HARD_MIDPOINT_STRENGTH, intensity);
  return [
    { offset: 0, color: hex },
    { offset: midpoint, color: dim(hex, strength) },
    { offset: 1, color: RIM_COLOR },
  ];
};

/**
 * Works out how wide a light's picture is: twice its reach, in whole pixels, since the game draws it on a canvas that
 * wide (Bitmap#_createCanvas) and a canvas drops any fraction of its width.
 * @param {number} radius The light's reach, in pixels.
 * @returns {number} The picture's width and height.
 */
const pictureSize = (radius: number): number =>
{
  return Math.trunc(radius * 2);
};

/**
 * Names a light's picture by the only things that shape it, as LightDeclaration#textureKey does: its reach, its colour
 * and its intensity. Two lights agreeing on all three share one picture; how brightly each burns, and where, never
 * changes the picture.
 * @param {number} radius The light's reach, in pixels.
 * @param {string} color The light's colour, a hex colour.
 * @param {number} intensity How evenly the circle is filled, 0 to 1.
 * @returns {string} The name.
 */
const pictureKey = (radius: number, color: string, intensity: number): string =>
{
  return `${radius}:${normalizeHex(color)}:${intensity}`;
};

export {
  falloffStops,
  HARD_MIDPOINT,
  HARD_MIDPOINT_STRENGTH,
  pictureKey,
  pictureSize,
  RIM_COLOR,
  SOFT_MIDPOINT,
  SOFT_MIDPOINT_STRENGTH,
};
export type { FalloffStop };
