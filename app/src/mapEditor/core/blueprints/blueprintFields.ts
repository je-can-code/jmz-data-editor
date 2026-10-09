import type { JsonValue } from '../model/json.ts';
import type {
  RmmzEventCommand,
  RmmzEventConditions,
  RmmzEventImage,
  RmmzEventPage,
  RmmzMapEvent,
  RmmzMoveRoute,
} from '../model/rmmzTypes.ts';
import { withoutBlueprintLink } from './blueprintLink.ts';

/**
 * A field holding a number, which a copy holds relative to its blueprint's, by an offset, or pinned to a value of its own:
 * the least and the greatest value the field may hold, both allowed, which a copy's value is held to however far its
 * offset or its pin would take it.
 */
type NumberField = {
  readonly kind: 'number';
  readonly min: number;
  readonly max: number;
};

/**
 * A field holding a choice, which a copy either shares with its blueprint or overrides with one of its own: a trigger, a
 * picture, a colour, anything with nothing between one value and the next, and anything a number could only be taken
 * for, such as an enemy's id, which an offset must never move.
 */
type ChoiceField = {
  readonly kind: 'choice';
};

/**
 * What kind of field one is: a number with a range, or a choice.
 */
type FieldKind = NumberField | ChoiceField;

/**
 * Every choice field's kind.
 */
const CHOICE: ChoiceField = { kind: 'choice' };

/**
 * One field one of a module's tags gives on a comment line: its name among the tag's fields, what kind of field it is, and
 * its value as the game reads it, a number for a number field.
 */
type TagField = {
  readonly name: string;
  readonly kind: FieldKind;
  readonly value: JsonValue;
};

/**
 * One comment line on a page carrying one of a module's tags, read as fields.
 */
type TagLine = {
  /**
   * Where the line sits in the page's command list.
   */
  readonly listIndex: number;

  /**
   * Tells the line from every other tag line on the page, such as light1 and light2 for a page's two lights: a lowercase
   * letter, then letters and digits.
   */
  readonly key: string;

  /**
   * The fields the line gives, each named with a lowercase letter, then letters and digits.
   */
  readonly fields: readonly TagField[];
};

/**
 * A tag a module reads from an event page's comments, such as J-Lighting's light, read as fields a copy of a blueprint
 * follows one by one: the module finds every line on a page carrying the tag, names each one, reads each of its fields as
 * the game reads it, says whether each is a number with a range or a choice, and writes a value back into a line in place,
 * every other character of it kept. A line one of these reads is fields of its own and no part of the page's command list.
 * A tag no module reads stays part of the command list, which is one choice, so it is never a number and never moves by an
 * offset, however much like a number it reads, as an enemy's id does.
 */
type CommentTagDefinition = {
  /**
   * Unique, prefixed like event kinds: {@code lighting.light}.
   */
  readonly id: string;

  /**
   * Finds every line on a page carrying the tag, as the game reads them.
   * @param {RmmzEventPage} page The page.
   * @returns {readonly TagLine[]} The lines, in the order they are written.
   */
  readonly read: (page: RmmzEventPage) => readonly TagLine[];

  /**
   * Writes one field's value into a line carrying the tag, in place.
   * @param {string} text The line.
   * @param {string} field The field's name.
   * @param {JsonValue} value The value, as the field reads it.
   * @returns {string} The line holding the value.
   * @throws {Error} When the line cannot hold the value as the game would read it; the message says why, for the author.
   */
  readonly write: (text: string, field: string, value: JsonValue) => string;
};

/**
 * One tag line on a page, with the tag that reads it.
 */
type PageTagLine = TagLine & { readonly tag: CommentTagDefinition };

/**
 * One of a page's own fields, as the event window groups them: its name in the field's key, what kind of field it is, and
 * how its value is read from a page and written into one, every other key of the page kept where it was.
 */
type PageField = {
  readonly name: string;
  readonly kind: FieldKind;
  readonly read: (page: RmmzEventPage) => JsonValue;
  readonly write: (page: RmmzEventPage, value: JsonValue) => RmmzEventPage;
};

