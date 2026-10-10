import { normalizeHex } from './lightTags.ts';

/**
 * A colour as its red, green and blue channels, each 0 to 255, as LightingColor#toRgb splits one.
 */
type Rgb = readonly [ number, number, number ];

/**
 * One source's say in how dark the map is, as J-Lighting's AmbientDeclaration holds it: how much light is gone, from 0
 * (none) to 1 (pitch black), what colour the dark is, whether the source named that colour itself, and who said so.
 * The source is J-Lighting's source key: {@code map} for a map's own note, {@code time} for the clock, and so on.
 */
type AmbientDeclaration = {
  readonly darkness: number;
  readonly color: Rgb;
  readonly declaresColor: boolean;
  readonly source: string;
};

/**
 * How strongly each kind of source outranks the others, as ScreenLightingComposer ranks them: the more fleeting a
 * declaration, the more it is what the player should be reading right now. A map's darkness is what a place always is;
 * the clock's lasts an hour; an event command's is happening this second. A source of a kind not listed ranks below
 * them all.
 */
const SOURCE_PRIORITIES: ReadonlyMap<string, number> = new Map([
  [ 'command', 5 ],
  [ 'time', 4 ],
  [ 'player', 3 ],
  [ 'page', 2 ],
  [ 'map', 1 ],
]);

/**
 * The colour of the dark when no source names one: black, as LightingChannels#identityFor starts the colour channel.
 */
const UNNAMED_DARK: Rgb = [ 0, 0, 0 ];

/**
 * Splits a hex colour into its channels, as LightingColor#toRgb does: three digits are shorthand, each doubled.
 * @param {string} hex A colour that passed the hex check.
 * @returns {Rgb} The channels.
 */
const rgbOf = (hex: string): Rgb =>
{
  const digits = normalizeHex(hex).slice(1);
  return [
    Number.parseInt(digits.slice(0, 2), 16),
    Number.parseInt(digits.slice(2, 4), 16),
    Number.parseInt(digits.slice(4, 6), 16),
  ];
};

/**
 * Ranks a source by its kind, the part of its key before any colon: {@code page:12} ranks as every {@code page} does.
 * @param {string} source The source key.
 * @returns {number} How strongly it outranks others; 0 for a kind J-Lighting does not rank.
 */
const priorityOf = (source: string): number =>
{
  const [ kind ] = source.split(':');
  return SOURCE_PRIORITIES.get(kind) ?? 0;
};

/**
 * Orders declarations the way the composer folds them, least assertive first, keeping the given order between equals,
 * so the last one folded in is the one that keeps a claimed channel.
 * @param {readonly AmbientDeclaration[]} declarations The declarations.
 * @returns {AmbientDeclaration[]} The declarations, least assertive first.
 */
const ascendingByPriority = (declarations: readonly AmbientDeclaration[]): AmbientDeclaration[] =>
{
  return [ ...declarations ].sort((first, second) => priorityOf(first.source) - priorityOf(second.source));
};

/**
 * Compounds every source's darkness, as ScreenLightingComposer#composeDarkness does: each source takes away its share of
 * whatever light reached it, so a map 30% dark at an hour 40% dark is 58% dark, never 70%, and two ordinary evenings
 * never add up to a blackout. The arithmetic and its order are the composer's own, so the result is the same number to
 * the last bit.
 * @param {readonly AmbientDeclaration[]} declarations Every source's darkness.
 * @returns {number} How much light is gone, 0 to 1; 0 with no source.
 */
const composeDarkness = (declarations: readonly AmbientDeclaration[]): number =>
{
  return ascendingByPriority(declarations).reduce((accumulated, declaration) =>
  {
    // the light each leaves behind multiplies, which is what makes darkness compound rather than add.
    const lightRemaining = (1 - accumulated) * (1 - declaration.darkness);
    return 1 - lightRemaining;
  }, 0);
};

/**
 * Settles the colour of the dark, as ScreenLightingComposer#composeAmbientColor does: only a source that named a colour
 * has a say, and the most assertive of those keeps it. A teal cave stays teal whatever the clock says about how dark it
 * is, since the clock names no colour; with nobody naming one, the dark is black.
 * @param {readonly AmbientDeclaration[]} declarations Every source's darkness.
 * @returns {Rgb} The colour of the dark.
 */
const composeAmbientColor = (declarations: readonly AmbientDeclaration[]): Rgb =>
{
  return ascendingByPriority(declarations)
    .filter(declaration => declaration.declaresColor)
    .reduce<Rgb>((_, declaration) => declaration.color, UNNAMED_DARK);
};

/**
 * Reports whether there is any darkness to draw, as LightingComposition#hasMask decides: only a stated darkness earns
 * the mask, and lights alone never do, so a map that says nothing looks exactly as it always has, torches and all.
 * @param {number} darkness How much light is gone.
 * @returns {boolean} True when the map is dark at all.
 */
const hasMask = (darkness: number): boolean =>
{
  return darkness > 0;
};

/**
 * Works out the colour the mask is filled with before any light is cut through it, as LightingRenderLayer#maskTintFor
 * does. The mask multiplies into the map, so each channel is the share of that channel the map keeps: white keeps
 * everything, black nothing, and a coloured dark keeps more of some channels than others, which is how a nearly black
 * cave still reads teal. The arithmetic and its rounding are the plugin's own, so the fill is the same to the unit.
 * @param {number} darkness How much light is gone, 0 to 1.
 * @param {Rgb} color The colour of the dark.
 * @returns {number} The fill, as {@code 0xRRGGBB}.
 */
const maskTintFor = (darkness: number, color: Rgb): number =>
{
  const light = 1 - darkness;
  const [ red, green, blue ] = color.map(channel =>
  {
    const kept = light + (darkness * (channel / 255));
    return Math.round(kept * 255);
  });

  return (red << 16) + (green << 8) + blue;
};

export {
  ascendingByPriority,
  composeAmbientColor,
  composeDarkness,
  hasMask,
  maskTintFor,
  priorityOf,
  rgbOf,
  SOURCE_PRIORITIES,
  UNNAMED_DARK,
};
export type { AmbientDeclaration, Rgb };
