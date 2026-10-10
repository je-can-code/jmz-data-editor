import type { PluginsJsEntry } from '../../../services/plugins/PluginsJsReader.ts';
import { parsableCommentLines } from '../../core/blueprints/blueprintFields.ts';
import type { RmmzEventPage } from '../../core/model/rmmzTypes.ts';

/**
 * One row of Enemies.json, as much of it as a battler reads: its id, its name, and the note J-ABS reads its battler tags
 * from.
 */
type EnemyRecord = {
  readonly id: number;
  readonly name: string;
  readonly note: string;
};

/**
 * Where the value a battler fights with comes from: the event's own page, the enemy's database note, J-ABS's own default
 * for every enemy, the page's own move speed (for a move speed the page's tags leave alone), or being inanimate, which
 * forces the neutral team and hides the HP bar, the name and idling.
 */
type BattlerSource = 'event' | 'enemy' | 'default' | 'page' | 'inanimate';

/**
 * One value a battler fights with, as J-ABS works it out (Game_Event#parseEnemyComments): what the event's page sets,
 * what the enemy's note sets, the value that wins, and where it came from.
 */
type BattlerValue<T> = {
  /**
   * What the page's own tag gives, as the game reads it, or null when the page sets none.
   */
  readonly event: T | null;

  /**
   * What the enemy's database note gives, as the game reads it, or null when the note sets none.
   */
  readonly enemy: T | null;

  /**
   * The value the battler fights with.
   */
  readonly value: T;

  /**
   * Where that value came from.
   */
  readonly from: BattlerSource;
};

/**
 * The passive states a battler starts with: the enemy's own, from its note, and those its page adds to them, every one
 * of both applying (J-Passive-Affix gives the battler its page's on top of its enemy's).
 */
type BattlerPassives = {
  readonly event: readonly number[];
  readonly enemy: readonly number[];
  readonly value: readonly number[];
};

/**
 * J-ABS's fallbacks for every enemy whose page and note say nothing: its Default Enemy parameters, read as J-ABS reads
 * them, a number with Number and a switch as true only when written true.
 */
type JabsDefaults = {
  readonly sight: number;
  readonly pursuit: number;
  readonly alertedSightBoost: number;
  readonly alertedPursuitBoost: number;
  readonly alertDuration: number;
  readonly canIdle: boolean;
  readonly showHpBar: boolean;
  readonly showName: boolean;
  readonly inanimate: boolean;
};

/**
 * Everything one battler page makes of its battler, value by value, as J-ABS builds it from the page and the enemy.
 */
type BattlerReading = {
  /**
   * The enemy it fights as, from the page's last enemy tag.
   */
  readonly enemyId: number;

  /**
   * That enemy's row, or null when the database holds no enemy by that id.
   */
  readonly enemy: EnemyRecord | null;

  /**
   * Its level, as J-LevelMaster reads it: the page's own replaces the enemy's.
   */
  readonly level: BattlerValue<number>;

  /**
   * How fast it moves: the page's tag, or else the page's own move speed; the database has no say.
   */
  readonly moveSpeed: BattlerValue<number>;

  readonly sight: BattlerValue<number>;
  readonly pursuit: BattlerValue<number>;
  readonly alertedSightBoost: BattlerValue<number>;
  readonly alertedPursuitBoost: BattlerValue<number>;

  /**
   * How long it stays alerted, in frames.
   */
  readonly alertDuration: BattlerValue<number>;

  /**
   * Its AI traits: the page's set replaces the enemy's whole, never value by value.
   */
  readonly aiTraits: BattlerValue<readonly string[]>;

  /**
   * Its AI roles: the page's set, or none at all. The enemy's note names roles too, but the game never hands them to a
   * battler on the map, so they are kept here only to say so.
   */
  readonly aiRoles: BattlerValue<readonly string[]>;

  readonly inanimate: BattlerValue<boolean>;

  /**
   * Its team: 0 the player's allies, 1 the enemies, 2 neither; always 2 while inanimate.
   */
  readonly team: BattlerValue<number>;

  readonly idle: BattlerValue<boolean>;
  readonly hpBar: BattlerValue<boolean>;
  readonly name: BattlerValue<boolean>;
  readonly passives: BattlerPassives;
};

