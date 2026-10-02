import type { CommandCatalogEntry } from '../catalogTypes.ts';
import { field, withNotes } from './fieldHelpers.ts';
import { CHOICE_POSITIONS, MESSAGE_BACKGROUNDS, MESSAGE_POSITIONS, options } from './options.ts';
import { oneLine, textList } from './phrases.ts';

/**
 * What happens when the player cancels a choice: a branch of its own, nothing, or one of the choices.
 */
const CANCEL_TYPES = options([
  [ -2, 'Branch' ],
  [ -1, 'Disallow' ],
  [ 0, 'Choice #1' ],
  [ 1, 'Choice #2' ],
  [ 2, 'Choice #3' ],
  [ 3, 'Choice #4' ],
  [ 4, 'Choice #5' ],
  [ 5, 'Choice #6' ],
]);

/**
 * Which choice starts highlighted.
 */
const DEFAULT_CHOICES = options([
  [ -1, 'None' ],
  [ 0, 'Choice #1' ],
  [ 1, 'Choice #2' ],
  [ 2, 'Choice #3' ],
  [ 3, 'Choice #4' ],
  [ 4, 'Choice #5' ],
  [ 5, 'Choice #6' ],
]);

/**
 * The kinds of item Select Item offers.
 */
const ITEM_TYPES = options([ [ 1, 'Regular Item' ], [ 2, 'Key Item' ], [ 3, 'Hidden Item A' ], [ 4, 'Hidden Item B' ] ]);

/**
 * The Message group: text, choices, and the inputs a message can ask for.
 */
const MESSAGE_ENTRIES: readonly CommandCatalogEntry[] = [
  {
    id: 'core:101',
    code: 101,
    name: 'Show Text',
    category: 'Message',
    keywords: [ 'message', 'dialogue', 'dialog', 'talk', 'say', 'speech', 'line', 'face', 'text' ],
    fields: [
      field('faceName', 'Face', 0, 'face', { folder: 'faces', default: '' }),
      field('faceIndex', 'Face index', 1, 'number', { min: 0, max: 7, default: 0 }),
      field('background', 'Background', 2, 'select', { options: MESSAGE_BACKGROUNDS, default: 0 }),
      field('position', 'Window position', 3, 'select', { options: MESSAGE_POSITIONS, default: 2 }),
      field('speaker', 'Name', 4, 'text', { default: '' }),
      field('text', 'Text', 0, 'multiline', { lines: 'continuation', default: '' }),
    ],
    sentence: parts =>
    {
      const said = oneLine(parts.value('text'));
      const speaker = String(parts.value('speaker') ?? '');
      const words = said === ''
        ? '(no text)'
        : said;
      return speaker === ''
        ? words
        : `${speaker}: ${words}`;
    },
    continuation: 401,
    defaultParameters: [ '', 0, 0, 2, '' ],
  },
  {
    id: 'core:102',
    code: 102,
    name: 'Show Choices',
    category: 'Message',
    keywords: [ 'choice', 'options', 'menu', 'question', 'ask', 'answer', 'yes', 'no' ],
    fields: [
      field('choices', 'Choices', 0, 'list', { default: [ 'Yes', 'No' ] }),
      field('cancelType', 'When cancelled', 1, 'select', { options: CANCEL_TYPES, default: 1 }),
      field('defaultType', 'Highlighted at first', 2, 'select', { options: DEFAULT_CHOICES, default: 0 }),
      field('position', 'Window position', 3, 'select', { options: CHOICE_POSITIONS, default: 2 }),
      field('background', 'Background', 4, 'select', { options: MESSAGE_BACKGROUNDS, default: 0 }),
    ],
    sentence: parts =>
    {
      const choices = textList(parts.value('choices'));
      const cancel = parts.value('cancelType');
      return withNotes(`Choices: ${choices.join(' / ')}`, [
        cancel === -2 && 'cancel has its own branch',
        cancel === -1 && 'cannot cancel',
      ]);
    },
    block: { end: 404, branches: [ 402, 403 ] },
    defaultParameters: [ [ 'Yes', 'No' ], 1, 0, 2, 0 ],
  },
  {
    id: 'core:103',
    code: 103,
    name: 'Input Number',
    category: 'Message',
    keywords: [ 'number', 'digits', 'enter', 'code', 'password', 'input' ],
    fields: [
      field('variable', 'Store in', 0, 'variable', { default: 1 }),
      field('digits', 'Digits', 1, 'number', { min: 1, max: 8, default: 1 }),
    ],
    sentence: parts => `Input a ${parts.text('digits')}-digit number into ${parts.text('variable')}`,
    defaultParameters: [ 1, 1 ],
  },
  {
    id: 'core:104',
    code: 104,
    name: 'Select Item',
    category: 'Message',
    keywords: [ 'item', 'choose', 'pick', 'key item', 'give' ],
    fields: [
      field('variable', 'Store in', 0, 'variable', { default: 1 }),
      field('itemType', 'Item type', 1, 'select', { options: ITEM_TYPES, default: 2 }),
    ],
    sentence: parts => `Select a ${parts.text('itemType')} into ${parts.text('variable')}`,
    defaultParameters: [ 1, 2 ],
  },
  {
    id: 'core:105',
    code: 105,
    name: 'Show Scrolling Text',
    category: 'Message',
    keywords: [ 'credits', 'scroll', 'crawl', 'text', 'roll' ],
    fields: [
      field('speed', 'Speed', 0, 'number', { min: 1, max: 8, default: 2 }),
      field('noFast', 'No fast forward', 1, 'boolean', { default: false }),
      field('text', 'Text', 0, 'multiline', { lines: 'continuation', default: '' }),
    ],
    sentence: parts => withNotes(`Scrolling text: ${oneLine(parts.value('text')) || '(no text)'}`, [
      `speed ${parts.text('speed')}`,
      parts.value('noFast') === true && 'no fast forward',
    ]),
    continuation: 405,
    defaultParameters: [ 2, false ],
  },
];

export { MESSAGE_ENTRIES };
