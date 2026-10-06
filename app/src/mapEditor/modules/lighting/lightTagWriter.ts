import {
  isColorCandidate,
  isEffect,
  isFiniteNumber,
  isHexColor,
  LIGHT_PARAMETER_LIMIT,
  LIGHT_TAG,
  MAX_INTENSITY_PERCENT,
  normalizeHex,
  readLightLine,
  readValue,
  type LightDeclaration,
  type LightDefaults,
  type LightEffect,
  type TagValue,
} from './lightTags.ts';

/**
 * One value of a light tag's list exactly as its line writes it: the text, where it starts and ends on the line, and
 * the separator written before it (a comma, with or without one space), empty for the reach, which comes first.
 */
type TagValueSpan = {
  readonly text: string;
  readonly start: number;
  readonly end: number;
  readonly separator: string;
};

/**
 * A light tag's list as its line writes it, and which of its values J-Lighting reads as each part of the light after
 * the reach, which is always the first value: the first value led by a hash is its colour (a usable colour or not), the
 * first finite number its intensity, and the first effect named its effect. A part the tag leaves out is -1.
 */
type LightTagParts = {
  readonly values: readonly TagValueSpan[];
  readonly color: number;
  readonly intensity: number;
  readonly effect: number;
};

/**
 * Why a light cannot take another value: J-Lighting refuses a tag of more than four values whole, so a fifth would put
 * the light out. A tag holding four without the part asked for is holding a value the game ignores.
 */
const FULL_TAG = 'this light already has four values written, the most the game reads; remove the one it ignores in the '
  + 'event window, then try again';

/**
 * Why a change was refused when the tag it would write reads back as some other light, or as none.
 */
const MISREAD = 'the game would not read that light back as written';

/**
 * The separator a new value goes in with when the tag holds the reach alone: a comma and a space, as J-Lighting's own
 * examples write it.
 */
const PLAIN_SEPARATOR = ', ';

/**
 * Turns a light's intensity into what the panel shows: 0 to 100, to two places, so a fraction that floats a little off
 * its hundredths, as 0.3 times 100 does, still reads as the number meant.
 * @param {number} intensity The intensity, 0 to 1.
 * @returns {number} The intensity out of 100.
 */
const intensityPercent = (intensity: number): number =>
{
  return Math.round(intensity * MAX_INTENSITY_PERCENT * 100) / 100;
};

/**
 * Splits a light tag's list into its values, each with where it sits on the line, and finds which value J-Lighting
 * reads as each part of the light. The line must hold a light tag, as every line {@link lightLines} finds does.
 * @param {string} line The comment line.
 * @returns {LightTagParts} The values and the parts.
 */
const lightTagParts = (line: string): LightTagParts =>
{
  // the line holds a light tag, so the match is there; its list opens at the tag's first bracket.
  const match = LIGHT_TAG.exec(line) as RegExpExecArray;
  const [ tag, list ] = match;
  const pieces = list.slice(1, -1).split(/(, |,)/u);
  const values: TagValueSpan[] = [];
  let cursor = match.index + tag.indexOf('[') + 1;
  for (let index = 0; index < pieces.length; index += 2)
  {
    // the pieces alternate value and separator, since the tag's pattern allows nothing else between the brackets.
    const separator = index === 0 ? '' : pieces[index - 1];
    const text = pieces[index];
    const start = cursor + separator.length;
    values.push({ text, start, end: start + text.length, separator });
    cursor = start + text.length;
  }

  // each part is the first value after the reach that looks like one, as LightingTagParser#parseLightPayload reads it.
  const read = values.map(value => readValue(value.text));
  const firstAfterReach = (looksRight: (value: TagValue) => boolean): number =>
  {
    return read.findIndex((value, index) => index > 0 && looksRight(value));
  };

  return {
    values,
    color: firstAfterReach(isColorCandidate),
    intensity: firstAfterReach(isFiniteNumber),
    effect: firstAfterReach(isEffect),
  };
};

