import { noteLines, withLineAdded, withSpanRemoved } from '../../core/properties/noteText.ts';
import { AMBIENT_PARAMETER_LIMIT, AMBIENT_TAG, MAP_SOURCE, MAX_DARKNESS_PERCENT, parseAmbient } from './ambientTags.ts';
import { rgbOf, type AmbientDeclaration } from './lightingComposition.ts';
import { isHexColor, normalizeHex } from './lightTags.ts';
import { inCaseOf, valueSpansOf, type TagValueSpan } from './lightTagWriter.ts';

/**
 * One darkness tag as a note writes it: where it starts and ends in the note, its list exactly as written, and each value
 * of the list with where it sits in the note.
 */
type AmbientTagSpan = {
  readonly start: number;
  readonly end: number;
  readonly list: string;
  readonly values: readonly TagValueSpan[];
};

/**
 * A map's darkness as its lighting settings show it, read from the note as J-Lighting reads it on arrival.
 */
type MapDarkness = {
  /**
   * How dark the map is, from 0 to 100 to two places: 0 for a map the game reads no darkness on.
   */
  readonly percent: number;

  /**
   * False only for a note whose darkness tag the game finds but cannot read, which leaves the map as dark as the map
   * the player came from.
   */
  readonly readable: boolean;

  /**
   * The colour the tag writes for the dark, as written, whether the game can use it or not; empty when it writes none,
   * or when the game cannot read the tag at all.
   */
  readonly colorText: string;

  /**
   * The colour the dark shows, as six lowercase digits: the colour the tag names, the project's for one the game cannot
   * use, and plain black for a map naming none.
   */
  readonly color: string;

  /**
   * How many darkness tags the note holds, read or not: the game reads only the first on the last line holding any.
   */
  readonly tags: number;
};

/**
 * The colour of the dark when no source names one, as {@link UNNAMED_DARK} has it, written as a colour setting shows it.
 */
const PLAIN_BLACK = '#000000';

/**
 * The separator a colour goes in with after a darkness written alone: a comma and a space, as J-Lighting's own examples
 * write it.
 */
const PLAIN_SEPARATOR = ', ';

/**
 * Why a change was refused when the note it would write reads back as some other darkness, or as none.
 */
const DARKNESS_MISREAD = 'the game would not read this map\'s darkness back as written';

/**
 * Why a colour was refused for a map the game reads no darkness on: the colour belongs to the dark, so there is nothing
 * to give it to.
 */
const NO_DARKNESS = 'this map is not dark, so its dark has no colour to change; give it some darkness first';

/**
 * Every darkness tag on a line, rather than the first alone, which is all the game reads of a line.
 */
const AMBIENT_TAGS = new RegExp(AMBIENT_TAG.source, 'gi');

/**
 * Takes a number to two places, so one that floats a little off its hundredths reads as the number meant.
 * @param {number} value The number.
 * @returns {number} The number, to two places.
 */
const toHundredths = (value: number): number =>
{
  return Math.round(value * 100) / 100;
};

/**
 * Turns a declaration's darkness into what the settings show: 0 to 100, to two places.
 * @param {number} darkness The darkness, 0 to 1.
 * @returns {number} The darkness out of 100.
 */
const darknessPercent = (darkness: number): number =>
{
  return toHundredths(darkness * MAX_DARKNESS_PERCENT);
};

/**
 * Finds every darkness tag in a note, line by line as the game cuts it, each with where it sits and where each value of
 * its list sits.
 * @param {string} note The map's note.
 * @returns {AmbientTagSpan[][]} The tags, a list per line, in order; a line holding none has an empty list.
 */
const ambientTagsByLine = (note: string): AmbientTagSpan[][] =>
{
  return noteLines(note).map(line => [ ...line.text.matchAll(AMBIENT_TAGS) ].map(found =>
  {
    const [ tag, list ] = found;
    const start = line.start + found.index;
    return { start, end: start + tag.length, list, values: valueSpansOf(list, start + tag.indexOf('[')) };
  }));
};

/**
 * Finds every darkness tag a note holds, in the order written.
 * @param {string} note The map's note.
 * @returns {AmbientTagSpan[]} The tags.
 */
const ambientTagsIn = (note: string): AmbientTagSpan[] =>
{
  return ambientTagsByLine(note).flat();
};

/**
 * Finds the darkness tag the game reads, as RPGManager#getStringFromNoteByRegex finds it: the first on a line, from the
 * last line holding any. It is the same tag {@link ambientPayloadOf} reads, with where it sits.
 * @param {string} note The map's note.
 * @returns {AmbientTagSpan | null} The tag, or null when the note holds none.
 */
const gameAmbientTagIn = (note: string): AmbientTagSpan | null =>
{
  const lines = ambientTagsByLine(note).filter(tags => tags.length > 0);
  const last = lines[lines.length - 1];
  return last === undefined
    ? null
    : last[0];
};

