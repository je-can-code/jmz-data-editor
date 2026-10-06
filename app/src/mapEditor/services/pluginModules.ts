import { readPluginEntries, type PluginsJsEntry } from '../../services/plugins/PluginsJsReader.ts';
import { MapEditorApiError, type MapEditorApi } from '../core/api/MapEditorApi.ts';
import { jsonEquals, type JsonValue } from '../core/model/json.ts';
import type { PluginModule } from '../core/modules/PluginModule.ts';
import { enabledPlugins, type PluginModuleRegistry } from '../core/modules/PluginModuleRegistry.ts';
import { jabsModule } from '../modules/jabs/jabsModule.ts';
import { lightingModule } from '../modules/lighting/lightingModule.ts';

/**
 * Every plugin module the editor ships. Each switches on only while its plugins are enabled in js/plugins.js.
 */
const SHIPPED_MODULES: readonly PluginModule[] = [ jabsModule, lightingModule ];

/**
 * What the modules' switching on reads from the server: js/plugins.js, and the config files the modules name, where the
 * client can read them.
 */
type ModuleSource = Pick<MapEditorApi, 'loadPluginList' | 'loadPluginConfig'>;

/**
 * The config files the modules read: each one's content by name, null for one that could not be read, and why each
 * of those could not.
 */
type ModuleConfigs = {
  readonly contents: Map<string, JsonValue | null>;
  readonly problems: Map<string, string>;
};

/**
 * Why no config could be read by a window whose client cannot read config files at all.
 */
const NO_CONFIG_READER = 'this window cannot read config files';

/**
 * Words why a config could not be read: the server's own words where it gave them, which name the file and what is
 * wrong with it, and otherwise the message of the error the read failed with, such as a server that never answered.
 * @param {Error} error What the read failed with.
 * @returns {string} Why.
 */
const problemOf = (error: Error): string =>
{
  return error instanceof MapEditorApiError && error.detail !== ''
    ? error.detail
    : error.message;
};

/**
 * Reads the config files named by the modules that are about to switch on, and only theirs, so a project without a
 * plugin is never asked for that plugin's config. A file the server cannot give, or a client that cannot read configs
 * at all, reads as null, and why is kept, so the module can say so rather than quietly falling back.
 * @param {ModuleSource} api The server.
 * @param {readonly PluginModule[]} modules The modules.
 * @param {readonly PluginsJsEntry[]} plugins The project's plugins.
 * @returns {Promise<ModuleConfigs>} The configs, by name, and why any could not be read.
 */
const readModuleConfigs = async (
  api: ModuleSource,
  modules: readonly PluginModule[],
  plugins: readonly PluginsJsEntry[]): Promise<ModuleConfigs> =>
{
  const enabled = enabledPlugins(plugins);
  const names = new Set(modules
    .filter(pluginModule => pluginModule.plugins.every(name => enabled.has(name)))
    .flatMap(pluginModule => pluginModule.configs ?? []));
  const read = async (name: string): Promise<{ name: string; content: JsonValue | null; problem: string | null }> =>
  {
    if (api.loadPluginConfig === undefined)
    {
      return { name, content: null, problem: NO_CONFIG_READER };
    }

    return api.loadPluginConfig(name)
      .then(content => ({ name, content, problem: null }))
      .catch((error: Error) => ({ name, content: null, problem: problemOf(error) }));
  };

  const reads = await Promise.all([ ...names ].map(read));
  return {
    contents: new Map(reads.map(each => [ each.name, each.content ])),
    problems: new Map(reads.flatMap(each => (each.problem === null ? [] : [ [ each.name, each.problem ] as const ]))),
  };
};

/**
 * What one switching on was built from: js/plugins.js as read, and the configs read for it.
 */
type ModuleInputs = {
  readonly list: string;
  readonly configs: ModuleConfigs;
};

/**
 * Where a project's config files sit, as the server's config routes read them: {@code data/config.lighting.json} holds
 * the config named {@code lighting}.
 */
const CONFIG_FILE = /^data\/config\.([a-z0-9-]+)\.json$/u;

