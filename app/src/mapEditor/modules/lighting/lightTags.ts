import type { RmmzEventPage, RmmzMapEvent } from '../../core/model/rmmzTypes.ts';

/**
 * How a light animates, by the names J-Lighting gives its effects: steady when its tag names none.
 */
type LightEffect = 'steady' | 'flicker' | 'pulse' | 'glitch';

/**
 * One light, as J-Lighting reads it from one tag: how far it reaches in tiles, its colour as the hex the tag wrote (or
 * the project's default), how evenly its circle is filled from 0 (a soft pool) to 1 (a flat disc), and how it animates.
 */
type LightDeclaration = {
  readonly radius: number;
  readonly color: string;
  readonly intensity: number;
  readonly effect: LightEffect;
};

/**
 * What a light falls back to for what its tag leaves out: the colour and the intensity the project configures.
 */
type LightDefaults = {
  readonly color: string;
  readonly intensity: number;
};

/**
 * A page that gives light, where it sits among its event's pages (counted from 0), and the lights it gives, in the
 * order they are written.
 */
type LitPage = {
  readonly page: RmmzEventPage;
  readonly pageIndex: number;
  readonly lights: readonly LightDeclaration[];
};

/**
 * One comment line that gives a light: where it sits in its page's command list, the line exactly as written, and the
 * light it gives.
 */
type LightLine = {
  readonly listIndex: number;
  readonly text: string;
  readonly light: LightDeclaration;
};

/**
 * Picks the page whose lights an event shows, or null when it shows none.
 */
type LightPageChoice = (event: RmmzMapEvent, defaults: LightDefaults) => LitPage | null;

/**
 * One value of a tag's bracketed list, as J-Base's JsonMapper reads it: a boolean, a number, or else the word itself.
 */
type TagValue = string | number | boolean;

/**
 * The light tag exactly as J-Lighting declares it (J.LIGHTING.RegExp.Light): a reach of digits and dots, then any
 * number of further words, each after a comma and at most one space. Case does not matter.
 *
 * <pre>
 * Structure:
 *  <light:[RADIUS]>
 *  <light:[RADIUS, COLOR, INTENSITY, EFFECT]>
 *
 * Example:
 *  <light:[6, #ffbb73, flicker]>
 *
 * Translation:
 *  A warm light reaching six tiles, guttering like a torch.
 * </pre>
 */
