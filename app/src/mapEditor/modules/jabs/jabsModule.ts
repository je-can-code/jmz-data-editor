import type { PluginsJsEntry } from '../../../services/plugins/PluginsJsReader.ts';
import { pageCommentText } from '../../core/model/eventModel.ts';
import type { RmmzMapEvent } from '../../core/model/rmmzTypes.ts';
import type { PluginModule } from '../../core/modules/PluginModule.ts';

/**
 * J-ABS's file name, as js/plugins.js lists it.
 */
const JABS_PLUGIN = 'J-ABS';

/**
 * The id J-ABS's module registers battlers under.
 */
const BATTLER_KIND_ID = 'jabs.battler';

/**
 * The tag that makes an event a J-ABS battler, as J-ABS itself reads it from a page's comments: the enemy it fights as,
 * by database id, with one space allowed after the colon.
 *
 * <pre>
 * Structure:
 *  <enemyId:ENEMY_ID>
 *
 * Example:
 *  <enemyId:12>
 *
 * Translation:
 *  This event fights as enemy 12.
 * </pre>
 */
const ENEMY_ID_TAG = /<enemyId:[ ]?\d+>/iu;

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
 * Recognises a J-ABS battler: an event with a page whose comments name the enemy it fights as. Any page counts, since a
 * battler that only appears once a switch is on carries its tag on that later page alone.
 * @param {RmmzMapEvent} event The event.
 * @returns {boolean} True for a battler.
 */
const isBattler = (event: RmmzMapEvent): boolean =>
{
  return event.pages.some(page => ENEMY_ID_TAG.test(pageCommentText(page)));
};

/**
 * What the editor knows of J-ABS: its battlers, recognised by their enemy tag, which outrank every core kind since a
 * battler is otherwise an event of comments alone; and the events on its action map, which are the patterns its actions
 * are copied from, so none of them is taken for something placed on a map.
 */
const jabsModule: PluginModule = {
  id: 'jabs',
  title: 'J-ABS',
  plugins: [ JABS_PLUGIN ],
  register: (contributions, context) =>
  {
    contributions.eventKind({ id: BATTLER_KIND_ID, title: 'Battler', priority: 50, detect: isBattler, marker: 'battler' });

    // the registry switches this module on only while J-ABS is enabled, so the plugin is always listed here.
    const actionMapId = actionMapIdOf(context.plugins.get(JABS_PLUGIN) as PluginsJsEntry);
    if (actionMapId !== null)
    {
      contributions.templateMap(actionMapId);
    }
  },
};

export { actionMapIdOf, BATTLER_KIND_ID, isBattler, jabsModule };
