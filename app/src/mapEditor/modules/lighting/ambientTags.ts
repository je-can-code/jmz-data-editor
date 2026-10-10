import type { MapDocument } from '../../core/model/MapDocument.ts';
import type { LightingClock } from '../../core/renderer/lightingLayer.ts';
import { rgbOf, type AmbientDeclaration } from './lightingComposition.ts';
import { isFiniteNumber, isHexColor, readPayload } from './lightTags.ts';

/**
 * Something that darkens a map, as J-Lighting composes it: handed the map and the view's clock, it says how dark it
 * makes the map, or nothing. The map's own note is one such source, whatever the clock says; the sky at the clock's hour
 * is another, and joins the same composition.
 */
type AmbientSource = (document: MapDocument, clock: LightingClock) => AmbientDeclaration | null;

/**
 * The ambient tag exactly as J-Lighting declares it (J.LIGHTING.RegExp.Ambient): a darkness of digits and dots, then any
 * number of further words, each after a comma and at most one space. Case does not matter.
 *
 * <pre>
 * Structure:
 *  <ambient:[DARKNESS]>
 *  <ambient:[DARKNESS, COLOR]>
 *
 * Example:
 *  <ambient:[85, #0a2a2a]>
 *
 * Translation:
 *  This map has lost 85% of its light, and what is left reads teal.
 * </pre>
 */
const AMBIENT_TAG = /<ambient:[ ]?(\[[\d.]+(?:,[ ]?[#\w.-]+)*])>/i;

/**
 * How a note is cut into lines, as RPGManager reads a note: any run of line breaks ends a line.
 */
const NOTE_LINES = /[\r\n]+/;

/**
 * How many values an ambient tag may hold: the darkness and a colour. A tag holding more is refused whole, as
 * J-Lighting refuses it.
 */
const AMBIENT_PARAMETER_LIMIT = 2;

/**
 * The darkness a tag writes for pitch black; tags write 0 to 100, and a declaration holds 0 to 1.
 */
const MAX_DARKNESS_PERCENT = 100;

/**
 * The source a map's own darkness is declared under, as MapAmbientCoordinator.SOURCE_KEY names it.
 */
const MAP_SOURCE = 'map';

/**
 * Finds the ambient tag a map's note holds, as RPGManager#getStringFromNoteByRegex finds it: line by line, the first tag
 * on a line, and the last line holding one wins. Unlike a comment, a note line need not be the tag alone.
 * @param {string} note The map's note.
 * @returns {string | null} The tag's list, brackets included, or null when the note holds none.
 */
const ambientPayloadOf = (note: string): string | null =>
{
  let payload: string | null = null;
  note.split(NOTE_LINES).forEach(line =>
  {
    const match = AMBIENT_TAG.exec(line);
    if (match !== null)
    {
      [ , payload ] = match;
    }
  });

  return payload;
};

/**
 * Reads one ambient tag's list as LightingTagParser#parseAmbientPayload does. The darkness comes first and must be a
 * number, held to 0 to 100 and read as a fraction; a list of more than two values, or a darkness that is no number, is
 * no darkness at all. Whatever follows is the colour: a hex colour is used, and anything else (a colour misspelled, a
 * number) falls back to the project's. Writing anything there at all says what colour the dark is, which is what lets
 * the map keep its colour when a source that only knows how dark it is outranks it; a tag writing nothing there leaves
 * the colour to others, and to black when nobody names one.
 * @param {string} payload The list, brackets included, such as {@code [85, #0a2a2a]}.
 * @param {string} defaultColor The project's colour of the dark, a hex colour.
 * @param {string} source Who declares it.
 * @returns {AmbientDeclaration | null} The darkness, or null when the tag gives none.
 */
const parseAmbient = (payload: string, defaultColor: string, source: string): AmbientDeclaration | null =>
{
  const values = readPayload(payload);
  const [ percent, ...rest ] = values;
  if (values.length > AMBIENT_PARAMETER_LIMIT)
  {
    return null;
  }

  // darkness written as a word cannot be held to a scale, so it is no darkness at all.
  if (isFiniteNumber(percent) === false)
  {
    return null;
  }

  // an author overshooting the scale means as dark, or as bright, as it goes.
  const darkness = Math.min(Math.max(percent, 0), MAX_DARKNESS_PERCENT) / MAX_DARKNESS_PERCENT;
  const [ candidate ] = rest;
  const hex = candidate !== undefined && isHexColor(String(candidate))
    ? String(candidate)
    : defaultColor;
  return { darkness, color: rgbOf(hex), declaresColor: rest.length > 0, source };
};

/**
 * The map's own darkness, as MapAmbientCoordinator#refresh declares it when the player arrives: the ambient tag its note
 * holds, under the map's source, at every hour alike. A note without one, or whose tag gives no darkness, darkens
 * nothing.
 * @param {string} defaultColor The project's colour of the dark, a hex colour.
 * @returns {AmbientSource} The source.
 */
const mapAmbient = (defaultColor: string): AmbientSource =>
{
  return (document: MapDocument) =>
  {
    const payload = ambientPayloadOf(document.property('note'));
    return payload === null
      ? null
      : parseAmbient(payload, defaultColor, MAP_SOURCE);
  };
};

export {
  AMBIENT_PARAMETER_LIMIT,
  AMBIENT_TAG,
  ambientPayloadOf,
  MAP_SOURCE,
  mapAmbient,
  MAX_DARKNESS_PERCENT,
  parseAmbient,
};
export type { AmbientSource };
