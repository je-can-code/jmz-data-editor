import type { JsonValue } from '../../core/model/json.ts';
import type { ModuleContext, ModuleContributions, PluginModule } from '../../core/modules/PluginModule.ts';
import { quickPanelFor } from '../../views/quickPanel/QuickFieldsPanel.tsx';
import { TIME_PLUGIN } from '../time/timeParameters.ts';
import { mapAmbient, type AmbientSource } from './ambientTags.ts';
import { effectStrength } from './lightEffects.ts';
import { ambientColorFrom, effectTuningsFrom, LIGHTING_CONFIG, lightDefaultsFrom, lightingConfigNotice } from './lightingConfig.ts';
import { LIGHTING_TIME_CONFIG, lightingTimeConfigNotice, skyCurveFrom } from './lightingTimeConfig.ts';
import { LightMask } from './lightMask.ts';
import { lightPanelOptions, lightQuickModel } from './lightPanel.ts';
import { LightRings } from './lightRings.ts';
import { firstLitPage, isLight, type LightPageChoice } from './lightTags.ts';
import { MAP_LIGHTING_ID, mapLightingSource } from './mapLighting.ts';
import { skyAmbient } from './sky.ts';
import { SkyTone } from './skyTone.ts';
import type { SkyCurve } from './timeTone.ts';

/**
 * J-Lighting's file name, as js/plugins.js lists it.
 */
const LIGHTING_PLUGIN = 'J-Lighting';

/**
 * J-Lighting-Time's file name, as js/plugins.js lists it: the extension casting the day and night cycle over the map,
 * as colour and as darkness, from the hour J-TIME keeps.
 */
const LIGHTING_TIME_PLUGIN = 'J-Lighting-Time';

/**
 * J-Weather-Time's file name, as js/plugins.js lists it: the extension driving a sky's weather from J-TIME's clock
 * (ForecastDirector), which J-Weather then brings to a map unless the map has no sky. J-Weather reads that from the same
 * tag J-Lighting-Time does (MapWeatherResolver.declarationFor), but on its own it drives no sky at all, so a map's sky
 * changes nothing about its weather until J-Weather-Time is on.
 */
const WEATHER_TIME_PLUGIN = 'J-Weather-Time';

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
 * The id of the sky's colour J-Lighting's module casts over the map while J-Lighting-Time is on.
 */
const SKY_TONE_ID = 'lighting.sky';

/**
 * Reports whether J-Lighting-Time is on, with J-TIME, which it needs for the hour: only then does the game have a sky.
 * @param {ModuleContext} context The enabled plugins.
 * @returns {boolean} True while both are enabled.
 */
const hasTimeOfDay = (context: ModuleContext): boolean =>
{
  return context.plugins.has(LIGHTING_TIME_PLUGIN) && context.plugins.has(TIME_PLUGIN);
};

/**
 * Adds what J-Lighting-Time brings, while it is on: the sky's colour at the hour of the clock J-TIME's module offers,
 * cast over the map; and, unless the curve fails it, which is then said over every map view, the curve it is all drawn
 * with, for the sky's darkness to join the map's own.
 * @param {ModuleContributions} contributions Where to add them.
 * @param {ModuleContext} context The enabled plugins and the configs read.
 * @returns {SkyCurve | null} The day and night curve, or null when there is none to draw the sky with.
 */
const registerSky = (contributions: ModuleContributions, context: ModuleContext): SkyCurve | null =>
{
  // the registry reads the curve before the module switches on, whenever J-Lighting-Time and J-TIME are enabled.
  const config = context.configs.get(LIGHTING_TIME_CONFIG) as JsonValue | null;
  const notice = lightingTimeConfigNotice(config, context.configProblems.get(LIGHTING_TIME_CONFIG));
  if (notice !== null)
  {
    contributions.notice(notice);
  }

  const curve = skyCurveFrom(config);
  if (curve === null)
  {
    return null;
  }

  contributions.lightingLayer({
    id: SKY_TONE_ID,
    title: 'Sky',
    shownInGame: true,
    create: stage => new SkyTone(stage, curve),
  });
  return curve;
};

