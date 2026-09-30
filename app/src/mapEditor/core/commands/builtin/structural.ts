import type { CommandCatalogEntry, CommandCategory } from '../catalogTypes.ts';
import { field } from './fieldHelpers.ts';
import { moveStepPhrase } from './moveRoute.ts';

/**
 * Builds the entry of a code that only exists inside another command's structure.
 * @param {number} code The command code.
 * @param {string} name What it is called.
 * @param {CommandCategory} category The group of the command it belongs to.
 * @param {string} sentence What its row says.
 * @returns {CommandCatalogEntry} The entry.
 */
const structuralEntry = (code: number, name: string, category: CommandCategory, sentence: string): CommandCatalogEntry =>
{
  return { id: `core:${code}`, code, name, category, keywords: [], fields: [], sentence, structural: true };
};

/**
 * Builds the entry of a line of text continuing another command.
 * @param {number} code The command code.
 * @param {string} name What it is called.
 * @param {CommandCategory} category The group of the command it continues.
 * @returns {CommandCatalogEntry} The entry.
 */
const textLineEntry = (code: number, name: string, category: CommandCategory): CommandCatalogEntry =>
{
  return {
    id: `core:${code}`,
    code,
    name,
    category,
    keywords: [],
    fields: [ field('text', 'Text', 0, 'text', { default: '' }) ],
    sentence: '{text}',
    structural: true,
  };
};

/**
 * The codes that only exist inside another command's structure: the list's own end and every body's, the lines
 * continuing a command, and the branches and ends of blocks. The list shows them as part of the command they
 * belong to and never offers them on their own.
 */
const STRUCTURAL_ENTRIES: readonly CommandCatalogEntry[] = [
  structuralEntry(0, 'End', 'Flow Control', 'End'),
  textLineEntry(401, 'Text Line', 'Message'),
  {
    id: 'core:402',
    code: 402,
    name: 'When',
    category: 'Message',
    keywords: [],
    fields: [
      field('index', 'Choice number', 0, 'number', { default: 0 }),
      field('choice', 'Choice', 1, 'text', { default: '' }),
    ],
    sentence: 'When {choice}',
    structural: true,
  },
  structuralEntry(403, 'When Cancel', 'Message', 'When cancelled'),
  structuralEntry(404, 'End of Choices', 'Message', 'End'),
  textLineEntry(405, 'Scrolling Text Line', 'Message'),
  textLineEntry(408, 'Comment Line', 'Flow Control'),
  structuralEntry(409, 'End of Skip', 'Flow Control', 'End'),
  structuralEntry(411, 'Else', 'Flow Control', 'Else'),
  structuralEntry(412, 'End of Branch', 'Flow Control', 'End'),
  structuralEntry(413, 'Repeat Above', 'Flow Control', 'Repeat above'),
  {
    id: 'core:505',
    code: 505,
    name: 'Move Route Step',
    category: 'Movement',
    keywords: [],
    fields: [ field('step', 'Step', 0, 'json') ],
    sentence: parts => moveStepPhrase(parts.value('step')),
    structural: true,
  },
  structuralEntry(601, 'If Win', 'Scene Control', 'If won'),
  structuralEntry(602, 'If Escape', 'Scene Control', 'If escaped'),
  structuralEntry(603, 'If Lose', 'Scene Control', 'If lost'),
  structuralEntry(604, 'End of Battle', 'Scene Control', 'End'),
  {
    id: 'core:605',
    code: 605,
    name: 'Shop Item',
    category: 'Scene Control',
    keywords: [],
    fields: [
      field('goodType', 'Type', 0, 'number'),
      field('id', 'Id', 1, 'number'),
      field('priceType', 'Price', 2, 'number'),
      field('price', 'Price', 3, 'number'),
    ],
    sentence: 'Sells {goodType}:{id}',
    structural: true,
  },
  textLineEntry(655, 'Script Line', 'Advanced'),
  textLineEntry(657, 'Plugin Command Line', 'Advanced'),
];

export { STRUCTURAL_ENTRIES };
