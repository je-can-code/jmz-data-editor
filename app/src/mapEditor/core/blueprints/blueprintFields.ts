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
 * its value as the game reads it, a number for a number field. A line giving one value alone, as J-ABS's sight does,
 * names it {@link LINE_VALUE}, and the field is known by the line's key alone.
 */
type TagField = {
  readonly name: string;
  readonly kind: FieldKind;
  readonly value: JsonValue;
};

/**
 * One comment line on a page carrying a tag, read as fields.
 */
type TagLine = {
  /**
   * Where the line sits in the page's command list.
   */
  readonly listIndex: number;

  /**
   * Tells the line from every other tag line on the page, such as light1 and light2 for a page's two lights. A module
   * names its lines with a lowercase letter, then letters and digits, and never with the name of one of the page's own
   * fields; a line no module reads is named by its tag, as written, between angle brackets: <motion>, and <motion>#2 for
   * the second line of that tag on the page.
   */
  readonly key: string;

  /**
   * The fields the line gives, each named with a lowercase letter, then letters and digits, or the one value the line
   * gives alone, named {@link LINE_VALUE}.
   */
  readonly fields: readonly TagField[];
};

/**
 * A tag a module reads from an event page's comments, such as J-Lighting's light, read as fields a copy of a blueprint
 * follows one by one: the module finds every line on a page carrying the tag, names each one, reads each of its fields as
 * the game reads it, says whether each is a number with a range or a choice, and writes a value back into a line in place,
 * every other character of it kept. A line one of these reads is fields of its own and no part of the page's command list.
 * A tag line no module reads is a field of its own too, one choice holding the whole line (see {@link UNDECLARED_TAG}), so
 * it is never a number and never moves by an offset, however much like a number it reads, as an enemy's id does.
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
 *                      tag line
 *  pPAGE.LINE.FIELD    a field of a module's tag on a page
 *  pPAGE.LINE          a module's tag on a page giving one value alone
 *  pPAGE.<TAG>         a tag line on a page no module reads, the whole line one choice; pPAGE.<TAG>#2 for the second
 *                      line of that tag on the page, and so on
 *
 * Example:
 *  p1.light2.radius
 *  p1.moveSpeed
 *  p1.<motion>#2
 *
 * Translation:
 *  How far the second light on the event's first page reaches; how fast J-ABS moves the battler of its first page; the
 *  second motion line of its first page, which no module reads.
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
 * The name of a page's command list less every tag line, which is one choice.
 */
const COMMANDS_FIELD = 'commands';

/**
 * What the key of a module's tag line and each of its fields' names must be: a lowercase letter, then letters and digits,
 * so every key a link writes reads back as one.
 */
const FIELD_NAME = /^[a-z][a-zA-Z0-9]*$/u;

/**
 * The name of the one value a tag line gives when it gives one alone, as J-ABS's sight does: the field is then known by
 * the line's key alone, p1.sight rather than p1.sight.value.
 */
const LINE_VALUE = '';

/**
 * The command codes of a comment's first line and of each line after it.
 */
const COMMENT_CODES: readonly number[] = [ 108, 408 ];

/**
 * What a comment line must be before J-Base offers it to any plugin (J.BASE.RegExp.ParsableComment): one tag filling the
 * whole line, made only of these characters. Every comment line of this shape is a tag line, whether a module reads it
 * or not; a tag with words after it, or a space before it, is no tag line, as no plugin is ever offered it.
 */
