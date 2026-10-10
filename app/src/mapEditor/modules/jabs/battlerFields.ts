import {
  CHOICE,
  decimalPlaces,
  LINE_VALUE,
  parsableCommentLines,
  type CommentTagDefinition,
  type FieldKind,
  type NumberField,
  type TagLine,
} from '../../core/blueprints/blueprintFields.ts';
import { jsonEquals, type JsonValue } from '../../core/model/json.ts';
import type { RmmzEventPage } from '../../core/model/rmmzTypes.ts';

/**
 * One of the tags a battler's page carries in its comments, as the plugin reading it reads it, and how a value goes back
 * into a line carrying it.
 */
type BattlerTag = {
  /**
   * The tag as J-ABS names it, which names its lines too: sight for a page's first sight line, sight2 for its second.
   */
  readonly name: string;

  /**
   * What the tag is to an author, for the words of a refusal, such as move speed.
   */
  readonly words: string;

  /**
   * Whether its value is a number with a range or a choice.
   */
  readonly kind: FieldKind;

  /**
   * A whole comment line carrying the tag, as the plugin's own pattern matches it: what comes before the value, the value
   * as written, and what comes after it.
   */
  readonly pattern: RegExp;

  /**
   * Reads the value as written, as the plugin reads it.
   * @param {string} written The value, as the line writes it.
   * @returns {JsonValue | null} The value, or null for one the plugin reads as no value at all.
   */
  readonly read: (written: string) => JsonValue | null;

  /**
   * Writes a value as a line of the tag would hold it, given how the line writes its value now.
   * @param {JsonValue} value The value.
   * @param {string} written The value, as the line writes it now.
   * @returns {string} The value, as the line would write it.
   */
  readonly text: (value: JsonValue, written: string) => string;
};

/**
 * The largest whole number a number holds exactly. J-ABS sets no top on any number a battler's page gives, nor
 * J-LevelMaster on a battler's level, so each is held at the top the number's own type has: past it, an offset could no
 * longer be added exactly, nor the number be written back in plain digits for the game to read.
 */
const TYPE_TOP = Number.MAX_SAFE_INTEGER;

/**
 * A number J-ABS reads from a pattern that writes no minus sign, as it reads every number a battler's page gives: 0 at the
 * least, since nothing below it can be written, and no top but the number's own (see {@link TYPE_TOP}).
 */
const FROM_ZERO: NumberField = { kind: 'number', min: 0, max: TYPE_TOP };

/**
 * A battler's level as J-LevelMaster reads it off the page: any whole number, below 0 too, since its pattern takes a
 * minus sign, with no bottom or top but the number's own (see {@link TYPE_TOP}).
 */
const ANY_LEVEL: NumberField = { kind: 'number', min: -TYPE_TOP, max: TYPE_TOP };

/**
 * The value of a number J-ABS reads from its range pattern (J.ABS.RegExp.Sight and the like): no sign, no leading zero,
 * and a fraction or none.
 */
const RANGE_VALUE = '(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?';

/**
 * The most places a number is written to after its point, the most {@code Number#toFixed} writes.
 */
const MOST_PLACES = 100;

/**
 * The AI traits J-ABS reads off a battler's page (J.ABS.RegExp.AiTraitCareful and the rest), and the two older words it
 * still reads there as a role (AiTraitFollower and AiTraitLeader), each as J-ABS writes it.
 */
const AI_TRAITS: readonly string[] = [ 'careful', 'executor', 'reckless', 'healer', 'cleanser', 'buffer', 'tactical', 'berserker', 'follower', 'leader' ];

/**
 * The AI roles J-ABS reads off a battler's page (J.ABS.RegExp.AiRoleLeader and the rest).
 */
const AI_ROLES: readonly string[] = [ 'leader', 'follower', 'guardian', 'ward', 'solo', 'sentinel' ];

/**
 * The settings J-ABS reads off a battler's page (J.ABS.RegExp.ConfigNoIdle and the rest), each as J-ABS writes it.
 */
const BATTLER_SETTINGS: readonly string[] = [
  'noIdle',
  'canIdle',
  'noHpBar',
  'showHpBar',
  'showStates',
  'hideStates',
  'inanimate',
  'notInanimate',
  'invincible',
  'notInvincible',
  'noName',
  'showName',
];

/**
 * Builds the pattern of a whole comment line carrying one of a battler's tags, as J-ABS's own pattern matches it: the tag,
 * a colon and the one space allowed after it, the value, and the line's close, in any case unless told otherwise. J-ABS's
 * patterns are not held to a whole line, but J-Base offers a plugin no comment line but one tag filling it, so a pattern
 * held to the whole line matches the very lines J-ABS's does.
 * @param {string} name The tag, or a pattern of the names it goes by.
 * @param {string} value A pattern of the value.
 * @param {string} flags The pattern's flags; i, any case, unless the plugin's own pattern minds the case.
 * @returns {RegExp} The pattern: what comes before the value, the value, and what comes after it.
 */
