import type { MapDocument } from '../../core/model/MapDocument.ts';
import type { RmmzMapEvent } from '../../core/model/rmmzTypes.ts';
import type { AmbientSource } from './ambientTags.ts';
import { composeAmbientColor, composeDarkness, hasMask, maskTintFor } from './lightingComposition.ts';
import { lightCentre } from './lightRings.ts';
import type { LightDefaults, LightEffect, LightPageChoice } from './lightTags.ts';

/**
 * How brightly a light burns at the moment the dark is drawn, from 0 to 1: the strength its picture is added into the
 * dark at. Handed the light's name and its effect, it answers for that light alone. J-Lighting's effects move this and
 * nothing else, which is why a guttering torch and a steady one share one picture.
 */
type LightStrength = (light: { readonly id: string; readonly effect: LightEffect }) => number;

/**
 * One light as the dark is cut by it, in world pixels: its name, where its pool is centred, how far it reaches, its
 * colour and intensity (which shape its picture), its effect, and how brightly it burns as it is drawn.
 */
type MaskLight = {
  /**
   * The light's name as J-Lighting gives it, which stays the same however the list of lights around it changes: its
   * event's source, then its place among that page's lights, such as {@code page:12#0}.
   */
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly color: string;
  readonly intensity: number;
  readonly effect: LightEffect;
  readonly strength: number;
};

/**
 * What the dark over a map is, all sources composed: how much light is gone, the colour the mask is filled with before
 * any light is cut through it, and every light cutting through it, by event and then in the order its page writes them.
 */
type DarkScene = {
  readonly darkness: number;
  readonly tint: number;
  readonly lights: readonly MaskLight[];
};

/**
 * What the dark is worked out from: everything that darkens the map, what a light falls back to, the tile size, the
 * page an event shows its lights from, and how brightly each light burns.
 */
type DarkSetup = {
  readonly sources: readonly AmbientSource[];
  readonly defaults: LightDefaults;
  readonly tileSize: number;
  readonly choosePage: LightPageChoice;
  readonly strengthOf: LightStrength;
};

/**
 * How brightly a light burns with no effect running: at full strength, always, as LightingEasing#strengthFor answers
 * for a steady light. Every light is drawn so until effects animate.
 * @returns {number} 1.
 */
const steadyStrength: LightStrength = () => 1;

/**
 * Names a light as LightingRenderLayer names it: its event's source key, then its place among that page's lights.
 * @param {number} eventId The event's id.
 * @param {number} ordinal Its place among its page's lights, from 0.
 * @returns {string} The name, such as {@code page:12#0}.
 */
const lightIdOf = (eventId: number, ordinal: number): string =>
{
  return `page:${eventId}#${ordinal}`;
};

/**
 * Lists the lights a map's events cut through its dark: one per light on the page each event shows its lights from,
 * centred where the game centres the event's light and where its ring is drawn, so a light's pool and its ring always
 * agree.
 * @param {readonly (RmmzMapEvent | null)[]} events The map's events, with empty slots.
 * @param {DarkSetup} setup The defaults, the tile size, the page choice and the strength.
 * @returns {MaskLight[]} The lights, by event, then in the order the page writes them.
 */
const maskLightsOf = (events: readonly (RmmzMapEvent | null)[], setup: DarkSetup): MaskLight[] =>
{
  const { defaults, tileSize, choosePage, strengthOf } = setup;
  return events.flatMap(event =>
  {
    if (event === null)
    {
      return [];
    }

    const lit = choosePage(event, defaults);
    if (lit === null)
    {
      return [];
    }

    const { x, y } = lightCentre(event, lit.page, tileSize);
    return lit.lights.map((light, ordinal) =>
    {
      const id = lightIdOf(event.id, ordinal);
      return {
        id,
        x,
        y,
        radius: light.radius * tileSize,
        color: light.color,
        intensity: light.intensity,
        effect: light.effect,
        strength: strengthOf({ id, effect: light.effect }),
      };
    });
  });
};

/**
 * Works out the dark over a map as J-Lighting composes it: every source's darkness compounded, the colour of the dark
 * settled among the sources that named one, and every light on the map. A map nobody calls dark has no dark at all, as
 * in the game, where lights alone never earn a mask.
 * @param {MapDocument} document The map.
 * @param {DarkSetup} setup What the dark is worked out from.
 * @returns {DarkScene | null} The dark, or null when the map is not dark.
 */
const darkSceneOf = (document: MapDocument, setup: DarkSetup): DarkScene | null =>
{
  const ambients = setup.sources.flatMap(source =>
  {
    const declared = source(document);
    return declared === null
      ? []
      : [ declared ];
  });
  const darkness = composeDarkness(ambients);
  if (hasMask(darkness) === false)
  {
    return null;
  }

  return {
    darkness,
    tint: maskTintFor(darkness, composeAmbientColor(ambients)),
    lights: maskLightsOf(document.events, setup),
  };
};

export { darkSceneOf, lightIdOf, maskLightsOf, steadyStrength };
export type { DarkScene, DarkSetup, LightStrength, MaskLight };
