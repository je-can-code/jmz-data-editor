import type { PluginsJsEntry } from '../../../services/plugins/PluginsJsReader.ts';
import type { PluginModule } from '../../core/modules/PluginModule.ts';

/**
 * J-ABS's file name, as js/plugins.js lists it.
 */
const JABS_PLUGIN = 'J-ABS';

/**
 * Reads the map J-ABS copies an action's event from each time one spawns, such as a sword's swing, from its Action
 * Map Id parameter. RMMZ keeps every parameter as text and J-ABS reads this one as a number, so anything but a map id
 * names no map.
 * @param {PluginsJsEntry} plugin J-ABS, as js/plugins.js lists it.
 * @returns {number | null} The map's id, or null when the parameter names none.
 */
const actionMapIdOf = (plugin: PluginsJsEntry): number | null =>
{
  // a plugins.js written before the parameter existed has no value for it at all.
  const text = plugin.parameters['actionMapId'] ?? '';
  const mapId = Number(text);
  return /^\d+$/u.test(text) && mapId > 0
    ? mapId
    : null;
};

/**
 * What the editor knows of J-ABS: the events on its action map are the patterns its actions are copied from, so none
 * of them is taken for something placed on a map.
 */
const jabsModule: PluginModule = {
  id: 'jabs',
  title: 'J-ABS',
  plugins: [ JABS_PLUGIN ],
  register: (contributions, context) =>
  {
    // the registry switches this module on only while J-ABS is enabled, so the plugin is always listed here.
    const actionMapId = actionMapIdOf(context.plugins.get(JABS_PLUGIN) as PluginsJsEntry);
    if (actionMapId !== null)
    {
      contributions.templateMap(actionMapId);
    }
  },
};

export { actionMapIdOf, jabsModule };