/**
 * One field of an event: its key, what kind of field it is, and its value.
 *
 * <pre>
 * Structure:
 *  name                the event's name
 *  note                the note's own text, outside the link to its blueprint
 *  pPAGE.FIELD         one of a page's own fields: speed, frequency, conditions, image, moveType, moveRoute, walking,
 *                      stepping, directionFix, through, priority, trigger, or commands, the command list less every
 *                      module tag
 *  pPAGE.LINE.FIELD    a field of a module's tag on a page
 *
 * Example:
 *  p1.light2.radius
 *
 * Translation:
 *  How far the second light on the event's first page reaches.
 * </pre>
 */
type Field = {
  readonly key: string;
  readonly kind: FieldKind;
  readonly value: JsonValue;
};

/**
 * The key of an event's name.
 */
const NAME_FIELD = 'name';

/**
 * The key of the note's own text, outside the link to its blueprint.
 */
const NOTE_FIELD = 'note';

/**
 * The name of a page's command list less every module tag, which is one choice.
 */
const COMMANDS_FIELD = 'commands';

/**
 * What a tag line's key and each of its fields' names must be: a lowercase letter, then letters and digits, so every key
 * a link writes reads back as one.
 */
const FIELD_NAME = /^[a-z][a-zA-Z0-9]*$/u;

/**
 * A page's move speed as MZ offers it: 1, an eighth of normal speed, to 6, four times it.
 */
const MOVE_SPEED: NumberField = { kind: 'number', min: 1, max: 6 };

/**
 * A page's move frequency as MZ offers it: 1, the lowest, to 5, the highest.
 */
const MOVE_FREQUENCY: NumberField = { kind: 'number', min: 1, max: 5 };

/**
 * A page's own fields, in the order the event window shows them: move speed and frequency are numbers; the rest are
 * choices. The command list is a field of its own, read less every module tag (see {@link listLessTags}).
 */
const PAGE_FIELDS: readonly PageField[] = [
  {
    name: 'speed',
    kind: MOVE_SPEED,
    read: page => page.moveSpeed,
    write: (page, value) => ({ ...page, moveSpeed: value as number }),
  },
  {
    name: 'frequency',
    kind: MOVE_FREQUENCY,
    read: page => page.moveFrequency,
    write: (page, value) => ({ ...page, moveFrequency: value as number }),
  },
  {
    name: 'conditions',
    kind: CHOICE,
    read: page => page.conditions,
    write: (page, value) => ({ ...page, conditions: value as unknown as RmmzEventConditions }),
  },
  {
    name: 'image',
    kind: CHOICE,
    read: page => page.image,
    write: (page, value) => ({ ...page, image: value as unknown as RmmzEventImage }),
  },
  {
    name: 'moveType',
    kind: CHOICE,
    read: page => page.moveType,
    write: (page, value) => ({ ...page, moveType: value as number }),
  },
  {
    name: 'moveRoute',
    kind: CHOICE,
    read: page => page.moveRoute as unknown as JsonValue,
    write: (page, value) => ({ ...page, moveRoute: value as unknown as RmmzMoveRoute }),
  },
  {
    name: 'walking',
    kind: CHOICE,
    read: page => page.walkAnime,
    write: (page, value) => ({ ...page, walkAnime: value as boolean }),
  },
  {
    name: 'stepping',
    kind: CHOICE,
    read: page => page.stepAnime,
    write: (page, value) => ({ ...page, stepAnime: value as boolean }),
  },
  {
    name: 'directionFix',
    kind: CHOICE,
    read: page => page.directionFix,
    write: (page, value) => ({ ...page, directionFix: value as boolean }),
  },
  {
    name: 'through',
    kind: CHOICE,
    read: page => page.through,
    write: (page, value) => ({ ...page, through: value as boolean }),
  },
  {
    name: 'priority',
    kind: CHOICE,
    read: page => page.priorityType,
    write: (page, value) => ({ ...page, priorityType: value as number }),
  },
  {
    name: 'trigger',
    kind: CHOICE,
    read: page => page.trigger,
    write: (page, value) => ({ ...page, trigger: value as number }),
  },
];