/**
 * Reports whether two reads found the project the same: the same plugin list, the same configs, and the same reasons
 * for any config that could not be read. The same list enables the same modules, which name the same configs, so the
 * two reads hold the same names and compare name by name; a config read in one and not the other differs in content.
 * @param {ModuleInputs} left One read.
 * @param {ModuleInputs} right The other.
 * @returns {boolean} True when switching the modules on from either would make the same modules.
 */
const sameInputs = (left: ModuleInputs, right: ModuleInputs): boolean =>
{
  return left.list === right.list
    && [ ...left.configs.contents ].every(([ name, content ]) => jsonEquals(content, right.configs.contents.get(name)))
    && [ ...left.configs.problems ].every(([ name, problem ]) => problem === right.configs.problems.get(name));
};

/**
 * Reports whether a changed file is a config one of the modules reads, so the modules should read their configs again.
 * @param {string} path The file, relative to the project root, as the change stream names it.
 * @param {readonly PluginModule[]} modules The modules; by default, the ones the editor ships.
 * @returns {boolean} True for a config some module names.
 */
const isModuleConfigFile = (path: string, modules: readonly PluginModule[] = SHIPPED_MODULES): boolean =>
{
  const match = CONFIG_FILE.exec(path);
  if (match === null)
  {
    return false;
  }

  const [ , name ] = match;
  return modules.some(pluginModule => (pluginModule.configs ?? []).includes(name));
};

/**
 * Keeps one window's plugin modules switched on as the project stands. Each refresh reads js/plugins.js, then the config
 * files of the modules it enables, and switches those modules on, unless what it read is exactly what they were last
 * switched on from, so asking again when nothing changed costs two reads and nothing more. Reads never overlap: asks
 * that come while a read is running are answered by one more read after it, however many came. A refresh never
 * rejects: a list that cannot be read leaves the modules as they were, which before the first read is the core's kinds
 * on their own, as in a project without those plugins.
 */
class ModuleActivation
{
  #api: ModuleSource;

  #registry: PluginModuleRegistry;

  #applied: ModuleInputs | null = null;

  #queue: Promise<void> = Promise.resolve();

  #waiting = false;

  /**
   * @param {ModuleSource} api The server.
   * @param {PluginModuleRegistry} registry The window's registry.
   */
  constructor(api: ModuleSource, registry: PluginModuleRegistry)
  {
    this.#api = api;
    this.#registry = registry;
  }

  /**
   * Reads the project again and switches the modules on afresh if anything they are built from changed.
   * @returns {Promise<void>} Settles once a read that started after this ask has finished.
   */
  refresh(): Promise<void>
  {
    // a read queued but not yet begun will see whatever this ask is about.
    if (this.#waiting)
    {
      return this.#queue;
    }

    this.#waiting = true;
    this.#queue = this.#queue.then(() =>
    {
      this.#waiting = false;
      return this.#read();
    });
    return this.#queue;
  }

  /**
   * Reads the plugin list and the configs, and switches the modules on when either differs from what they were last
   * switched on from.
   * @returns {Promise<void>} Settles once done, or once the list has proved unreadable.
   */
  #read(): Promise<void>
  {
    return this.#api.loadPluginList()
      .then(async list =>
      {
        const plugins = readPluginEntries(list);
        const read: ModuleInputs = { list, configs: await readModuleConfigs(this.#api, SHIPPED_MODULES, plugins) };
        if (this.#applied !== null && sameInputs(this.#applied, read))
        {
          return;
        }

        this.#applied = read;
        this.#registry.activate(SHIPPED_MODULES, plugins, read.configs.contents, read.configs.problems);
      })
      .catch(() => undefined);
  }
}

/**
 * Reads js/plugins.js, then the config files of the modules it switches on, and switches those modules on. Never
 * rejects: a list that cannot be read leaves the core's kinds on their own, as in a project without those plugins.
 * @param {ModuleSource} api The server.
 * @param {PluginModuleRegistry} registry The window's registry.
 * @returns {Promise<void>} Settles once the modules are on, or once the list has proved unreadable.
 */
const activatePluginModules = (api: ModuleSource, registry: PluginModuleRegistry): Promise<void> =>
{
  return new ModuleActivation(api, registry).refresh();
};

export { activatePluginModules, isModuleConfigFile, ModuleActivation, readModuleConfigs, SHIPPED_MODULES };
export type { ModuleConfigs, ModuleSource };
