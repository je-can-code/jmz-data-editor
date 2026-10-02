import { pluginBasename, type PluginsJsEntry } from '../../../../services/plugins/PluginsJsReader.ts';
import { checkPluginCommandRegistration, type PluginCommandRegistration } from './pluginCommandRegistration.ts';
import type { PluginCommandSchema, PluginHeader, PluginStructSchema } from './pluginHeader.ts';

/**
 * The plugin headers the editor has read, looked up the ways the plugin command editor needs: by plugin, by
 * command, and a struct by the plugin that declares it. Also keeps every entry {@code js/plugins.js} lists,
 * enabled or not, since telling a disabled or unknown plugin apart from an enabled one that simply does not
 * declare a command needs the whole list, not only the enabled headers.
 */
class PluginHeaderLibrary
{
  #headers: readonly PluginHeader[];

  #byPlugin: ReadonlyMap<string, PluginHeader>;

  #entries: readonly PluginsJsEntry[];

  /**
   * @param {readonly PluginHeader[]} headers The headers, in {@code js/plugins.js} order.
   * @param {readonly PluginsJsEntry[]} entries Every entry {@code js/plugins.js} lists, enabled or not.
   */
  constructor(headers: readonly PluginHeader[] = [], entries: readonly PluginsJsEntry[] = [])
  {
    this.#headers = headers;
    this.#byPlugin = new Map(headers.map(header => [ header.plugin, header ]));
    this.#entries = entries;
  }

  /**
   * Lists every header, in {@code js/plugins.js} order.
   * @returns {readonly PluginHeader[]} The headers.
   */
  headers(): readonly PluginHeader[]
  {
    return this.#headers;
  }

  /**
   * Lists the headers of the plugins that offer commands, which are the ones a plugin command can pick.
   * @returns {PluginHeader[]} The headers.
   */
  withCommands(): PluginHeader[]
  {
    return this.#headers.filter(header => header.commands.length > 0);
  }

  /**
   * Finds a plugin's header.
   * @param {string} plugin The plugin's name as {@code js/plugins.js} spells it.
   * @returns {PluginHeader | null} The header, or null when the plugin was not read.
   */
  header(plugin: string): PluginHeader | null
  {
    return this.#byPlugin.get(plugin) ?? null;
  }

  /**
   * Finds a command a plugin's header declares.
   * @param {string} plugin The plugin's name.
   * @param {string} command The command's name.
   * @returns {PluginCommandSchema | null} The command, or null when the header does not declare it.
   */
  command(plugin: string, command: string): PluginCommandSchema | null
  {
    return this.header(plugin)?.commands.find(each => each.command === command) ?? null;
  }

  /**
   * Checks whether a plugin command is registered: its plugin must be one {@code js/plugins.js} lists and
   * enables, and that plugin's header must declare a command by this exact name. The command list and the
   * plugin command editor both read this to flag a stale or mistyped command before it ships silently broken.
   * @param {string} plugin The plugin's name, as the command stores it.
   * @param {string} command The command's name, as the command stores it.
   * @returns {PluginCommandRegistration} Registered, or not, with why.
   */
  registrationOf(plugin: string, command: string): PluginCommandRegistration
  {
    return checkPluginCommandRegistration(plugin, command, this.#entries, (p, c) => this.command(p, c) !== null);
  }

  /**
   * Finds a struct a plugin's header declares.
   * @param {string} plugin The plugin's name.
   * @param {string} name The struct's name.
   * @returns {PluginStructSchema | null} The struct, or null when the header does not declare it.
   */
  struct(plugin: string, name: string): PluginStructSchema | null
  {
    return this.header(plugin)?.structs.find(each => each.name === name) ?? null;
  }

  /**
   * Names a plugin the way the editor shows it: its file name, without the folders {@code js/plugins.js} keeps it in.
   * @param {string} plugin The plugin's name.
   * @returns {string} The name to show.
   */
  static displayName(plugin: string): string
  {
    return pluginBasename(plugin);
  }
}

/**
 * Holds the current library while the headers load, and tells whoever listens when it changes, so editors
 * opened before the headers arrived pick them up.
 */
class PluginHeaderStore
{
  #library = new PluginHeaderLibrary();

  #listeners = new Set<() => void>();

  /**
   * Reads the current library.
   * @returns {PluginHeaderLibrary} The library; empty until headers are set.
   */
  library(): PluginHeaderLibrary
  {
    return this.#library;
  }

  /**
   * Replaces the headers and the full plugin list, and tells every listener.
   * @param {readonly PluginHeader[]} headers The headers.
   * @param {readonly PluginsJsEntry[]} entries Every entry {@code js/plugins.js} lists, enabled or not.
   */
  set(headers: readonly PluginHeader[], entries: readonly PluginsJsEntry[] = []): void
  {
    this.#library = new PluginHeaderLibrary(headers, entries);
    [ ...this.#listeners ].forEach(listener => listener());
  }

  /**
   * Listens for the headers changing.
   * @param {() => void} listener Called after each change.
   * @returns {() => void} Stops listening.
   */
  subscribe(listener: () => void): () => void
  {
    this.#listeners.add(listener);
    return () =>
    {
      this.#listeners.delete(listener);
    };
  }
}

export { PluginHeaderLibrary, PluginHeaderStore };