const linePattern = (name: string, value: string, flags = 'i'): RegExp =>
{
  return new RegExp(`^(<${name}:[ ]?)(${value})(>)$`, flags);
};

/**
 * Reads a number as J-ABS reads most of a battler's numbers, with {@code parseInt}: its whole part, so a sight written 3.5
 * is a sight of 3.
 * @param {string} written The number, as the line writes it.
 * @returns {number} The number.
 */
const wholeRead = (written: string): number =>
{
  return Number.parseInt(written, 10);
};

/**
 * Reads a number as J-ABS reads a move speed or an alerted pursuit boost, with {@code parseFloat}: fraction and all.
 * @param {string} written The number, as the line writes it.
 * @returns {number} The number.
 */
const fractionRead = (written: string): number =>
{
  return Number.parseFloat(written);
};

/**
 * Reads a level as J-LevelMaster reads it, with {@code parseInt}: a sign and both a minus and a plus ahead of the digits is
 * a level its pattern takes and {@code parseInt} reads as no number at all, which is no level.
 * @param {string} written The level, as the line writes it.
 * @returns {number | null} The level, or null for one read as no number.
 */
const levelRead = (written: string): number | null =>
{
  const level = Number.parseInt(written, 10);
  return Number.isNaN(level)
    ? null
    : level;
};

/**
 * Counts the places a number is written to after its point.
 * @param {string} written The number, as the line writes it.
 * @returns {number} The places; 0 for a whole number written without a point.
 */
const placesWritten = (written: string): number =>
{
  const [ , fraction = '' ] = written.split('.');
  return fraction.length;
};

/**
 * Writes a number in the plain digits of J-ABS's range pattern, to as many places as the line wrote its value to, or as
 * the number needs, whichever is more, so a move speed written 4.0 goes on as 5.0, as its author writes them.
 * @param {JsonValue} value The number.
 * @param {string} written The value, as the line writes it now.
 * @returns {string} The number, as the line would write it.
 */
const rangeText = (value: JsonValue, written: string): string =>
{
  return typeof value === 'number'
    ? value.toFixed(Math.min(Math.max(placesWritten(written), decimalPlaces(value)), MOST_PLACES))
    : String(value);
};

/**
 * Writes a value as plain text: a whole number in its digits, a word as it is.
 * @param {JsonValue} value The value.
 * @returns {string} The value, as the line would write it.
 */
const plainText = (value: JsonValue): string =>
{
  return String(value);
};

/**
 * Builds the reader of a word among some, which J-ABS matches in any case, as J-ABS writes the word.
 * @param {readonly string[]} words The words.
 * @returns {(written: string) => string} The reader.
 */
const wordAmong = (words: readonly string[]): ((written: string) => string) =>
{
  return written => words.find(word => word.toLowerCase() === written.toLowerCase()) as string;
};

/**
 * Reads one half of a respawn's value as J-Base's JsonMapper#parseString reads it: true and false in any case are
 * booleans, anything parseFloat makes a number of is that number, and anything else stays a word.
 * @param {string} part The half, as written.
 * @returns {JsonValue} The half, as J-ABS reads it.
 */
const respawnPart = (part: string): JsonValue =>
{
  const lowered = part.toLowerCase();
  if (lowered === 'true' || lowered === 'false')
  {
    return lowered === 'true';
  }

  const number = Number.parseFloat(part);
  return Number.isNaN(number)
    ? part
    : number;
};

/**
 * Reads a respawn as J-ABS reads it (Game_Event#getRespawnOverrides, through JsonMapper#parseObject): how its wait is
 * measured, and what feeds that, the comma between them read with or without its one space.
 * @param {string} written The value, as the line writes it, brackets and all.
 * @returns {JsonValue} The method and its parameter.
 */
const respawnRead = (written: string): JsonValue =>
{
  return written.slice(1, -1).split(/, |,/u).map(respawnPart);
};

/**
 * Writes a respawn's method and parameter between brackets, the space after the comma kept as the line writes it.
 * @param {JsonValue} value The method and its parameter.
 * @param {string} written The value, as the line writes it now.
 * @returns {string} The value, as the line would write it.
 */
const respawnText = (value: JsonValue, written: string): string =>
{
  const space = written.includes(', ') ? ' ' : '';
  return Array.isArray(value)
    ? `[${value.map(String).join(`,${space}`)}]`
    : String(value);
};

