import type { CommandCatalogEntry, CommandField, SentenceParts } from '../catalogTypes.ts';
import { actorTargetFields, actorTargetPhrase, field, operandFields, operandPhrase, withNotes } from './fieldHelpers.ts';
import { ADD_REMOVE, options, PARAMETERS } from './options.ts';

/**
 * Learning or forgetting a skill.
 */
const LEARN_FORGET = options([ [ 0, 'Learn' ], [ 1, 'Forget' ] ]);

/**
 * Builds one of the commands that add to or take from an actor's number (HP, MP, TP, EXP, level), which all share
 * a shape: who, how much, and sometimes a flag after the amount.
 * @param {number} code The command code.
 * @param {string} name What the list calls it.
 * @param {string} stat What the number is called in a row.
 * @param {readonly string[]} keywords Words that find it.
 * @param {CommandField | null} flag The flag after the amount, or null when there is none.
 * @param {(parts: SentenceParts) => string | false} note The row's note for the flag.
 * @returns {CommandCatalogEntry} The entry.
 */
const actorAmountEntry = (
  code: number,
  name: string,
  stat: string,
  keywords: readonly string[],
  flag: CommandField | null,
  note: (parts: SentenceParts) => string | false,
): CommandCatalogEntry =>
{
  return {
    id: `core:${code}`,
    code,
    name,
    category: 'Actor',
    keywords,
    fields: [
      ...actorTargetFields(),
      ...operandFields(2, 'Amount'),
      ...(flag === null ? [] : [ flag ]),
    ],
    sentence: parts => withNotes(`${stat} of ${actorTargetPhrase(parts)} ${operandPhrase(parts)}`, [ note(parts) ]),
    defaultParameters: flag === null
      ? [ 0, 0, 0, 0, 1 ]
      : [ 0, 0, 0, 0, 1, false ],
  };
};

/**
 * Builds one of the commands that set an actor's text (name, nickname, profile).
 * @param {number} code The command code.
 * @param {string} name What the list calls it.
 * @param {string} label What the text is called.
 * @param {'text' | 'multiline'} kind The input it edits with.
 * @param {readonly string[]} keywords Words that find it.
 * @returns {CommandCatalogEntry} The entry.
 */
const actorTextEntry = (code: number, name: string, label: string, kind: 'text' | 'multiline', keywords: readonly string[]): CommandCatalogEntry =>
{
  return {
    id: `core:${code}`,
    code,
    name,
    category: 'Actor',
    keywords,
    fields: [
      field('actor', 'Actor', 0, 'actor', { default: 1 }),
      field('text', label, 1, kind, { default: '' }),
    ],
    sentence: parts => `${label} of ${parts.text('actor')}: "${String(parts.value('text') ?? '').replace(/\n/gu, ' ')}"`,
    defaultParameters: [ 1, '' ],
  };
};

/**
 * The flag letting HP damage knock an actor out.
 */
const ALLOW_KNOCKOUT = field('allowDeath', 'Allow knockout', 5, 'boolean', { default: false, visibleWhen: { field: 'operation', equals: 1 } });

/**
 * The flag showing the level-up message when EXP or level rises.
 */
const SHOW_LEVEL_UP = field('showLevelUp', 'Show level up', 5, 'boolean', { default: false });

/**
 * The Actor group: an actor's numbers, states, skills, equipment and names.
 */
