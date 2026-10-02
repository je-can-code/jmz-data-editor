import { readPluginEntries } from '../../services/plugins/PluginsJsReader.ts';
import type { MapEditorApi } from '../core/api/MapEditorApi.ts';
import type { PluginModule } from '../core/modules/PluginModule.ts';
import type { PluginModuleRegistry } from '../core/modules/PluginModuleRegistry.ts';
import { jabsModule } from '../modules/jabs/jabsModule.ts';
import { lightingModule } from '../modules/lighting/lightingModule.ts';

/**
 * Every plugin module the editor ships. Each switches on only while its plugins are enabled in js/plugins.js.
 */
const SHIPPED_MODULES: readonly PluginModule[] = [ jabsModule, lightingModule ];

/**
 * Reads js/plugins.js and switches on every shipped module whose plugins it enables. Never rejects: a list that cannot
 * be read leaves the core's kinds on their own, as in a project without those plugins.
 * @param {Pick<MapEditorApi, 'loadPluginList'>} api The server.
 * @param {PluginModuleRegistry} registry The window's registry.
 * @returns {Promise<void>} Settles once the modules are on, or once the list has proved unreadable.
 */
const activatePluginModules = (api: Pick<MapEditorApi, 'loadPluginList'>, registry: PluginModuleRegistry): Promise<void> =>
{
  return api.loadPluginList()
    .then(text =>
    {
      registry.activate(SHIPPED_MODULES, readPluginEntries(text));
    })
    .catch(() => undefined);
};

export { activatePluginModules, SHIPPED_MODULES };
