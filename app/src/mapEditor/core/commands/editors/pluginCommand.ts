import { cloneJson, isJsonObject, jsonEquals, type JsonObject, type JsonValue } from '../../model/json.ts';
import type { RmmzEventCommand } from '../../model/rmmzTypes.ts';
import { PLUGIN_COMMAND_CODE, PLUGIN_COMMAND_CONTINUATION_CODE } from '../pluginCommands.ts';
import type { PluginArgSchema, PluginCommandSchema } from '../pluginHeaders/pluginHeader.ts';
import { areTextLines, createCommand, withParameters } from './commandShape.ts';

/**
 * The longest line MZ writes after a plugin command before cutting it short with an ellipsis.
 */
const MAX_LINE_LENGTH = 59;

/**
 * A plugin command read for editing: which plugin and command it calls, the command's name as the plugin
 * called it when it was written, and its arguments, each kept as text the way MZ stores them.
 */
type PluginCommandModel = {
  readonly plugin: string;
  readonly command: string;
  readonly text: string;
  readonly args: Readonly<JsonObject>;
};

/**
 * Reads a plugin command. The lines after it are MZ's display of its arguments; nothing reads them, but they
 * must be single lines of text for the command to be MZ-shaped.
 * @param {RmmzEventCommand} command The plugin command.
 * @param {readonly RmmzEventCommand[]} continuation The 657 lines after it.
 * @returns {PluginCommandModel | null} The model, or null when not MZ-shaped.
 */
const parsePluginCommand = (command: RmmzEventCommand, continuation: readonly RmmzEventCommand[]): PluginCommandModel | null =>
{
  const { code, parameters } = command;
  const [ plugin, name, text, args ] = parameters;
  if (code !== PLUGIN_COMMAND_CODE
    || parameters.length !== 4
    || typeof plugin !== 'string'
    || typeof name !== 'string'
    || typeof text !== 'string'
    || isJsonObject(args) === false
    || areTextLines(continuation, PLUGIN_COMMAND_CONTINUATION_CODE) === false)
  {
    return null;
  }

  return { plugin, command: name, text, args: cloneJson(args) };
};

/**
 * Writes an argument's value as MZ's display line shows it: on one line.
 * @param {JsonValue} value The stored value.
 * @returns {string} The value as shown.
 */
const displayValue = (value: JsonValue): string =>
{
  const text = typeof value === 'object' && value !== null
    ? JSON.stringify(value)
    : String(value);
  return text.replace(/\r?\n/gu, ' ');
};

/**
 * Builds one display line, cut short with an ellipsis past the length MZ allows.
 * @param {string} label What the argument is called.
 * @param {JsonValue} value Its value.
 * @returns {string} The line.
 */
const displayLine = (label: string, value: JsonValue): string =>
{
  const line = `${label} = ${displayValue(value)}`;
  return line.length > MAX_LINE_LENGTH
    ? `${line.slice(0, MAX_LINE_LENGTH)}…`
    : line;
};

/**
 * Builds the lines MZ writes after a plugin command: one per argument, in the order the header lists them, named
 * as the header names them; any argument the header does not know follows, under its own name. Without a header,
 * every argument is listed in the order it is stored.
 * @param {PluginCommandModel} model The command.
 * @param {PluginCommandSchema | null} schema Its header's declaration, or null when there is none.
 * @param {number} indent The command's indent.
 * @returns {RmmzEventCommand[]} The lines.
 */
const pluginCommandLines = (model: PluginCommandModel, schema: PluginCommandSchema | null, indent: number): RmmzEventCommand[] =>
{
  const declared = schema?.args ?? [];
  const known = declared
    .filter(arg => Object.hasOwn(model.args, arg.name))
    .map(arg => displayLine(arg.text ?? arg.name, model.args[arg.name]));
  const unknown = Object.keys(model.args)
    .filter(name => declared.some(arg => arg.name === name) === false)
    .map(name => displayLine(name, model.args[name]));

  return [ ...known, ...unknown ].map(line => createCommand(PLUGIN_COMMAND_CONTINUATION_CODE, indent, [ line ]));
};

/**
 * Writes a plugin command back. The display lines stay exactly as they were while the command still calls the
 * same thing with the same arguments (some commands were written by tools that left them out, and MZ's own cut
 * varies), and are rebuilt the way MZ builds them as soon as anything changes.
 * @param {RmmzEventCommand} command The command as it stood.
 * @param {readonly RmmzEventCommand[]} continuation Its lines as they stood.
 * @param {PluginCommandModel} model What it should now call.
 * @param {PluginCommandSchema | null} schema The header's declaration of the command, or null when there is none.
 * @returns {{ command: RmmzEventCommand, continuation: RmmzEventCommand[] }} The command and its lines.
 */
const writePluginCommand = (
  command: RmmzEventCommand,
  continuation: readonly RmmzEventCommand[],
  model: PluginCommandModel,
  schema: PluginCommandSchema | null,
): { command: RmmzEventCommand; continuation: RmmzEventCommand[] } =>
{
  const { plugin, text, args } = model;
  const unchanged = jsonEquals(parsePluginCommand(command, continuation), model);
  return {
    command: withParameters(command, [ plugin, model.command, text, cloneJson(args) ]),
    continuation: unchanged
      ? cloneJson([ ...continuation ])
      : pluginCommandLines(model, schema, command.indent),
  };
};

/**
 * Sets one argument, keeping every other argument, the ones the header no longer knows included, where it is.
 * @param {PluginCommandModel} model The command.
 * @param {string} name The argument.
 * @param {string} value Its new value, as text.
 * @returns {PluginCommandModel} The command.
 */
const setPluginArg = (model: PluginCommandModel, name: string, value: string): PluginCommandModel =>
{
  return { ...model, args: { ...model.args, [name]: value } };
};

/**
 * Reads the value a new command gives an argument: its header default, or empty.
 * @param {PluginArgSchema} arg The argument.
 * @returns {string} The value.
 */
const pluginArgDefault = (arg: PluginArgSchema): string =>
{
  return arg.default ?? '';
};

/**
 * Points the command at another plugin command, with every argument that command declares at its default, as MZ
 * starts a newly picked command.
 * @param {PluginCommandModel} model The command.
 * @param {PluginCommandSchema} schema The command to call.
 * @returns {PluginCommandModel} The command.
 */
const choosePluginCommand = (model: PluginCommandModel, schema: PluginCommandSchema): PluginCommandModel =>
{
  if (model.plugin === schema.plugin && model.command === schema.command)
  {
    return model;
  }

  return {
    plugin: schema.plugin,
    command: schema.command,
    text: schema.text ?? schema.command,
    args: Object.fromEntries(schema.args.map(arg => [ arg.name, pluginArgDefault(arg) ])),
  };
};

export {
  choosePluginCommand,
  MAX_LINE_LENGTH,
  parsePluginCommand,
  pluginArgDefault,
  pluginCommandLines,
  setPluginArg,
  writePluginCommand,
};
export type { PluginCommandModel };
