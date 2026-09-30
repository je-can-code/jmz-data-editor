import type { PluginArgSchema, PluginCommandSchema, PluginHeader, PluginStructSchema } from './pluginHeader.ts';

/**
 * Finds the comment blocks MZ reads a plugin's header from: {@code /*:} (with a language after the colon for a
 * translation, as {@code /*:ja}) and {@code /*~struct~Name:} (the colon is optional; some plugins leave it off).
 * The marker must be followed by whitespace, so JSDoc and ordinary comments never match.
 */
const HEADER_BLOCK = /\/\*(?::([A-Za-z_-]*)|~struct~([A-Za-z0-9_]+)(?::([A-Za-z_-]*))?)(?=\s)([\s\S]*?)\*\//gu;

/**
 * Matches a tag line once its leading asterisk is gone: the tag's name, then its value.
 */
const TAG_LINE = /^@([A-Za-z]+)\s*(.*)$/u;

/**
 * An argument or struct field while its tags are still being read.
 */
type ArgDraft = {
  name: string;
  text?: string;
  description?: string;
  type?: string;
  default?: string;
  min?: number;
  max?: number;
  decimals?: number;
  dir?: string;
  on?: string;
  off?: string;
  require?: boolean;
  parent?: string;
  options: { value: string; label: string }[];
};

/**
 * A command while its tags are still being read.
 */
type CommandDraft = {
  command: string;
  text?: string;
  description?: string;
  args: ArgDraft[];
};

/**
 * One header block, found in the source.
 */
type HeaderBlock = {
  readonly struct: string | null;
  readonly language: string;
  readonly body: string;
};

/**
 * What a block reads into: its description, its commands, and its parameters (a struct's fields, or the plugin's
 * own settings).
 */
type BlockReading = {
  description: string;
  commands: CommandDraft[];
  params: ArgDraft[];
};

/**
 * Carries a tag on over the next line of the block.
 */
type Continuation = ((line: string) => void) | null;

/**
 * Lists the header blocks in a plugin's source.
 * @param {string} source The plugin's source.
 * @returns {HeaderBlock[]} The blocks, in the order they appear.
 */
const headerBlocks = (source: string): HeaderBlock[] =>
{
  return [ ...source.matchAll(HEADER_BLOCK) ].map(([ , mainLanguage, struct, structLanguage, body ]) => ({
    struct: struct ?? null,
    language: (struct === undefined ? mainLanguage : structLanguage) ?? '',
    body,
  }));
};

/**
 * Picks the block to read from a block's translations: the untranslated one first, then English, then whichever
 * came first.
 * @param {readonly HeaderBlock[]} blocks The translations of one block.
 * @returns {HeaderBlock | undefined} The block to read.
 */
const pickLanguage = (blocks: readonly HeaderBlock[]): HeaderBlock | undefined =>
{
  return blocks.find(block => block.language === '')
    ?? blocks.find(block => block.language === 'en')
    ?? blocks.at(0);
};

/**
 * Splits a block's body into lines with the comment's leading asterisk taken off. Plugins written without
 * asterisks read the same.
 * @param {string} body The block's body.
 * @returns {string[]} The lines, trimmed.
 */
const bodyLines = (body: string): string[] =>
{
  return body.split(/\r?\n/u).map(line => line.replace(/^\s*\*?/u, '').trim());
};

/**
 * Reads a tag's value as a number.
 * @param {string} value The value.
 * @returns {number | undefined} The number, or undefined when it is not one.
 */
const numberTag = (value: string): number | undefined =>
{
  const number = Number(value);
  return value !== '' && Number.isFinite(number)
    ? number
    : undefined;
};

/**
 * Drops the keys a header never set, so a schema holds only what the plugin said.
 * @param {T} value The object.
 * @returns {T} The object without its undefined keys.
 */
const compact = <T extends object>(value: T): T =>
{
  return Object.fromEntries(Object.entries(value).filter(([ , each ]) => each !== undefined)) as T;
};

/**
 * Builds the continuation of a description: each further line joins it on a line of its own.
 * @param {{ description?: string }} target What the description belongs to.
 * @returns {(line: string) => void} The continuation.
 */
const continueDescription = (target: { description?: string }): ((line: string) => void) =>
{
  return next =>
  {
    target.description = `${target.description ?? ''}\n${next}`.trim();
  };
};

/**
 * Applies one tag to the argument or field being read.
 * @param {ArgDraft} draft The argument.
 * @param {string} tag The tag's name.
 * @param {string} value Its value.
 */
const applyArgTag = (draft: ArgDraft, tag: string, value: string): void =>
{
  const lastOption = draft.options.at(-1);
  switch (tag)
  {
    case 'text':
    case 'type':
    case 'default':
    case 'dir':
    case 'on':
    case 'off':
    case 'parent':
      draft[tag] = value;
      break;
    case 'desc':
      draft.description = value;
      break;
    case 'min':
    case 'max':
    case 'decimals':
      draft[tag] = numberTag(value);
      break;
    case 'require':
      draft.require = value === '1' || value.toLowerCase() === 'true';
      break;
    case 'option':
      draft.options.push({ value, label: value });
      break;
    case 'value':
      if (lastOption !== undefined)
      {
        lastOption.value = value;
      }
      break;
  }
};