/**
 * The teams J-ABS numbers (JABS_Battler.allyTeamId and the rest).
 */
const TEAMS = { allies: 0, enemies: 1, neutral: 2 } as const;

/**
 * J-ABS's own defaults for its Default Enemy parameters, as its plugin header gives them: what a js/plugins.js written
 * before a parameter existed falls back to, since MZ writes each parameter's default into the file as the plugin is
 * added.
 */
const HEADER_DEFAULTS: Readonly<Record<string, string>> = {
  defaultEnemySightRange: '4',
  defaultEnemyPursuitRange: '6',
  defaultEnemyAlertedSightBoost: '2',
  defaultEnemyAlertedPursuitBoost: '4',
  defaultEnemyAlertDuration: '300',
  defaultEnemyCanIdle: 'true',
  defaultEnemyShowHpBar: 'true',
  defaultEnemyShowBattlerName: 'true',
  defaultEnemyIsInanimate: 'false',
};

/**
 * J-ABS's battler tags, each copied from J.ABS.RegExp: the enemy's id, its team (the one pattern among them minding the
 * case), its senses, its move speed and its alert values. J-ABS reads each with exec on every comment line J-Base offers
 * it, and RPGManager reads each off an enemy's note the same way, line by line.
 */
const JABS_PATTERNS = {
  enemyId: /<enemyId:[ ]?(\d+)>/i,
  teamId: /<teamId:[ ]?(\d+)>/,
  sight: /<sight:[ ]?((0|([1-9][0-9]*))(\.[0-9]+)?)>/i,
  pursuit: /<pursuit:[ ]?((0|([1-9][0-9]*))(\.[0-9]+)?)>/i,
  moveSpeed: /<moveSpeed:[ ]?((0|([1-9][0-9]*))(\.[0-9]+)?)>/i,
  alertDuration: /<alertDuration:[ ]?(\d+)>/i,
  alertedSightBoost: /<alertedSightBoost:[ ]?((0|([1-9][0-9]*))(\.[0-9]+)?)>/i,
  alertedPursuitBoost: /<alertedPursuitBoost:[ ]?((0|([1-9][0-9]*))(\.[0-9]+)?)>/i,
} as const;

/**
 * J-LevelMaster's level tag, copied from J.LEVEL.RegExp.Level: three spellings, and a sign before the digits.
 *
 * <pre>
 * Structure:
 *  <level:LEVEL>
 *  <lv:LEVEL>
 *  <lvl:LEVEL>
 *
 * Example:
 *  <level:12>
 *
 * Translation:
 *  This battler is level 12, whatever its enemy's note says.
 * </pre>
 */
const LEVEL_PATTERN = /<(?:lv|lvl|level):[ ]?(-?\+?\d+)>/i;

/**
 * J-Passive's passive tag, copied from J.PASSIVE.RegExp.PassiveStateIds less its global flag, which both of its readers
 * neutralise: a page's reader resets it before each line, and RPGManager scans a note with a copy holding none.
 *
 * <pre>
 * Structure:
 *  <passive:[STATE_IDS]>
 *
 * Example:
 *  <passive:[371]>
 *
 * Translation:
 *  This battler also carries passive state 371.
 * </pre>
 */
const PASSIVE_PATTERN = /<passive:[ ]?(\[[\d, ]+])>/i;

/**
 * The AI traits J-ABS reads, in the order its readers check them (JABS_EnemyAI's eight).
 */
const TRAITS: readonly string[] = [ 'careful', 'executor', 'reckless', 'healer', 'cleanser', 'buffer', 'tactical', 'berserker' ];

/**
 * The AI roles J-ABS reads, in the order its readers check them (JABS_BattlerRole's six).
 */