/**
 * What the editor knows of J-Lighting: its lights, read from their tags exactly as the plugin reads them; a dark map's
 * darkness, from the ambient tag in its note, with each light's pool cut through it by the plugin's own falloff, as the
 * game composes it, and each pool guttering, breathing or stuttering with its light's effect as the game animates it,
 * tuned by the project's config; the ring each light shows on the map, over the dark; and the quick panel a single
 * click on a light shows, which changes its reach, colour, intensity and effect by rewriting its tag in place. The dark
 * and the rings draw in the lighting layer, so the view's Lighting switch shows and hides them together. A light ranks
 * below the transfers and chests that sometimes carry one too, since a door that glows is still a door, and above
 * dialogue and decor, which a comment-tagged event never is anyway; its ring and its pool show whatever kind it is. The
 * dark, the rings and the panel fall back to the project's own config for what a tag leaves out. The ring and the pool
 * come from the page the game shows at the clock's time, so a lamp lit by its hours glows only then and a ghost lit
 * behind a switch stays dark on a fresh save; the panel edits the first page with a light, so an unlit lamp can still
 * be clicked and changed at noon, and says when that page shows. A config that fails them, so that lights fall back to
 * white and burn steady, is said over every map view rather than left to look like the game's own colours.
 *
 * While its extension J-Lighting-Time is on too, with J-TIME keeping the hour, the sky follows the clock J-TIME's module
 * offers the map views, as the extension casts it, from the project's day and night curve: its colour over the map, the
 * way the engine tints the screen, and its darkness as one more source of the map's dark, compounding with the map's
 * own, so a field with no darkness of its own darkens at night and its lights show through it. A map tagged to have no
 * sky, a cave or an interior, gets neither. The Lighting switch shows and hides the sky with the rest. A curve the module
 * cannot use is said over every map view, and the sky then stays as it is at every hour.
 *
 * Map Properties gains a Lighting section setting the map's own darkness and its colour, and, while J-Lighting-Time or
 * J-Weather-Time is on, whether the map has a sky, which J-Lighting-Time reads to tint and darken it by the hour and
 * J-Weather-Time's sky reads to keep its weather off it, so the setting names whichever of them is on. J-Weather alone
 * drives no sky, so it is not offered for J-Weather alone. Each is written into the map's note in place.
 */
const lightingModule: PluginModule = {
  id: 'lighting',
  title: 'J-Lighting',
  plugins: [ LIGHTING_PLUGIN ],
  configs: [ LIGHTING_CONFIG ],
  extensionConfigs: [ { name: LIGHTING_TIME_CONFIG, plugins: [ LIGHTING_TIME_PLUGIN, TIME_PLUGIN ] } ],
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

    // the panel edits the first page with a light, which a lamp lit only by night still has at noon, and says when it
    // shows; the map shows the light of the page the game shows at the clock's time.
    const choosePage: LightPageChoice = firstLitPage;
    contributions.eventKind({
      id: LIGHT_KIND_ID,
      title: 'Light',
      priority: 25,
      detect: isLight,
      marker: 'light',
      quickPanel: quickPanelFor(lightQuickModel(defaults, choosePage), LIGHT_KIND_ID, lightPanelOptions(defaults, choosePage, context.pageWords)),
    });

    // the dark goes in first, so the rings draw over it and stay in sight on the darkest map; the sky's darkness joins
    // the map's own in it while the sky follows the clock.
    const curve = hasTimeOfDay(context)
      ? registerSky(contributions, context)
      : null;
    const sources: AmbientSource[] = curve === null
      ? [ mapAmbient(ambientColorFrom(config)) ]
      : [ mapAmbient(ambientColorFrom(config)), skyAmbient(curve) ];
    const strengthOf = effectStrength(effectTuningsFrom(config));
    contributions.lightingLayer({
      id: LIGHT_MASK_ID,
      title: 'Darkness',
      shownInGame: true,
      create: stage => new LightMask(stage, { sources, defaults, strengthOf }),
    });
    contributions.lightingLayer({
      id: LIGHT_RINGS_ID,
      title: 'Light rings',
      create: stage => new LightRings(stage, defaults),
    });

    // a map's own darkness is set in Map Properties, and so is whether it has a sky while either plugin a sky changes the
    // map for is on, the setting worded for whichever is: J-Lighting-Time's tint, and J-Weather-Time's weather.
    const clock = context.plugins.has(LIGHTING_TIME_PLUGIN);
    const weather = context.plugins.has(WEATHER_TIME_PLUGIN);
    contributions.mapProperties({
      id: MAP_LIGHTING_ID,
      title: 'Lighting',
      source: mapLightingSource(ambientColorFrom(config), clock, weather),
    });
  },
};

export { isLight, LIGHT_KIND_ID, LIGHT_MASK_ID, LIGHT_RINGS_ID, LIGHTING_TIME_PLUGIN, lightingModule, SKY_TONE_ID };
