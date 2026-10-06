import type { JsonValue } from '../../core/model/json.ts';
import type { PluginModule } from '../../core/modules/PluginModule.ts';
import { quickPanelFor } from '../../views/quickPanel/QuickFieldsPanel.tsx';
import { LIGHTING_CONFIG, lightDefaultsFrom } from './lightingConfig.ts';
import { lightPanelOptions, lightQuickModel } from './lightPanel.ts';
import { LightRings } from './lightRings.ts';
import { firstLitPage, isLight, type LightPageChoice } from './lightTags.ts';

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
 * What the editor knows of J-Lighting: its lights, read from their tags exactly as the plugin reads them; the ring
 * each light shows on the map, drawn in the lighting layer so the view's Lighting switch shows and hides them with the
 * rest of what J-Lighting draws; and the quick panel a single click on a light shows, which changes its reach, colour,
 * intensity and effect by rewriting its tag in place. A light ranks below the transfers and chests that sometimes carry
 * one too, since a door that glows is still a door, and above dialogue and decor, which a comment-tagged event never is
 * anyway; its ring shows whatever kind it is. The rings and the panel fall back to the project's own config for what a
 * light leaves out, and both read a light from the page one choice picks, so the panel always changes the light the
 * ring shows.
 */
const lightingModule: PluginModule = {
  id: 'lighting',
  title: 'J-Lighting',
  plugins: [ LIGHTING_PLUGIN ],
  configs: [ LIGHTING_CONFIG ],
  register: (contributions, context) =>
  {
    // the registry hands over every config the module names, null for one the project lacks.
    const defaults = lightDefaultsFrom(context.configs.get(LIGHTING_CONFIG) as JsonValue | null);
    const choosePage: LightPageChoice = firstLitPage;
    contributions.eventKind({
      id: LIGHT_KIND_ID,
      title: 'Light',
      priority: 25,
      detect: isLight,
      marker: 'light',
      quickPanel: quickPanelFor(lightQuickModel(defaults, choosePage), LIGHT_KIND_ID, lightPanelOptions(defaults, choosePage)),
    });
    contributions.lightingLayer({
      id: LIGHT_RINGS_ID,
      title: 'Light rings',
      create: stage => new LightRings(stage, defaults, choosePage),
    });
  },
};

export { isLight, LIGHT_KIND_ID, LIGHT_RINGS_ID, lightingModule };
