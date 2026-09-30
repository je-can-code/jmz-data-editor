import { pluginBasename } from '../../../../services/plugins/PluginsJsReader.ts';
import type { CommandCatalogEntry } from '../catalogTypes.ts';
import { pluginCommandEntry } from '../pluginCommands.ts';
import type { PluginHeader } from './pluginHeader.ts';

/**
 * Turns parsed plugin headers into catalog entries, one per command, so plugin commands sit in the same list as
 * the built-in ones and are found the same way. Each reads "Plugin: <plugin> <command>", the plugin by its file
 * name and the command by the name its plugin gives it, which keeps two plugins' same-named commands apart
 * ("Call the Creation Menu" and "Call the Refinement Menu" are both {@code call-menu}). Everything else about the
 * entry (its id, its typed fields, its sentence) is the catalog's standard plugin command entry. A plugin that
 * {@code js/plugins.js} lists twice contributes its commands once, since the catalog holds one entry per id.
 * @param {readonly PluginHeader[]} headers The headers, in {@code js/plugins.js} order.
 * @returns {CommandCatalogEntry[]} The entries, in the same order, each plugin's commands in its header's order.
 */
const pluginHeaderEntries = (headers: readonly PluginHeader[]): CommandCatalogEntry[] =>
{
  const entries = headers.flatMap(header => header.commands.map(command => ({
    ...pluginCommandEntry(command),
    name: `Plugin: ${pluginBasename(header.plugin)} ${command.text ?? command.command}`,
  })));

  return entries.filter((entry, index) => entries.findIndex(each => each.id === entry.id) === index);
};

export { pluginHeaderEntries };
