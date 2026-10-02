import type { CommandCatalogEntry, CommandField, SentenceParts } from '../catalogTypes.ts';
import { field, withNotes } from './fieldHelpers.ts';
import { options } from './options.ts';

/**
 * How Battle Processing picks its troop.
 */
const TROOP_DESIGNATIONS = options([ [ 0, 'Direct' ], [ 1, 'Variable' ], [ 2, 'Same as Random Encounters' ] ]);

/**
 * What kind of goods a shop row sells.
 */
const GOOD_TYPES = options([ [ 0, 'Item' ], [ 1, 'Weapon' ], [ 2, 'Armor' ] ]);

/**
 * Whether a shop row sells at the database price or its own.
 */
const PRICE_TYPES = options([ [ 0, 'Standard' ], [ 1, 'Specify' ] ]);

/**
 * The inputs of one shop row, which the shop command itself holds for its first row and each 605 line for another.
 * @returns {CommandField[]} The fields, parameters 0 to 3.
 */
const goodFields = (): CommandField[] =>
{
  return [
    field('goodType', 'Type', 0, 'select', { options: GOOD_TYPES, default: 0 }),
    field('item', 'Item', 1, 'item', { default: 1, visibleWhen: { field: 'goodType', equals: 0 } }),
    field('weapon', 'Weapon', 1, 'weapon', { default: 1, visibleWhen: { field: 'goodType', equals: 1 } }),
    field('armor', 'Armor', 1, 'armor', { default: 1, visibleWhen: { field: 'goodType', equals: 2 } }),
    field('priceType', 'Price', 2, 'select', { options: PRICE_TYPES, default: 0 }),
    field('price', 'Price', 3, 'number', { min: 0, default: 0, visibleWhen: { field: 'priceType', equals: 1 } }),
  ];
};

/**
 * Says the first row a shop sells.
 * @param {SentenceParts} parts The shop's parts.
 * @returns {string} The good's name.
 */
const firstGoodPhrase = (parts: SentenceParts): string =>
{
  const type = parts.value('goodType');
  if (type === 1)
  {
    return parts.text('weapon');
  }

  return type === 2
    ? parts.text('armor')
    : parts.text('item');
};

/**
 * Builds a command that simply opens a scene, or ends the game.
 * @param {number} code The command code.
 * @param {string} name What the list calls it.
 * @param {string} sentence What its row says.
 * @param {readonly string[]} keywords Words that find it.
 * @returns {CommandCatalogEntry} The entry.
 */
const sceneEntry = (code: number, name: string, sentence: string, keywords: readonly string[]): CommandCatalogEntry =>
{
  return { id: `core:${code}`, code, name, category: 'Scene Control', keywords, fields: [], sentence, defaultParameters: [] };
};

/**
 * The Scene Control group: battles, shops, name input, menus and the game's end.
 */
const SCENE_ENTRIES: readonly CommandCatalogEntry[] = [
  {
    id: 'core:301',
    code: 301,
    name: 'Battle Processing',
    category: 'Scene Control',
    keywords: [ 'battle', 'fight', 'encounter', 'troop', 'combat', 'boss' ],
    fields: [
      field('designation', 'Troop', 0, 'select', { options: TROOP_DESIGNATIONS, default: 0 }),
      field('troop', 'Troop', 1, 'troop', { default: 1, visibleWhen: { field: 'designation', equals: 0 } }),
      field('troopVariable', 'Troop from', 1, 'variable', { default: 1, visibleWhen: { field: 'designation', equals: 1 } }),
      field('canEscape', 'Can escape', 2, 'boolean', { default: false }),
      field('canLose', 'Continue when lost', 3, 'boolean', { default: false }),
    ],
    sentence: parts =>
    {
      const designation = parts.value('designation');
      const troop = designation === 1
        ? `the troop in ${parts.text('troopVariable')}`
        : parts.text('troop');
      return withNotes(`Battle: ${designation === 2 ? 'a random encounter' : troop}`, [
        parts.value('canEscape') === true && 'can escape',
        parts.value('canLose') === true && 'can lose',
      ]);
    },
    block: { end: 604, branches: [ 601, 602, 603 ] },
    defaultParameters: [ 0, 1, false, false ],
  },
  {
    id: 'core:302',
    code: 302,
    name: 'Shop Processing',
    category: 'Scene Control',
    keywords: [ 'shop', 'store', 'merchant', 'buy', 'sell', 'vendor' ],
    fields: [
      ...goodFields(),
      field('purchaseOnly', 'Purchase only', 4, 'boolean', { default: false }),
    ],
    continuationFields: goodFields(),
    sentence: parts =>
    {
      const more = parts.continuation.length;
      const goods = more === 0
        ? firstGoodPhrase(parts)
        : `${firstGoodPhrase(parts)} and ${more} more`;
      return withNotes(`Shop: ${goods}`, [ parts.value('purchaseOnly') === true && 'purchase only' ]);
    },
    continuation: 605,
    defaultParameters: [ 0, 1, 0, 0, false ],
  },
  {
    id: 'core:303',
    code: 303,
    name: 'Name Input Processing',
    category: 'Scene Control',
    keywords: [ 'name', 'input', 'rename', 'enter name', 'keyboard' ],
    fields: [
      field('actor', 'Actor', 0, 'actor', { default: 1 }),
      field('maxLength', 'Max characters', 1, 'number', { min: 1, max: 16, default: 8 }),
    ],
    sentence: 'Name input for {actor}, up to {maxLength} characters',
    defaultParameters: [ 1, 8 ],
  },
  sceneEntry(351, 'Open Menu Screen', 'Open the menu', [ 'menu', 'open menu', 'pause' ]),
  sceneEntry(352, 'Open Save Screen', 'Open the save screen', [ 'save', 'save game', 'save point' ]),
  sceneEntry(353, 'Game Over', 'Game over', [ 'game over', 'death', 'lose', 'defeat' ]),
  sceneEntry(354, 'Return to Title Screen', 'Return to the title screen', [ 'title', 'quit', 'restart', 'main menu' ]),
];

export { SCENE_ENTRIES };
