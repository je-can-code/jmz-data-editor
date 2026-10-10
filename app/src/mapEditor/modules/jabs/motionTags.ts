import { parsableCommentLines } from '../../core/blueprints/blueprintFields.ts';
import { isJsonObject, type JsonValue } from '../../core/model/json.ts';
import type { RmmzEventPage } from '../../core/model/rmmzTypes.ts';

/**
 * What one of a motion's parameters holds: a number, a turning direction (cw or ccw), an axis (x, y or both), or a
 * colour written #rrggbb.
 */
type MotionParameterKind = 'number' | 'direction' | 'axis' | 'color';

/**
 * One motion J-Motion can give a character, as its type registry declares it (MotionTypeRegistry): its name, what it
 * does in an author's words, the parameters it takes in the order they are written, and what each is when left out.
 */
type MotionDefinition = {
  readonly type: string;
  readonly label: string;
  readonly does: string;
  readonly parameters: readonly string[];
  readonly defaults: Readonly<Record<string, JsonValue>>;
};

/**
 * One motion line on a page, as J-Motion reads it: the motion named, the parameters written after it with the token
 * asking to move in step left out, and whether it moves in step. A line is known when it names one of the motions
 * J-Motion ships and carries no more parameters than that motion takes; any other is shown as written, since an
 * extension may add motions of its own, and the game reports and ignores one nobody adds.
 */
type MotionLine = {
  /**
   * Where the line sits in the page's command list.
   */
  readonly listIndex: number;
  readonly text: string;
  readonly type: string;

  /**
   * The parameters, as the line writes them, in order.
   */
  readonly values: readonly string[];
  readonly sync: boolean;
  readonly known: boolean;
};

/**
 * What a motion line should say: the motion, each of its parameters as written or null to leave it to the project's
 * default, and whether it moves in step with every other character declaring it.
 */
type MotionValue = {
  readonly type: string;
  readonly values: readonly (string | null)[];
  readonly sync: boolean;
};

/**
 * J-Motion's motion tag, copied from J.MOTION.RegExp.Motion: the motion's name and its parameters between brackets.
 *
 * <pre>
 * Structure:
 *  <motion:[TYPE]>
 *  <motion:[TYPE, PARAM, ...]>
 *
 * Example:
 *  <motion:[swing, 15, 200]>
 *
 * Translation:
 *  This character rocks 15 degrees either way over a 200 frame cycle.
 * </pre>
 */