/**
 * Reads the darkness the game takes from a note, as J-Lighting declares it on arrival.
 * @param {string} note The map's note.
 * @param {string} defaultColor The project's colour of the dark, for a colour the game cannot use.
 * @returns {AmbientDeclaration | null} The darkness, or null when the note gives none the game can read.
 */
const declaredIn = (note: string, defaultColor: string): AmbientDeclaration | null =>
{
  const tag = gameAmbientTagIn(note);
  return tag === null
    ? null
    : parseAmbient(tag.list, defaultColor, MAP_SOURCE);
};

/**
 * Settles the colour the dark shows: the colour the tag names, the project's in place of one the game cannot use, and
 * plain black for a tag naming none, as the game draws a dark nobody gave a colour.
 * @param {string} written The colour the tag writes, as written, or empty for none.
 * @param {string} defaultColor The project's colour of the dark.
 * @returns {string} The colour, as six lowercase digits.
 */
const shownColor = (written: string, defaultColor: string): string =>
{
  if (written === '')
  {
    return PLAIN_BLACK;
  }

  return isHexColor(written)
    ? normalizeHex(written)
    : normalizeHex(defaultColor);
};

/**
 * Reads a map's darkness from its note for the map's lighting settings: how dark the game makes it, whether the game can
 * read what the note writes, the colour written and the colour shown, and how many darkness tags the note holds.
 * @param {string} note The map's note.
 * @param {string} defaultColor The project's colour of the dark, for a colour the game cannot use.
 * @returns {MapDarkness} The darkness.
 */
const readMapDarkness = (note: string, defaultColor: string): MapDarkness =>
{
  const tags = ambientTagsIn(note).length;
  const tag = gameAmbientTagIn(note);
  const declared = declaredIn(note, defaultColor);
  if (tag === null || declared === null)
  {
    return { percent: 0, readable: tag === null, colorText: '', color: PLAIN_BLACK, tags };
  }

  const [ , written ] = tag.values;
  const colorText = written === undefined ? '' : written.text;
  return { percent: darknessPercent(declared.darkness), readable: true, colorText, color: shownColor(colorText, defaultColor), tags };
};

/**
 * What a written note must give when read back: the darkness, as a declaration holds it, and, where the change has a say
 * in it, whether the tag names a colour and which.
 */
type MeantDarkness = {
  readonly darkness: number;
  readonly declaresColor?: boolean;
  readonly color?: readonly number[];
};

/**
 * Reports whether two colours are the same colour, channel by channel.
 * @param {readonly number[]} left One colour.
 * @param {readonly number[]} right The other.
 * @returns {boolean} True when every channel matches.
 */
const sameRgb = (left: readonly number[], right: readonly number[]): boolean =>
{
  return left.every((channel, index) => channel === right[index]);
};

/**
 * Reads a written note back the way the game will, and hands it on only when it gives exactly the darkness meant: no
 * darkness tag at all when none is meant, and otherwise the darkness meant, naming a colour or not as meant and, where
 * one is meant, that colour. This is what makes sure a change never writes a tag J-Lighting would refuse or read as some
 * other dark.
 * @param {string} written The note as it would be written.
 * @param {MeantDarkness | null} meant The darkness it must give, or null for none.
 * @param {string} defaultColor The project's colour of the dark.
 * @returns {string} The note.
 */
const checkedDarkness = (written: string, meant: MeantDarkness | null, defaultColor: string): string =>
{
  if (meant === null)
  {
    if (gameAmbientTagIn(written) !== null)
    {
      throw new Error(DARKNESS_MISREAD);
    }

    return written;
  }

  const read = declaredIn(written, defaultColor);
  const right = read !== null
    && read.darkness === meant.darkness
    && (meant.declaresColor === undefined || read.declaresColor === meant.declaresColor)
    && (meant.color === undefined || sameRgb(read.color, meant.color));
  if (right === false)
  {
    throw new Error(DARKNESS_MISREAD);
  }

  return written;
};

/**
 * Takes every darkness tag out of a note, the last first so each one still sits where it was read. Every one goes, not
 * only the one the game reads: with that one gone, the game would read the one before it instead.
 * @param {string} note The map's note.
 * @returns {string} The note without them.
 */
const withoutAmbientTags = (note: string): string =>
{
  return ambientTagsIn(note).reduceRight((text, tag) => withSpanRemoved(text, tag.start, tag.end), note);
};

/**
 * Writes a new darkness into the tag the game reads, over its darkness and nothing else. A tag the game cannot read
 * because it holds more values than a darkness and a colour keeps only those two, so the darkness written is one the
 * game reads.
 * @param {string} note The map's note.
 * @param {AmbientTagSpan} tag The tag the game reads.
 * @param {string} text The darkness, as written.
 * @returns {string} The note.
 */