/**
 * Reads the light a line gives and its tag's parts, for a change to it.
 * @param {string} line The comment line.
 * @param {LightDefaults} defaults What the light falls back to.
 * @returns {{ parts: LightTagParts, light: LightDeclaration }} The tag's parts and the light.
 */
const readTag = (line: string, defaults: LightDefaults): { parts: LightTagParts; light: LightDeclaration } =>
{
  const light = readLightLine(line, defaults);
  if (light === null)
  {
    throw new Error(`"${line}" gives no light`);
  }

  return { parts: lightTagParts(line), light };
};

/**
 * Writes one value over another on a line, leaving every other character where it was.
 * @param {string} line The line.
 * @param {TagValueSpan} value The value written over.
 * @param {string} text The new value.
 * @returns {string} The line.
 */
const replaced = (line: string, value: TagValueSpan, text: string): string =>
{
  return `${line.slice(0, value.start)}${text}${line.slice(value.end)}`;
};

/**
 * Takes one value off a line, with the separator before it.
 * @param {string} line The line.
 * @param {TagValueSpan} value The value; never the reach, which has no separator before it.
 * @returns {string} The line.
 */
const removed = (line: string, value: TagValueSpan): string =>
{
  return `${line.slice(0, value.start - value.separator.length)}${line.slice(value.end)}`;
};

/**
 * Puts a new value on a line right after another. It goes in with the separator the tag already writes where it lands,
 * the one before the value it now comes ahead of, or at the end the one before the last value, so it reads as written
 * by the same hand. A tag already holding four values has no room, and is refused.
 * @param {string} line The line.
 * @param {LightTagParts} parts The tag's parts.
 * @param {number} after The value it goes after.
 * @param {string} text The new value.
 * @returns {string} The line.
 */
const inserted = (line: string, parts: LightTagParts, after: number, text: string): string =>
{
  const { values } = parts;
  if (values.length >= LIGHT_PARAMETER_LIMIT)
  {
    throw new Error(FULL_TAG);
  }

  const anchor = values[after];
  const next = values[after + 1];
  const last = values[values.length - 1];
  const separator = next === undefined
    ? last.separator || PLAIN_SEPARATOR
    : next.separator;
  return `${line.slice(0, anchor.end)}${separator}${text}${line.slice(anchor.end)}`;
};

/**
 * Reports whether two lights are the same light.
 * @param {LightDeclaration} left One light.
 * @param {LightDeclaration} right The other.
 * @returns {boolean} True when every part matches.
 */
const sameLight = (left: LightDeclaration, right: LightDeclaration): boolean =>
{
  return left.radius === right.radius
    && left.color === right.color
    && left.intensity === right.intensity
    && left.effect === right.effect;
};

/**
 * Reads a written line back the way the game will, and hands it on only when it gives exactly the light meant. This is
 * what makes sure a change never writes a tag J-Lighting would refuse, or read as some other light.
 * @param {string} written The line as it would be written.
 * @param {LightDeclaration} meant The light it must give.
 * @param {LightDefaults} defaults What the light falls back to.
 * @returns {string} The line.
 */
const checked = (written: string, meant: LightDeclaration, defaults: LightDefaults): string =>
{
  const read = readLightLine(written, defaults);
  if (read === null || sameLight(read, meant) === false)
  {
    throw new Error(MISREAD);
  }

  return written;
};

/**
 * Writes a new colour in the case of the one it replaces: in capitals for a colour written in capitals, as given
 * otherwise.
 * @param {string} color The new colour.
 * @param {string} written The colour it replaces, as written.
 * @returns {string} The colour to write.
 */
const inCaseOf = (color: string, written: string): string =>
{
  const capitals = /[A-Z]/u.test(written) && /[a-z]/u.test(written) === false;
  return capitals
    ? color.toUpperCase()
    : color;
};

