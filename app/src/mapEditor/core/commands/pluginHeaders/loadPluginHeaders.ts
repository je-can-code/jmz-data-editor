import { readPluginEntries } from '../../../../services/plugins/PluginsJsReader.ts';
import type { MapEditorApi } from '../../api/MapEditorApi.ts';
import { parsePluginHeader } from './parsePluginHeader.ts';
import type { PluginHeader } from './pluginHeader.ts';

/**
 * Reads the header of every enabled plugin: {@code js/plugins.js} says which plugins are on, and each one's
 * source comes through the server. A plugin switched off is never read, and one whose file is missing is left
 * out, so a stale entry in {@code js/plugins.js} costs nothing but its commands.
 * @param {Pick<MapEditorApi, 'loadPluginList' | 'loadPluginSource'>} api The server.
 * @returns {Promise<PluginHeader[]>} The headers, in {@code js/plugins.js} order.
 */
const loadPluginHeaders = async (api: Pick<MapEditorApi, 'loadPluginList' | 'loadPluginSource'>): Promise<PluginHeader[]> =>
{
  const enabled = readPluginEntries(await api.loadPluginList()).filter(entry => entry.status);
  const sources = await Promise.all(enabled.map(entry => api.loadPluginSource(entry.name)));

  return enabled.flatMap((entry, index) =>
  {
    const source = sources[index];
    return source === null
      ? []
      : [ parsePluginHeader(entry.name, source) ];
  });
};

export { loadPluginHeaders };