const ROLES: readonly string[] = [ 'leader', 'follower', 'guardian', 'ward', 'solo', 'sentinel' ];

/**
 * The two roles J-ABS still reads written as AI traits, the older way of writing them.
 */
const LEGACY_ROLES: readonly string[] = [ 'leader', 'follower' ];

/**
 * Every word tag's pattern built so far, by tag and word: a map's battlers read the same few dozen thousands of times.
 */
const WORD_PATTERNS = new Map<string, RegExp>();

/**
 * Builds the pattern of one of J-ABS's word tags, as J.ABS.RegExp writes each of them: {@code <aiTrait:careful>} and the
 * rest, in any case, one space allowed after the colon. It holds no global flag, so one pattern serves every read.
 * @param {string} tag The tag: aiTrait, aiRole or jabsConfig.
 * @param {string} word The word.
 * @returns {RegExp} The pattern.
 */
const wordPattern = (tag: string, word: string): RegExp =>
{
  const key = `${tag}:${word}`;
  const known = WORD_PATTERNS.get(key);
  if (known !== undefined)
  {
    return known;
  }

  const pattern = new RegExp(`<${tag}:[ ]?${word}>`, 'i');
  WORD_PATTERNS.set(key, pattern);
  return pattern;
};

/**
 * Reads J-ABS's Default Enemy parameters from its entry in js/plugins.js, each as J-ABS's metadata reads it: a number
 * with Number, a switch as true only when written true. A parameter the file lacks takes the plugin header's default.
 * @param {PluginsJsEntry | undefined} plugin J-ABS, as js/plugins.js lists it, or undefined for none.
 * @returns {JabsDefaults} The defaults.
 */
const jabsDefaultsOf = (plugin: PluginsJsEntry | undefined): JabsDefaults =>
{
  const parameters = plugin === undefined ? {} : plugin.parameters;
  const text = (key: string): string => parameters[key] ?? HEADER_DEFAULTS[key];
  return {
    sight: Number(text('defaultEnemySightRange')),
    pursuit: Number(text('defaultEnemyPursuitRange')),
    alertedSightBoost: Number(text('defaultEnemyAlertedSightBoost')),
    alertedPursuitBoost: Number(text('defaultEnemyAlertedPursuitBoost')),
    alertDuration: Number(text('defaultEnemyAlertDuration')),
    canIdle: text('defaultEnemyCanIdle') === 'true',
    showHpBar: text('defaultEnemyShowHpBar') === 'true',
    showName: text('defaultEnemyShowBattlerName') === 'true',
    inanimate: text('defaultEnemyIsInanimate') === 'true',
  };
};

/**
 * One comment line J-Base offers a plugin from a page, with its tag in lowercase: what follows its opening bracket, up to
 * its first colon or its close.
 */
type TaggedLine = {
  readonly tag: string;
  readonly text: string;
};

/**
 * A comment line's tag: what follows its opening bracket, up to its first colon or its close.
 */
const TAG_NAME = /^<([^:>]*)/u;

/**
 * Lists the comment lines J-Base offers a plugin from a page (Game_Event#getValidCommentCommands), every comment line
 * that is one tag filling it, in order, each with its tag. A line is one tag from its opening bracket to its close, so
 * only a line of a tag can match that tag's pattern, and each pattern need only be tried on its own tag's lines.
 * @param {RmmzEventPage} page The page.
 * @returns {TaggedLine[]} The lines.
 */
const taggedLines = (page: RmmzEventPage): TaggedLine[] =>
{
  return parsableCommentLines(page).map(({ text }) =>
  {
    const [ , tag ] = TAG_NAME.exec(text) as RegExpExecArray;
    return { tag: tag.toLowerCase(), text };
  });
};

/**
 * Picks the lines of some tags out of a page's lines, in the order written.
 * @param {readonly TaggedLine[]} lines The page's lines.
 * @param {readonly string[]} tags The tags, in lowercase.
 * @returns {string[]} Their lines' text.
 */
