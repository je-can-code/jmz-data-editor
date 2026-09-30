import type { CommandCatalogEntry, CommandField, CommandFieldKind, FieldOption } from './catalogTypes.ts';

/**
 * The code RMMZ writes for a plugin command. Its parameters are the plugin's name, the command's name, the
 * command's display text, and an object of arguments, each kept as text.
 */
const PLUGIN_COMMAND_CODE = 357;

/**
 * The code of the lines that follow a plugin command in MZ's list, one per argument, for display.
 */
const PLUGIN_COMMAND_CONTINUATION_CODE = 657;

/**
 * One argument of a plugin command, as a plugin header declares it with {@code @arg}.
 */
type PluginCommandArg = {
  readonly name: string;
  readonly text?: string;
  readonly description?: string;

  /**
   * The header's {@code @type}, verbatim: {@code number}, {@code switch}, {@code struct<Reward>}, {@code number[]}.
   */
  readonly type: string;
  readonly default?: string;
  readonly min?: number;
  readonly max?: number;
  readonly options?: readonly FieldOption[];
  readonly dir?: string;
};

/**
 * One plugin command, as a plugin header declares it with {@code @command}. The header parser produces these;
 * {@link pluginCommandEntry} turns each into a catalog entry, so plugin commands sit in the same list and edit
 * the same way as built-in ones.
 */
type PluginCommandDescriptor = {
  readonly plugin: string;
  readonly command: string;
  readonly text?: string;
  readonly description?: string;
  readonly args: readonly PluginCommandArg[];
};

/**
 * The field kind each simple header type edits as.
 */
const KIND_BY_TYPE: Readonly<Record<string, CommandFieldKind>> = {
  number: 'number',
  boolean: 'boolean',
  string: 'text',
  multiline_string: 'multiline',
  note: 'multiline',
  select: 'select',
  combo: 'select',
  switch: 'switch',
  variable: 'variable',
  actor: 'actor',
  class: 'class',
  skill: 'skill',
  item: 'item',
  weapon: 'weapon',
  armor: 'armor',
  enemy: 'enemy',
  troop: 'troop',
  state: 'state',
  animation: 'animation',
  tileset: 'tileset',
  common_event: 'common-event',
  file: 'file',
  location: 'map-point',
  map: 'map',
};

/**
 * Names the catalog entry of a plugin command.
 * @param {string} plugin The plugin's name as {@code js/plugins.js} spells it.
 * @param {string} command The command's name.
 * @returns {string} The entry id.
 */
const pluginEntryId = (plugin: string, command: string): string =>
{
  return `plugin:${plugin}:${command}`;
};

/**
 * Decides the field kind a header type edits as: lists and structs first, then the simple types, then text.
 * @param {string} type The header's {@code @type}.
 * @returns {CommandFieldKind} The kind.
 */
const kindForPluginType = (type: string): CommandFieldKind =>
{
  const trimmed = type.trim();
  if (trimmed.endsWith('[]'))
  {
    return 'list';
  }

  if (trimmed.startsWith('struct<'))
  {
    return 'struct';
  }

  return KIND_BY_TYPE[trimmed] ?? 'text';
};

/**
 * Splits text into lowercase search words.
 * @param {string} text The text.
 * @returns {string[]} The words.
 */
const wordsOf = (text: string): string[] =>
{
  return text.toLowerCase().split(/[^a-z0-9]+/u).filter(word => word.length > 0);
};

/**
 * Turns a plugin header's command into a catalog entry: named with the {@code Plugin:} prefix, grouped under
 * Plugin, found by its plugin's name, its own and its words, and with one field per argument reading from the
 * command's argument object, where every value is text.
 * @param {PluginCommandDescriptor} descriptor The command as the header declares it.
 * @returns {CommandCatalogEntry} The entry.
 */
const pluginCommandEntry = (descriptor: PluginCommandDescriptor): CommandCatalogEntry =>
{
  const title = descriptor.text ?? descriptor.command;
  const fields: CommandField[] = descriptor.args.map(arg => ({
    key: arg.name,
    label: arg.text ?? arg.name,
    param: [ 3, arg.name ],
    kind: kindForPluginType(arg.type),
    storage: 'string',
    default: arg.default ?? '',
    options: arg.options,
    min: arg.min,
    max: arg.max,
    folder: arg.dir,
    help: arg.description,
  }));

  const keywords = [ ...new Set([
    descriptor.plugin,
    descriptor.command,
    ...wordsOf(descriptor.plugin),
    ...wordsOf(title),
    ...wordsOf(descriptor.description ?? ''),
  ]) ];

  return {
    id: pluginEntryId(descriptor.plugin, descriptor.command),
    code: PLUGIN_COMMAND_CODE,
    name: `Plugin: ${title}`,
    category: 'Plugin',
    keywords,
    fields,
    sentence: parts =>
    {
      // the row names the command, then each argument that holds something.
      const shown = fields
        .map(field => ({ label: field.label, text: parts.text(field.key) }))
        .filter(({ text }) => text !== '')
        .map(({ label, text }) => `${label} ${text}`);
      return shown.length > 0
        ? `${title}: ${shown.join(', ')}`
        : title;
    },
    continuation: PLUGIN_COMMAND_CONTINUATION_CODE,
    plugin: { name: descriptor.plugin, command: descriptor.command },
  };
};

export {
  kindForPluginType,
  PLUGIN_COMMAND_CODE,
  PLUGIN_COMMAND_CONTINUATION_CODE,
  pluginCommandEntry,
  pluginEntryId,
};
export type { PluginCommandArg, PluginCommandDescriptor };