/**
 * Names a page in a field's key: p1 for the first.
 * @param {number} pageIndex The page, counted from 0.
 * @returns {string} The page's part of the key.
 */
const pageKey = (pageIndex: number): string =>
{
  return `p${pageIndex + 1}`;
};

/**
 * Builds the key of one of a page's own fields.
 * @param {number} pageIndex The page, counted from 0.
 * @param {string} name The field's name, such as speed.
 * @returns {string} The key, such as p1.speed.
 */
const pageFieldKey = (pageIndex: number, name: string): string =>
{
  return `${pageKey(pageIndex)}.${name}`;
};

/**
 * Builds the key of one field of a module's tag on a page.
 * @param {number} pageIndex The page, counted from 0.
 * @param {string} lineKey The tag line's key, such as light1.
 * @param {string} name The field's name, such as radius.
 * @returns {string} The key, such as p1.light1.radius.
 */
const tagFieldKey = (pageIndex: number, lineKey: string, name: string): string =>
{
  return `${pageKey(pageIndex)}.${lineKey}.${name}`;
};

/**
 * Finds every line on a page carrying a module's tag, with the tag reading it, in the order the lines sit in the list. A
 * module naming a line or a field otherwise than {@link FIELD_NAME} allows, naming two lines alike, or reading one line
 * twice, is a mistake in the module, and throws.
 * @param {RmmzEventPage} page The page.
 * @param {readonly CommentTagDefinition[]} tags The tags the active modules read.
 * @returns {PageTagLine[]} The lines.
 */
const tagLinesOf = (page: RmmzEventPage, tags: readonly CommentTagDefinition[]): PageTagLine[] =>
{
  const lines = tags.flatMap(tag => tag.read(page).map(line => ({ ...line, tag })));
  const keys = new Set<string>();
  const indexes = new Set<number>();
  lines.forEach(line =>
  {
    const named = FIELD_NAME.test(line.key) && line.fields.every(field => FIELD_NAME.test(field.name));
    if (named === false || keys.has(line.key) || indexes.has(line.listIndex))
    {
      throw new Error(`${line.tag.id} read a tag line as ${line.key} at ${line.listIndex}, which another reads, or which names a field no link could hold`);
    }

    keys.add(line.key);
    indexes.add(line.listIndex);
  });

  return lines.sort((left, right) => left.listIndex - right.listIndex);
};

/**
 * Reads a page's command list less every module tag, which is the one choice it is: each line a module reads stands as a
 * mark naming the tag and the line's key, so where a tag line sits counts and what it says does not, its fields being
 * fields of their own. A mark is an object, which no comment's text ever is, so no comment can be taken for one. A fold
 * MZ's window drew shut is left out, since it is how that window shows the list rather than anything the list does.
 * @param {readonly RmmzEventCommand[]} list The command list.
 * @param {readonly PageTagLine[]} lines The tag lines on it.
 * @returns {JsonValue[]} The list less its tags, for comparing.
 */
const listLessTags = (list: readonly RmmzEventCommand[], lines: readonly PageTagLine[]): JsonValue[] =>
{
  const marks = new Map(lines.map(line => [ line.listIndex, { tag: line.tag.id, key: line.key } ]));
  return list.map((command, index) =>
  {
    const { collapsed: _collapsed, ...content } = command;
    const mark = marks.get(index);
    const read = mark === undefined
      ? content
      : { ...content, parameters: [ mark ] };
    return read as unknown as JsonValue;
  });
};

/**
 * Reads the note's own text, outside the link to its blueprint, as the event's note field holds it.
 * @param {RmmzMapEvent} event The event.
 * @returns {string} The note without its link; the very note when it holds none.
 * @throws {Error} When the note would read otherwise without its link; the message says why, for the author.
 */
const ownNoteOf = (event: RmmzMapEvent): string =>
{
  return withoutBlueprintLink(event.note);
};

