import type { JsonValue } from '../../core/model/json.ts';
import type { PluginModule } from '../../core/modules/PluginModule.ts';
import { quickPanelFor } from '../../views/quickPanel/QuickFieldsPanel.tsx';
import { mapAmbient } from './ambientTags.ts';
import { effectStrength } from './lightEffects.ts';
import { ambientColorFrom, effectTuningsFrom, LIGHTING_CONFIG, lightDefaultsFrom, lightingConfigNotice } from './lightingConfig.ts';
import { LightMask } from './lightMask.ts';
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
 * The id of the darkness J-Lighting's module draws into the lighting layer, with every light cut through it.
 */
const LIGHT_MASK_ID = 'lighting.dark';

/**
 * What the editor knows of J-Lighting: its lights, read from their tags exactly as the plugin reads them; a dark map's
 * darkness, from the ambient tag in its note, with each light's pool cut through it by the plugin's own falloff, as the
 * game composes it, and each pool guttering, breathing or stuttering with its light's effect as the game animates it,
 * tuned by the project's config; the ring each light shows on the map, over the dark; and the quick panel a single
 * click on a light shows, which changes its reach, colour, intensity and effect by rewriting its tag in place. The dark
 * and the rings draw in the lighting layer, so the view's Lighting switch shows and hides them together. A light ranks
 * below the transfers and chests that sometimes carry one too, since a door that glows is still a door, and above
 * dialogue and decor, which a comment-tagged event never is anyway; its ring and its pool show whatever kind it is. The
 * dark, the rings and the panel fall back to the project's own config for what a tag leaves out, and all three read a
 * light from the page one choice picks, so the panel always changes the light the ring and the pool show. A config that
 * fails them, so that lights fall back to white and burn steady, is said over every map view rather than left to look
 * like the game's own colours.
 */
const lightingModule: PluginModule = {
  id: 'lighting',
  title: 'J-Lighting',
  plugins: [ LIGHTING_PLUGIN ],
  configs: [ LIGHTING_CONFIG ],
  register: (contributions, context) =>
  {
    // the registry hands over every config the module names, null for one the project lacks, with why it lacks it.
    const config = context.configs.get(LIGHTING_CONFIG) as JsonValue | null;
    const defaults = lightDefaultsFrom(config);
    const notice = lightingConfigNotice(config, context.configProblems.get(LIGHTING_CONFIG));
    if (notice !== null)
    {
      contributions.notice(notice);
    }

    const choosePage: LightPageChoice = firstLitPage;
    contributions.eventKind({
      id: LIGHT_KIND_ID,
      title: 'Light',
      priority: 25,
      detect: isLight,
      marker: 'light',
      quickPanel: quickPanelFor(lightQuickModel(defaults, choosePage), LIGHT_KIND_ID, lightPanelOptions(defaults, choosePage)),
    });

    // the dark goes in first, so the rings draw over it and stay in sight on the darkest map.
    const sources = [ mapAmbient(ambientColorFrom(config)) ];
    const strengthOf = effectStrength(effectTuningsFrom(config));
    contributions.lightingLayer({
      id: LIGHT_MASK_ID,
      title: 'Darkness',
      shownInGame: true,
      create: stage => new LightMask(stage, { sources, defaults, choosePage, strengthOf }),
    });
    contributions.lightingLayer({
      id: LIGHT_RINGS_ID,
      title: 'Light rings',
      create: stage => new LightRings(stage, defaults, choosePage),
    });
  },
};

export { isLight, LIGHT_KIND_ID, LIGHT_MASK_ID, LIGHT_RINGS_ID, lightingModule };