const ACTOR_ENTRIES: readonly CommandCatalogEntry[] = [
  actorAmountEntry(311, 'Change HP', 'HP', [ 'hp', 'health', 'heal', 'damage', 'hurt' ], ALLOW_KNOCKOUT,
    parts => parts.value('operation') === 1 && parts.value('allowDeath') === true && 'can knock out'),
  actorAmountEntry(312, 'Change MP', 'MP', [ 'mp', 'mana', 'magic' ], null, () => false),
  actorAmountEntry(326, 'Change TP', 'TP', [ 'tp', 'tech', 'limit' ], null, () => false),
  {
    id: 'core:313',
    code: 313,
    name: 'Change State',
    category: 'Actor',
    keywords: [ 'state', 'status', 'poison', 'buff', 'debuff', 'afflict', 'cure' ],
    fields: [
      ...actorTargetFields(),
      field('operation', 'Operation', 2, 'select', { options: ADD_REMOVE, default: 0 }),
      field('state', 'State', 3, 'state', { default: 1 }),
    ],
    sentence: parts => (parts.value('operation') === 1
      ? `Remove ${parts.text('state')} from ${actorTargetPhrase(parts)}`
      : `Add ${parts.text('state')} to ${actorTargetPhrase(parts)}`),
    defaultParameters: [ 0, 0, 0, 1 ],
  },
  {
    id: 'core:314',
    code: 314,
    name: 'Recover All',
    category: 'Actor',
    keywords: [ 'heal', 'recover', 'restore', 'full', 'inn', 'rest' ],
    fields: actorTargetFields(),
    sentence: parts => `Recover all: ${actorTargetPhrase(parts)}`,
    defaultParameters: [ 0, 0 ],
  },
  actorAmountEntry(315, 'Change EXP', 'EXP', [ 'exp', 'experience', 'xp' ], SHOW_LEVEL_UP,
    parts => parts.value('showLevelUp') === true && 'show level up'),
  actorAmountEntry(316, 'Change Level', 'Level', [ 'level', 'lv', 'level up' ], SHOW_LEVEL_UP,
    parts => parts.value('showLevelUp') === true && 'show level up'),
  {
    id: 'core:317',
    code: 317,
    name: 'Change Parameter',
    category: 'Actor',
    keywords: [ 'parameter', 'stat', 'attack', 'defense', 'agility', 'luck', 'max hp' ],
    fields: [
      ...actorTargetFields(),
      field('parameter', 'Parameter', 2, 'select', { options: PARAMETERS, default: 0 }),
      ...operandFields(3, 'Amount'),
    ],
    sentence: parts => `${parts.text('parameter')} of ${actorTargetPhrase(parts)} ${operandPhrase(parts)}`,
    defaultParameters: [ 0, 0, 0, 0, 0, 1 ],
  },
  {
    id: 'core:318',
    code: 318,
    name: 'Change Skill',
    category: 'Actor',
    keywords: [ 'skill', 'learn', 'forget', 'teach', 'ability' ],
    fields: [
      ...actorTargetFields(),
      field('operation', 'Operation', 2, 'select', { options: LEARN_FORGET, default: 0 }),
      field('skill', 'Skill', 3, 'skill', { default: 1 }),
    ],
    sentence: parts => (parts.value('operation') === 1
      ? `${actorTargetPhrase(parts)} forgets ${parts.text('skill')}`
      : `${actorTargetPhrase(parts)} learns ${parts.text('skill')}`),
    defaultParameters: [ 0, 0, 0, 1 ],
  },
  {
    id: 'core:319',
    code: 319,
    name: 'Change Equipment',
    category: 'Actor',
    keywords: [ 'equip', 'equipment', 'weapon', 'armor', 'gear', 'unequip' ],
    fields: [
      field('actor', 'Actor', 0, 'actor', { default: 1 }),
      field('equipType', 'Equipment type', 1, 'number', { min: 1, default: 1, help: 'The slot, numbered as in the database\'s equipment types.' }),
      field('weapon', 'Weapon', 2, 'weapon', { default: 0, options: [ { value: 0, label: 'None' } ], visibleWhen: { field: 'equipType', equals: 1 } }),
      field('armor', 'Armor', 2, 'armor', { default: 0, options: [ { value: 0, label: 'None' } ], visibleWhen: { not: { field: 'equipType', equals: 1 } } }),
    ],
    sentence: parts =>
    {
      const item = parts.value('equipType') === 1
        ? parts.text('weapon')
        : parts.text('armor');
      return `Equip ${parts.text('actor')} with ${item} in slot ${parts.text('equipType')}`;
    },
    defaultParameters: [ 1, 1, 0 ],
  },
  actorTextEntry(320, 'Change Name', 'Name', 'text', [ 'name', 'rename', 'call' ]),
  {
    id: 'core:321',
    code: 321,
    name: 'Change Class',
    category: 'Actor',
    keywords: [ 'class', 'job', 'profession', 'role' ],
    fields: [
      field('actor', 'Actor', 0, 'actor', { default: 1 }),
      field('class', 'Class', 1, 'class', { default: 1 }),
      field('keepExp', 'Save EXP', 2, 'boolean', { default: false }),
    ],
    sentence: parts => withNotes(`Change ${parts.text('actor')}'s class to ${parts.text('class')}`, [
      parts.value('keepExp') === true && 'keeping EXP',
    ]),
    defaultParameters: [ 1, 1, false ],
  },
  actorTextEntry(324, 'Change Nickname', 'Nickname', 'text', [ 'nickname', 'title', 'alias' ]),
  actorTextEntry(325, 'Change Profile', 'Profile', 'multiline', [ 'profile', 'biography', 'description' ]),
];

export { ACTOR_ENTRIES };
