import { pluginBasename } from '../../../../services/plugins/PluginsJsReader.ts';
import type { PluginCommandSchema, PluginHeader, PluginStructSchema } from './pluginHeader.ts';

/**
 * The plugin headers the editor has read, looked up the ways the plugin command editor needs: by plugin, by
 * command, and a struct by the plugin that declares it.
 */
class PluginHeaderLibrary
{
  #headers: readonly PluginHeader[];

  #byPlugin: ReadonlyMap<string, PluginHeader>;

  /**
   * @param {readonly PluginHeader[]} headers The headers, in {@code js/plugins.js} order.
   */
  constructor(headers: readonly PluginHeader[] = [])
  {
    this.#headers = headers;
    this.#byPlugin = new Map(headers.map(header => [ header.plugin, header ]));
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
   * Replaces the headers and tells every listener.
   * @param {readonly PluginHeader[]} headers The headers.
   */
  set(headers: readonly PluginHeader[]): void
  {
    this.#library = new PluginHeaderLibrary(headers);
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
