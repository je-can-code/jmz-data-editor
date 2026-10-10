import { LINE_VALUE, parsableCommentLines } from '../../core/blueprints/blueprintFields.ts';
import type { EventEdit } from '../../core/eventKinds/quickFields.ts';
import { cloneJson, jsonEquals, type JsonValue } from '../../core/model/json.ts';
import type { RmmzEventCommand, RmmzEventPage } from '../../core/model/rmmzTypes.ts';
import { JABS_TAGS, LEVEL_TAG, writtenLine, type BattlerTag } from './battlerFields.ts';
import {
  LEGACY_ROLES,
  pageEnemyId,
  readBattlerPage,
  ROLES,
  TRAITS,
  type BattlerReading,
  type EnemyRecord,
  type JabsDefaults,
} from './battlerReading.ts';
import { FIRST_MOTION, MOTION_LINE, motionLinesOf, writtenMotionLine, type MotionValue } from './motionTags.ts';

/**
 * A battler's numbers the panel sets, each one tag line on the page.
 */
type NumberRow = 'level' | 'moveSpeed' | 'sight' | 'pursuit' | 'alertedSightBoost' | 'alertedPursuitBoost' | 'alertDuration';

/**
 * A battler's switches the panel sets, each one of two words of J-ABS's battler setting tag.
 */
type SwitchRow = 'inanimate' | 'idle' | 'hpBar' | 'name';

/**
 * One change the panel makes to a battler's page. A value of null takes the page's own tag out, so the enemy's value, or
 * J-ABS's default, applies; the enemy itself cannot be taken out. A motion change names the motion by its place among the
 * page's motion lines, or null to add one, and a null value takes that motion off.
 */
type BattlerChange =
  | { readonly row: 'enemy'; readonly value: number }
  | { readonly row: NumberRow; readonly value: number | null }
  | { readonly row: SwitchRow; readonly value: boolean | null }
  | { readonly row: 'team'; readonly value: number | null }
  | { readonly row: 'aiTraits' | 'aiRoles'; readonly value: readonly string[] | null }
  | { readonly row: 'passives'; readonly value: readonly number[] | null }
  | { readonly row: 'motion'; readonly motion: number | null; readonly value: MotionValue | null };

/**
 * What a change is read against: the enemies, J-ABS's defaults, and the project's motion defaults.
 */
type BattlerContext = {
  readonly enemyOf: (enemyId: number) => EnemyRecord | null;
  readonly defaults: JabsDefaults;
  readonly motionDefaults: (type: string, parameter: string) => JsonValue | undefined;
};

/**
 * The command codes of a comment's first line and of each line after it.
 */
const COMMENT_FIRST = 108;
const COMMENT_NEXT = 408;

/**
 * The two words of J-ABS's battler setting tag each switch is written with: the one turning it off, then on.
 */
const SWITCH_WORDS: Readonly<Record<SwitchRow, readonly [ string, string ]>> = {
  inanimate: [ 'notInanimate', 'inanimate' ],
  idle: [ 'noIdle', 'canIdle' ],
  hpBar: [ 'noHpBar', 'showHpBar' ],
  name: [ 'noName', 'showName' ],
};

/**
 * Why a change is refused when the page it would write reads any other of its tags differently, the light panel's rule.
 */
const OTHERS_MISREAD = 'that would change how the game reads another of this page\'s tags';

/**
 * Why a change is refused when the page it would write does not read back as the change meant.
 */
const MISREAD = 'the game would not read that back as written';

/**
 * Why a motion change is refused when the motion it names is no longer on the page.
 */
const MOTION_GONE = 'that motion is no longer on this page';

/**
 * Why a change is refused on a page that names no enemy, as a page changed elsewhere may come to.
 */
const NO_ENEMY = 'this page no longer names an enemy';

/**
 * A whole comment line of one of J-ABS's word tags, among the words given: what comes before the word, the word, and
 * the close, in any case.
 * @param {string} tag The tag: aiTrait, aiRole or jabsConfig.
 * @param {readonly string[]} words The words.
 * @returns {RegExp} The pattern.
 */
const wordLine = (tag: string, words: readonly string[]): RegExp =>
{
  return new RegExp(`^(<${tag}:[ ]?)(${words.join('|')})(>)$`, 'i');
};