/**
 * Reads one page of an event as fields: its own fields, its command list less every module tag, then every field of every
 * module tag on it.
 * @param {RmmzEventPage} page The page.
 * @param {number} pageIndex Where it sits among the event's pages, counted from 0.
 * @param {readonly CommentTagDefinition[]} tags The tags the active modules read.
 * @returns {Field[]} The fields.
 */
const pageFieldsOf = (page: RmmzEventPage, pageIndex: number, tags: readonly CommentTagDefinition[]): Field[] =>
{
  const lines = tagLinesOf(page, tags);
  const own = PAGE_FIELDS.map(field => ({ key: pageFieldKey(pageIndex, field.name), kind: field.kind, value: field.read(page) }));
  const commands = { key: pageFieldKey(pageIndex, COMMANDS_FIELD), kind: CHOICE, value: listLessTags(page.list, lines) };
  const tagged = lines.flatMap(line => line.fields.map(field => ({
    key: tagFieldKey(pageIndex, line.key, field.name),
    kind: field.kind,
    value: field.value,
  })));
  return [ ...own, commands, ...tagged ];
};

/**
 * Reads an event as the fields a copy of a blueprint differs from it by, one by one: its name and the note's own text,
 * which are choices, then each page's fields. Where it stands is no field, since every copy stands where it was put.
 * @param {RmmzMapEvent} event The event.
 * @param {readonly CommentTagDefinition[]} tags The tags the active modules read from comments.
 * @returns {Field[]} The fields, in order.
 * @throws {Error} When the note would read otherwise without its link; the message says why, for the author.
 */
const eventFields = (event: RmmzMapEvent, tags: readonly CommentTagDefinition[]): Field[] =>
{
  return [
    { key: NAME_FIELD, kind: CHOICE, value: event.name },
    { key: NOTE_FIELD, kind: CHOICE, value: ownNoteOf(event) },
    ...event.pages.flatMap((page, pageIndex) => pageFieldsOf(page, pageIndex, tags)),
  ];
};

/**
 * Counts the digits a number has after its decimal point, written out in full: 0 for a whole number, 2 for 0.25, 7 for a
 * ten millionth, which the shortest form writes with an exponent.
 * @param {number} value The number.
 * @returns {number} The digits.
 */
const decimalPlaces = (value: number): number =>
{
  const [ digits, exponent = '0' ] = String(value).split('e');
  const [ , fraction = '' ] = digits.split('.');
  return Math.max(0, fraction.length - Number(exponent));
};

/**
 * Adds two numbers as the decimals they are written as, so a reach of 1.2 moved by 0.1 is 1.3, where adding them as
 * binary fractions makes 1.3000000000000003, which no author wrote and every offset worked out from it would carry on.
 * @param {number} left One number.
 * @param {number} right The other, negative to take away.
 * @returns {number} The sum, to the places of the more precise of the two.
 */
const addExactly = (left: number, right: number): number =>
{
  const scale = 10 ** Math.max(decimalPlaces(left), decimalPlaces(right));
  return (Math.round(left * scale) + Math.round(right * scale)) / scale;
};

/**
 * Holds a number to a field's range.
 * @param {NumberField} field The field.
 * @param {number} value The number.
 * @returns {number} The number, or the end of the range it passed.
 */
const clampTo = (field: NumberField, value: number): number =>
{
  return Math.min(Math.max(value, field.min), field.max);
};

export {
  addExactly,
  CHOICE,
  clampTo,
  COMMANDS_FIELD,
  decimalPlaces,
  eventFields,
  FIELD_NAME,
  listLessTags,
  MOVE_FREQUENCY,
  MOVE_SPEED,
  NAME_FIELD,
  NOTE_FIELD,
  ownNoteOf,
  PAGE_FIELDS,
  pageFieldKey,
  pageKey,
  tagFieldKey,
  tagLinesOf,
};
export type { ChoiceField, CommentTagDefinition, Field, FieldKind, NumberField, PageField, PageTagLine, TagField, TagLine };