const linesTagged = (lines: readonly TaggedLine[], ...tags: readonly string[]): string[] =>
{
  return lines.filter(line => tags.includes(line.tag)).map(line => line.text);
};

/**
 * Finds the last line a pattern matches and hands back its first capture, as each of J-ABS's page readers keeps the last.
 * @param {readonly string[]} lines The lines.
 * @param {RegExp} pattern The pattern, which holds no global flag.
 * @returns {string | null} The capture, or null when no line matches.
 */
const lastCapture = (lines: readonly string[], pattern: RegExp): string | null =>
{
  let found: string | null = null;
  lines.forEach(line =>
  {
    const match = pattern.exec(line);
    if (match !== null)
    {
      [ , found ] = match;
    }
  });

  return found;
};

/**
 * Reads a whole number off a page as J-ABS's page readers do, with parseInt: a sight written 3.5 is a sight of 3.
 * @param {readonly string[]} lines The page's offered lines.
 * @param {RegExp} pattern The tag.
 * @returns {number | null} The number, or null when the page sets none.
 */
const pageWhole = (lines: readonly string[], pattern: RegExp): number | null =>
{
  const capture = lastCapture(lines, pattern);
  return capture === null
    ? null
    : Number.parseInt(capture, 10);
};

/**
 * Reads a number off a page as J-ABS reads a move speed or an alerted pursuit boost there, with parseFloat.
 * @param {readonly string[]} lines The page's offered lines.
 * @param {RegExp} pattern The tag.
 * @returns {number | null} The number, or null when the page sets none.
 */
const pageFraction = (lines: readonly string[], pattern: RegExp): number | null =>
{
  const capture = lastCapture(lines, pattern);
  return capture === null
    ? null
    : Number.parseFloat(capture);
};

/**
 * Reads a page's level as J-LevelMaster reads it (Game_Event#getLevelOverrides), with parseInt. A level its pattern
 * takes and parseInt cannot read, written with both a minus and a plus, is no level.
 * @param {readonly string[]} lines The page's offered lines.
 * @returns {number | null} The level, or null when the page sets none.
 */
const pageLevel = (lines: readonly string[]): number | null =>
{
  const capture = lastCapture(lines, LEVEL_PATTERN);
  const level = capture === null ? Number.NaN : Number.parseInt(capture, 10);
  return Number.isNaN(level)
    ? null
    : level;
};

/**
 * Reads one of a page's switches as J-ABS's page readers do: each line naming either word sets it, the later line
 * winning, and within a line the second word checked winning, as the readers check them in that order.
 * @param {readonly string[]} lines The page's offered lines.
 * @param {string} off The word that turns it off, such as noIdle.
 * @param {string} on The word that turns it on, such as canIdle.
 * @returns {boolean | null} The switch, or null when the page names neither.
 */
const pageSwitch = (lines: readonly string[], off: string, on: string): boolean | null =>
{
  const offPattern = wordPattern('jabsConfig', off);
  const onPattern = wordPattern('jabsConfig', on);
  let value: boolean | null = null;
  lines.forEach(line =>
  {
    if (offPattern.test(line))
    {
      value = false;
    }

    if (onPattern.test(line))
    {
      value = true;
    }
  });

  return value;
};

/**
 * Reads the AI traits a page names (Game_Event#getBattlerAiOverrides): the set of every trait any line names, or null
 * when the page names none, which leaves the enemy's own.
 * @param {readonly string[]} lines The page's offered lines.
 * @returns {string[] | null} The traits, in J-ABS's order, or null.
 */
const pageTraits = (lines: readonly string[]): string[] | null =>
{
  const named = TRAITS.filter(trait => lines.some(line => wordPattern('aiTrait', trait).test(line)));
  return named.length === 0
    ? null
    : named;
};

/**
 * Reads the AI roles a page names (Game_Event#getBattlerRoleOverrides): the set of every role any line names, as an AI
 * role or as one of the two older AI traits, or null when the page names none, which leaves the enemy's own.
 * @param {readonly string[]} lines The page's offered lines.
 * @returns {string[] | null} The roles, in J-ABS's order, or null.
 */