/**
 * A whole comment line of J-Passive's passive tag: what comes before the list, the list, and the close.
 */
const PASSIVE_LINE = /^(<passive:[ ]?)(\[[\d, ]+])(>)$/i;

/**
 * Finds one of J-ABS's tags among those the field model reads, by name.
 * @param {string} name The tag.
 * @returns {BattlerTag} The tag.
 */
const jabsTag = (name: string): BattlerTag =>
{
  return JABS_TAGS.find(tag => tag.name === name) as BattlerTag;
};

/**
 * The tag each number row is written with.
 * @param {NumberRow} row The row.
 * @returns {BattlerTag} The tag.
 */
const numberTag = (row: NumberRow): BattlerTag =>
{
  return row === 'level'
    ? LEVEL_TAG
    : jabsTag(row);
};

/**
 * Writes a number as a new line of its tag would hold it: a move speed to one place at least, as every move speed the game
 * ships is written, and every other number in its plain digits.
 * @param {NumberRow} row The row.
 * @param {number} value The number.
 * @returns {string} The line.
 */
const newNumberLine = (row: NumberRow, value: number): string =>
{
  const name = row === 'level' ? 'level' : row;
  const text = row === 'moveSpeed' && Number.isInteger(value)
    ? value.toFixed(1)
    : String(value);
  return `<${name}:${text}>`;
};

/**
 * A page's command list being changed, keeping every change as the edit that makes it, addressed against the list as the
 * changes before it left it, as a quick panel's edits are applied.
 */
class ListDraft
{
  #list: RmmzEventCommand[];

  #path: readonly (string | number)[];

  #edits: EventEdit[] = [];

  /**
   * @param {RmmzEventPage} page The page.
   * @param {number} pageIndex Its place in its event.
   */
  constructor(page: RmmzEventPage, pageIndex: number)
  {
    this.#list = cloneJson(page.list);
    this.#path = [ 'pages', pageIndex, 'list' ];
  }

  /**
   * The list as it stands.
   * @returns {readonly RmmzEventCommand[]} The commands.
   */
  get list(): readonly RmmzEventCommand[]
  {
    return this.#list;
  }

  /**
   * The edits made so far, in order.
   * @returns {EventEdit[]} The edits.
   */
  get edits(): EventEdit[]
  {
    return this.#edits;
  }

