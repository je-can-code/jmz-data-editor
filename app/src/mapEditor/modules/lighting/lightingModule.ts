import type { JsonValue } from '../../core/model/json.ts';
import type { PluginModule } from '../../core/modules/PluginModule.ts';
import { LIGHTING_CONFIG, lightDefaultsFrom } from './lightingConfig.ts';
import { LightRings } from './lightRings.ts';
import { isLight } from './lightTags.ts';

/**
 * J-Lighting's file name, as js/plugins.js lists it.
 */
const LIGHTING_PLUGIN = 'J-Lighting';

/**
 * The id J-Lighting's module registers lights under.
 */
const LIGHT_KIND_ID = 'lighting.light';

/**
 * The id of the light rings J-Lighting's module draws into the lighting layer.
 */
const LIGHT_RINGS_ID = 'lighting.rings';

/**
 * What the editor knows of J-Lighting: its lights, read from their tags exactly as the plugin reads them, and the ring
 * each light shows on the map, drawn in the lighting layer so the view's Lighting switch shows and hides them with the
 * rest of what J-Lighting draws. A light ranks below the transfers and chests that sometimes carry one too, since a
 * door that glows is still a door, and above dialogue and decor, which a comment-tagged event never is anyway; its ring
 * shows whatever kind it is. The rings fall back to the project's own config for a light naming no colour.
 */
const lightingModule: PluginModule = {
  id: 'lighting',
  title: 'J-Lighting',
  plugins: [ LIGHTING_PLUGIN ],
  configs: [ LIGHTING_CONFIG ],
  register: (contributions, context) =>
  {
    contributions.eventKind({ id: LIGHT_KIND_ID, title: 'Light', priority: 25, detect: isLight, marker: 'light' });

    // the registry hands over every config the module names, null for one the project lacks.
    const defaults = lightDefaultsFrom(context.configs.get(LIGHTING_CONFIG) as JsonValue | null);
    contributions.lightingLayer({ id: LIGHT_RINGS_ID, title: 'Light rings', create: stage => new LightRings(stage, defaults) });
  },
};

export { isLight, LIGHT_KIND_ID, LIGHT_RINGS_ID, lightingModule };