const PARSABLE_COMMENT = /^<[[\]\w :"',.!?+\-*/\\#~%=();]+>$/i;

/**
 * A tag line's tag: what follows its opening angle bracket, up to its first colon, or up to its closing bracket when it
 * has no colon.
 *
 * <pre>
 * Structure:
 *  <TAG:VALUE>
 *  <TAG>
 *
 * Example:
 *  <motion:[breathe]>
 *
 * Translation:
 *  A line of the tag motion.
 * </pre>
 */
const TAG_NAME = /^<([^:>]*)/u;

/**
 * The id the field model reads every tag line no module reads under, which no module's id can take, a module's ids all
 * starting with its own.
 */
const UNDECLARED_TAG_ID = 'core.tag';

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
 * choices. The command list is a field of its own, read less every tag line (see {@link listLessTags}).
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
 * The names of a page's own fields, its command list among them, which no module may give one of its tag lines, lest a
 * line giving one value alone be known by the very name of one of them.
 */
const OWN_FIELD_NAMES: ReadonlySet<string> = new Set([ ...PAGE_FIELDS.map(field => field.name), COMMANDS_FIELD ]);

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
 * Names a field of a tag line among its page's fields: the line's key, then the field's name, or the line's key alone for
 * the one value a line gives alone.
 * @param {string} lineKey The tag line's key, such as light1 or sight.
 * @param {string} name The field's name, such as radius, or {@link LINE_VALUE}.
 * @returns {string} The field's name on its page, such as light1.radius or sight.
 */
const lineFieldName = (lineKey: string, name: string): string =>
{
  return name === LINE_VALUE
    ? lineKey
    : `${lineKey}.${name}`;
};

/**
 * Builds the key of one field of a tag line on a page.
 * @param {number} pageIndex The page, counted from 0.
 * @param {string} lineKey The tag line's key, such as light1.
 * @param {string} name The field's name, such as radius, or {@link LINE_VALUE}.
 * @returns {string} The key, such as p1.light1.radius, or p1.sight for the one value a line gives alone.
 */
const tagFieldKey = (pageIndex: number, lineKey: string, name: string): string =>
{
  return `${pageKey(pageIndex)}.${lineFieldName(lineKey, name)}`;
};

/**
 * One comment line J-Base offers to plugins, and where it sits in its page's command list.
 */
type CommentTagText = {
  readonly listIndex: number;
  readonly text: string;
};

/**
 * Finds every tag line on a page, as Game_Event#getValidCommentCommands finds the comment lines J-Base offers to plugins:
 * the first line and each later line of every comment, wherever it sits, that is one tag filling the whole line. Which
 * plugin reads each one, if any, is no matter here.
 * @param {RmmzEventPage} page The page.
 * @returns {CommentTagText[]} The lines, in the order written.
 */
const parsableCommentLines = (page: RmmzEventPage): CommentTagText[] =>
{
  return page.list.flatMap((command, listIndex) =>
  {
    const [ text ] = command.parameters;
    return COMMENT_CODES.includes(command.code) && typeof text === 'string' && PARSABLE_COMMENT.test(text)
      ? [ { listIndex, text } ]
      : [];
  });
};

/**
 * Reads a tag line's tag (see {@link TAG_NAME}).
 * @param {string} text The line, one tag filling it.
 * @returns {string} The tag, as written.
 */
const tagNameOf = (text: string): string =>
{
  const [ , name ] = TAG_NAME.exec(text) as RegExpExecArray;
  return name;
};

/**
 * Names a tag line no module reads: its tag between angle brackets, then, for the second line of that tag on its page and
 * every one after, a hash and which line of the tag it is. No module's line can be named so, as a module's names hold
 * letters and digits alone.
 * @param {string} name The line's tag, as written.
 * @param {number} ordinal Which line of that tag on the page it is, counted from 1.
 * @returns {string} The key, such as <motion> or <motion>#2.
 */
const undeclaredKey = (name: string, ordinal: number): string =>
{
  return ordinal === 1
    ? `<${name}>`
    : `<${name}>#${ordinal}`;
};

/**
 * Reads every tag line on a page no module reads, each as a choice of its own holding the whole line as written: what such
 * a line means is no module's to say, so its text is all there is to compare, and a copy writing it otherwise holds its
 * own. Each is keyed by its tag, and by its place among the page's lines of that tag when the tag repeats, wherever the
 * lines sit: in one comment, or spread over several.
 * @param {RmmzEventPage} page The page.
 * @param {ReadonlySet<number>} taken Where the lines a module reads sit in the list, which are the module's.
 * @returns {TagLine[]} The lines, in the order written.
 */
const undeclaredTagLines = (page: RmmzEventPage, taken: ReadonlySet<number>): TagLine[] =>
{
  const counts = new Map<string, number>();
  return parsableCommentLines(page)
    .filter(line => taken.has(line.listIndex) === false)
    .map(({ listIndex, text }) =>
    {
      // the first line of a tag is named by the tag alone, so a line added after it never renames it.
      const name = tagNameOf(text);
      const ordinal = (counts.get(name) ?? 0) + 1;
      counts.set(name, ordinal);
      return { listIndex, key: undeclaredKey(name, ordinal), fields: [ { name: LINE_VALUE, kind: CHOICE, value: text } ] };
    });
};

/**
 * Writes a tag line no module reads, which is one choice holding the whole line: the line becomes the value, which is
 * another line of the same tag, as a copy following its blueprint takes the blueprint's line whole.
 * @param {string} text The line.
 * @param {string} field The field's name, the line's one value.
 * @param {JsonValue} value The line to write.
 * @returns {string} The line written.
 * @throws {Error} When the value is no tag line, or a line of another tag, which no line of the same key could be.
 */
const writtenWholeLine = (text: string, field: string, value: JsonValue): string =>
{
  const line = typeof value === 'string' && PARSABLE_COMMENT.test(value)
    ? value
    : null;
  if (field !== LINE_VALUE || line === null || tagNameOf(line) !== tagNameOf(text))
  {
    throw new Error(`a tag line no plugin reads can only be written as another line of the same tag, not ${JSON.stringify(value)}`);
  }

  return line;
};

/**
 * Every tag line no module reads, read as a choice of its own (see {@link undeclaredTagLines}) and written back by putting
 * the blueprint's line whole in place of the copy's. It is the field model's own, never a module's: it takes every tag
 * line on a page that the modules' tags leave.
 */
const UNDECLARED_TAG: CommentTagDefinition = {
  id: UNDECLARED_TAG_ID,
  read: page => undeclaredTagLines(page, new Set()),
  write: writtenWholeLine,
};

/**
 * Reports whether a module named one of its tag lines, and the line's fields, so a link can hold each: the line by a
 * lowercase letter, then letters and digits, and by no name of one of its page's own fields; each field likewise, unless
 * the line gives one value alone, named {@link LINE_VALUE}.
 * @param {TagLine} line The line.
 * @returns {boolean} True when the line and its fields are named as they should be.
 */
const isNamed = (line: TagLine): boolean =>
{
  const alone = line.fields.length === 1 && line.fields[0].name === LINE_VALUE;
  return FIELD_NAME.test(line.key)
    && OWN_FIELD_NAMES.has(line.key) === false
    && (alone || line.fields.every(field => FIELD_NAME.test(field.name)));
};

/**
 * Finds every tag line on a page, with the tag reading it, in the order the lines sit in the list: each line a module's
 * tag reads, and every other tag line as a choice of its own (see {@link UNDECLARED_TAG}). A module naming a line or a
 * field otherwise than {@link isNamed} allows, naming two lines alike, or reading one line twice, is a mistake in the
 * module, and throws.
 * @param {RmmzEventPage} page The page.
 * @param {readonly CommentTagDefinition[]} tags The tags the active modules read.
 * @returns {PageTagLine[]} The lines.
 */
const tagLinesOf = (page: RmmzEventPage, tags: readonly CommentTagDefinition[]): PageTagLine[] =>
{
  const read = tags.flatMap(tag => tag.read(page).map(line => ({ ...line, tag })));
  const keys = new Set<string>();
  const indexes = new Set<number>();
  read.forEach(line =>
  {
    if (isNamed(line) === false || keys.has(line.key) || indexes.has(line.listIndex))
    {
      throw new Error(`${line.tag.id} read a tag line as ${line.key} at ${line.listIndex}, which another reads, or which names a field no link could hold`);
    }

    keys.add(line.key);
    indexes.add(line.listIndex);
  });

  // every tag line the modules left is a choice of its own, under a name no module's line can have.
  const undeclared = undeclaredTagLines(page, indexes).map(line => ({ ...line, tag: UNDECLARED_TAG }));
  return [ ...read, ...undeclared ].sort((left, right) => left.listIndex - right.listIndex);
};

/**
 * Reads a page's command list less every tag line, which is the one choice it is: each tag line, whether a module reads it
 * or not, stands as a mark naming the tag reading it and the line's key, so where a tag line sits counts and what it says
 * does not, its fields being fields of their own. A mark is an object, which no comment's text ever is, so no comment can
 * be taken for one. A fold MZ's window drew shut is left out, since it is how that window shows the list rather than
 * anything the list does.
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
 * Reads one page of an event as fields: its own fields, its command list less every tag line, then every field of every
 * tag line on it, in the order the lines sit.
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
 * Adds two numbers as the decimals they are written as, so a reach of 4.35 moved by 0.1 is 4.45, where adding them as
 * binary fractions makes 4.449999999999999, which no author wrote and every offset worked out from it would carry on.
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
  LINE_VALUE,
  lineFieldName,
  listLessTags,
  MOVE_FREQUENCY,
  MOVE_SPEED,
  NAME_FIELD,
  NOTE_FIELD,
  ownNoteOf,
  PAGE_FIELDS,
  pageFieldKey,
  pageKey,
  parsableCommentLines,
  tagFieldKey,
  tagLinesOf,
  UNDECLARED_TAG,
  UNDECLARED_TAG_ID,
};
export type {
  ChoiceField,
  CommentTagDefinition,
  CommentTagText,
  Field,
  FieldKind,
  NumberField,
  PageField,
  PageTagLine,
  TagField,
  TagLine,
};