/**
 * Applies a tag to whatever is being read: a command takes its text and description, an argument or field
 * everything. A description can carry on over the following lines, so this answers how to continue it.
 * @param {ArgDraft | CommandDraft | null} target What is being read, or null outside any command or argument.
 * @param {string} tag The tag's name.
 * @param {string} value Its value.
 * @returns {Continuation} How to continue the tag on the next line, or null when it cannot be.
 */
const applyTag = (target: ArgDraft | CommandDraft | null, tag: string, value: string): Continuation =>
{
  if (target === null)
  {
    return null;
  }

  if ('command' in target)
  {
    if (tag === 'text')
    {
      target.text = value;
    }
    else if (tag === 'desc')
    {
      target.description = value;
    }
  }
  else
  {
    applyArgTag(target, tag, value);
  }

  return tag === 'desc'
    ? continueDescription(target)
    : null;
};

/**
 * Reads the tags of one block. An {@code @arg} belongs to the {@code @command} before it until the next command
 * or parameter; a description may carry on over the lines after its tag, up to a blank line or the next tag;
 * every other untagged line (the help text) is passed over.
 * @param {string} body The block's body.
 * @returns {BlockReading} What the block declares.
 */
const readBlock = (body: string): BlockReading =>
{
  const reading: BlockReading = { description: '', commands: [], params: [] };
  let command: CommandDraft | null = null;
  let target: ArgDraft | CommandDraft | null = null;
  let continuing: Continuation = null;

  bodyLines(body).forEach(line =>
  {
    const match = TAG_LINE.exec(line);
    if (match === null)
    {
      // a blank line ends a description; anything else continues it.
      if (line === '')
      {
        continuing = null;
      }
      else if (continuing !== null)
      {
        continuing(line);
      }
      return;
    }

    const [ , tag, value ] = match;
    continuing = null;
    if (tag === 'command')
    {
      command = { command: value, args: [] };
      reading.commands.push(command);
      target = command;
    }
    else if (tag === 'arg')
    {
      const arg: ArgDraft = { name: value, options: [] };
      command?.args.push(arg);
      target = command === null ? null : arg;
    }
    else if (tag === 'param')
    {
      const param: ArgDraft = { name: value, options: [] };
      reading.params.push(param);
      command = null;
      target = param;
    }
    else if (tag === 'plugindesc')
    {
      reading.description = value;
      continuing = continueDescription(reading);
    }
    else
    {
      continuing = applyTag(target, tag, value);
    }
  });

  return reading;
};

/**
 * Turns a finished argument into its schema, leaving out whatever the header never said. An argument with no
 * type is text, as it is in MZ.
 * @param {ArgDraft} draft The argument.
 * @returns {PluginArgSchema} The schema.
 */
const finishArg = (draft: ArgDraft): PluginArgSchema =>
{
  const { options, type, ...rest } = draft;
  return compact({
    ...rest,
    type: type === undefined || type === '' ? 'string' : type,
    options: options.length > 0 ? options : undefined,
  });
};

/**
 * Turns the finished commands into schemas. A command declared twice keeps its first declaration.
 * @param {string} plugin The plugin's name.
 * @param {readonly CommandDraft[]} drafts The commands.
 * @returns {PluginCommandSchema[]} The schemas.
 */
const finishCommands = (plugin: string, drafts: readonly CommandDraft[]): PluginCommandSchema[] =>
{
  const seen = new Set<string>();
  return drafts
    .filter(draft =>
    {
      const fresh = draft.command !== '' && seen.has(draft.command) === false;
      seen.add(draft.command);
      return fresh;
    })
    .map(draft => compact({
      plugin,
      command: draft.command,
      text: draft.text,
      description: draft.description,
      args: draft.args.map(finishArg),
    }));
};

/**
 * Reads the structs a plugin declares, each in the language its header is read in.
 * @param {readonly HeaderBlock[]} blocks Every header block of the plugin.
 * @returns {PluginStructSchema[]} The structs, in the order first declared.
 */
const readStructs = (blocks: readonly HeaderBlock[]): PluginStructSchema[] =>
{
  const names = [ ...new Set(blocks.flatMap(block => (block.struct === null ? [] : [ block.struct ]))) ];
  return names.map(name =>
  {
    const chosen = pickLanguage(blocks.filter(block => block.struct === name)) as HeaderBlock;
    return { name, params: readBlock(chosen.body).params.map(finishArg) };
  });
};

/**
 * Reads a plugin's header: its description, the commands it offers with every argument typed, and the structs
 * those arguments use. Only MZ's header blocks are read, never the plugin's other comments, and a translated
 * header is only used when there is no untranslated one.
 * @param {string} plugin The plugin's name as {@code js/plugins.js} spells it.
 * @param {string} source The plugin's source.
 * @returns {PluginHeader} What the header declares; a plugin with no header declares nothing.
 */
const parsePluginHeader = (plugin: string, source: string): PluginHeader =>
{
  const blocks = headerBlocks(source);
  const main = pickLanguage(blocks.filter(block => block.struct === null));
  const reading = main === undefined
    ? { description: '', commands: [], params: [] }
    : readBlock(main.body);

  return {
    plugin,
    description: reading.description,
    commands: finishCommands(plugin, reading.commands),
    structs: readStructs(blocks),
  };
};

export { parsePluginHeader };