/**
 * Builds one of a battler's tags holding an id, which is a choice an offset never moves, read with {@code parseInt} from
 * digits, as J-ABS reads each of them.
 * @param {string} name The tag.
 * @param {string} words What the tag is to an author.
 * @param {string} flags The pattern's flags; i, any case, unless J-ABS's own pattern minds the case.
 * @returns {BattlerTag} The tag.
 */
const idTag = (name: string, words: string, flags = 'i'): BattlerTag =>
{
  return { name, words, kind: CHOICE, pattern: linePattern(name, '\\d+', flags), read: wholeRead, text: plainText };
};

/**
 * Builds one of a battler's tags holding a word among some, which is a choice, read in any case as J-ABS reads it.
 * @param {string} name The tag.
 * @param {string} words What the tag is to an author.
 * @param {readonly string[]} among The words J-ABS knows for it.
 * @returns {BattlerTag} The tag.
 */
const wordTag = (name: string, words: string, among: readonly string[]): BattlerTag =>
{
  return { name, words, kind: CHOICE, pattern: linePattern(name, among.join('|')), read: wordAmong(among), text: plainText };
};

/**
 * Builds one of a battler's tags holding a number in J-ABS's range pattern, which writes no sign: a number from 0 with no
 * top (see {@link FROM_ZERO}), read as J-ABS reads that tag.
 * @param {string} name The tag.
 * @param {string} words What the tag is to an author.
 * @param {(written: string) => number} read How J-ABS reads it: {@link wholeRead} or {@link fractionRead}.
 * @returns {BattlerTag} The tag.
 */
const rangeTag = (name: string, words: string, read: (written: string) => number): BattlerTag =>
{
  return { name, words, kind: FROM_ZERO, pattern: linePattern(name, RANGE_VALUE), read, text: rangeText };
};

/**
 * Every tag J-ABS reads off a battler's page (Game_Event#parseEnemyComments, and the overrides and move speed it reads),
 * each as J-ABS's own pattern in J.ABS.RegExp matches it and as J-ABS reads its value. A number is a number with the range
 * its pattern and its reading allow; the enemy, the team and the respawn animation are ids, and so choices an offset
 * never moves, as are the AI's traits and role, the battler's settings and its respawn. J-ABS reads the last line of a
 * tag where a page repeats it, but every line is a field of its own, named by its place among the tag's lines.
 */
const JABS_TAGS: readonly BattlerTag[] = [
  // EnemyId and RespawnAnimation, read with parseInt; TeamId too, its pattern alone among these minding the case.
  idTag('enemyId', 'enemy'),
  idTag('teamId', 'team', ''),
  idTag('respawnAnimation', 'respawn animation'),

  // AiTraitCareful and the rest, AiRoleLeader and the rest, and ConfigNoIdle and the rest.
  wordTag('aiTrait', 'AI trait', AI_TRAITS),
  wordTag('aiRole', 'AI role', AI_ROLES),
  wordTag('jabsConfig', 'battler setting', BATTLER_SETTINGS),

  // Sight, Pursuit, AlertedSightBoost and GuardRange, each read with parseInt: whole tiles from 0, with no top.
  rangeTag('sight', 'sight', wholeRead),
  rangeTag('pursuit', 'pursuit', wholeRead),
  rangeTag('alertedSightBoost', 'alerted sight boost', wholeRead),
  rangeTag('guardRange', 'guard range', wholeRead),

  // AlertedPursuitBoost and MoveSpeed, each read with parseFloat: fractions too, from 0, with no top.
  rangeTag('alertedPursuitBoost', 'alerted pursuit boost', fractionRead),
  rangeTag('moveSpeed', 'move speed', fractionRead),

  // AlertDuration, digits read with parseInt: whole frames from 0, with no top.
  { name: 'alertDuration', words: 'alert duration', kind: FROM_ZERO, pattern: linePattern('alertDuration', '\\d+'), read: wholeRead, text: plainText },

  // Respawn, read through JsonMapper: how the battler's wait to come back is measured, and what feeds that.
  { name: 'respawn', words: 'respawn', kind: CHOICE, pattern: linePattern('respawn', '\\[[\\w-]+,[ ]?[\\w-]+]'), read: respawnRead, text: respawnText },

  // NoRespawn: a mark holding no value, that the battler never comes back.
  { name: 'noRespawn', words: 'no respawn mark', kind: CHOICE, pattern: /^(<noRespawn)()(>)$/i, read: () => true, text: () => '' },
];

/**
 * A battler's level, which J-LevelMaster reads off a J-ABS battler's page (J.LEVEL.RegExp.Level, read with parseInt by
 * Game_Event#getLevelOverrides): under any of its three names, a whole number, below 0 too, with no bottom or top.
 */
