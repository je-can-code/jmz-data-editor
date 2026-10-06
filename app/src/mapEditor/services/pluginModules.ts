import { readPluginEntries, type PluginsJsEntry } from '../../services/plugins/PluginsJsReader.ts';
import type { MapEditorApi } from '../core/api/MapEditorApi.ts';
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
 * Reads the config files named by the modules that are about to switch on, and only theirs, so a project without a
 * plugin is never asked for that plugin's config. A file the server cannot give, or a client that cannot read configs
 * at all, reads as null.
 * @param {ModuleSource} api The server.
 * @param {readonly PluginModule[]} modules The modules.
 * @param {readonly PluginsJsEntry[]} plugins The project's plugins.
 * @returns {Promise<Map<string, JsonValue | null>>} The configs, by name.
 */
const readModuleConfigs = async (
  api: ModuleSource,
  modules: readonly PluginModule[],
  plugins: readonly PluginsJsEntry[]): Promise<Map<string, JsonValue | null>> =>
{
  const enabled = enabledPlugins(plugins);
  const names = new Set(modules
    .filter(pluginModule => pluginModule.plugins.every(name => enabled.has(name)))
    .flatMap(pluginModule => pluginModule.configs ?? []));
  const read = async (name: string): Promise<[ string, JsonValue | null ]> =>
  {
    if (api.loadPluginConfig === undefined)
    {
      return [ name, null ];
    }

    const config = await api.loadPluginConfig(name).catch(() => null);
    return [ name, config ];
  };

  return new Map(await Promise.all([ ...names ].map(read)));
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
      const configs = await readModuleConfigs(api, SHIPPED_MODULES, plugins);
      registry.activate(SHIPPED_MODULES, plugins, configs);
    })
    .catch(() => undefined);
};

export { activatePluginModules, readModuleConfigs, SHIPPED_MODULES };
export type { ModuleSource };