/**
 * Gives a light tag a new reach, writing over the reach it has and nothing else.
 * @param {string} line A comment line giving a light.
 * @param {number} radius The reach, in tiles.
 * @param {LightDefaults} defaults What the light falls back to.
 * @returns {string} The line, unchanged when the light already reaches that far.
 */
const withRadius = (line: string, radius: number, defaults: LightDefaults): string =>
{
  const { parts, light } = readTag(line, defaults);
  if (light.radius === radius)
  {
    return line;
  }

  const [ reach ] = parts.values;
  return checked(replaced(line, reach, String(radius)), { ...light, radius }, defaults);
};

/**
 * Gives a light tag a new colour: written over the colour the game reads, a usable one or not, or put in after the
 * reach when the tag names none. A colour the light already shows, whatever case or length it is written in, or the
 * default it falls back to, changes nothing.
 * @param {string} line A comment line giving a light.
 * @param {string} color The colour, such as #ffbb73.
 * @param {LightDefaults} defaults What the light falls back to.
 * @returns {string} The line, unchanged when the light already shows that colour.
 */
const withColor = (line: string, color: string, defaults: LightDefaults): string =>
{
  const { parts, light } = readTag(line, defaults);
  if (isHexColor(color) && normalizeHex(color) === normalizeHex(light.color))
  {
    return line;
  }

  if (parts.color === -1)
  {
    return checked(inserted(line, parts, 0, color), { ...light, color }, defaults);
  }

  const written = parts.values[parts.color];
  const text = inCaseOf(color, written.text);
  return checked(replaced(line, written, text), { ...light, color: text }, defaults);
};

/**
 * Gives a light tag a new intensity, out of 100: written over the number the game reads as its intensity, or put in
 * after its colour (after the reach when it names none) when the tag gives none. An intensity the light already has,
 * its default included, changes nothing.
 * @param {string} line A comment line giving a light.
 * @param {number} percent The intensity, 0 for a soft pool to 100 for an even disc.
 * @param {LightDefaults} defaults What the light falls back to.
 * @returns {string} The line, unchanged when the light already has that intensity.
 */
const withIntensity = (line: string, percent: number, defaults: LightDefaults): string =>
{
  const { parts, light } = readTag(line, defaults);
  if (intensityPercent(light.intensity) === percent)
  {
    return line;
  }

  const text = String(percent);
  const meant = { ...light, intensity: percent / MAX_INTENSITY_PERCENT };
  if (parts.intensity === -1)
  {
    const after = parts.color === -1 ? 0 : parts.color;
    return checked(inserted(line, parts, after, text), meant, defaults);
  }

  return checked(replaced(line, parts.values[parts.intensity], text), meant, defaults);
};

/**
 * Gives a light tag a new effect: written over the effect the game reads, or put in at the end when the tag names none.
 * A steady light names none, so steady takes every effect named off the tag, each with the separator before it: leaving
 * a second one would have the game read it as the light's effect instead.
 * @param {string} line A comment line giving a light.
 * @param {LightEffect} effect The effect.
 * @param {LightDefaults} defaults What the light falls back to.
 * @returns {string} The line, unchanged when the light already does that.
 */
const withEffect = (line: string, effect: LightEffect, defaults: LightDefaults): string =>
{
  const { parts, light } = readTag(line, defaults);
  if (light.effect === effect)
  {
    return line;
  }

  const meant = { ...light, effect };
  if (effect === 'steady')
  {
    // taken off from the last back, so each one still sits where the tag was read to have it.
    const named = parts.values.filter(value => isEffect(readValue(value.text)));
    return checked(named.reduceRight((text, value) => removed(text, value), line), meant, defaults);
  }

  if (parts.effect === -1)
  {
    return checked(inserted(line, parts, parts.values.length - 1, effect), meant, defaults);
  }

  return checked(replaced(line, parts.values[parts.effect], effect), meant, defaults);
};

export { intensityPercent, lightTagParts, withColor, withEffect, withIntensity, withRadius };
export type { LightTagParts, TagValueSpan };