const withDarknessWritten = (note: string, tag: AmbientTagSpan, text: string): string =>
{
  const { values } = tag;
  const [ darkness ] = values;
  const kept = values.slice(0, AMBIENT_PARAMETER_LIMIT);
  const last = kept[kept.length - 1];
  const between = note.slice(darkness.end, last.end);
  return `${note.slice(0, darkness.start)}${text}${between}${note.slice(values[values.length - 1].end)}`;
};

/**
 * Gives a map a new darkness by writing its note in place. A map that is not dark gains a tag on a line of its own at
 * the end of the note; a dark map has the darkness of the tag the game reads written over, and nothing else; and no
 * darkness at all takes every darkness tag out, each cleanly, since with the one the game reads gone it would read an
 * earlier one. A tag the game cannot read is mended by the change, whatever darkness it is given. Every other character
 * of the note stays as it was, and the note is read back as the game reads it before it is handed on.
 * @param {string} note The map's note.
 * @param {number} percent How dark the map is to be, 0 to 100; taken to two places.
 * @param {string} defaultColor The project's colour of the dark, for a colour the game cannot use.
 * @returns {string} The note, unchanged when the game already reads that darkness from it.
 */
const withDarkness = (note: string, percent: number, defaultColor: string): string =>
{
  if (Number.isFinite(percent) === false || percent < 0 || percent > MAX_DARKNESS_PERCENT)
  {
    throw new Error(`a darkness runs from 0 to ${MAX_DARKNESS_PERCENT}, not ${percent}`);
  }

  const rounded = toHundredths(percent);
  const tag = gameAmbientTagIn(note);
  const declared = declaredIn(note, defaultColor);

  // a darkness the game already reads changes nothing; a tag it cannot read takes any change, which mends it.
  if (tag === null ? rounded === 0 : declared !== null && darknessPercent(declared.darkness) === rounded)
  {
    return note;
  }

  if (rounded === 0)
  {
    return checkedDarkness(withoutAmbientTags(note), null, defaultColor);
  }

  // a number to two places from 0 to 100 is written plainly, never in the exponent form the tag's pattern refuses.
  const text = String(rounded);
  const darkness = rounded / MAX_DARKNESS_PERCENT;
  if (tag === null)
  {
    return checkedDarkness(withLineAdded(note, `<ambient:[${text}]>`), { darkness, declaresColor: false }, defaultColor);
  }

  // a tag the game reads keeps whatever it says of the colour; one it cannot read says whatever its second value says.
  const meant = declared === null
    ? { darkness }
    : { darkness, declaresColor: declared.declaresColor, color: declared.color };
  return checkedDarkness(withDarknessWritten(note, tag, text), meant, defaultColor);
};

/**
 * Gives a dark map's dark a new colour by writing its note in place: written over the colour the tag names, a usable one
 * or not, in the case it was written in, or put in after the darkness when the tag names none. No colour at all takes
 * the colour the tag names off it, with the separator before it, so the dark goes back to plain black. A colour the dark
 * already shows, whatever case or length it is written in, the project's in place of one the game cannot use included,
 * changes nothing. Every other character of the note stays as it was, and the note is read back as the game reads it
 * before it is handed on.
 * @param {string} note The map's note; the game must read a darkness from it.
 * @param {string} color The colour, such as #0a2a2a, or empty for none.
 * @param {string} defaultColor The project's colour of the dark, for a colour the game cannot use.
 * @returns {string} The note, unchanged when the dark already shows that colour.
 */
const withDarkColor = (note: string, color: string, defaultColor: string): string =>
{
  if (color !== '' && isHexColor(color) === false)
  {
    throw new Error(`${color} is not a colour; the game takes only a hex colour such as #0a2a2a`);
  }

  const tag = gameAmbientTagIn(note);
  const declared = declaredIn(note, defaultColor);
  if (tag === null || declared === null)
  {
    throw new Error(NO_DARKNESS);
  }

  // the darkness itself is never touched, so it must read back exactly as it reads now.
  const { darkness } = declared;
  const [ written, named ] = tag.values;
  if (color === '')
  {
    return named === undefined
      ? note
      : checkedDarkness(`${note.slice(0, written.end)}${note.slice(named.end)}`, { darkness, declaresColor: false }, defaultColor);
  }

  const meant = { darkness, declaresColor: true, color: rgbOf(color) };
  if (named === undefined)
  {
    return checkedDarkness(`${note.slice(0, written.end)}${PLAIN_SEPARATOR}${color}${note.slice(written.end)}`, meant, defaultColor);
  }

  if (shownColor(named.text, defaultColor) === normalizeHex(color))
  {
    return note;
  }

  return checkedDarkness(`${note.slice(0, named.start)}${inCaseOf(color, named.text)}${note.slice(named.end)}`, meant, defaultColor);
};

export {
  ambientTagsIn,
  checkedDarkness,
  DARKNESS_MISREAD,
  darknessPercent,
  gameAmbientTagIn,
  NO_DARKNESS,
  PLAIN_BLACK,
  readMapDarkness,
  withDarkColor,
  withDarkness,
};
export type { AmbientTagSpan, MapDarkness, MeantDarkness };