const pageRoles = (lines: readonly string[]): string[] | null =>
{
  const named = ROLES.filter(role =>
  {
    const legacy = LEGACY_ROLES.includes(role) ? [ wordPattern('aiTrait', role) ] : [];
    const patterns = [ wordPattern('aiRole', role), ...legacy ];
    return lines.some(line => patterns.some(pattern => pattern.test(line)));
  });
  return named.length === 0
    ? null
    : named;
};

/**
 * Reads the passive states a page adds (Game_Event#getPassiveStateIds): every id of every passive line, in order,
 * repeats kept, since each one adds a stack.
 * @param {readonly string[]} lines The page's offered lines.
 * @returns {number[]} The ids; none when the page lists none.
 */
const pagePassives = (lines: readonly string[]): number[] =>
{
  return lines.flatMap(line =>
  {
    const match = PASSIVE_PATTERN.exec(line);
    return match === null
      ? []
      : JSON.parse(match[1]) as number[];
  });
};

/**
 * Splits a note into lines as RPGManager does, on any run of line breaks.
 * @param {string} note The note.
 * @returns {string[]} The lines.
 */
const noteLines = (note: string): string[] =>
{
  return note.split(/[\r\n]+/u);
};

/**
 * Reads a number off an enemy's note as RPGManager#getNumberFromNoteByRegex does: the last line holding the tag
 * anywhere wins, read with parseFloat.
 * @param {string} note The note.
 * @param {RegExp} pattern The tag.
 * @returns {number | null} The number, or null when the note sets none.
 */
const noteNumber = (note: string, pattern: RegExp): number | null =>
{
  const capture = lastCapture(noteLines(note), pattern);
  return capture === null
    ? null
    : Number.parseFloat(capture);
};

/**
 * Reads whether an enemy's note holds a tag as RPGManager#checkForBooleanFromNoteByRegex does with null for none: true
 * when any line holds it, null when none does.
 * @param {string} note The note.
 * @param {RegExp} pattern The tag.
 * @returns {true | null} True, or null.
 */
const noteHas = (note: string, pattern: RegExp): true | null =>
{
  return noteLines(note).some(line => pattern.test(line))
    ? true
    : null;
};

/**
 * Reads one of an enemy's switches as J-ABS's Game_Enemy readers do: its on-word wins over its off-word wherever each
 * sits in the note, and a note naming neither says nothing.
 * @param {string} note The note.
 * @param {string} off The word that turns it off, such as noIdle.
 * @param {string} on The word that turns it on, such as canIdle.
 * @returns {boolean | null} The switch, or null when the note names neither.
 */
const noteSwitch = (note: string, off: string, on: string): boolean | null =>
{
  if (noteHas(note, wordPattern('jabsConfig', on)) !== null)
  {
    return true;
  }

  return noteHas(note, wordPattern('jabsConfig', off)) === null
    ? null
    : false;
};

/**
 * Reads the passive states an enemy's note gives it, as J-Passive reads them (RPG_BaseBattler#passiveStateIds, through
 * RPGManager#getNumbersFromNoteByRegex): the list of the last passive line alone.
 * @param {string} note The note.
 * @returns {number[]} The ids; none when the note lists none.
 */
const notePassives = (note: string): number[] =>
{
  const capture = lastCapture(noteLines(note), PASSIVE_PATTERN);
  return capture === null
    ? []
    : capture.slice(1, -1).split(/, |,/u).map(Number.parseFloat).filter(id => Number.isNaN(id) === false);
};

/**
 * What an enemy's note says of its battlers, each value as the game reads it off the note, or null where the note says
 * nothing; J-ABS's defaults are left to whoever reads it.
 */
