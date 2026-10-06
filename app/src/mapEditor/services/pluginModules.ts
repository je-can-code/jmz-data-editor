import { readPluginEntries, type PluginsJsEntry } from '../../services/plugins/PluginsJsReader.ts';
import { MapEditorApiError, type MapEditorApi } from '../core/api/MapEditorApi.ts';
import type { JsonValue } from '../core/model/json.ts';
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
 * Reads js/plugins.js, then the config files of the modules it switches on, and switches those modules on. Never
 * rejects: a list that cannot be read leaves the core's kinds on their own, as in a project without those plugins.
 * @param {ModuleSource} api The server.
 * @param {PluginModuleRegistry} registry The window's registry.
 * @returns {Promise<void>} Settles once the modules are on, or once the list has proved unreadable.
 */
const activatePluginModules = (api: ModuleSource, registry: PluginModuleRegistry): Promise<void> =>
{
  return api.loadPluginList()
    .then(async text =>
    {
      const plugins = readPluginEntries(text);
      const { contents, problems } = await readModuleConfigs(api, SHIPPED_MODULES, plugins);
      registry.activate(SHIPPED_MODULES, plugins, contents, problems);
    })
    .catch(() => undefined);
};

export { activatePluginModules, readModuleConfigs, SHIPPED_MODULES };
export type { ModuleConfigs, ModuleSource };
