import type { CommandCatalogEntry } from '../commands/catalogTypes.ts';
import { parametersFromDefaults } from '../commands/fieldValues.ts';
import { PLUGIN_COMMAND_CONTINUATION_CODE } from '../commands/pluginCommands.ts';
import { cloneJson, isJsonObject, type JsonValue } from '../model/json.ts';
import { readAt } from '../model/patches.ts';
import type { RmmzEventCommand } from '../model/rmmzTypes.ts';
import { freshBlock } from './blockReconcile.ts';
import type { CommandStructure } from './commandTree.ts';

/**
 * What every plugin command entry's name starts with.
 */
const PLUGIN_PREFIX = 'Plugin: ';

/**
 * Builds a fresh plugin command's parameters the way MZ writes one: the plugin, the command, the command's own
 * words, and its arguments at their defaults, as text.
 * @param {CommandCatalogEntry} entry The plugin command's entry.
 * @param {{ name: string, command: string }} plugin The plugin and command it stands for.
 * @returns {JsonValue[]} The parameters.
 */
const pluginParameters = (entry: CommandCatalogEntry, plugin: { readonly name: string; readonly command: string }): JsonValue[] =>
{
  const title = entry.name.startsWith(PLUGIN_PREFIX)
    ? entry.name.slice(PLUGIN_PREFIX.length)
    : entry.name;
  const [ , , , args ] = parametersFromDefaults(entry.fields);
  return [ plugin.name, plugin.command, title, isJsonObject(args) ? args : {} ];
};

/**
 * Builds the lines MZ lists under a fresh plugin command, one per argument.
 * @param {CommandCatalogEntry} entry The plugin command's entry.
 * @param {RmmzEventCommand} head The fresh command.
 * @returns {RmmzEventCommand[]} The lines.
 */
const pluginLines = (entry: CommandCatalogEntry, head: RmmzEventCommand): RmmzEventCommand[] =>
{
  return entry.fields.map(field => ({
    code: PLUGIN_COMMAND_CONTINUATION_CODE,
    indent: head.indent,
    parameters: [ `${field.label} = ${String(readAt(head.parameters, field.param) ?? '')}` ],
  }));
};

/**
 * Builds a fresh command from its entry, ready to insert, at indent 0: the command as MZ would first write it,
 * the lines continuing it, and for a block, the whole block with its bodies and closer.
 * @param {CommandCatalogEntry} entry The entry.
 * @param {CommandStructure} structure How commands nest.
 * @returns {RmmzEventCommand[]} The commands.
 */
const createCommandUnit = (entry: CommandCatalogEntry, structure: CommandStructure): RmmzEventCommand[] =>
{
  let parameters: JsonValue[];
  if (entry.defaultParameters !== undefined)
  {
    parameters = cloneJson([ ...entry.defaultParameters ]);
  }
  else if (entry.plugin !== undefined)
  {
    parameters = pluginParameters(entry, entry.plugin);
  }
  else
  {
    parameters = parametersFromDefaults(entry.fields);
  }

  const head: RmmzEventCommand = { code: entry.code, indent: 0, parameters };
  if (entry.block !== undefined)
  {
    return freshBlock(head, entry.block.end, structure);
  }

  if (entry.deriveContinuation !== undefined)
  {
    return [ head, ...entry.deriveContinuation(head) ];
  }

  return entry.plugin === undefined
    ? [ head ]
    : [ head, ...pluginLines(entry, head) ];
};

export { createCommandUnit };