type EnemyNote = {
  readonly team: number | null;
  readonly sight: number | null;
  readonly pursuit: number | null;
  readonly alertedSightBoost: number | null;
  readonly alertedPursuitBoost: number | null;
  readonly alertDuration: number | null;
  readonly level: number | null;
  readonly inanimate: boolean | null;
  readonly idle: boolean | null;
  readonly hpBar: boolean | null;
  readonly name: boolean | null;
  readonly traits: readonly string[];
  readonly roles: readonly string[];
  readonly passives: readonly number[];
};

/**
 * Every enemy note read so far, by its text: the same few hundred notes stand behind every battler on every map.
 */
const ENEMY_NOTES = new Map<string, EnemyNote>();

/**
 * Reads an enemy's note as J-ABS's Game_Enemy and RPG_Enemy readers read it, J-LevelMaster's level and J-Passive's
 * passives beside them, once for each note however many battlers stand for its enemy.
 * @param {string} note The note.
 * @returns {EnemyNote} What it says.
 */
const enemyNoteOf = (note: string): EnemyNote =>
{
  const known = ENEMY_NOTES.get(note);
  if (known !== undefined)
  {
    return known;
  }

  // a team of 0 in the note reads as none at all, since J-ABS takes any falsy team there for the enemies'.
  const team = noteNumber(note, JABS_PATTERNS.teamId);
  const read: EnemyNote = {
    team: team === null || team === 0 ? null : team,
    sight: noteNumber(note, JABS_PATTERNS.sight),
    pursuit: noteNumber(note, JABS_PATTERNS.pursuit),
    alertedSightBoost: noteNumber(note, JABS_PATTERNS.alertedSightBoost),
    alertedPursuitBoost: noteNumber(note, JABS_PATTERNS.alertedPursuitBoost),
    alertDuration: noteNumber(note, JABS_PATTERNS.alertDuration),
    level: noteNumber(note, LEVEL_PATTERN),
    inanimate: noteSwitch(note, 'notInanimate', 'inanimate'),
    idle: noteSwitch(note, 'noIdle', 'canIdle'),
    hpBar: noteSwitch(note, 'noHpBar', 'showHpBar'),
    name: noteSwitch(note, 'noName', 'showName'),
    traits: TRAITS.filter(trait => noteHas(note, wordPattern('aiTrait', trait)) !== null),
    roles: ROLES.filter(role =>
    {
      const legacy = LEGACY_ROLES.includes(role) ? noteHas(note, wordPattern('aiTrait', role)) : null;
      return noteHas(note, wordPattern('aiRole', role)) !== null || legacy !== null;
    }),
    passives: notePassives(note),
  };
  ENEMY_NOTES.set(note, read);
  return read;
};

/**
 * Works out one value the page sets or leaves to the enemy and then to J-ABS's default, as parseEnemyComments does with
 * {@code ??} for each of them.
 * @param {T | null} event What the page sets.
 * @param {T | null} enemy What the enemy's note sets.
 * @param {T} fallback J-ABS's default.
 * @returns {BattlerValue<T>} The value.
 */
const layered = <T>(event: T | null, enemy: T | null, fallback: T): BattlerValue<T> =>
{
  if (event !== null)
  {
    return { event, enemy, value: event, from: 'event' };
  }

  return enemy === null
    ? { event, enemy, value: fallback, from: 'default' }
    : { event, enemy, value: enemy, from: 'enemy' };
};

/**
 * Works out one of the three things being inanimate hides (idling, the HP bar and the name), as parseEnemyComments and
 * the enemy's own reader work it out together: the page's word wins; otherwise the enemy's note, which hides it for an
 * enemy inanimate in the database even when the page says it is not; and a battler inanimate in the end hides it
 * whatever the enemy says, unless its page says otherwise.
 * @param {boolean | null} event What the page says.
 * @param {boolean | null} enemy What the enemy's note says outright.
 * @param {boolean} enemyInanimate Whether the enemy is inanimate in the database.
 * @param {boolean} inanimate Whether the battler is inanimate in the end.
 * @param {boolean} fallback J-ABS's default.
 * @returns {BattlerValue<boolean>} The value.
 */
