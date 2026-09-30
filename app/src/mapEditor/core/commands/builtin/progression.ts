import type { CommandCatalogEntry, FieldCondition, SentenceParts } from '../catalogTypes.ts';
import { field } from './fieldHelpers.ts';
import { ENEMY_INDEXES, ON_OFF, options, PARTY_INDEXES, SELF_SWITCHES } from './options.ts';
import { clockPhrase } from './phrases.ts';

/**
 * What Control Variables does to the variables.
 */
const VARIABLE_OPERATIONS = options([ [ 0, 'Set' ], [ 1, 'Add' ], [ 2, 'Sub' ], [ 3, 'Mul' ], [ 4, 'Div' ], [ 5, 'Mod' ] ]);

/**
 * The sign each operation reads as in a row.
 */
const OPERATION_SIGNS: readonly string[] = [ '=', '+=', '-=', '*=', '/=', '%=' ];

/**
 * Where Control Variables' value comes from.
 */
const VARIABLE_OPERANDS = options([ [ 0, 'Constant' ], [ 1, 'Variable' ], [ 2, 'Random' ], [ 3, 'Game Data' ], [ 4, 'Script' ] ]);

/**
 * The kinds of game data a variable can read.
 */
const GAME_DATA_TYPES = options([
  [ 0, 'Item' ],
  [ 1, 'Weapon' ],
  [ 2, 'Armor' ],
  [ 3, 'Actor' ],
  [ 4, 'Enemy' ],
  [ 5, 'Character' ],
  [ 6, 'Party' ],
  [ 7, 'Other' ],
  [ 8, 'Last' ],
]);

/**
 * What can be read off an actor.
 */
const ACTOR_DATA = options([
  [ 0, 'Level' ],
  [ 1, 'EXP' ],
  [ 2, 'HP' ],
  [ 3, 'MP' ],
  [ 4, 'Max HP' ],
  [ 5, 'Max MP' ],
  [ 6, 'Attack' ],
  [ 7, 'Defense' ],
  [ 8, 'M.Attack' ],
  [ 9, 'M.Defense' ],
  [ 10, 'Agility' ],
  [ 11, 'Luck' ],
  [ 12, 'TP' ],
]);

/**
 * What can be read off an enemy.
 */
const ENEMY_DATA = options([
  [ 0, 'HP' ],
  [ 1, 'MP' ],
  [ 2, 'Max HP' ],
  [ 3, 'Max MP' ],
  [ 4, 'Attack' ],
  [ 5, 'Defense' ],
  [ 6, 'M.Attack' ],
  [ 7, 'M.Defense' ],
  [ 8, 'Agility' ],
  [ 9, 'Luck' ],
  [ 10, 'TP' ],
]);

/**
 * What can be read off a character on the map.
 */
const CHARACTER_DATA = options([ [ 0, 'Map X' ], [ 1, 'Map Y' ], [ 2, 'Direction' ], [ 3, 'Screen X' ], [ 4, 'Screen Y' ] ]);

/**
 * The other game data a variable can read.
 */
const OTHER_DATA = options([
  [ 0, 'Map ID' ],
  [ 1, 'Party Members' ],
  [ 2, 'Gold' ],
  [ 3, 'Steps' ],
  [ 4, 'Play Time' ],
  [ 5, 'Timer' ],
  [ 6, 'Save Count' ],
  [ 7, 'Battle Count' ],
  [ 8, 'Win Count' ],
  [ 9, 'Escape Count' ],
]);

/**
 * What the last action left behind.
 */
const LAST_DATA = options([
  [ 0, 'Last Used Skill ID' ],
  [ 1, 'Last Used Item ID' ],
  [ 2, 'Last Actor ID to Act' ],
  [ 3, 'Last Enemy Index to Act' ],
  [ 4, 'Last Target Actor ID' ],
  [ 5, 'Last Target Enemy Index' ],
]);

/**
 * Starting or stopping the timer.
 */
