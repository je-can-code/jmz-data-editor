import type { CommandCatalogEntry, FieldCondition, SentenceParts } from '../catalogTypes.ts';
import { field, withNotes } from './fieldHelpers.ts';
import { BUTTONS, CONSTANT_VARIABLE, DIRECTIONS, ENEMY_INDEXES, ON_OFF, options, SELF_SWITCHES, VEHICLES } from './options.ts';
import { clockPhrase, oneLine } from './phrases.ts';

/**
 * What a conditional branch tests.
 */
const BRANCH_TYPES = options([
  [ 0, 'Switch' ],
  [ 1, 'Variable' ],
  [ 2, 'Self Switch' ],
  [ 3, 'Timer' ],
  [ 4, 'Actor' ],
  [ 5, 'Enemy' ],
  [ 6, 'Character' ],
  [ 7, 'Gold' ],
  [ 8, 'Item' ],
  [ 9, 'Weapon' ],
  [ 10, 'Armor' ],
  [ 11, 'Button' ],
  [ 12, 'Script' ],
  [ 13, 'Vehicle' ],
]);

/**
 * How a variable is compared.
 */
const COMPARISONS = options([ [ 0, '=' ], [ 1, '≥' ], [ 2, '≤' ], [ 3, '>' ], [ 4, '<' ], [ 5, '≠' ] ]);

/**
 * How the timer is compared.
 */
const TIMER_COMPARISONS = options([ [ 0, '≥' ], [ 1, '≤' ] ]);

/**
 * How gold is compared.
 */
const GOLD_COMPARISONS = options([ [ 0, '≥' ], [ 1, '≤' ], [ 2, '<' ] ]);

/**
 * What a branch can check about an actor.
 */
const ACTOR_CHECKS = options([
  [ 0, 'In the Party' ],
  [ 1, 'Name' ],
  [ 2, 'Class' ],
  [ 3, 'Skill' ],
  [ 4, 'Weapon' ],
  [ 5, 'Armor' ],
  [ 6, 'State' ],
]);

/**
 * What a branch can check about an enemy.
 */
const ENEMY_CHECKS = options([ [ 0, 'Appeared' ], [ 1, 'State' ] ]);

/**
 * How a button is checked.
 */
const BUTTON_CHECKS = options([ [ 0, 'is being pressed' ], [ 1, 'is being triggered' ], [ 2, 'is being repeated' ] ]);

/**
 * Shows a field only for one kind of test.
 * @param {number} type The test.
 * @param {readonly FieldCondition[]} more Further conditions that must hold too.
 * @returns {FieldCondition} The condition.
 */
const whenType = (type: number, ...more: FieldCondition[]): FieldCondition =>
{
  return more.length === 0
    ? { field: 'type', equals: type }
    : { all: [ { field: 'type', equals: type }, ...more ] };
};

/**
 * Says each check a branch can make about an actor, by its number.
 */
const ACTOR_PHRASES: readonly ((parts: SentenceParts) => string)[] = [
  parts => `${parts.text('actor')} is in the party`,
  parts => `${parts.text('actor')} is named "${parts.text('actorName')}"`,
  parts => `${parts.text('actor')} is class ${parts.text('actorClass')}`,
  parts => `${parts.text('actor')} knows ${parts.text('actorSkill')}`,
  parts => `${parts.text('actor')} has ${parts.text('actorWeapon')} equipped`,
  parts => `${parts.text('actor')} has ${parts.text('actorArmor')} equipped`,
  parts => `${parts.text('actor')} is affected by ${parts.text('actorState')}`,
];

/**
 * Says what each kind of test checks, by its number.
 */
const BRANCH_PHRASES: readonly ((parts: SentenceParts) => string)[] = [
  parts => `switch ${parts.text('switch')} is ${parts.text('switchValue')}`,
  parts =>
  {
    const other = parts.value('variableOperandType') === 1
      ? parts.text('variableOther')
      : parts.text('variableConstant');
    return `variable ${parts.text('variable')} ${parts.text('variableCompare')} ${other}`;
  },
  parts => `self switch ${parts.text('selfSwitch')} is ${parts.text('selfSwitchValue')}`,
  parts => `the timer ${parts.text('timerCompare')} ${clockPhrase(parts.value('timerSeconds'))}`,
  parts => ACTOR_PHRASES[Number(parts.value('actorCheck'))]?.(parts) ?? `${parts.text('actor')} (${parts.text('actorCheck')})`,
  parts => (parts.value('enemyCheck') === 1
    ? `enemy ${parts.text('enemy')} is affected by ${parts.text('enemyState')}`
    : `enemy ${parts.text('enemy')} has appeared`),
  parts => `${parts.text('character')} is facing ${parts.text('characterDirection')}`,
  parts => `gold ${parts.text('goldCompare')} ${parts.text('gold')}`,
  parts => `the party has ${parts.text('item')}`,
  parts => withNotes(`the party has ${parts.text('weapon')}`, [ parts.value('weaponIncludeEquip') === true && 'counting equipped' ]),
  parts => withNotes(`the party has ${parts.text('armor')}`, [ parts.value('armorIncludeEquip') === true && 'counting equipped' ]),
  parts => `the ${parts.text('button')} button ${parts.text('buttonCheck') || 'is being pressed'}`,
  parts => `script: ${parts.text('script')}`,
  parts => `the player is riding the ${parts.text('vehicle')}`,
];