const MOTION_PATTERN = /<motion:[ ]?(\[\w+(?:,[ ]?[#\w.-]+)*])>/i;

/**
 * A whole comment line carrying a motion tag: what comes before the list, the list, and the close.
 */
const MOTION_LINE = /^(<motion:[ ]?)(\[\w+(?:,[ ]?[#\w.-]+)*])(>)$/i;

/**
 * The word asking a motion to move in step with every other character declaring the same one.
 */
const SYNC = 'sync';

/**
 * Every motion J-Motion ships, as MotionTypeRegistry registers them, with what each does in J-Motion's own words.
 */
const MOTIONS: readonly MotionDefinition[] = [
  { type: 'breathe', label: 'Breathe', does: 'Swells and narrows, the way a chest does.', parameters: [ 'amount', 'period' ], defaults: { amount: 0.05, period: 150 } },
  { type: 'stretch', label: 'Stretch', does: 'Grows and shrinks in height only.', parameters: [ 'amount', 'period' ], defaults: { amount: 0.05, period: 150 } },
  { type: 'pulse', label: 'Pulse', does: 'Grows and shrinks evenly, like a heartbeat.', parameters: [ 'amount', 'period' ], defaults: { amount: 0.05, period: 150 } },
  { type: 'float', label: 'Float', does: 'Hovers above the ground and settles back to it.', parameters: [ 'distance', 'period' ], defaults: { distance: 12, period: 180 } },
  { type: 'sway', label: 'Sway', does: 'Drifts side to side.', parameters: [ 'distance', 'period' ], defaults: { distance: 6, period: 200 } },
  { type: 'swing', label: 'Swing', does: 'Rocks back and forth about its feet, like a hanging sign.', parameters: [ 'angle', 'period' ], defaults: { angle: 8, period: 170 } },
  { type: 'spin', label: 'Spin', does: 'Turns in place.', parameters: [ 'period', 'direction' ], defaults: { period: 120, direction: 'cw' } },
  { type: 'ghost', label: 'Ghost', does: 'Fades smoothly between two opacities.', parameters: [ 'min', 'max', 'period' ], defaults: { min: 0.25, max: 1.0, period: 240 } },
  { type: 'flicker', label: 'Flicker', does: 'Jumps between opacities, like a failing lamp.', parameters: [ 'min', 'max', 'interval' ], defaults: { min: 0.6, max: 1.0, interval: 6 } },
  { type: 'shake', label: 'Shake', does: 'Vibrates.', parameters: [ 'strength', 'axis', 'interval' ], defaults: { strength: 4, axis: 'x', interval: 1 } },
  { type: 'hop', label: 'Hop', does: 'Leaps, lands, waits, and leaps again.', parameters: [ 'height', 'duration', 'rest' ], defaults: { height: 24, duration: 24, rest: 30 } },
  { type: 'throb', label: 'Throb', does: 'Pulses a colour tone in and out.', parameters: [ 'red', 'green', 'blue', 'gray', 'period' ], defaults: { red: 0, green: 0, blue: 80, gray: 0, period: 120 } },
  { type: 'flash', label: 'Flash', does: 'Strobes a colour.', parameters: [ 'color', 'period' ], defaults: { color: '#ffffff', period: 40 } },
  { type: 'scale', label: 'Scale', does: 'Eases to a size and holds it.', parameters: [ 'percent', 'duration' ], defaults: { percent: 150, duration: 30 } },
  { type: 'angle', label: 'Angle', does: 'Eases to an angle and holds it.', parameters: [ 'degrees', 'duration' ], defaults: { degrees: 90, duration: 30 } },
  { type: 'fade', label: 'Fade', does: 'Eases to an opacity and holds it.', parameters: [ 'percent', 'duration' ], defaults: { percent: 50, duration: 30 } },
  { type: 'hue', label: 'Hue', does: 'Eases to a hue rotation and holds it.', parameters: [ 'degrees', 'duration' ], defaults: { degrees: 180, duration: 30 } },
  { type: 'tint', label: 'Tint', does: 'Eases to a colour tint and holds it.', parameters: [ 'color', 'duration' ], defaults: { color: '#ffa0a0', duration: 30 } },
];

/**
 * What each parameter is called on its box, and what it counts in.
 */
const PARAMETER_WORDS: Readonly<Record<string, { readonly label: string; readonly unit: string }>> = {
  amount: { label: 'Amount', unit: '' },
  period: { label: 'Cycle', unit: 'frames' },
  distance: { label: 'Distance', unit: 'px' },
  angle: { label: 'Angle', unit: '°' },
  direction: { label: 'Direction', unit: '' },
  min: { label: 'Lowest', unit: '' },
  max: { label: 'Highest', unit: '' },
  interval: { label: 'Every', unit: 'frames' },
  strength: { label: 'Strength', unit: 'px' },
  axis: { label: 'Axis', unit: '' },
  height: { label: 'Height', unit: 'px' },
  duration: { label: 'Duration', unit: 'frames' },
  rest: { label: 'Rest', unit: 'frames' },
  red: { label: 'Red', unit: '' },
  green: { label: 'Green', unit: '' },
  blue: { label: 'Blue', unit: '' },
  gray: { label: 'Grey', unit: '' },
  color: { label: 'Colour', unit: '' },
  percent: { label: 'Percent', unit: '%' },
  degrees: { label: 'Degrees', unit: '°' },
};

/**
 * The motion a new motion line starts as: the one most of the game's battlers declare.
 */
const FIRST_MOTION = 'stretch';

/**
 * Says what one of a motion's parameters holds, from its name.
 * @param {string} name The parameter.
 * @returns {MotionParameterKind} What it holds.
 */
const parameterKindOf = (name: string): MotionParameterKind =>
{
  if (name === 'direction' || name === 'axis' || name === 'color')
  {
    return name;
  }

  return 'number';
};

/**
 * Finds the motion J-Motion ships under a name, as its registry matches it: exactly, case and all.
 * @param {string} type The motion's name.
 * @returns {MotionDefinition | null} The motion, or null for one J-Motion does not ship.
 */
const motionNamed = (type: string): MotionDefinition | null =>
{
  return MOTIONS.find(motion => motion.type === type) ?? null;
};

/**
 * Reads a value as J-Base's JsonMapper#parseString reads one of a tag's list: true and false in any case are booleans,
 * anything parseFloat makes a number of is that number, and anything else stays as written.
 * @param {string} written The value, as written.
 * @returns {JsonValue} The value, as J-Motion reads it.
 */
const parsedValue = (written: string): JsonValue =>
{
  const lowered = written.toLowerCase();
  if (lowered === 'true' || lowered === 'false')
  {
    return lowered === 'true';
  }

  const number = Number.parseFloat(written);
  return Number.isNaN(number)
    ? written
    : number;
};

/**
 * Splits a motion's bracketed list into what it writes, as JsonMapper#parseArrayFromString splits it, on a comma with or
 * without one space after it.
 * @param {string} list The list, brackets included.
 * @returns {string[]} The values, as written.
 */
const listValues = (list: string): string[] =>
{
  return list.slice(1, -1).split(/, |,/u);
};

/**
 * Reads one comment line as J-Motion reads a page's motion (MotionTagParser#parseComments), or null for a line holding
 * no motion tag.
 * @param {number} listIndex Where the line sits in the page's command list.
 * @param {string} text The line.
 * @returns {MotionLine | null} The motion, or null.
 */
const readMotionLine = (listIndex: number, text: string): MotionLine | null =>
{
  const match = MOTION_PATTERN.exec(text);
  if (match === null)
  {
    return null;
  }

  const [ written, ...rest ] = listValues(match[1]);
  const type = String(parsedValue(written));
  const motion = motionNamed(type);
  const sync = rest.some(value => parsedValue(value) === SYNC);
  const values = rest.filter(value => parsedValue(value) !== SYNC);

  // a motion J-Motion ships, carrying no more parameters than it takes, is one the panel can change.
  const known = motion !== null && values.length <= motion.parameters.length;
  return { listIndex, text, type, values, sync, known };
};

/**
 * Finds every motion line on a page, in the order written: each comment line J-Base offers J-Motion holding a motion tag.
 * Every one the game knows runs at once, so a battler can breathe and float together.
 * @param {RmmzEventPage} page The page.
 * @returns {MotionLine[]} The lines.
 */
const motionLinesOf = (page: RmmzEventPage): MotionLine[] =>
{
  return parsableCommentLines(page).flatMap(line =>
  {
    const motion = readMotionLine(line.listIndex, line.text);
    return motion === null ? [] : [ motion ];
  });
};

/**
 * Builds how the project fills in each motion's parameters left out, as J-Motion fills them: the project's config.motion.json
 * first, then the defaults J-Motion ships. A config that is missing or holds no entry for a motion leaves that motion to
 * J-Motion's own.
 * @param {JsonValue | null} config The project's config.motion.json, or null for none.
 * @returns {(type: string, parameter: string) => JsonValue | undefined} The default of a motion's parameter, or undefined
 * for a parameter the motion does not take.
 */
const motionDefaultsFrom = (config: JsonValue | null): ((type: string, parameter: string) => JsonValue | undefined) =>
{
  return (type, parameter) =>
  {
    const motion = motionNamed(type);
    const configured = isJsonObject(config) && isJsonObject(config[type])
      ? config[type][parameter]
      : undefined;
    return configured ?? (motion === null ? undefined : motion.defaults[parameter]);
  };
};

/**
 * Reports whether a value is one a motion's parameter can be written as and read back as meant.
 * @param {MotionParameterKind} kind What the parameter holds.
 * @param {string} value The value, as it would be written.
 * @returns {boolean} True when it can.
 */
const isWritableValue = (kind: MotionParameterKind, value: string): boolean =>
{
  switch (kind)
  {
    case 'direction':
      return value === 'cw' || value === 'ccw';
    case 'axis':
      return value === 'x' || value === 'y' || value === 'both';
    case 'color':
      return /^#[0-9a-f]{6}$/iu.test(value);
    default:
      return /^-?\d+(\.\d+)?$/u.test(value);
  }
};

/**
 * Writes the list a motion line holds: the motion, then its parameters up to the last one given, any left out before it
 * written as the project's default (J-Motion fills them by place, so none can be skipped), then the step token when asked.
 * @param {MotionValue} motion What the line should say.
 * @param {(type: string, parameter: string) => JsonValue | undefined} defaults The project's defaults.
 * @param {string} separator What the line writes between values: a comma, with or without one space.
 * @returns {string} The list, brackets included.
 * @throws {Error} When the motion is not one J-Motion ships, or a parameter cannot be written as given.
 */
const motionList = (motion: MotionValue, defaults: (type: string, parameter: string) => JsonValue | undefined, separator: string): string =>
{
  const definition = motionNamed(motion.type);
  if (definition === null)
  {
    throw new Error(`${motion.type} is not a motion the game knows`);
  }

  const given = definition.parameters.map((parameter, index) =>
  {
    const value = motion.values[index] ?? null;
    return value === null || value.trim() === '' ? null : value.trim();
  });
  const last = given.findLastIndex(value => value !== null);
  const written = given.slice(0, last + 1).map((value, index) =>
  {
    const parameter = definition.parameters[index];
    const text = value ?? String(defaults(motion.type, parameter));
    if (isWritableValue(parameterKindOf(parameter), text) === false)
    {
      throw new Error(`a ${definition.label.toLowerCase()}'s ${PARAMETER_WORDS[parameter].label.toLowerCase()} cannot be ${text}`);
    }

    return text;
  });
  const values = [ motion.type, ...written, ...(motion.sync ? [ SYNC ] : []) ];
  return `[${values.join(separator)}]`;
};

/**
 * Reads the separator a motion line writes between its values: a comma and a space, unless it writes them with none.
 * @param {string} text The line.
 * @returns {string} The separator.
 */
const separatorOf = (text: string): string =>
{
  return text.includes(',') && text.includes(', ') === false
    ? ','
    : ', ';
};

/**
 * Writes a motion line anew, in place: what comes before its list and after it kept to the character, the list written
 * with the separator the line already uses. A new line is written as the game's own examples write one.
 * @param {string | null} text The line as it stands, or null for a new one.
 * @param {MotionValue} motion What the line should say.
 * @param {(type: string, parameter: string) => JsonValue | undefined} defaults The project's defaults.
 * @returns {string} The line.
 * @throws {Error} When the motion cannot be written as given, or would not read back as given.
 */
const writtenMotionLine = (text: string | null, motion: MotionValue, defaults: (type: string, parameter: string) => JsonValue | undefined): string =>
{
  const match = text === null ? null : MOTION_LINE.exec(text);
  const before = match === null ? '<motion:' : match[1];
  const after = match === null ? '>' : match[3];
  const line = `${before}${motionList(motion, defaults, text === null ? ', ' : separatorOf(text))}${after}`;

  // the line written must read back as the very motion meant, or the game would show something else.
  const read = readMotionLine(0, line);
  const meant = motion.values.map(value => (value === null ? '' : value.trim()));
  if (read === null || read.known === false || read.type !== motion.type || read.sync !== motion.sync
    || read.values.some((value, index) => meant[index] !== '' && meant[index] !== value))
  {
    throw new Error('the game would not read that motion back as written');
  }

  return line;
};

export {
  FIRST_MOTION,
  MOTION_LINE,
  MOTION_PATTERN,
  motionDefaultsFrom,
  motionLinesOf,
  motionNamed,
  MOTIONS,
  PARAMETER_WORDS,
  parameterKindOf,
  readMotionLine,
  writtenMotionLine,
};
export type { MotionDefinition, MotionLine, MotionParameterKind, MotionValue };