const TIMER_OPERATIONS = options([ [ 0, 'Start' ], [ 1, 'Stop' ] ]);

/**
 * Shows a field only for one kind of game data.
 * @param {number} dataType The game data kind.
 * @returns {FieldCondition} The condition.
 */
const whenGameData = (dataType: number): FieldCondition =>
{
  return { all: [ { field: 'operand', equals: 3 }, { field: 'dataType', equals: dataType } ] };
};

/**
 * Says each kind of game data, by its number.
 */
const GAME_DATA_PHRASES: readonly ((parts: SentenceParts) => string)[] = [
  parts => `the number of ${parts.text('dataItem')}`,
  parts => `the number of ${parts.text('dataWeapon')}`,
  parts => `the number of ${parts.text('dataArmor')}`,
  parts => `${parts.text('dataActorValue')} of ${parts.text('dataActor')}`,
  parts => `${parts.text('dataEnemyValue')} of enemy ${parts.text('dataEnemy')}`,
  parts => `${parts.text('dataCharacterValue')} of ${parts.text('dataCharacter')}`,
  parts => `the actor id of party ${parts.text('dataPartyMember')}`,
  parts => parts.text('dataOther'),
  parts => parts.text('dataLast'),
];

/**
 * Says each kind of operand, by its number.
 */
const OPERAND_PHRASES: readonly ((parts: SentenceParts) => string)[] = [
  parts => parts.text('constant'),
  parts => parts.text('source'),
  parts => `random ${parts.text('randomMin')} to ${parts.text('randomMax')}`,
  parts => GAME_DATA_PHRASES[Number(parts.value('dataType'))]?.(parts) ?? parts.text('dataType'),
  parts => `script: ${parts.text('script')}`,
];

/**
 * Says the switches or variables a range covers.
 * @param {SentenceParts} parts The command's parts, with {@code start} and {@code end}.
 * @param {string} one What one of them is called.
 * @param {string} many What several are called.
 * @returns {string} Such as "Switch #0001 Door" or "Switches #0001 Door to #0004 Gate".
 */
const rangePhrase = (parts: SentenceParts, one: string, many: string): string =>
{
  return parts.value('start') === parts.value('end')
    ? `${one} ${parts.text('start')}`
    : `${many} ${parts.text('start')} to ${parts.text('end')}`;
};

/**
 * The Game Progression group: switches, variables, self switches and the timer.
 */
