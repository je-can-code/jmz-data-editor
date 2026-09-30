import type { CommandCatalogEntry, CommandFieldKind } from '../catalogTypes.ts';
import { field, operandFields, operandPhrase, withNotes } from './fieldHelpers.ts';
import { ADD_REMOVE } from './options.ts';

/**
 * Builds Change Weapons or Change Armors, which differ only in what they change.
 * @param {number} code The command code.
 * @param {string} name What the list calls it.
 * @param {CommandFieldKind} kind The kind of row it changes.
 * @param {string} label What one of them is called.
 * @param {readonly string[]} keywords Words that find it.
 * @returns {CommandCatalogEntry} The entry.
 */
const equipmentEntry = (code: number, name: string, kind: CommandFieldKind, label: string, keywords: readonly string[]): CommandCatalogEntry =>
{
  return {
    id: `core:${code}`,
    code,
    name,
    category: 'Party',
    keywords,
    fields: [
      field('target', label, 0, kind, { default: 1 }),
      ...operandFields(1, 'Amount'),
      field('includeEquip', 'Include equipment', 4, 'boolean', { default: false, visibleWhen: { field: 'operation', equals: 1 } }),
    ],
    sentence: parts => withNotes(`${label}: ${parts.text('target')} ${operandPhrase(parts)}`, [
      parts.value('operation') === 1 && parts.value('includeEquip') === true && 'including equipped',
    ]),
    defaultParameters: [ 1, 0, 0, 1, false ],
  };
};

/**
 * The Party group: gold, items, weapons, armors and who is in the party.
 */
const PARTY_ENTRIES: readonly CommandCatalogEntry[] = [
  {
    id: 'core:125',
    code: 125,
    name: 'Change Gold',
    category: 'Party',
    keywords: [ 'gold', 'money', 'cash', 'currency', 'pay', 'reward' ],
    fields: operandFields(0, 'Gold'),
    sentence: parts => `Gold ${operandPhrase(parts)}`,
    defaultParameters: [ 0, 0, 1 ],
  },
  {
    id: 'core:126',
    code: 126,
    name: 'Change Items',
    category: 'Party',
    keywords: [ 'item', 'give', 'take', 'inventory', 'loot', 'reward', 'gain' ],
    fields: [
      field('target', 'Item', 0, 'item', { default: 1 }),
      ...operandFields(1, 'Amount'),
    ],
    sentence: parts => `Items: ${parts.text('target')} ${operandPhrase(parts)}`,
    defaultParameters: [ 1, 0, 0, 1 ],
  },
  equipmentEntry(127, 'Change Weapons', 'weapon', 'Weapons', [ 'weapon', 'give', 'take', 'sword', 'inventory', 'gain' ]),
  equipmentEntry(128, 'Change Armors', 'armor', 'Armors', [ 'armor', 'give', 'take', 'inventory', 'accessory', 'gain' ]),
  {
    id: 'core:129',
    code: 129,
    name: 'Change Party Member',
    category: 'Party',
    keywords: [ 'party', 'join', 'leave', 'recruit', 'member', 'add actor', 'remove actor' ],
    fields: [
      field('actor', 'Actor', 0, 'actor', { default: 1 }),
      field('operation', 'Operation', 1, 'select', { options: ADD_REMOVE, default: 0 }),
      field('initialize', 'Initialize', 2, 'boolean', { default: false, visibleWhen: { field: 'operation', equals: 0 } }),
    ],
    sentence: parts => (parts.value('operation') === 1
      ? `Remove ${parts.text('actor')} from the party`
      : withNotes(`Add ${parts.text('actor')} to the party`, [ parts.value('initialize') === true && 'initialized' ])),
    defaultParameters: [ 1, 0, false ],
  },
];

export { PARTY_ENTRIES };