const hiddenWhenInanimate = (
  event: boolean | null,
  enemy: boolean | null,
  enemyInanimate: boolean,
  inanimate: boolean,
  fallback: boolean,
): BattlerValue<boolean> =>
{
  if (event !== null)
  {
    return { event, enemy, value: event, from: 'event' };
  }

  if (inanimate)
  {
    return { event, enemy, value: false, from: 'inanimate' };
  }

  if (enemy !== null)
  {
    return { event, enemy, value: enemy, from: 'enemy' };
  }

  // an enemy inanimate in its note hides it even once its page makes the battler animate.
  return enemyInanimate
    ? { event, enemy, value: false, from: 'enemy' }
    : { event, enemy, value: fallback, from: 'default' };
};

/**
 * Reads the enemy a page names, as J-ABS finds it (Game_Event#getBattlerIdOverrides): the last enemy tag among the
 * lines J-Base offers.
 * @param {RmmzEventPage} page The page.
 * @returns {number | null} The enemy's id, or null for a page naming none, which is no battler page.
 */
const pageEnemyId = (page: RmmzEventPage): number | null =>
{
  return pageWhole(linesTagged(taggedLines(page), 'enemyid'), JABS_PATTERNS.enemyId);
};

/**
 * Reads the level a page gives its battler, as J-LevelMaster reads it (Game_Event#getLevelOverrides): the last of its
 * level lines, under any of the tag's three names, among the lines J-Base offers.
 * @param {RmmzEventPage} page The page.
 * @returns {number | null} The level, or null for a page giving none, whose battler fights at its enemy's own level.
 */
const pageLevelOf = (page: RmmzEventPage): number | null =>
{
  return pageLevel(linesTagged(taggedLines(page), 'level', 'lv', 'lvl'));
};

/**
 * Reads a battler page as J-ABS builds its battler (Game_Event#parseEnemyComments), with the enemy's note read as
 * J-ABS's Game_Enemy and RPG_Enemy readers read it, J-LevelMaster's level and J-Passive's passives beside them.
 *
 * Value by value, the page wins, then the enemy's note, then J-ABS's default. The AI traits are a set: a page naming any
 * replaces the enemy's whole. The AI roles are the page's alone: the enemy's never reach a battler on the map, since
 * J-ABS asks for them where they are not kept. Being inanimate forces the neutral team and hides the HP bar, the name and
 * idling, unless the page itself says otherwise for one of those. The page's passives add to the enemy's. The level the
 * page gives replaces the enemy's; the move speed the page's tag gives replaces the page's own speed, and the database
 * has no move speed at all.
 * @param {RmmzEventPage} page The page.
 * @param {(enemyId: number) => EnemyRecord | null} enemyOf Finds an enemy's row by id.
 * @param {JabsDefaults} defaults J-ABS's defaults.
 * @returns {BattlerReading | null} The battler, or null for a page naming no enemy.
 */
