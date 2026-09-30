import type { CommandCatalogEntry } from '../catalogTypes.ts';
import { PLUGIN_COMMAND_CODE, PLUGIN_COMMAND_CONTINUATION_CODE } from '../pluginCommands.ts';
import { field } from './fieldHelpers.ts';

/**
 * The Advanced group: scripts and plugin commands.
 *
 * Plugin Command here is the generic one, which is what the list offers for picking a plugin's command; every
 * plugin command already in a list resolves to its own plugin's entry instead, so its row reads in its own words.
 */
const ADVANCED_ENTRIES: readonly CommandCatalogEntry[] = [
  {
    id: 'core:355',
    code: 355,
    name: 'Script',
    category: 'Advanced',
    keywords: [ 'script', 'code', 'javascript', 'js', 'eval', 'custom' ],
    fields: [
      field('script', 'Script', 0, 'multiline', { lines: 'first-and-continuation', default: '' }),
    ],
    sentence: parts =>
    {
      const [ first, ...rest ] = String(parts.value('script') ?? '').split('\n');
      return rest.length === 0
        ? `Script: ${first}`
        : `Script: ${first} (and ${rest.length} more ${rest.length === 1 ? 'line' : 'lines'})`;
    },
    continuation: 655,
    defaultParameters: [ '' ],
  },
  {
    id: `core:${PLUGIN_COMMAND_CODE}`,
    code: PLUGIN_COMMAND_CODE,
    name: 'Plugin Command',
    category: 'Advanced',
    keywords: [ 'plugin', 'command', 'extension' ],
    fields: [],
    sentence: 'Plugin command',
    continuation: PLUGIN_COMMAND_CONTINUATION_CODE,
    defaultParameters: [ '', '', '', {} ],
  },
  {
    id: 'core:356',
    code: 356,
    name: 'Plugin Command (MV)',
    category: 'Advanced',
    keywords: [ 'plugin', 'mv', 'legacy', 'old plugin' ],
    fields: [
      field('text', 'Command', 0, 'text', { default: '' }),
    ],
    sentence: 'Plugin command (MV): {text}',
    defaultParameters: [ '' ],
  },
];

export { ADVANCED_ENTRIES };
