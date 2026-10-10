import { CHOICE, type CommentTagDefinition, type NumberField, type TagLine } from '../../core/blueprints/blueprintFields.ts';
import type { JsonValue } from '../../core/model/json.ts';
import { RADIUS_CONTROL } from './lightPanel.ts';
import {
  lightLines,
  MAX_INTENSITY_PERCENT,
  normalizeHex,
  readValue,
  type LightDefaults,
  type LightEffect,
  type LightLine,
} from './lightTags.ts';
import { intensityPercent, lightTagParts, withColor, withEffect, withIntensity, withRadius } from './lightTagWriter.ts';

/**
 * The id J-Lighting's module reads its light tag under, as fields of a blueprint's copies.
 */
const LIGHT_TAG_ID = 'lighting.light';

/**
 * A light's reach, in tiles, as a number field. J-Lighting takes any reach above 0, fractions included, and none at or
 * below it, which would put the light out; so a copy's reach is held at the least the light's panel writes, a hundredth
 * of a tile, and has no top, as J-Lighting sets none.
 */
const RADIUS_FIELD: NumberField = { kind: 'number', min: RADIUS_CONTROL.min, max: Number.POSITIVE_INFINITY };

/**
 * A light's intensity, out of 100, as a number field: J-Lighting holds whatever a tag writes to 0, a soft pool, up to 100,
 * an even disc.
 */
const INTENSITY_FIELD: NumberField = { kind: 'number', min: 0, max: MAX_INTENSITY_PERCENT };

/**
 * Writes one field of a light into its tag's line, in place.
 */
type LightFieldWriter = (text: string, value: JsonValue, defaults: LightDefaults) => string;

/**
 * How each field of a light is written into its tag, by the field's name: through the same writers the light's panel uses,
 * so a copy's tag is never written any way the panel would not write it, and is refused whenever the panel's would be.
 */
const WRITERS: Readonly<Record<string, LightFieldWriter>> = {
  radius: (text, value, defaults) => withRadius(text, value as number, defaults),
  color: (text, value, defaults) => withColor(text, value as string, defaults),
  intensity: (text, value, defaults) => withIntensity(text, value as number, defaults),
  effect: (text, value, defaults) => withEffect(text, value as LightEffect, defaults),
};

/**
 * Reads a light's intensity, out of 100, as J-Lighting reads it from the tag: the number written, held to 0 to 100, or the
 * project's default when the tag writes none. It is read from the number as written rather than from the fraction the
 * light holds, so an intensity of 37.5 reads as 37.5, exactly.
 * @param {LightLine} line The line giving the light.
 * @param {LightDefaults} defaults What the light falls back to.
 * @returns {number} The intensity, 0 to 100.
 */
const intensityOf = (line: LightLine, defaults: LightDefaults): number =>
{
  const parts = lightTagParts(line.text);
  if (parts.intensity === -1)
  {
    return intensityPercent(defaults.intensity);
  }

  const written = readValue(parts.values[parts.intensity].text) as number;
  return Math.min(Math.max(written, 0), MAX_INTENSITY_PERCENT);
};

/**
 * Reads one line giving a light as fields: its reach and its intensity are numbers, which a copy holds by an offset or a
 * pin; its colour and its effect are choices. Each is read as the game reads it, the project's defaults filling in what
 * the tag leaves out, and the colour written the one way the panel writes it, so #FB7 and #ffbb77 read as the one colour.
 * @param {LightLine} line The line.
 * @param {number} ordinal Which of its page's lights it is, from 0, which names it: light1 for the first.
 * @param {LightDefaults} defaults What the light falls back to.
 * @returns {TagLine} The line, read as fields.
 */
const lightFieldsOf = (line: LightLine, ordinal: number, defaults: LightDefaults): TagLine =>
{
  const { listIndex, light } = line;
  return {
    listIndex,
    key: `light${ordinal + 1}`,
    fields: [
      { name: 'radius', kind: RADIUS_FIELD, value: light.radius },
      { name: 'color', kind: CHOICE, value: normalizeHex(light.color) },
      { name: 'intensity', kind: INTENSITY_FIELD, value: intensityOf(line, defaults) },
      { name: 'effect', kind: CHOICE, value: light.effect },
    ],
  };
};

/**
 * What each field of a light is to an author, by the field's name, as the light's panel labels them.
 */
const FIELD_WORDS: Readonly<Record<string, string>> = {
  radius: 'radius',
  color: 'colour',
  intensity: 'intensity',
  effect: 'effect',
};

/**
 * Names one field of a light the way an author knows it: which of its page's lights it is, then the field, as the light's
 * panel labels it.
 * @param {string} line The light's key, such as light2.
 * @param {string} field The field's name, such as color.
 * @returns {string} The words, such as "light 2 colour".
 */
const lightWords = (line: string, field: string): string =>
{
  return `light ${line.slice('light'.length)} ${FIELD_WORDS[field]}`;
};

/**
 * Builds J-Lighting's light tag as fields of a blueprint's copies: every line on a page giving a light, as J-Lighting reads
 * the lights of a page (a page can give several, so each is named by its place among them: light1, light2), each light's
 * reach, colour, intensity and effect a field, written back into the copy's own line in place by the light panel's own
 * writers, which refuse a change the game would read otherwise.
 * @param {LightDefaults} defaults What the lights fall back to: the project's configured colour and intensity.
 * @returns {CommentTagDefinition} The light tag, as fields.
 */
const lightTagFields = (defaults: LightDefaults): CommentTagDefinition =>
{
  return {
    id: LIGHT_TAG_ID,
    read: page => lightLines(page, defaults).map((line, ordinal) => lightFieldsOf(line, ordinal, defaults)),
    write: (text, field, value) =>
    {
      const writer = WRITERS[field];
      if (writer === undefined)
      {
        throw new Error(`a light has no field named ${field}`);
      }

      return writer(text, value, defaults);
    },
    words: lightWords,
  };
};

export { INTENSITY_FIELD, LIGHT_TAG_ID, lightTagFields, RADIUS_FIELD };
