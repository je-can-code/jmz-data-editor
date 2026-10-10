import type { PluginsJsEntry } from '../../../services/plugins/PluginsJsReader.ts';
import type { PluginModule } from '../../core/modules/PluginModule.ts';
import { regionRule, regionSettingsOf } from './regionRules.ts';

/**
 * J-RegionEffects' file name, as js/plugins.js lists it.
 */
const REGIONS_PLUGIN = 'J-RegionEffects';

/**
 * What the editor knows of J-RegionEffects, while it is enabled: the regions and terrain tags it keeps the player out of
 * or off, on every map from its parameters and on one map from that map's note, as one passability rule. The
 * Passability overlay marks the steps it forbids beside the engine's own, a route preview walks into them as walls, and a
 * transfer's landing counts them when it asks whether the player could step off the tile.
 *
 * The regions it lets anyone onto whatever the tiles say are not drawn as open: a rule can only forbid a step. They keep
 * a terrain tag from forbidding a step onto them, as the plugin has them do.
 */
const regionsModule: PluginModule = {
  id: 'regions',
  title: 'J-RegionEffects',
  plugins: [ REGIONS_PLUGIN ],
  register: (contributions, context) =>
  {
    // the module switches on only while the plugin is enabled, so its entry is always there.
    const plugin = context.plugins.get(REGIONS_PLUGIN) as PluginsJsEntry;
    contributions.passabilityRule(regionRule(regionSettingsOf(plugin)));
  },
};

export { REGIONS_PLUGIN, regionsModule };
