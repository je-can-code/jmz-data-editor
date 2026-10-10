import type { PluginsJsEntry } from '../../../services/plugins/PluginsJsReader.ts';
import { pageCommentText } from '../../core/model/eventModel.ts';
import type { RmmzMapEvent } from '../../core/model/rmmzTypes.ts';
import type { PluginModule } from '../../core/modules/PluginModule.ts';
import type { MapPropertiesModel } from '../../core/properties/moduleProperties.ts';
import { battlerBrushFor } from './BattlerBrush.tsx';
import { battlerTagFields } from './battlerFields.ts';
import { battlerPageSectionFor, battlerQuickPanelFor } from './BattlerQuickPanel.tsx';
import { battlerSetupOf, MOTION_CONFIG, MOTION_PLUGIN } from './battlerSetup.ts';
import { newBattlerLevelPropertyFor } from './NewBattlerLevelProperty.tsx';

/**
 * J-ABS's file name, as js/plugins.js lists it.
 */
const JABS_PLUGIN = 'J-ABS';

/**
 * The id J-ABS's module registers battlers under.
 */
const BATTLER_KIND_ID = 'jabs.battler';

/**
 * The id of the battler brush J-ABS's module offers to place with.
 */
const BATTLER_BRUSH_ID = 'jabs.battlers';

/**
 * The id of J-ABS's section of Map Properties, which holds the level a map's new battlers start at.
 */
const MAP_BATTLERS_ID = 'jabs.map';

/**
 * A section of Map Properties with no settings read from the map itself: J-ABS's holds one setting the map's own file
 * never does, which draws itself.
 * @returns {MapPropertiesModel} Nothing to say of the map, and no settings.
 */
const NO_MAP_SETTINGS = (): MapPropertiesModel =>
{
  return { note: null, fields: [] };
};

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
 * battler is otherwise an event of comments alone; the tags on a battler's page, each a field a blueprint's copies follow
 * on its own; and the events on its action map, which are the patterns its actions are copied from, so none of them is
 * taken for something placed on a map.
 *
 * A battler's quick panel, and its section of the event window, show everything it fights with, as the game builds it
 * from the page, the enemy's database note and J-ABS's defaults, marking which the page sets; each change writes the
 * page's own tag in place, and taking one out leaves the enemy's. Its level shows while J-LevelMaster is on, its passives
 * while J-Passive and its affix extension are, and its motions while J-Motion is, with J-Motion's config filling in what
 * a motion leaves out. At the top of the Stamps panel, the battler brush places a battler of the enemy picked with each
 * click, shaped like most of that enemy's battlers already placed.
 *
 * While J-LevelMaster is on too, each battler the brush places starts at the level its map calls for: the level set for
 * the map in Map Properties, where J-ABS's section offers it, kept in the editor's own data and never in the map's file;
 * else the level that enemy already carries on the map; else the map's level; else the enemy's own (see newBattlerLevel).
 */
const jabsModule: PluginModule = {
  id: 'jabs',
  title: 'J-ABS',
  plugins: [ JABS_PLUGIN ],
  extensionConfigs: [ { name: MOTION_CONFIG, plugins: [ MOTION_PLUGIN ] } ],
  register: (contributions, context) =>
  {
    // the registry reads J-Motion's config before the module switches on, whenever J-Motion is enabled beside J-ABS.
    const setup = battlerSetupOf(context.plugins, context.configs.get(MOTION_CONFIG) ?? null, context.pageWords);
    contributions.eventKind({
      id: BATTLER_KIND_ID,
      title: 'Battler',
      priority: 50,
      detect: isBattler,
      marker: 'battler',
      quickPanel: battlerQuickPanelFor(setup),
      pageSection: battlerPageSectionFor(setup),
    });
    contributions.paletteEntry({ id: BATTLER_BRUSH_ID, title: 'Battlers', kind: BATTLER_KIND_ID, picker: battlerBrushFor(setup) });

    // a copy of a blueprint follows each of a battler's tags on its own, and its level only while the plugin reading it is
    // on too.
    battlerTagFields(setup.levels).forEach(tag => contributions.commentTag(tag));

    // the level new battlers start at is set per map only while the plugin reading a battler's level is on.
    if (setup.levels)
    {
      contributions.mapProperties({ id: MAP_BATTLERS_ID, title: 'Battlers', source: NO_MAP_SETTINGS, body: newBattlerLevelPropertyFor() });
    }

    // the registry switches this module on only while J-ABS is enabled, so the plugin is always listed here.
    const actionMapId = actionMapIdOf(context.plugins.get(JABS_PLUGIN) as PluginsJsEntry);
    if (actionMapId !== null)
    {
      contributions.templateMap(actionMapId, 'action templates');
    }
  },
};

export { actionMapIdOf, BATTLER_BRUSH_ID, BATTLER_KIND_ID, isBattler, jabsModule, MAP_BATTLERS_ID };
