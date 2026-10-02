import { pageCommentText } from '../../core/model/eventModel.ts';
import type { RmmzMapEvent } from '../../core/model/rmmzTypes.ts';
import type { PluginModule } from '../../core/modules/PluginModule.ts';

/**
 * J-Lighting's file name, as js/plugins.js lists it.
 */
const LIGHTING_PLUGIN = 'J-Lighting';

/**
 * The id J-Lighting's module registers lights under.
 */
const LIGHT_KIND_ID = 'lighting.light';

/**
 * The tag that makes an event page give light, as J-Lighting itself reads it from a page's comments: how far the light
 * reaches in tiles, fractions allowed, then any of a colour, an intensity and an effect, in any order, with one space
 * allowed after the colon and after each comma.
 *
 * <pre>
 * Structure:
 *  <light:[TILES]>
 *  <light:[TILES, COLOR, INTENSITY, EFFECT]>
 *
 * Example:
 *  <light:[6, #ffbb73, flicker]>
 *
 * Translation:
 *  A warm light reaching six tiles, guttering.
 * </pre>
 */
const LIGHT_TAG = /<light:[ ]?\[[\d.]+(?:,[ ]?[#\w.-]+)*\]>/iu;

/**
 * Recognises a light: an event with a page whose comments make it give light. Any page counts, since a torch that can
 * be lit is a cold first page and a lit page behind a switch or a self switch, and only the lit page carries the tag.
 * @param {RmmzMapEvent} event The event.
 * @returns {boolean} True for a light.
 */
const isLight = (event: RmmzMapEvent): boolean =>
{
  return event.pages.some(page => LIGHT_TAG.test(pageCommentText(page)));
};

/**
 * What the editor knows of J-Lighting: its lights, recognised by their light tag. A light ranks below the transfers and
 * chests that sometimes carry one too, since a door that glows is still a door, and above dialogue and decor, which a
 * comment-tagged event never is anyway.
 */
const lightingModule: PluginModule = {
  id: 'lighting',
  title: 'J-Lighting',
  plugins: [ LIGHTING_PLUGIN ],
  register: contributions =>
  {
    contributions.eventKind({ id: LIGHT_KIND_ID, title: 'Light', priority: 25, detect: isLight, marker: 'light' });
  },
};

export { isLight, LIGHT_KIND_ID, lightingModule };
