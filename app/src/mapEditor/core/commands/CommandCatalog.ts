import type { RmmzEventCommand } from '../model/rmmzTypes.ts';
import type { CommandCatalogEntry } from './catalogTypes.ts';
import { conditionFields } from './commandFields.ts';
import { PLUGIN_COMMAND_CODE, PLUGIN_COMMAND_CONTINUATION_CODE, pluginEntryId } from './pluginCommands.ts';
import { templateFields } from './sentence.ts';

/**
 * Options for a search.
 */
type CatalogSearchOptions = {
  /**
   * How often each entry is used, by entry id, so the commands a project actually uses rank first.
   */
  readonly usage?: ReadonlyMap<string, number>;

  /**
   * How many results at most.
   */
  readonly limit?: number;
};

/**
 * Scores how well a name or keyword matches a query: whole name first, then a start, then a word start, then
 * anywhere; 0 for no match.
 * @param {string} text The name or keyword, lowercase.
 * @param {string} query The query, lowercase.
 * @returns {number} The score.
 */
const matchScore = (text: string, query: string): number =>
{
  if (text === query)
  {
    return 4;
  }

  if (text.startsWith(query))
  {
    return 3;
  }

  if (text.split(/[^a-z0-9]+/u).some(word => word.startsWith(query)))
  {
    return 2;
  }

  return text.includes(query)
    ? 1
    : 0;
};

/**
 * Builds the entry for a command code nobody described yet. It has no fields, so a command it stands for is
 * shown and saved exactly as it came, never rewritten.
 * @param {number} code The command code.
 * @returns {CommandCatalogEntry} The entry.
 */
const unknownEntry = (code: number): CommandCatalogEntry =>
{
  return {
    id: `unknown:${code}`,
    code,
    name: `Command ${code}`,
    category: 'Other',
    keywords: [],
    fields: [],
    sentence: () => `Command ${code}`,
  };
};

/**
 * Builds the entry for a plugin command whose plugin header nobody has read, or whose plugin is gone.
 * @param {string} plugin The plugin's name.
 * @param {string} command The command's name.
 * @returns {CommandCatalogEntry} The entry.
 */
const unknownPluginEntry = (plugin: string, command: string): CommandCatalogEntry =>
{
  return {
    id: pluginEntryId(plugin, command),
    code: PLUGIN_COMMAND_CODE,
    name: `Plugin: ${plugin} ${command}`,
    category: 'Plugin',
    keywords: [ plugin, command ],
    fields: [],
    sentence: () => `Plugin: ${plugin} ${command}`,
    continuation: PLUGIN_COMMAND_CONTINUATION_CODE,
    plugin: { name: plugin, command },
  };
};

/**
 * Every command the editor can describe, built-in and plugin alike, one entry each.
 *
 * Built-in entries are found by code; plugin commands, which all share code 357, by plugin and command name. A
 * command no entry describes still resolves, to an entry with no fields that leaves it exactly as it was, so the
 * list can show every command in every map without ever losing one.
 */
class CommandCatalog
{
  #entries = new Map<string, CommandCatalogEntry>();

  #byCode = new Map<number, CommandCatalogEntry>();

  /**
   * Adds an entry, after checking that its sentence and conditions only name fields it has.
   * @param {CommandCatalogEntry} entry The entry.
   */
  register(entry: CommandCatalogEntry): void
  {
    if (this.#entries.has(entry.id))
    {
      throw new Error(`the catalog already has ${entry.id}`);
    }

    const keys = new Set(entry.fields.map(field => field.key));
    const named = [
      ...(typeof entry.sentence === 'string' ? templateFields(entry.sentence) : []),
      ...entry.fields.flatMap(field => (field.visibleWhen === undefined ? [] : conditionFields(field.visibleWhen))),
    ];
    const missing = named.filter(key => keys.has(key) === false);
    if (missing.length > 0)
    {
      throw new Error(`${entry.id} names fields it does not have: ${[ ...new Set(missing) ].join(', ')}`);
    }

    this.#entries.set(entry.id, entry);
    if (entry.plugin === undefined)
    {
      this.#byCode.set(entry.code, entry);
    }
  }

  /**
   * Removes an entry, as when the plugin behind it is switched off.
   * @param {string} id The entry id.
   * @returns {boolean} True when it was there.
   */
  unregister(id: string): boolean
  {
    const entry = this.#entries.get(id);
    if (entry === undefined)
    {
      return false;
    }

    this.#entries.delete(id);
    if (this.#byCode.get(entry.code) === entry)
    {
      this.#byCode.delete(entry.code);
    }

    return true;
  }

  /**
   * Finds an entry by id.
   * @param {string} id The entry id.
   * @returns {CommandCatalogEntry | null} The entry, or null when there is none.
   */
  entry(id: string): CommandCatalogEntry | null
  {
    return this.#entries.get(id) ?? null;
  }

  /**
   * Lists every entry, in the order registered.
   * @returns {CommandCatalogEntry[]} The entries.
   */
  entries(): CommandCatalogEntry[]
  {
    return [ ...this.#entries.values() ];
  }

  /**
   * Finds the entry that describes a command: its plugin command's entry, its code's entry, or one made up on
   * the spot that keeps it untouched.
   * @param {RmmzEventCommand} command The command.
   * @returns {CommandCatalogEntry} The entry.
   */
  resolve(command: RmmzEventCommand): CommandCatalogEntry
  {
    if (command.code === PLUGIN_COMMAND_CODE)
    {
      const [ plugin, name ] = command.parameters;
      const pluginName = String(plugin ?? '');
      const commandName = String(name ?? '');
      return this.#entries.get(pluginEntryId(pluginName, commandName)) ?? unknownPluginEntry(pluginName, commandName);
    }

    return this.#byCode.get(command.code) ?? unknownEntry(command.code);
  }

  /**
   * Finds the commands a query names, best match first, then most used. Structural codes are never offered.
   * @param {string} query What was typed.
   * @param {CatalogSearchOptions} options Usage counts and a limit.
   * @returns {CommandCatalogEntry[]} The matches.
   */
  search(query: string, options: CatalogSearchOptions = {}): CommandCatalogEntry[]
  {
    const needle = query.trim().toLowerCase();
    const usage = options.usage ?? new Map<string, number>();
    const scored = this.entries()
      .filter(entry => entry.structural !== true)
      .map(entry =>
      {
        // the name counts double, so a name match always outranks a keyword match.
        const nameScore = needle === '' ? 1 : matchScore(entry.name.toLowerCase(), needle) * 2;
        const keywordScore = Math.max(0, ...entry.keywords.map(keyword => matchScore(keyword.toLowerCase(), needle)));
        return { entry, score: Math.max(nameScore, keywordScore), used: usage.get(entry.id) ?? 0 };
      })
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score || right.used - left.used || left.entry.name.localeCompare(right.entry.name));

    return scored.slice(0, options.limit ?? scored.length).map(({ entry }) => entry);
  }
}

export { CommandCatalog };
export type { CatalogSearchOptions };