  /**
   * Writes a comment line's text anew, unless it reads as it is.
   * @param {number} index Where the line sits.
   * @param {string} text Its new text.
   */
  setText(index: number, text: string): void
  {
    if (this.#list[index].parameters[0] === text)
    {
      return;
    }

    this.#list[index] = { ...this.#list[index], parameters: [ text ] };
    this.#edits.push({ kind: 'set', path: [ ...this.#path, index, 'parameters', 0 ], value: text });
  }

  /**
   * Puts in a comment line after the one before it, as a further line of that comment.
   * @param {number} index Where it goes.
   * @param {string} text Its text.
   * @param {number} indent Its indent: the comment's own.
   */
  insert(index: number, text: string, indent: number): void
  {
    const command: RmmzEventCommand = { code: COMMENT_NEXT, indent, parameters: [ text ] };
    this.#list.splice(index, 0, command);
    this.#edits.push({ kind: 'splice', path: [ ...this.#path ], index, deleteCount: 0, inserted: [ command ] });
  }

  /**
   * Takes a comment line out. A comment's first line taken out hands its place to the line after it, which then starts
   * the comment, so the comment's other lines stay one comment.
   * @param {number} index Where the line sits.
   */
  remove(index: number): void
  {
    const next = this.#list[index + 1];
    if (this.#list[index].code === COMMENT_FIRST && next !== undefined && next.code === COMMENT_NEXT)
    {
      this.#list[index + 1] = { ...next, code: COMMENT_FIRST };
      this.#edits.push({ kind: 'set', path: [ ...this.#path, index + 1, 'code' ], value: COMMENT_FIRST });
    }

    this.#list.splice(index, 1);
    this.#edits.push({ kind: 'splice', path: [ ...this.#path ], index, deleteCount: 1, inserted: [] });
  }

  /**
   * Takes several lines out, the last first, so each one still sits where it was found.
   * @param {readonly number[]} indexes Where the lines sit, in order.
   */
  removeAll(indexes: readonly number[]): void
  {
    [ ...indexes ].reverse().forEach(index => this.remove(index));
  }

  /**
   * Reads the list as a page, for reading it back.
   * @param {RmmzEventPage} page The page the list belongs to.
   * @returns {RmmzEventPage} The page with the list as it stands.
   */
  pageOf(page: RmmzEventPage): RmmzEventPage
  {
    return { ...page, list: this.#list };
  }
}

/**
 * Finds every comment line J-Base offers a plugin whose whole text a pattern matches, in order.
 * @param {readonly RmmzEventCommand[]} list The command list.
 * @param {RegExp} pattern The pattern.
 * @returns {number[]} Where the lines sit.
 */
const linesMatching = (list: readonly RmmzEventCommand[], pattern: RegExp): number[] =>
{
  return parsableCommentLines({ list } as RmmzEventPage)
    .filter(line => pattern.test(line.text))
    .map(line => line.listIndex);
};

/**
 * Finds where a new tag line goes: at the end of the comment holding the enemy the game reads, so a battler's tags stay
 * together as the game's battlers keep them, and with that comment's indent.
 * @param {readonly RmmzEventCommand[]} list The command list.
 * @returns {{ index: number, indent: number }} Where it goes.
 * @throws {Error} When the page names no enemy, which no battler page lacks.
 */
const insertionPoint = (list: readonly RmmzEventCommand[]): { index: number; indent: number } =>
{
  const enemyLines = linesMatching(list, jabsTag('enemyId').pattern);
  const enemyLine = enemyLines[enemyLines.length - 1];
  if (enemyLine === undefined)
  {
    throw new Error('this page names no enemy');
  }

  let end = enemyLine;
  while (list[end + 1] !== undefined && list[end + 1].code === COMMENT_NEXT)
  {
    end += 1;
  }

  return { index: end + 1, indent: list[enemyLine].indent };
};

/**
 * Puts a new tag line in where new tag lines go.
 * @param {ListDraft} draft The list.
 * @param {string} text The line.
 */
const insertTagLine = (draft: ListDraft, text: string): void =>
{
  const { index, indent } = insertionPoint(draft.list);
  draft.insert(index, text, indent);
};

/**
 * Gives a number row a value: written over the last line of its tag, which the game reads, or a new line when the page
 * has none; no value takes every line of the tag out, since with the last gone the game would read the one before it.
 * @param {ListDraft} draft The list.
 * @param {NumberRow | 'team' | 'enemy'} row The row.
 * @param {number | null} value The value, or null to take it out.
 */
const setNumber = (draft: ListDraft, row: NumberRow | 'team' | 'enemy', value: number | null): void =>
{
  const tag = row === 'team' || row === 'enemy'
    ? jabsTag(`${row}Id`)
    : numberTag(row);
  const lines = linesMatching(draft.list, tag.pattern);
  if (value === null)
  {
    draft.removeAll(lines);
    return;
  }

  const last = lines[lines.length - 1];
  if (last !== undefined)
  {
    draft.setText(last, writtenLine(tag, String(draft.list[last].parameters[0]), LINE_VALUE, value));
    return;
  }

  const text = row === 'team' ? `<teamId:${value}>` : newNumberLine(row as NumberRow, value);
  insertTagLine(draft, text);
};

/**
 * Gives a switch row a value: its word written over the word of its tag's last line, or a new line when the page has
 * none; no value takes every line naming either word out.
 * @param {ListDraft} draft The list.
 * @param {SwitchRow} row The row.
 * @param {boolean | null} value The value, or null to take it out.
 */
const setSwitch = (draft: ListDraft, row: SwitchRow, value: boolean | null): void =>
{
  const [ off, on ] = SWITCH_WORDS[row];
  const pattern = wordLine('jabsConfig', [ off, on ]);
  const lines = linesMatching(draft.list, pattern);
  if (value === null)
  {
    draft.removeAll(lines);
    return;
  }

  const word = value ? on : off;
  const last = lines[lines.length - 1];
  if (last === undefined)
  {
    insertTagLine(draft, `<jabsConfig:${word}>`);
    return;
  }

  const [ , before, , after ] = pattern.exec(String(draft.list[last].parameters[0])) as RegExpExecArray;
  draft.setText(last, `${before}${word}${after}`);
};

/**
 * A set row's lines: the whole lines naming one of its words, each with its word second, and every word of the set in
 * J-ABS's spelling and order.
 */
type WordSet = {
  readonly patterns: readonly RegExp[];
  readonly order: readonly string[];

  /**
   * The tag a new line is written with.
   */
  readonly tag: string;
};

/**
 * The AI traits' lines: J-ABS's eight traits, never the two older roles written as traits.
 */
const TRAIT_SET: WordSet = { patterns: [ wordLine('aiTrait', TRAITS) ], order: TRAITS, tag: 'aiTrait' };

/**
 * The AI roles' lines: J-ABS's six roles, and the two of them still read when written the older way, as AI traits.
 */
const ROLE_SET: WordSet = { patterns: [ wordLine('aiRole', ROLES), wordLine('aiTrait', LEGACY_ROLES) ], order: ROLES, tag: 'aiRole' };

/**
 * Reads the word a set's line names, in J-ABS's spelling, or null for a line naming none of its words.
 * @param {WordSet} set The set.
 * @param {string} text The line.
 * @returns {string | null} The word, or null.
 */
const wordOfLine = (set: WordSet, text: string): string | null =>
{
  const match = set.patterns.map(pattern => pattern.exec(text)).find(found => found !== null) ?? null;
  return match === null
    ? null
    : set.order.find(word => word.toLowerCase() === match[2].toLowerCase()) ?? null;
};

/**
 * Gives a set row its words: every line naming a word left out goes, and a line for each word given that the page does
 * not name yet comes in, in J-ABS's order; none at all takes every line out, as a page can never say it has none.
 * @param {ListDraft} draft The list.
 * @param {WordSet} set The set.
 * @param {readonly string[] | null} value The words, or null to take them out.
 */
const setWords = (draft: ListDraft, set: WordSet, value: readonly string[] | null): void =>
{
  const wanted = value ?? [];
  const lines = (): { index: number; word: string }[] => parsableCommentLines({ list: draft.list } as RmmzEventPage).flatMap(line =>
  {
    const word = wordOfLine(set, line.text);
    return word === null ? [] : [ { index: line.listIndex, word } ];
  });
  draft.removeAll(lines().filter(line => wanted.includes(line.word) === false).map(line => line.index));

  const named = lines().map(line => line.word);
  set.order.filter(word => wanted.includes(word) && named.includes(word) === false)
    .forEach(word => insertTagLine(draft, `<${set.tag}:${word}>`));
};

/**
 * Gives the page its passive states: written over the first passive line's list, every later passive line taken out,
 * or a new line when the page has none; none at all takes every passive line out.
 * @param {ListDraft} draft The list.
 * @param {readonly number[] | null} value The states, or null to take them out.
 */
const setPassives = (draft: ListDraft, value: readonly number[] | null): void =>
{
  const lines = linesMatching(draft.list, PASSIVE_LINE);
  if (value === null || value.length === 0)
  {
    draft.removeAll(lines);
    return;
  }

  const [ first, ...rest ] = lines;
  if (first === undefined)
  {
    insertTagLine(draft, `<passive:[${value.join(',')}]>`);
    return;
  }

  // the list is written with the separator the line already writes, the game's own habit when it writes none.
  const [ , before, list, after ] = PASSIVE_LINE.exec(String(draft.list[first].parameters[0])) as RegExpExecArray;
  const separator = list.includes(', ') ? ', ' : ',';
  draft.removeAll(rest);
  draft.setText(first, `${before}[${value.join(separator)}]${after}`);
};

/**
 * Changes one motion line: written anew in place, taken out, or a new one put in after the page's last motion line, or
 * where new tag lines go when the page has none.
 * @param {ListDraft} draft The list.
 * @param {RmmzEventPage} page The page the list belongs to.
 * @param {number | null} motion Which motion line, by its place among the page's, or null to add one.
 * @param {MotionValue | null} value What it should say, or null to take it out.
 * @param {BattlerContext} context The project's motion defaults.
 */
const setMotion = (draft: ListDraft, page: RmmzEventPage, motion: number | null, value: MotionValue | null, context: BattlerContext): void =>
{
  const lines = motionLinesOf(draft.pageOf(page));
  if (motion === null)
  {
    const text = writtenMotionLine(null, value ?? { type: FIRST_MOTION, values: [], sync: false }, context.motionDefaults);
    const last = lines[lines.length - 1];
    if (last === undefined)
    {
      insertTagLine(draft, text);
      return;
    }

    draft.insert(last.listIndex + 1, text, draft.list[last.listIndex].indent);
    return;
  }

  const line = lines[motion];
  if (line === undefined || MOTION_LINE.test(line.text) === false)
  {
    throw new Error(MOTION_GONE);
  }

  if (value === null)
  {
    draft.remove(line.listIndex);
    return;
  }

  draft.setText(line.listIndex, writtenMotionLine(line.text, value, context.motionDefaults));
};

/**
 * Reads what a page's own tags set, row by row, as the game reads them: every value the page gives, without the enemy's.
 * @param {RmmzEventPage} page The page.
 * @param {BattlerContext} context The enemies and defaults.
 * @returns {Record<string, JsonValue>} What each row reads from the page.
 */
const pageSide = (page: RmmzEventPage, context: BattlerContext): Record<string, JsonValue> =>
{
  const reading = readBattlerPage(page, context.enemyOf, context.defaults) as BattlerReading;
  const motions = motionLinesOf(page).map(line => ({ type: line.type, values: [ ...line.values ], sync: line.sync }));
  return {
    enemy: reading.enemyId,
    level: reading.level.event,
    moveSpeed: reading.moveSpeed.event,
    sight: reading.sight.event,
    pursuit: reading.pursuit.event,
    alertedSightBoost: reading.alertedSightBoost.event,
    alertedPursuitBoost: reading.alertedPursuitBoost.event,
    alertDuration: reading.alertDuration.event,
    aiTraits: reading.aiTraits.event === null ? null : [ ...reading.aiTraits.event ],
    aiRoles: reading.aiRoles.event === null ? null : [ ...reading.aiRoles.event ],
    inanimate: reading.inanimate.event,
    team: reading.team.event,
    idle: reading.idle.event,
    hpBar: reading.hpBar.event,
    name: reading.name.event,
    passives: [ ...reading.passives.event ],
    motion: motions,
  };
};

/**
 * Lists every command of a list but the comment lines a row's change may write, comment lines by their text alone, so a
 * comment's first line handing its place to the next reads as nothing moving.
 * @param {readonly RmmzEventCommand[]} list The list.
 * @param {(text: string) => boolean} owned Whether a comment line is one the change may write.
 * @returns {JsonValue[]} The commands left.
 */
const untouched = (list: readonly RmmzEventCommand[], owned: (text: string) => boolean): JsonValue[] =>
{
  return list.flatMap((command): JsonValue[] =>
  {
    const [ text ] = command.parameters;
    const comment = command.code === COMMENT_FIRST || command.code === COMMENT_NEXT;
    if (comment && typeof text === 'string')
    {
      return owned(text) ? [] : [ [ 'comment', command.indent, text ] ];
    }

    return [ command as unknown as JsonValue ];
  });
};

/**
 * The whole line of the tag a change writes, for every change but a set's, whose lines take more than one pattern.
 * @param {Exclude<BattlerChange, { row: 'aiTraits' | 'aiRoles' }>} change The change.
 * @returns {RegExp} The pattern.
 */
const linePatternOf = (change: Exclude<BattlerChange, { row: 'aiTraits' | 'aiRoles' }>): RegExp =>
{
  switch (change.row)
  {
    case 'enemy':
      return jabsTag('enemyId').pattern;
    case 'team':
      return jabsTag('teamId').pattern;
    case 'inanimate':
    case 'idle':
    case 'hpBar':
    case 'name':
      return wordLine('jabsConfig', SWITCH_WORDS[change.row]);
    case 'passives':
      return PASSIVE_LINE;
    case 'motion':
      return MOTION_LINE;
    default:
      return numberTag(change.row).pattern;
  }
};

/**
 * Says which comment lines a row's change may write: its own tag's lines, and nothing else.
 * @param {BattlerChange} change The change.
 * @returns {(text: string) => boolean} Whether a line is one of them.
 */
const ownedBy = (change: BattlerChange): ((text: string) => boolean) =>
{
  switch (change.row)
  {
    case 'aiTraits':
      return text => wordOfLine(TRAIT_SET, text) !== null;
    case 'aiRoles':
      return text => wordOfLine(ROLE_SET, text) !== null;
    default:
    {
      const pattern = linePatternOf(change);
      return text => pattern.test(text);
    }
  }
};

/**
 * Says what the changed row should read from the page once changed, as the page side reads it.
 * @param {BattlerChange} change The change.
 * @returns {JsonValue | undefined} What it should read, or undefined for a motion change, which its own writer checks.
 */
const meantOf = (change: BattlerChange): JsonValue | undefined =>
{
  switch (change.row)
  {
    case 'motion':
      return undefined;
    case 'aiTraits':
      return change.value === null || change.value.length === 0 ? null : TRAITS.filter(trait => (change.value as readonly string[]).includes(trait));
    case 'aiRoles':
      return change.value === null || change.value.length === 0 ? null : ROLES.filter(role => (change.value as readonly string[]).includes(role));
    case 'passives':
      return change.value === null ? [] : [ ...change.value ];
    default:
      return change.value;
  }
};

/**
 * Holds a changed page to the light panel's rule: every other command stays exactly as it was, every other row reads from
 * the page as it did, and the changed row reads as the change meant.
 * @param {RmmzEventPage} before The page as it was.
 * @param {RmmzEventPage} after The page as it would be written.
 * @param {BattlerChange} change The change.
 * @param {BattlerContext} context The enemies and defaults.
 * @throws {Error} When anything else would read differently, or the row would not read as meant.
 */
const checkChange = (before: RmmzEventPage, after: RmmzEventPage, change: BattlerChange, context: BattlerContext): void =>
{
  const owned = ownedBy(change);
  const was = pageSide(before, context);
  const now = pageSide(after, context);
  const othersSame = jsonEquals(untouched(before.list, owned), untouched(after.list, owned))
    && Object.keys(was).every(row => row === change.row || jsonEquals(was[row], now[row]));
  if (othersSame === false)
  {
    throw new Error(OTHERS_MISREAD);
  }

  const meant = meantOf(change);
  if (meant !== undefined && jsonEquals(now[change.row], meant) === false)
  {
    throw new Error(MISREAD);
  }
};

/**
 * Works out the edits one change makes to a battler's page, written in place under the light panel's rule: a value
 * written over the line the game reads, a new line put at the end of the comment holding the enemy, and a value taken out
 * by taking out every line of its tag, so the enemy's applies. Every other command of the page stays exactly as it was,
 * and a change that would have the game read any other tag differently, or this one otherwise than meant, is refused.
 * @param {RmmzEventPage} page The page, as it stands.
 * @param {number} pageIndex Its place in its event.
 * @param {BattlerChange} change The change.
 * @param {BattlerContext} context The enemies, J-ABS's defaults and the project's motion defaults.
 * @returns {EventEdit[]} The edits, addressed inside the event; none when the page already reads as asked.
 * @throws {Error} When the change cannot be made; the message says why, for the author.
 */
const planBattlerChange = (page: RmmzEventPage, pageIndex: number, change: BattlerChange, context: BattlerContext): EventEdit[] =>
{
  if (pageEnemyId(page) === null)
  {
    throw new Error(NO_ENEMY);
  }

  const draft = new ListDraft(page, pageIndex);
  switch (change.row)
  {
    case 'enemy':
    case 'team':
      setNumber(draft, change.row, change.value);
      break;
    case 'inanimate':
    case 'idle':
    case 'hpBar':
    case 'name':
      setSwitch(draft, change.row, change.value);
      break;
    case 'aiTraits':
      setWords(draft, TRAIT_SET, change.value);
      break;
    case 'aiRoles':
      setWords(draft, ROLE_SET, change.value);
      break;
    case 'passives':
      setPassives(draft, change.value);
      break;
    case 'motion':
      setMotion(draft, page, change.motion, change.value, context);
      break;
    default:
      setNumber(draft, change.row, change.value);
      break;
  }

  checkChange(page, draft.pageOf(page), change, context);
  return draft.edits;
};

export { planBattlerChange, SWITCH_WORDS };
export type { BattlerChange, BattlerContext, NumberRow, SwitchRow };