/**
 * The Flow Control group: branches, loops, labels, comments and calling common events.
 */
const FLOW_ENTRIES: readonly CommandCatalogEntry[] = [
  {
    id: 'core:111',
    code: 111,
    name: 'Conditional Branch',
    category: 'Flow Control',
    keywords: [ 'if', 'else', 'condition', 'check', 'branch', 'when', 'test' ],
    fields: [
      field('type', 'Condition', 0, 'select', { options: BRANCH_TYPES, default: 0 }),
      field('switch', 'Switch', 1, 'switch', { default: 1, visibleWhen: whenType(0) }),
      field('switchValue', 'Is', 2, 'select', { options: ON_OFF, default: 0, visibleWhen: whenType(0) }),
      field('variable', 'Variable', 1, 'variable', { default: 1, visibleWhen: whenType(1) }),
      field('variableCompare', 'Compared', 4, 'select', { options: COMPARISONS, default: 0, visibleWhen: whenType(1) }),
      field('variableOperandType', 'With', 2, 'select', { options: CONSTANT_VARIABLE, default: 0, visibleWhen: whenType(1) }),
      field('variableConstant', 'Value', 3, 'number', { default: 0, visibleWhen: whenType(1, { field: 'variableOperandType', equals: 0 }) }),
      field('variableOther', 'Other variable', 3, 'variable', { default: 1, visibleWhen: whenType(1, { field: 'variableOperandType', equals: 1 }) }),
      field('selfSwitch', 'Self switch', 1, 'self-switch', { options: SELF_SWITCHES, default: 'A', visibleWhen: whenType(2) }),
      field('selfSwitchValue', 'Is', 2, 'select', { options: ON_OFF, default: 0, visibleWhen: whenType(2) }),
      field('timerCompare', 'Timer', 2, 'select', { options: TIMER_COMPARISONS, default: 0, visibleWhen: whenType(3) }),
      field('timerSeconds', 'Seconds', 1, 'number', { min: 0, default: 0, visibleWhen: whenType(3) }),
      field('actor', 'Actor', 1, 'actor', { default: 1, visibleWhen: whenType(4) }),
      field('actorCheck', 'Check', 2, 'select', { options: ACTOR_CHECKS, default: 0, visibleWhen: whenType(4) }),
      field('actorName', 'Name', 3, 'text', { default: '', visibleWhen: whenType(4, { field: 'actorCheck', equals: 1 }) }),
      field('actorClass', 'Class', 3, 'class', { default: 1, visibleWhen: whenType(4, { field: 'actorCheck', equals: 2 }) }),
      field('actorSkill', 'Skill', 3, 'skill', { default: 1, visibleWhen: whenType(4, { field: 'actorCheck', equals: 3 }) }),
      field('actorWeapon', 'Weapon', 3, 'weapon', { default: 1, visibleWhen: whenType(4, { field: 'actorCheck', equals: 4 }) }),
      field('actorArmor', 'Armor', 3, 'armor', { default: 1, visibleWhen: whenType(4, { field: 'actorCheck', equals: 5 }) }),
      field('actorState', 'State', 3, 'state', { default: 1, visibleWhen: whenType(4, { field: 'actorCheck', equals: 6 }) }),
      field('enemy', 'Enemy', 1, 'select', { options: ENEMY_INDEXES, default: 0, visibleWhen: whenType(5) }),
      field('enemyCheck', 'Check', 2, 'select', { options: ENEMY_CHECKS, default: 0, visibleWhen: whenType(5) }),
      field('enemyState', 'State', 3, 'state', { default: 1, visibleWhen: whenType(5, { field: 'enemyCheck', equals: 1 }) }),
      field('character', 'Character', 1, 'event', { default: -1, visibleWhen: whenType(6) }),
      field('characterDirection', 'Facing', 2, 'select', { options: DIRECTIONS, default: 2, visibleWhen: whenType(6) }),
      field('gold', 'Gold', 1, 'number', { min: 0, default: 0, visibleWhen: whenType(7) }),
      field('goldCompare', 'Compared', 2, 'select', { options: GOLD_COMPARISONS, default: 0, visibleWhen: whenType(7) }),
      field('item', 'Item', 1, 'item', { default: 1, visibleWhen: whenType(8) }),
      field('weapon', 'Weapon', 1, 'weapon', { default: 1, visibleWhen: whenType(9) }),
      field('weaponIncludeEquip', 'Count equipped', 2, 'boolean', { default: false, visibleWhen: whenType(9) }),
      field('armor', 'Armor', 1, 'armor', { default: 1, visibleWhen: whenType(10) }),
      field('armorIncludeEquip', 'Count equipped', 2, 'boolean', { default: false, visibleWhen: whenType(10) }),
      field('button', 'Button', 1, 'select', { options: BUTTONS, default: 'ok', visibleWhen: whenType(11) }),
      field('buttonCheck', 'Check', 2, 'select', { options: BUTTON_CHECKS, default: 0, visibleWhen: whenType(11) }),
      field('script', 'Script', 1, 'text', { default: '', visibleWhen: whenType(12) }),
      field('vehicle', 'Vehicle', 1, 'select', { options: VEHICLES, default: 0, visibleWhen: whenType(13) }),
    ],
    sentence: parts =>
    {
      const phrase = BRANCH_PHRASES[Number(parts.value('type'))];
      return phrase === undefined
        ? `If (${parts.text('type')})`
        : `If ${phrase(parts)}`;
    },
    block: { end: 412, branches: [ 411 ] },
    defaultParameters: [ 0, 1, 0 ],
  },
  {
    id: 'core:112',
    code: 112,
    name: 'Loop',
    category: 'Flow Control',
    keywords: [ 'repeat', 'while', 'forever', 'cycle' ],
    fields: [],
    sentence: 'Loop',
    block: { end: 413 },
    defaultParameters: [],
  },
  {
    id: 'core:113',
    code: 113,
    name: 'Break Loop',
    category: 'Flow Control',
    keywords: [ 'exit loop', 'stop loop', 'break' ],
    fields: [],
    sentence: 'Break out of the loop',
    defaultParameters: [],
  },
  {
    id: 'core:115',
    code: 115,
    name: 'Exit Event Processing',
    category: 'Flow Control',
    keywords: [ 'stop', 'end', 'return', 'quit', 'abort' ],
    fields: [],
    sentence: 'Stop running this event',
    defaultParameters: [],
  },
  {
    id: 'core:117',
    code: 117,
    name: 'Common Event',
    category: 'Flow Control',
    keywords: [ 'call', 'run', 'common', 'shared', 'function' ],
    fields: [
      field('commonEvent', 'Common event', 0, 'common-event', { default: 1 }),
    ],
    sentence: 'Run common event {commonEvent}',
    defaultParameters: [ 1 ],
  },
  {
    id: 'core:118',
    code: 118,
    name: 'Label',
    category: 'Flow Control',
    keywords: [ 'label', 'marker', 'anchor', 'goto' ],
    fields: [
      field('label', 'Label', 0, 'text', { default: '' }),
    ],
    sentence: 'Label: {label}',
    defaultParameters: [ '' ],
  },
  {
    id: 'core:119',
    code: 119,
    name: 'Jump to Label',
    category: 'Flow Control',
    keywords: [ 'goto', 'jump', 'label' ],
    fields: [
      field('label', 'Label', 0, 'text', { default: '' }),
    ],
    sentence: 'Jump to label {label}',
    defaultParameters: [ '' ],
  },
  {
    id: 'core:108',
    code: 108,
    name: 'Comment',
    category: 'Flow Control',
    keywords: [ 'comment', 'note', 'tag', 'annotation', 'remark', 'memo' ],
    fields: [
      field('text', 'Comment', 0, 'multiline', { lines: 'first-and-continuation', default: '' }),
    ],
    sentence: parts => oneLine(parts.value('text')) || '(empty comment)',
    continuation: 408,
    defaultParameters: [ '' ],
  },
  {
    id: 'core:109',
    code: 109,
    name: 'Skip',
    category: 'Flow Control',
    keywords: [ 'skip', 'disable', 'ignore', 'comment out', 'bypass' ],
    fields: [],
    sentence: 'Skip these commands',
    block: { end: 409 },
    defaultParameters: [],
  },
];

export { FLOW_ENTRIES };