const PROGRESSION_ENTRIES: readonly CommandCatalogEntry[] = [
  {
    id: 'core:121',
    code: 121,
    name: 'Control Switches',
    category: 'Game Progression',
    keywords: [ 'switch', 'flag', 'toggle', 'on', 'off' ],
    fields: [
      field('start', 'Switch', 0, 'switch', { default: 1 }),
      field('end', 'Through', 1, 'switch', { default: 1 }),
      field('value', 'Set to', 2, 'select', { options: ON_OFF, default: 0 }),
    ],
    sentence: parts => `${rangePhrase(parts, 'Switch', 'Switches')} = ${parts.text('value')}`,
    defaultParameters: [ 1, 1, 0 ],
  },
  {
    id: 'core:122',
    code: 122,
    name: 'Control Variables',
    category: 'Game Progression',
    keywords: [ 'variable', 'math', 'number', 'count', 'counter', 'add', 'set', 'random' ],
    fields: [
      field('start', 'Variable', 0, 'variable', { default: 1 }),
      field('end', 'Through', 1, 'variable', { default: 1 }),
      field('operation', 'Operation', 2, 'select', { options: VARIABLE_OPERATIONS, default: 0 }),
      field('operand', 'Operand', 3, 'select', { options: VARIABLE_OPERANDS, default: 0 }),
      field('constant', 'Value', 4, 'number', { default: 0, visibleWhen: { field: 'operand', equals: 0 } }),
      field('source', 'From', 4, 'variable', { default: 1, visibleWhen: { field: 'operand', equals: 1 } }),
      field('randomMin', 'From', 4, 'number', { default: 0, visibleWhen: { field: 'operand', equals: 2 } }),
      field('randomMax', 'To', 5, 'number', { default: 0, visibleWhen: { field: 'operand', equals: 2 } }),
      field('dataType', 'Game data', 4, 'select', { options: GAME_DATA_TYPES, default: 0, visibleWhen: { field: 'operand', equals: 3 } }),
      field('dataItem', 'Item', 5, 'item', { default: 1, visibleWhen: whenGameData(0) }),
      field('dataWeapon', 'Weapon', 5, 'weapon', { default: 1, visibleWhen: whenGameData(1) }),
      field('dataArmor', 'Armor', 5, 'armor', { default: 1, visibleWhen: whenGameData(2) }),
      field('dataActor', 'Actor', 5, 'actor', { default: 1, visibleWhen: whenGameData(3) }),
      field('dataActorValue', 'Value', 6, 'select', { options: ACTOR_DATA, default: 0, visibleWhen: whenGameData(3) }),
      field('dataEnemy', 'Enemy', 5, 'select', { options: ENEMY_INDEXES, default: 0, visibleWhen: whenGameData(4) }),
      field('dataEnemyValue', 'Value', 6, 'select', { options: ENEMY_DATA, default: 0, visibleWhen: whenGameData(4) }),
      field('dataCharacter', 'Character', 5, 'event', { default: -1, visibleWhen: whenGameData(5) }),
      field('dataCharacterValue', 'Value', 6, 'select', { options: CHARACTER_DATA, default: 0, visibleWhen: whenGameData(5) }),
      field('dataPartyMember', 'Member', 5, 'select', { options: PARTY_INDEXES, default: 0, visibleWhen: whenGameData(6) }),
      field('dataOther', 'Value', 5, 'select', { options: OTHER_DATA, default: 0, visibleWhen: whenGameData(7) }),
      field('dataLast', 'Value', 5, 'select', { options: LAST_DATA, default: 0, visibleWhen: whenGameData(8) }),
      field('script', 'Script', 4, 'text', { default: '', visibleWhen: { field: 'operand', equals: 4 } }),
    ],
    sentence: parts =>
    {
      const sign = OPERATION_SIGNS[Number(parts.value('operation'))] ?? parts.text('operation');
      const operand = OPERAND_PHRASES[Number(parts.value('operand'))]?.(parts) ?? parts.text('operand');
      return `${rangePhrase(parts, 'Variable', 'Variables')} ${sign} ${operand}`;
    },
    defaultParameters: [ 1, 1, 0, 0, 0 ],
  },
  {
    id: 'core:123',
    code: 123,
    name: 'Control Self Switch',
    category: 'Game Progression',
    keywords: [ 'self switch', 'switch', 'flag', 'local', 'toggle', 'a', 'b', 'c', 'd' ],
    fields: [
      field('selfSwitch', 'Self switch', 0, 'self-switch', { options: SELF_SWITCHES, default: 'A' }),
      field('value', 'Set to', 1, 'select', { options: ON_OFF, default: 0 }),
    ],
    sentence: 'Self switch {selfSwitch} = {value}',
    defaultParameters: [ 'A', 0 ],
  },
  {
    id: 'core:124',
    code: 124,
    name: 'Control Timer',
    category: 'Game Progression',
    keywords: [ 'timer', 'countdown', 'clock', 'time limit' ],
    fields: [
      field('operation', 'Operation', 0, 'select', { options: TIMER_OPERATIONS, default: 0 }),
      field('seconds', 'Seconds', 1, 'number', { min: 1, max: 5999, default: 60, visibleWhen: { field: 'operation', equals: 0 } }),
    ],
    sentence: parts => (parts.value('operation') === 1
      ? 'Stop the timer'
      : `Start the timer at ${clockPhrase(parts.value('seconds'))}`),
    defaultParameters: [ 0, 60 ],
  },
];

export { PROGRESSION_ENTRIES };