const LEVEL_TAG: BattlerTag = {
  name: 'level',
  words: 'level',
  kind: ANY_LEVEL,
  pattern: linePattern('(?:lv|lvl|level)', '-?\\+?\\d+'),
  read: levelRead,
  text: plainText,
};

/**
 * Finds every line on a page carrying one of a battler's tags, each named by its place among the tag's lines: the tag
 * alone for the first, then the tag and 2, and so on, as the field model names the lines no module reads.
 * @param {BattlerTag} tag The tag.
 * @param {RmmzEventPage} page The page.
 * @returns {TagLine[]} The lines, in the order written, each giving its value alone.
 */
const battlerLines = (tag: BattlerTag, page: RmmzEventPage): TagLine[] =>
{
  const read = parsableCommentLines(page).flatMap(({ listIndex, text }) =>
  {
    const match = tag.pattern.exec(text);
    const value = match === null ? null : tag.read(match[2]);
    return value === null ? [] : [ { listIndex, value } ];
  });
  return read.map(({ listIndex, value }, index) => ({
    listIndex,
    key: index === 0 ? tag.name : `${tag.name}${index + 1}`,
    fields: [ { name: LINE_VALUE, kind: tag.kind, value } ],
  }));
};

/**
 * Writes a value into a line carrying one of a battler's tags, in place: what comes before the value and after it kept to
 * the character, and a line already reading as the value left exactly as it is written. A value the line could not hold,
 * as the game would read it back, is refused: a fraction where the game reads whole numbers, a number below what the
 * pattern can write, or a word the plugin does not know.
 * @param {BattlerTag} tag The tag.
 * @param {string} text The line.
 * @param {string} field The field's name, which is the line's one value.
 * @param {JsonValue} value The value, as the game reads it.
 * @returns {string} The line holding the value.
 * @throws {Error} When the line is none of the tag's, or cannot hold the value; the message says why, for the author.
 */
const writtenLine = (tag: BattlerTag, text: string, field: string, value: JsonValue): string =>
{
  const match = tag.pattern.exec(text);
  if (field !== LINE_VALUE || match === null)
  {
    throw new Error(`a battler's ${tag.words} line gives one value, and ${JSON.stringify(text)} is no such line`);
  }

  // a line already reading as the value stays as its author wrote it.
  const [ , before, written, after ] = match;
  if (jsonEquals(tag.read(written), value))
  {
    return text;
  }

  // the line written must read back as the very value, or the game would read something else.
  const line = `${before}${tag.text(value, written)}${after}`;
  const check = tag.pattern.exec(line);
  if (check === null || jsonEquals(tag.read(check[2]), value) === false)
  {
    throw new Error(`its ${tag.words} cannot be ${JSON.stringify(value)} as the game reads it`);
  }

  return line;
};

/**
 * Names a line carrying one of a battler's tags the way an author knows it: by what the tag is, and, past the first line
 * of the tag on its page, by which line it is, as {@link battlerLines} names them.
 * @param {BattlerTag} tag The tag.
 * @param {string} line The line's key: the tag's name, or the name and which line it is, such as sight2.
 * @returns {string} The words, such as "sight" or "sight (line 2)".
 */
const lineWords = (tag: BattlerTag, line: string): string =>
{
  return line === tag.name
    ? tag.words
    : `${tag.words} (line ${line.slice(tag.name.length)})`;
};

/**
 * Builds one of a battler's tags as fields of a blueprint's copies.
 * @param {BattlerTag} tag The tag.
 * @returns {CommentTagDefinition} The tag, as fields.
 */
const definitionOf = (tag: BattlerTag): CommentTagDefinition =>
{
  return {
    id: `jabs.${tag.name}`,
    read: page => battlerLines(tag, page),
    write: (text, field, value) => writtenLine(tag, text, field, value),
    words: line => lineWords(tag, line),
  };
};

/**
 * Builds every tag J-ABS reads off a battler's page as fields of a blueprint's copies, so a copy follows each one by one,
 * its numbers by an offset or a pin held to their range, its choices unless the copy holds its own, rather than all of them
 * as one choice: J-ABS's own, and the battler's level, which J-LevelMaster reads off a J-ABS battler's page, when
 * J-LevelMaster is on too.
 * @param {boolean} levels Whether J-LevelMaster is on, which reads a battler's level.
 * @returns {CommentTagDefinition[]} The tags, as fields.
 */
const battlerTagFields = (levels: boolean): CommentTagDefinition[] =>
{
  const tags = levels
    ? [ ...JABS_TAGS, LEVEL_TAG ]
    : JABS_TAGS;
  return tags.map(definitionOf);
};

export { AI_ROLES, AI_TRAITS, ANY_LEVEL, BATTLER_SETTINGS, battlerTagFields, FROM_ZERO, TYPE_TOP };