const readBattlerPage = (page: RmmzEventPage, enemyOf: (enemyId: number) => EnemyRecord | null, defaults: JabsDefaults): BattlerReading | null =>
{
  const lines = taggedLines(page);
  const enemyId = pageWhole(linesTagged(lines, 'enemyid'), JABS_PATTERNS.enemyId);
  if (enemyId === null)
  {
    return null;
  }

  const enemy = enemyOf(enemyId);
  const note = enemyNoteOf(enemy === null ? '' : enemy.note);
  const settings = linesTagged(lines, 'jabsconfig');

  // the enemy's own inanimate state, which hides its HP bar, name and idling even under a page making it animate.
  const inanimate = layered(pageSwitch(settings, 'notInanimate', 'inanimate'), note.inanimate, defaults.inanimate);
  const enemyInanimate = note.inanimate ?? defaults.inanimate;
  const team = layered(pageWhole(linesTagged(lines, 'teamid'), JABS_PATTERNS.teamId), note.team, TEAMS.enemies);
  const eventTraits = pageTraits(linesTagged(lines, 'aitrait'));
  const eventRoles = pageRoles(linesTagged(lines, 'airole', 'aitrait'));
  const eventPassives = pagePassives(linesTagged(lines, 'passive'));
  const eventSpeed = pageFraction(linesTagged(lines, 'movespeed'), JABS_PATTERNS.moveSpeed);

  /**
   * Reads one of the numbers J-ABS layers from the page, the enemy and its default, from the page's lines of its tag.
   * @param {string} tag The tag, in lowercase.
   * @param {RegExp} pattern The tag's pattern.
   * @param {(lines: readonly string[], pattern: RegExp) => number | null} read How J-ABS reads it off the page.
   * @param {number | null} fromNote What the enemy's note gives.
   * @param {number} fallback J-ABS's default.
   * @returns {BattlerValue<number>} The value.
   */
  const number = (tag: string, pattern: RegExp, read: (lines: readonly string[], pattern: RegExp) => number | null, fromNote: number | null, fallback: number): BattlerValue<number> =>
  {
    return layered(read(linesTagged(lines, tag), pattern), fromNote, fallback);
  };

  return {
    enemyId,
    enemy,
    level: layered(pageLevel(linesTagged(lines, 'level', 'lv', 'lvl')), note.level, 0),
    moveSpeed: eventSpeed === null
      ? { event: null, enemy: null, value: page.moveSpeed, from: 'page' }
      : { event: eventSpeed, enemy: null, value: eventSpeed, from: 'event' },
    sight: number('sight', JABS_PATTERNS.sight, pageWhole, note.sight, defaults.sight),
    pursuit: number('pursuit', JABS_PATTERNS.pursuit, pageWhole, note.pursuit, defaults.pursuit),
    alertedSightBoost: number('alertedsightboost', JABS_PATTERNS.alertedSightBoost, pageWhole, note.alertedSightBoost, defaults.alertedSightBoost),
    alertedPursuitBoost: number('alertedpursuitboost', JABS_PATTERNS.alertedPursuitBoost, pageFraction, note.alertedPursuitBoost, defaults.alertedPursuitBoost),
    alertDuration: number('alertduration', JABS_PATTERNS.alertDuration, pageWhole, note.alertDuration, defaults.alertDuration),
    aiTraits: eventTraits === null
      ? { event: null, enemy: note.traits, value: note.traits, from: 'enemy' }
      : { event: eventTraits, enemy: note.traits, value: eventTraits, from: 'event' },
    // parseEnemyComments falls back to enemyBattler.jabsBattlerRole, which only the database row defines and the
    // Game_Enemy it asks lacks, so a battler whose page names no role has none, whatever its enemy's note names.
    aiRoles: eventRoles === null
      ? { event: null, enemy: note.roles, value: [], from: 'default' }
      : { event: eventRoles, enemy: note.roles, value: eventRoles, from: 'event' },
    inanimate,
    team: inanimate.value
      ? { ...team, value: TEAMS.neutral, from: 'inanimate' }
      : team,
    idle: hiddenWhenInanimate(pageSwitch(settings, 'noIdle', 'canIdle'), note.idle, enemyInanimate, inanimate.value, defaults.canIdle),
    hpBar: hiddenWhenInanimate(pageSwitch(settings, 'noHpBar', 'showHpBar'), note.hpBar, enemyInanimate, inanimate.value, defaults.showHpBar),
    name: hiddenWhenInanimate(pageSwitch(settings, 'noName', 'showName'), note.name, enemyInanimate, inanimate.value, defaults.showName),
    passives: { event: eventPassives, enemy: note.passives, value: [ ...note.passives, ...eventPassives ] },
  };
};

export {
  JABS_PATTERNS,
  jabsDefaultsOf,
  LEGACY_ROLES,
  LEVEL_PATTERN,
  PASSIVE_PATTERN,
  pageEnemyId,
  pageLevelOf,
  readBattlerPage,
  ROLES,
  TEAMS,
  TRAITS,
  wordPattern,
};
export type { BattlerPassives, BattlerReading, BattlerSource, BattlerValue, EnemyRecord, JabsDefaults };