const LIGHT_TAG = /<light:[ ]?(\[[\d.]+(?:,[ ]?[#\w.-]+)*])>/i;

/**
 * What a comment line must be before J-Base offers it to any plugin (J.BASE.RegExp.ParsableComment): one tag filling
 * the whole line, made only of these characters. A tag with words after it, or a space before it, is never read.
 */
const PARSABLE_COMMENT = /^<[[\]\w :"',.!?+\-*/\\#~%=();]+>$/i;

/**
 * A colour J-Lighting can use (LightingColor.HEX_PATTERN): a hash, then three or six hex digits.
 */
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * The command codes of a comment's first line and of each line after it.
 */
const COMMENT_CODES: readonly number[] = [ 108, 408 ];

/**
 * How many values a light tag may hold: the reach, a colour, an intensity and an effect. A tag holding more is refused
 * whole, as J-Lighting refuses it.
 */
const LIGHT_PARAMETER_LIMIT = 4;

/**
 * The intensity a tag writes for a flat disc; tags write 0 to 100, and a light holds 0 to 1.
 */
const MAX_INTENSITY_PERCENT = 100;

/**
 * The effects a tag can name. Steady is left out: it is what a light does when its tag names nothing.
 */
const AUTHORABLE_EFFECTS: readonly string[] = [ 'flicker', 'pulse', 'glitch' ];

/**
 * The defaults the game ships: white, and the soft pool a light with no intensity has always been.
 */
const PLUGIN_DEFAULTS: LightDefaults = { color: '#ffffff', intensity: 0 };

/**
 * Reports whether a string is a colour J-Lighting can use.
 * @param {string} text The string.
 * @returns {boolean} True for a hash and three or six hex digits.
 */
const isHexColor = (text: string): boolean =>
{
  return HEX_COLOR.test(text);
};

/**
 * Writes a colour the one way a colour picker writes it, six lowercase digits after the hash, so #FB7 and #ffbb77 read
 * as the one colour they are. Shorthand doubles each digit, as LightingColor#toRgb expands it.
 * @param {string} hex A colour that passed the hex check.
 * @returns {string} The colour, such as #ffbb77.
 */
const normalizeHex = (hex: string): string =>
{
  const digits = hex.slice(1).toLowerCase();
  const expanded = digits.length === 3
    ? digits.split('').map(digit => `${digit}${digit}`).join('')
    : digits;
  return `#${expanded}`;
};

/**
 * Reports whether a tag value is a finite number, as J-Lighting's {@code Number.isFinite} asks.
 * @param {TagValue} value The value.
 * @returns {boolean} True for a finite number.
 */
const isFiniteNumber = (value: TagValue): value is number =>
{
  return typeof value === 'number' && Number.isFinite(value);
};

/**
 * Reports whether a tag value names an effect a tag can ask for. Only the exact lowercase word counts, as J-Lighting
 * compares it.
 * @param {TagValue} value The value.
 * @returns {boolean} True for flicker, pulse or glitch.
 */
const isEffect = (value: TagValue): value is LightEffect =>
{
  return typeof value === 'string' && AUTHORABLE_EFFECTS.includes(value);
};

/**
 * Reports whether a tag value is put forward as a colour: a word led by a hash, which J-Lighting takes for the light's
 * colour whether or not the digits after it make one.
 * @param {TagValue} value The value.
 * @returns {boolean} True for a word starting with a hash.
 */
const isColorCandidate = (value: TagValue): value is string =>
{
  return typeof value === 'string' && value.startsWith('#');
};

/**
 * Reads one value of a tag's list as JsonMapper#parseString does: true and false in any case are booleans, anything
 * parseFloat makes a number of is that number (so 90px is 90), and anything else stays a word. The tag admits no
 * quote mark, so the quotes JsonMapper peels off can never be there.
 * @param {string} token The value as written.
 * @returns {TagValue} The value.
 */
const readValue = (token: string): TagValue =>
{
  const lowered = token.toLowerCase();
  if (lowered === 'true')
  {
    return true;
  }

  if (lowered === 'false')
  {
    return false;
  }

  const number = Number.parseFloat(token);
  return Number.isNaN(number)
    ? token
    : number;
};

/**
 * Reads a tag's bracketed list as JsonMapper#parseArrayFromString does: the brackets come off, and the values split on
 * a comma with or without one space after it.
 * @param {string} payload The list, brackets included, such as {@code [5, #ffbb73, flicker]}.
 * @returns {TagValue[]} The values, in order.
 */
const readPayload = (payload: string): TagValue[] =>
{
  return payload.slice(1, -1).split(/, |,/).map(readValue);
};

/**
 * Settles a light's colour: the first value led by a hash when it is a colour, the default when the tag has none, and
 * the default too when that first one is no colour at all, as a typo in a hex code reads in the game.
 * @param {readonly TagValue[]} values The values after the reach.
 * @param {string} fallback The default colour.
 * @returns {string} The colour, as written.
 */
const colorOf = (values: readonly TagValue[], fallback: string): string =>
{
  const [ candidate ] = values.filter(isColorCandidate);
  if (candidate === undefined)
  {
    return fallback;
  }

  return isHexColor(candidate)
    ? candidate
    : fallback;
};

/**
 * Settles a light's intensity: the first number after the reach, held to 0 to 100 and read as a fraction, or the
 * default when there is none.
 * @param {readonly TagValue[]} values The values after the reach.
 * @param {number} fallback The default intensity, already a fraction.
 * @returns {number} The intensity, 0 to 1.
 */
const intensityOf = (values: readonly TagValue[], fallback: number): number =>
{
  const candidate = values.find(isFiniteNumber);
  if (candidate === undefined)
  {
    return fallback;
  }

  // an author overshooting the scale means as flat, or as soft, as it goes.
  return Math.min(Math.max(candidate, 0), MAX_INTENSITY_PERCENT) / MAX_INTENSITY_PERCENT;
};

/**
 * Settles a light's effect: the first effect named after the reach, or steady when none is.
 * @param {readonly TagValue[]} values The values after the reach.
 * @returns {LightEffect} The effect.
 */
const effectOf = (values: readonly TagValue[]): LightEffect =>
{
  return values.find(isEffect) ?? 'steady';
};

/**
 * Reads one light tag's list as LightingTagParser#parseLightPayload does. Only the reach has a place, first; the
 * colour, the intensity and the effect are told apart by what they look like, so they come in any order and any may be
 * left out. A list of more than four values, or a reach that is no positive number, is no light at all; a value that
 * is none of the three is passed over.
 * @param {string} payload The list, brackets included.
 * @param {LightDefaults} defaults What the light falls back to.
 * @returns {LightDeclaration | null} The light, or null when the tag gives none.
 */
const parseLight = (payload: string, defaults: LightDefaults): LightDeclaration | null =>
{
  const values = readPayload(payload);
  const [ radius, ...rest ] = values;
  if (values.length > LIGHT_PARAMETER_LIMIT)
  {
    return null;
  }

  // a light with no reach is no light; the unit is tiles, so a fraction is fine.
  if (isFiniteNumber(radius) === false || radius <= 0)
  {
    return null;
  }

  return {
    radius,
    color: colorOf(rest, defaults.color),
    intensity: intensityOf(rest, defaults.intensity),
    effect: effectOf(rest),
  };
};

/**
 * Reads the light one comment line gives, as J-Base and J-Lighting read it: nothing unless the line is one tag filling
 * the whole line (Game_Event#getValidCommentCommands offers no other), that tag is a light tag, and its list gives a
 * light.
 * @param {string} text The line.
 * @param {LightDefaults} defaults What the light falls back to.
 * @returns {LightDeclaration | null} The light, or null when the line gives none.
 */
const readLightLine = (text: string, defaults: LightDefaults): LightDeclaration | null =>
{
  const match = PARSABLE_COMMENT.test(text)
    ? LIGHT_TAG.exec(text)
    : null;
  if (match === null)
  {
    return null;
  }

  const [ , payload ] = match;
  return parseLight(payload, defaults);
};

/**
 * Finds every line on a page that gives a light, as J-Lighting reads the lights of an event's active page: the first
 * line and each further line of every comment, wherever it sits, so a page can give several, all from the same spot.
 * Each comes with where it sits, so whatever changes a light can change that line and nothing else.
 * @param {RmmzEventPage} page The page.
 * @param {LightDefaults} defaults What the lights fall back to.
 * @returns {LightLine[]} The lines, in the order written.
 */
const lightLines = (page: RmmzEventPage, defaults: LightDefaults): LightLine[] =>
{
  return page.list.flatMap((command, listIndex) =>
  {
    const [ text ] = command.parameters;
    if (COMMENT_CODES.includes(command.code) === false || typeof text !== 'string')
    {
      return [];
    }

    const light = readLightLine(text, defaults);
    return light === null
      ? []
      : [ { listIndex, text, light } ];
  });
};

/**
 * Reads every light a page gives, by the lines {@link lightLines} finds, so the two can never disagree.
 * @param {RmmzEventPage} page The page.
 * @param {LightDefaults} defaults What the lights fall back to.
 * @returns {LightDeclaration[]} The lights, in the order written.
 */
const lightsOf = (page: RmmzEventPage, defaults: LightDefaults): LightDeclaration[] =>
{
  return lightLines(page, defaults).map(line => line.light);
};

/**
 * Picks the page whose lights a light's panel edits: the first page that gives any, whatever the clock shows. A torch
 * that can be lit is a cold first page and a lit page behind a switch, a self switch or its hours, and the lit page is
 * the one worth editing, even at noon while the map shows it cold.
 * @param {RmmzMapEvent} event The event.
 * @param {LightDefaults} defaults What the lights fall back to.
 * @returns {LitPage | null} The page, where it sits, and its lights, or null when no page gives light.
 */
const firstLitPage: LightPageChoice = (event: RmmzMapEvent, defaults: LightDefaults): LitPage | null =>
{
  for (const [ pageIndex, page ] of event.pages.entries())
  {
    const lights = lightsOf(page, defaults);
    if (lights.length > 0)
    {
      return { page, pageIndex, lights };
    }
  }

  return null;
};

/**
 * Picks the page whose lights an event gives off on the map: the page the game shows it at, when that page gives any. A
 * torch lit only by night gives none by day, and an event no page holds for gives none at all, however many of its
 * pages could.
 * @param {RmmzMapEvent} event The event.
 * @param {LightDefaults} defaults What the lights fall back to.
 * @param {number} active The page the game shows, or -1 when it shows none.
 * @returns {LitPage | null} The page, where it sits, and its lights, or null when it gives no light.
 */
const shownLitPage = (event: RmmzMapEvent, defaults: LightDefaults, active: number): LitPage | null =>
{
  const page = event.pages[active];
  if (page === undefined)
  {
    return null;
  }

  const lights = lightsOf(page, defaults);
  return lights.length === 0
    ? null
    : { page, pageIndex: active, lights };
};

/**
 * Recognises a light: an event with a page that gives light, read by the same parser and the same page choice that
 * the light's panel edits, so the two can never disagree about which events are lights.
 * @param {RmmzMapEvent} event The event.
 * @returns {boolean} True for a light.
 */
const isLight = (event: RmmzMapEvent): boolean =>
{
  return firstLitPage(event, PLUGIN_DEFAULTS) !== null;
};

export {
  AUTHORABLE_EFFECTS,
  firstLitPage,
  isColorCandidate,
  isEffect,
  isFiniteNumber,
  isHexColor,
  isLight,
  LIGHT_PARAMETER_LIMIT,
  LIGHT_TAG,
  lightLines,
  lightsOf,
  MAX_INTENSITY_PERCENT,
  normalizeHex,
  parseLight,
  PLUGIN_DEFAULTS,
  readLightLine,
  readPayload,
  readValue,
  shownLitPage,
};
export type { LightDeclaration, LightDefaults, LightEffect, LightLine, LightPageChoice, LitPage, TagValue };
