import type { CommandCatalogEntry, CommandField } from '../catalogTypes.ts';
import { field, operandFields, operandPhrase, withNotes } from './fieldHelpers.ts';
import { ADD_REMOVE, ENEMY_INDEXES, ENEMY_TARGETS, options } from './options.ts';

/**
 * Who Force Action makes act.
 */
const SUBJECT_TYPES = options([ [ 0, 'Enemy' ], [ 1, 'Actor' ] ]);

/**
 * Who a forced action targets.
 */
const ACTION_TARGETS = options([
  [ -2, 'Last Target' ],
  [ -1, 'Random' ],
  [ 0, 'Index 1' ],
  [ 1, 'Index 2' ],
  [ 2, 'Index 3' ],
  [ 3, 'Index 4' ],
  [ 4, 'Index 5' ],
  [ 5, 'Index 6' ],
  [ 6, 'Index 7' ],
  [ 7, 'Index 8' ],
]);

/**
 * The field choosing which enemies a command acts on.
 * @returns {CommandField} The field.
 */
const enemyTargetField = (): CommandField => field('enemy', 'Enemy', 0, 'select', { options: ENEMY_TARGETS, default: -1 });

/**
 * Builds one of the commands that add to or take from an enemy's number.
 * @param {number} code The command code.
 * @param {string} name What the list calls it.
 * @param {string} stat What the number is called in a row.
 * @param {boolean} canKnockOut Whether it has the flag letting damage knock the enemy out.
 * @returns {CommandCatalogEntry} The entry.
 */
const enemyAmountEntry = (code: number, name: string, stat: string, canKnockOut: boolean): CommandCatalogEntry =>
{
  const knockOut = field('allowDeath', 'Allow knockout', 4, 'boolean', { default: false, visibleWhen: { field: 'operation', equals: 1 } });
  return {
    id: `core:${code}`,
    code,
    name,
    category: 'Battle',
    keywords: [ 'enemy', stat.toLowerCase(), 'battle' ],
    fields: [
      enemyTargetField(),
      ...operandFields(1, 'Amount'),
      ...(canKnockOut ? [ knockOut ] : []),
    ],
    sentence: parts => withNotes(`${stat} of enemy ${parts.text('enemy')} ${operandPhrase(parts)}`, [
      canKnockOut && parts.value('operation') === 1 && parts.value('allowDeath') === true && 'can knock out',
    ]),
    defaultParameters: canKnockOut
      ? [ -1, 0, 0, 1, false ]
      : [ -1, 0, 0, 1 ],
  };
};

/**
 * The Battle group: changing enemies and the battle itself, from inside one.
 */
const BATTLE_ENTRIES: readonly CommandCatalogEntry[] = [
  enemyAmountEntry(331, 'Change Enemy HP', 'HP', true),
  enemyAmountEntry(332, 'Change Enemy MP', 'MP', false),
  enemyAmountEntry(342, 'Change Enemy TP', 'TP', false),
  {
    id: 'core:333',
    code: 333,
    name: 'Change Enemy State',
    category: 'Battle',
    keywords: [ 'enemy', 'state', 'status', 'battle' ],
    fields: [
      enemyTargetField(),
      field('operation', 'Operation', 1, 'select', { options: ADD_REMOVE, default: 0 }),
      field('state', 'State', 2, 'state', { default: 1 }),
    ],
    sentence: parts => (parts.value('operation') === 1
      ? `Remove ${parts.text('state')} from enemy ${parts.text('enemy')}`
      : `Add ${parts.text('state')} to enemy ${parts.text('enemy')}`),
    defaultParameters: [ -1, 0, 1 ],
  },
  {
    id: 'core:334',
    code: 334,
    name: 'Enemy Recover All',
    category: 'Battle',
    keywords: [ 'enemy', 'heal', 'recover', 'battle' ],
    fields: [ enemyTargetField() ],
    sentence: 'Recover all: enemy {enemy}',
    defaultParameters: [ -1 ],
  },
  {
    id: 'core:335',
    code: 335,
    name: 'Enemy Appear',
    category: 'Battle',
    keywords: [ 'enemy', 'appear', 'reveal', 'hidden', 'battle' ],
    fields: [ field('enemy', 'Enemy', 0, 'select', { options: ENEMY_INDEXES, default: 0 }) ],
    sentence: 'Make enemy {enemy} appear',
    defaultParameters: [ 0 ],
  },
  {
    id: 'core:336',
    code: 336,
    name: 'Enemy Transform',
    category: 'Battle',
    keywords: [ 'enemy', 'transform', 'morph', 'change', 'battle' ],
    fields: [
      field('enemy', 'Enemy', 0, 'select', { options: ENEMY_INDEXES, default: 0 }),
      field('into', 'Into', 1, 'enemy', { default: 1 }),
    ],
    sentence: 'Transform enemy {enemy} into {into}',
    defaultParameters: [ 0, 1 ],
  },
  {
    id: 'core:337',
    code: 337,
    name: 'Show Battle Animation',
    category: 'Battle',
    keywords: [ 'enemy', 'animation', 'effect', 'battle' ],
    fields: [
      field('enemy', 'Enemy', 0, 'select', { options: ENEMY_INDEXES, default: 0, visibleWhen: { field: 'entireTroop', equals: false } }),
      field('animation', 'Animation', 1, 'animation', { default: 1 }),
      field('entireTroop', 'Entire troop', 2, 'boolean', { default: false }),
    ],
    sentence: parts => `Show animation ${parts.text('animation')} on ${parts.value('entireTroop') === true ? 'the entire troop' : `enemy ${parts.text('enemy')}`}`,
    defaultParameters: [ 0, 1, false ],
  },
  {
    id: 'core:339',
    code: 339,
    name: 'Force Action',
    category: 'Battle',
    keywords: [ 'force', 'action', 'skill', 'battle', 'make use' ],
    fields: [
      field('subjectType', 'Subject', 0, 'select', { options: SUBJECT_TYPES, default: 0 }),
      field('enemy', 'Enemy', 1, 'select', { options: ENEMY_INDEXES, default: 0, visibleWhen: { field: 'subjectType', equals: 0 } }),
      field('actor', 'Actor', 1, 'actor', { default: 1, visibleWhen: { field: 'subjectType', equals: 1 } }),
      field('skill', 'Skill', 2, 'skill', { default: 1 }),
      field('target', 'Target', 3, 'select', { options: ACTION_TARGETS, default: -2 }),
    ],
    sentence: parts =>
    {
      const subject = parts.value('subjectType') === 1
        ? parts.text('actor')
        : `enemy ${parts.text('enemy')}`;
      return `Force ${subject} to use ${parts.text('skill')} on ${parts.text('target')}`;
    },
    defaultParameters: [ 0, 0, 1, -2 ],
  },
  {
    id: 'core:340',
    code: 340,
    name: 'Abort Battle',
    category: 'Battle',
    keywords: [ 'abort', 'end battle', 'stop battle', 'battle' ],
    fields: [],
    sentence: 'Abort the battle',
    defaultParameters: [],
  },
];

export { BATTLE_ENTRIES };
