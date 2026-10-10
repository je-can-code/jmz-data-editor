import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { RmmzEventPage, RmmzMap, RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { jabsDefaultsOf, pageEnemyId, readBattlerPage, type EnemyRecord } from '../../../../src/mapEditor/modules/jabs/battlerReading.ts';
import { motionLinesOf } from '../../../../src/mapEditor/modules/jabs/motionTags.ts';
import { pluginBasename, readPluginEntries } from '../../../../src/services/plugins/PluginsJsReader.ts';
import { listMapFiles, locateGameProject, readDataFile } from '../../../support/gameProject.ts';

/*
 * The battler panel's reading held against the game's own, on every battler the game ships: every page of every event
 * whose comments name an enemy, read from the game's map files into memory, a mirror nothing writes back to, beside the
 * game's own Enemies.json and the J-ABS parameters its js/plugins.js sets.
 *
 * The game's reading is worked out here straight from the plugins' source, kept apart from the panel's: J-Base offers a
 * plugin only the comment lines that are one whole tag (J.BASE.RegExp.ParsableComment); J-ABS's Game_Event#parseEnemyComments
 * takes each value from the page's last line holding its tag, else from the enemy through Game_Enemy's readers, which read
 * the note through RPGManager (the last line holding the tag anywhere, numbers with parseFloat), else from J-ABS's Default
 * Enemy parameters; an AI trait or role on the page replaces the enemy's set; inanimate forces the neutral team and hides
 * the HP bar, the name and idling unless the page says otherwise. Two things the plugins really do are kept here as they
 * do them: J-ABS's team pattern carries the global flag, so each page is read as it is first read on a fresh boot; and
 * parseEnemyComments asks the Game_Enemy, not its database row, for the enemy's roles, which only the row knows, so a
 * page naming no role leaves the battler with none. J-LevelMaster's level on the page replaces the enemy's own; J-Passive's
 * passives on the page add to the last passive line of the enemy's note; J-Motion reads every motion line on the page.
 *
 * Every value the panel shows agrees with the game's, and so does what it says the page sets and what it says the enemy
 * supplies.
 *
 * It runs against the project JMZ_PROJECT_ROOT names, or the sibling checkout, and skips when neither is there.
 */
const project = locateGameProject();

/**
 * J-Base's parsable comment, copied from J.BASE.RegExp.ParsableComment.
 */
const PARSABLE = /^<[[\]\w :"',.!?+\-*/\\#~%=();]+>$/i;

/**
 * J-ABS's battler patterns, copied from J.ABS.RegExp, flags and all.
 */
const RX = {
  EnemyId: /<enemyId:[ ]?(\d+)>/i,
  TeamId: /<teamId:[ ]?(\d+)>/g,
  Sight: /<sight:[ ]?((0|([1-9][0-9]*))(\.[0-9]+)?)>/i,
  Pursuit: /<pursuit:[ ]?((0|([1-9][0-9]*))(\.[0-9]+)?)>/i,
  MoveSpeed: /<moveSpeed:[ ]?((0|([1-9][0-9]*))(\.[0-9]+)?)>/i,
  AlertDuration: /<alertDuration:[ ]?(\d+)>/i,
  AlertedSightBoost: /<alertedSightBoost:[ ]?((0|([1-9][0-9]*))(\.[0-9]+)?)>/i,
  AlertedPursuitBoost: /<alertedPursuitBoost:[ ]?((0|([1-9][0-9]*))(\.[0-9]+)?)>/i,
  ConfigNoIdle: /<jabsConfig:[ ]?noIdle>/i,
  ConfigCanIdle: /<jabsConfig:[ ]?canIdle>/i,
  ConfigNoHpBar: /<jabsConfig:[ ]?noHpBar>/i,
  ConfigShowHpBar: /<jabsConfig:[ ]?showHpBar>/i,
  ConfigInanimate: /<jabsConfig:[ ]?inanimate>/i,
  ConfigNotInanimate: /<jabsConfig:[ ]?notInanimate>/i,
  ConfigNoName: /<jabsConfig:[ ]?noName>/i,
  ConfigShowName: /<jabsConfig:[ ]?showName>/i,
};

/**
 * J-ABS's eight AI traits, each with its pattern, copied from J.ABS.RegExp.AiTraitCareful and the rest.
 */
const TRAIT_RX: readonly [ string, RegExp ][] = [ 'careful', 'executor', 'reckless', 'healer', 'cleanser', 'buffer', 'tactical', 'berserker' ]
  .map(word => [ word, new RegExp(`<aiTrait:[ ]?${word}>`, 'i') ]);

/**
 * J-ABS's six AI roles, each with its patterns: J.ABS.RegExp.AiRoleLeader and the rest, and for two of them the older
 * AiTraitLeader and AiTraitFollower.
 */
const ROLE_RX: readonly [ string, RegExp[] ][] = [ 'leader', 'follower', 'guardian', 'ward', 'solo', 'sentinel' ]
  .map(word => [ word, [ new RegExp(`<aiRole:[ ]?${word}>`, 'i'), ...(word === 'leader' || word === 'follower' ? [ new RegExp(`<aiTrait:[ ]?${word}>`, 'i') ] : []) ] ]);

/**
 * J-LevelMaster's level, copied from J.LEVEL.RegExp.Level.
 */
const LEVEL_RX = /<(?:lv|lvl|level):[ ]?(-?\+?\d+)>/i;

/**
 * J-Passive's passive tag, copied from J.PASSIVE.RegExp.PassiveStateIds.
 */
const PASSIVE_RX = /<passive:[ ]?(\[[\d, ]+])>/gi;

/**
 * J-Motion's motion tag, copied from J.MOTION.RegExp.Motion.
 */
const MOTION_RX = /<motion:[ ]?(\[\w+(?:,[ ]?[#\w.-]+)*])>/i;

/**
 * The parameter counts of the motions J-Motion registers, from MotionTypeRegistry.
 */
const MOTION_COUNTS: Readonly<Record<string, number>> = {
  breathe: 2, stretch: 2, pulse: 2, float: 2, sway: 2, swing: 2, spin: 2, ghost: 3, flicker: 3, shake: 3, hop: 3, throb: 5,
  flash: 2, scale: 2, angle: 2, fade: 2, hue: 2, tint: 2,
};

/**
 * J-ABS's Default Enemy parameters, as J-ABS's metadata reads them from js/plugins.js.
 */
type GameDefaults = {
  sight: number;
  pursuit: number;
  alertedSightBoost: number;
  alertedPursuitBoost: number;
  alertDuration: number;
  canIdle: boolean;
  showHpBar: boolean;
  showName: boolean;
  inanimate: boolean;
};

/**
 * Reads J-Base's JsonMapper#parseString, as a tag's list entries are read.
 * @param {string} text The entry.
 * @returns {unknown} The entry, as the game reads it.
 */
const parseString = (text: string): unknown =>
{
  const unquoted = text.length >= 2 && text.startsWith('"') && text.endsWith('"') ? text.slice(1, -1) : text;
  if (unquoted.toLowerCase() === 'true')
  {
    return true;
  }

  if (unquoted.toLowerCase() === 'false')
  {
    return false;
  }

  return Number.isNaN(parseFloat(unquoted)) ? unquoted : parseFloat(unquoted);
};

/**
 * Reads a flat bracketed list as JsonMapper#parseArrayFromString does.
 * @param {string} list The list, brackets included.
 * @returns {unknown[]} The entries.
 */
const parseList = (list: string): unknown[] =>
{
  return list.slice(1, list.length - 1).split(/, |,/).map(parseString);
};

/**
 * RPGManager's readers of a database row's note, each as written in J-Base.
 */
const notes = {
  number: (note: string, structure: RegExp): number | null =>
  {
    const scan = new RegExp(structure.source, structure.flags.replace('g', '').replace('y', ''));
    let val: number | null = null;
    note.split(/[\r\n]+/).forEach(line =>
    {
      const result = scan.exec(line);
      if (result === null)
      {
        return;
      }

      val = parseFloat(result[1]);
    });
    return val;
  },
  bool: (note: string, structure: RegExp): boolean | null =>
  {
    const scan = new RegExp(structure.source, structure.flags.replace('g', '').replace('y', ''));
    let found = false;
    note.split(/[\r\n]+/).forEach(line =>
    {
      if (scan.test(line))
      {
        found = true;
      }
    });
    return found ? true : null;
  },
  array: (note: string, structure: RegExp): unknown[] | null =>
  {
    const scan = new RegExp(structure.source, structure.flags.replace('g', '').replace('y', ''));
    let val: unknown[] | null = null;
    note.split(/[\r\n]+/).forEach(line =>
    {
      if (line.match(structure))
      {
        val = parseList((scan.exec(line) as RegExpExecArray)[1]);
      }
    });
    return val;
  },
};

/**
 * What the game makes of one battler page.
 */
type GameBattler = {
  enemyId: number;
  page: Record<string, unknown>;
  enemy: Record<string, unknown>;
  value: Record<string, unknown>;
  motions: { type: string; values: string[]; sync: boolean }[];
};

/**
 * Keeps the last capture of a pattern among comment lines, as each of Game_Event's override readers does.
 * @param {readonly string[]} comments The comment lines.
 * @param {RegExp} structure The pattern.
 * @param {(text: string) => number} read How the capture is read.
 * @returns {number | null} The last line's, or null when none matches.
 */
const lastOf = (comments: readonly string[], structure: RegExp, read: (text: string) => number): number | null =>
{
  let value: number | null = null;
  comments.forEach(comment =>
  {
    const result = structure.exec(comment);
    if (result !== null)
    {
      value = read(result[1]);
    }
  });
  return value;
};

/**
 * Reads a switch off comment lines as Game_Event's config readers do: the off word, then the on word, line by line.
 * @param {readonly string[]} comments The comment lines.
 * @param {RegExp} off The off word's pattern.
 * @param {RegExp} on The on word's pattern.
 * @returns {boolean | null} The switch, or null when no line names either.
 */
const switchOf = (comments: readonly string[], off: RegExp, on: RegExp): boolean | null =>
{
  let value: boolean | null = null;
  comments.forEach(comment =>
  {
    if (off.test(comment))
    {
      value = false;
    }

    if (on.test(comment))
    {
      value = true;
    }
  });
  return value;
};

/**
 * What a page sets, as Game_Event's override readers read it, each null when it sets none.
 */
type GamePage = {
  team: number | null;
  traits: string[] | null;
  roles: string[] | null;
  sight: number | null;
  alertedSight: number | null;
  pursuit: number | null;
  alertedPursuit: number | null;
  alertDuration: number | null;
  idle: boolean | null;
  hpBar: boolean | null;
  name: boolean | null;
  inanimate: boolean | null;
  speed: number | null;
  level: number | null;
  passives: number[];
};

/**
 * What an enemy's note says, as RPGManager reads it, each null when it says nothing.
 */
type EnemySaid = {
  sight: number | null;
  alertedSight: number | null;
  pursuit: number | null;
  alertedPursuit: number | null;
  alertDuration: number | null;
  traits: string[];
  roles: string[];
  level: number | null;
  passives: number[];
};

/**
 * Reads a page as Game_Event's override readers do, with J-LevelMaster's level, J-Passive's passives and J-Motion's
 * motions beside them.
 * @param {readonly string[]} comments The page's comment lines J-Base offers.
 * @returns {GamePage} What the page sets, each null when it sets none.
 */
const gamePage = (comments: readonly string[]): GamePage =>
{
  // the team's pattern is global, and a fresh boot reads the first page with it from the start of the line.
  RX.TeamId.lastIndex = 0;
  const traits = TRAIT_RX.filter(([ , structure ]) => comments.some(comment => structure.test(comment))).map(([ word ]) => word);
  const roles = ROLE_RX.filter(([ , structures ]) => comments.some(comment => structures.some(structure => structure.test(comment)))).map(([ word ]) => word);
  return {
    team: lastOf(comments, RX.TeamId, text => parseInt(text)),
    traits: traits.length === 0 ? null : traits,
    roles: roles.length === 0 ? null : roles,
    sight: lastOf(comments, RX.Sight, text => parseInt(text)),
    alertedSight: lastOf(comments, RX.AlertedSightBoost, text => parseInt(text)),
    pursuit: lastOf(comments, RX.Pursuit, text => parseInt(text)),
    alertedPursuit: lastOf(comments, RX.AlertedPursuitBoost, text => parseFloat(text)),
    alertDuration: lastOf(comments, RX.AlertDuration, text => parseInt(text)),
    idle: switchOf(comments, RX.ConfigNoIdle, RX.ConfigCanIdle),
    hpBar: switchOf(comments, RX.ConfigNoHpBar, RX.ConfigShowHpBar),
    name: switchOf(comments, RX.ConfigNoName, RX.ConfigShowName),
    inanimate: switchOf(comments, RX.ConfigNotInanimate, RX.ConfigInanimate),
    speed: lastOf(comments, RX.MoveSpeed, text => parseFloat(text)),
    level: lastOf(comments, LEVEL_RX, text => parseInt(text)),
    passives: comments.flatMap(comment =>
    {
      PASSIVE_RX.lastIndex = 0;
      const result = PASSIVE_RX.exec(comment);
      return result === null ? [] : JSON.parse(result[1]) as number[];
    }),
  };
};

/**
 * Reads an enemy's note as Game_Enemy's readers do, through RPGManager, with J-LevelMaster's level and J-Passive's
 * passives beside them.
 * @param {string} note The note.
 * @param {GameDefaults} defaults J-ABS's Default Enemy parameters.
 * @returns {{ said: EnemySaid, team: number, inanimate: boolean, idle: boolean, hpBar: boolean, name: boolean }} What the note says, and what Game_Enemy answers for the team and switches.
 */
const gameEnemy = (note: string, defaults: GameDefaults): { said: EnemySaid; team: number; inanimate: boolean; idle: boolean; hpBar: boolean; name: boolean } =>
{
  const on = notes.bool(note, RX.ConfigInanimate);
  const off = notes.bool(note, RX.ConfigNotInanimate);
  const notOn = off === null ? defaults.inanimate : !off;
  const inanimate = on ?? notOn;
  const enemySwitch = (allow: RegExp, refuse: RegExp, fallback: boolean): boolean =>
  {
    const allowed = notes.bool(note, allow);
    const refused = notes.bool(note, refuse);
    if (allowed !== null)
    {
      return allowed;
    }

    if (refused !== null)
    {
      return !refused;
    }

    return inanimate ? false : fallback;
  };
  const team = notes.number(note, RX.TeamId);
  return {
    said: {
      sight: notes.number(note, RX.Sight),
      alertedSight: notes.number(note, RX.AlertedSightBoost),
      pursuit: notes.number(note, RX.Pursuit),
      alertedPursuit: notes.number(note, RX.AlertedPursuitBoost),
      alertDuration: notes.number(note, RX.AlertDuration),
      traits: TRAIT_RX.filter(([ , structure ]) => notes.bool(note, structure) !== null).map(([ word ]) => word),
      roles: ROLE_RX.filter(([ , structures ]) => structures.some(structure => notes.bool(note, structure) !== null)).map(([ word ]) => word),
      level: notes.number(note, LEVEL_RX),
      passives: (notes.array(note, PASSIVE_RX) ?? []) as number[],
    },
    team: team ? team : 1,
    inanimate,
    idle: enemySwitch(RX.ConfigCanIdle, RX.ConfigNoIdle, defaults.canIdle),
    hpBar: enemySwitch(RX.ConfigShowHpBar, RX.ConfigNoHpBar, defaults.showHpBar),
    name: enemySwitch(RX.ConfigShowName, RX.ConfigNoName, defaults.showName),
  };
};

/**
 * Reads the motions on a page as J-Motion's MotionTagParser#parseComments does, keeping what MotionTypeRegistry knows.
 * @param {readonly string[]} comments The page's comment lines J-Base offers.
 * @returns {{ type: string, values: string[], sync: boolean }[]} The motions.
 */
const gameMotions = (comments: readonly string[]): { type: string; values: string[]; sync: boolean }[] =>
{
  return comments.flatMap(comment =>
  {
    const result = MOTION_RX.exec(comment);
    if (result === null)
    {
      return [];
    }

    const [ type, ...rest ] = result[1].slice(1, -1).split(/, |,/);
    const values = rest.filter(value => parseString(value) !== 'sync');
    const count = MOTION_COUNTS[String(parseString(type))];
    return count === undefined || values.length > count
      ? []
      : [ { type, values, sync: values.length !== rest.length } ];
  });
};

/**
 * Takes a value from the page, else the enemy, else the default, as parseEnemyComments does with each.
 * @param {unknown} page What the page sets.
 * @param {unknown} enemy What the enemy's note sets.
 * @param {unknown} fallback J-ABS's default.
 * @returns {unknown} The value.
 */
const layer = (page: unknown, enemy: unknown, fallback: unknown): unknown =>
{
  return page ?? enemy ?? fallback;
};

/**
 * Builds a battler from a page the way J-ABS, J-LevelMaster, J-Passive and J-Motion do, each as its source reads
 * (Game_Event#parseEnemyComments for J-ABS's part).
 * @param {RmmzEventPage} page The page.
 * @param {(EnemyRecord | null)[]} enemies Enemies.json.
 * @param {GameDefaults} defaults J-ABS's Default Enemy parameters.
 * @returns {GameBattler | null} The battler, or null when the page names no enemy.
 */
const gameBattler = (page: RmmzEventPage, enemies: (EnemyRecord | null)[], defaults: GameDefaults): GameBattler | null =>
{
  const comments = page.list
    .filter(command => (command.code === 108 || command.code === 408) && PARSABLE.test(String(command.parameters[0])))
    .map(command => String(command.parameters[0]));
  if (comments.some(comment => RX.EnemyId.test(comment)) === false)
  {
    return null;
  }

  const enemyId = lastOf(comments, RX.EnemyId, text => parseInt(text)) as number;
  const own = gamePage(comments);
  const enemy = gameEnemy(enemies[enemyId]?.note ?? '', defaults);
  const { said } = enemy;
  const inanimate = own.inanimate ?? enemy.inanimate;
  const hidden = (key: 'idle' | 'hpBar' | 'name'): boolean => (inanimate && own[key] === null ? false : own[key] ?? enemy[key]);
  return {
    enemyId,
    page: own,
    enemy: said,
    value: {
      team: inanimate ? 2 : own.team ?? enemy.team,
      traits: own.traits ?? said.traits,
      roles: own.roles ?? [],
      sight: layer(own.sight, said.sight, defaults.sight),
      alertedSight: layer(own.alertedSight, said.alertedSight, defaults.alertedSightBoost),
      pursuit: layer(own.pursuit, said.pursuit, defaults.pursuit),
      alertedPursuit: layer(own.alertedPursuit, said.alertedPursuit, defaults.alertedPursuitBoost),
      alertDuration: layer(own.alertDuration, said.alertDuration, defaults.alertDuration),
      idle: hidden('idle'),
      hpBar: hidden('hpBar'),
      name: hidden('name'),
      inanimate,
      speed: own.speed ?? page.moveSpeed,
      level: layer(own.level, said.level, 0),
      passives: [ ...said.passives, ...own.passives ],
    },
    motions: gameMotions(comments),
  };
};

/**
 * Reads what the panel shows of the same page, in the game battler's own shape.
 * @param {RmmzEventPage} page The page.
 * @param {(EnemyRecord | null)[]} enemies Enemies.json.
 * @param {ReturnType<typeof jabsDefaultsOf>} defaults J-ABS's defaults, as the panel reads them.
 * @returns {GameBattler | null} What the panel shows.
 */
const panelBattler = (page: RmmzEventPage, enemies: (EnemyRecord | null)[], defaults: ReturnType<typeof jabsDefaultsOf>): GameBattler | null =>
{
  const reading = readBattlerPage(page, enemyId => enemies[enemyId] ?? null, defaults);
  if (reading === null)
  {
    return null;
  }

  const { level, moveSpeed, sight, pursuit, alertedSightBoost, alertedPursuitBoost, alertDuration, aiTraits, aiRoles, inanimate, team, idle, hpBar, name, passives } = reading;
  return {
    enemyId: reading.enemyId,
    page: {
      team: team.event, traits: aiTraits.event, roles: aiRoles.event, sight: sight.event, alertedSight: alertedSightBoost.event,
      pursuit: pursuit.event, alertedPursuit: alertedPursuitBoost.event, alertDuration: alertDuration.event, idle: idle.event,
      hpBar: hpBar.event, name: name.event, inanimate: inanimate.event, speed: moveSpeed.event, level: level.event, passives: passives.event,
    },
    enemy: {
      sight: sight.enemy, alertedSight: alertedSightBoost.enemy, pursuit: pursuit.enemy, alertedPursuit: alertedPursuitBoost.enemy,
      alertDuration: alertDuration.enemy, traits: aiTraits.enemy, roles: aiRoles.enemy, level: level.enemy, passives: passives.enemy,
    },
    value: {
      team: team.value, traits: aiTraits.value, roles: aiRoles.value, sight: sight.value, alertedSight: alertedSightBoost.value,
      pursuit: pursuit.value, alertedPursuit: alertedPursuitBoost.value, alertDuration: alertDuration.value, idle: idle.value,
      hpBar: hpBar.value, name: name.value, inanimate: inanimate.value, speed: moveSpeed.value, level: level.value, passives: passives.value,
    },
    motions: motionLinesOf(page).filter(line => line.known).map(line => ({ type: line.type, values: [ ...line.values ], sync: line.sync })),
  };
};

describe.skipIf(project === null)('the battler panel against the game, on every shipped battler', () =>
{
  const root = project as string;
  const enemies = project === null ? [] : readDataFile(root, 'Enemies.json') as (EnemyRecord | null)[];
  const plugins = project === null ? [] : readPluginEntries(readFileSync(`${root}/js/plugins.js`, 'utf8'));
  const jabs = plugins.find(plugin => pluginBasename(plugin.name) === 'J-ABS');
  const pages = project === null
    ? []
    : listMapFiles(root).flatMap(file =>
    {
      const map = readDataFile(root, file) as RmmzMap;
      return (map.events.filter(event => event !== null) as RmmzMapEvent[])
        .flatMap(event => event.pages.map((page, index) => ({ where: `${file} event ${event.id} page ${index + 1}`, page })))
        .filter(({ page }) => pageEnemyId(page) !== null);
    });

  it('reads every battler page as the game builds its battler, page, enemy and value alike', () =>
  {
    // Arrange: J-ABS's defaults as the game's js/plugins.js sets them, read as J-ABS's metadata reads them.
    const { parameters } = jabs as NonNullable<typeof jabs>;
    const gameDefaults: GameDefaults = {
      sight: Number(parameters['defaultEnemySightRange']),
      pursuit: Number(parameters['defaultEnemyPursuitRange']),
      alertedSightBoost: Number(parameters['defaultEnemyAlertedSightBoost']),
      alertedPursuitBoost: Number(parameters['defaultEnemyAlertedPursuitBoost']),
      alertDuration: Number(parameters['defaultEnemyAlertDuration']),
      canIdle: parameters['defaultEnemyCanIdle'] === 'true',
      showHpBar: parameters['defaultEnemyShowHpBar'] === 'true',
      showName: parameters['defaultEnemyShowBattlerName'] === 'true',
      inanimate: parameters['defaultEnemyIsInanimate'] === 'true',
    };
    const panelDefaults = jabsDefaultsOf(jabs);

    // Act.
    const wrong = pages.flatMap(({ where, page }) =>
    {
      const game = JSON.stringify(gameBattler(page, enemies, gameDefaults));
      const panel = JSON.stringify(panelBattler(page, enemies, panelDefaults));
      return game === panel ? [] : [ `${where}\n game:  ${game}\n panel: ${panel}` ];
    });

    // Assert: thousands of battler pages, every one agreeing, among them pages setting each kind of value themselves.
    const read = pages.map(({ page }) => panelBattler(page, enemies, panelDefaults) as GameBattler);
    const set = (key: string): number => read.filter(battler => battler.page[key] !== null && JSON.stringify(battler.page[key]) !== '[]').length;
    expect([ pages.length > 4500, wrong.slice(0, 5), [ 'team', 'traits', 'sight', 'idle', 'inanimate', 'speed', 'level', 'passives' ].map(set).every(count => count > 0) ])
      .toStrictEqual([ true, [], true ]);
  }, 60_000);
});
