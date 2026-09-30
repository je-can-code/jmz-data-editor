import { readPluginEntries, type PluginsJsEntry } from '../../../../services/plugins/PluginsJsReader.ts';
import type { MapEditorApi } from '../../api/MapEditorApi.ts';
import { parsePluginHeader } from './parsePluginHeader.ts';
import type { PluginHeader } from './pluginHeader.ts';

/**
 * What one read of {@code js/plugins.js} and its enabled plugins' sources produces: every entry the file
 * lists, enabled or not, and the header of each enabled one whose source could be fetched. The full list
 * travels alongside the headers so a plugin command can be checked against a disabled or unknown plugin, not
 * only against the ones with headers in hand.
 */
type PluginHeaders = {
  /**
   * Every plugin {@code js/plugins.js} lists, enabled or not, in its order.
   */
  readonly entries: readonly PluginsJsEntry[];

  /**
   * The headers of the enabled plugins whose source could be fetched, in {@code js/plugins.js} order.
   */
  readonly headers: readonly PluginHeader[];
};

/**
 * Reads {@code js/plugins.js} once, then the header of every enabled plugin: a plugin switched off is never
 * fetched (the game never loads it, so its commands would do nothing), and a plugin whose file is missing is
 * left out of the headers rather than failing the rest.
 * @param {Pick<MapEditorApi, 'loadPluginList' | 'loadPluginSource'>} api The server.
 * @returns {Promise<PluginHeaders>} Every entry {@code js/plugins.js} lists, and the enabled ones' headers.
 */
const loadPluginHeaders = async (api: Pick<MapEditorApi, 'loadPluginList' | 'loadPluginSource'>): Promise<PluginHeaders> =>
{
  const entries = readPluginEntries(await api.loadPluginList());
  const enabled = entries.filter(entry => entry.status);
  const sources = await Promise.all(enabled.map(entry => api.loadPluginSource(entry.name)));

  const headers = enabled.flatMap((entry, index) =>
  {
    const source = sources[index];
    return source === null
      ? []
      : [ parsePluginHeader(entry.name, source) ];
  });

  return { entries, headers };
};

export { loadPluginHeaders };
export type { PluginHeaders };
