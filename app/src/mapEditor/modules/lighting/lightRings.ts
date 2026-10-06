import { Graphics } from 'pixi.js';
import type { RmmzEventPage, RmmzMapEvent } from '../../core/model/rmmzTypes.ts';
import type { LightingDrawing, LightingFrame, LightingStage } from '../../core/renderer/lightingLayer.ts';
import { eventPlacement } from '../../render/engine/characterFrames.ts';
import { firstLitPage, normalizeHex, type LightDefaults, type LightPageChoice } from './lightTags.ts';

/**
 * One light's ring: where the light sits and how far it reaches, in world pixels, and its colour as {@code 0xRRGGBB}.
 */
type LightRing = {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly color: number;
};

/**
 * How a ring is drawn so it reads over a bright map without drowning the art: a faint wash of the light's colour over
 * its reach, a soft dark band under its edge so even a white ring shows on snow, the edge itself one screen pixel wide
 * in the light's colour at every zoom, and a small dot where the light sits. The band is in world pixels, so it thins
 * as the view zooms out and the rings stay out of the way of a map seen whole.
 */
const RING_STYLE = {
  washAlpha: 0.07,
  bandColor: 0x000000,
  bandAlpha: 0.45,
  bandWidth: 3,
  edgeAlpha: 1,
  dotRadius: 3,
} as const;

/**
 * Turns a hex colour, three digits or six, into {@code 0xRRGGBB}, as LightingColor#toRgb and #toTintNumber do.
 * @param {string} hex A colour that passed the hex check.
 * @returns {number} The colour.
 */
const colorNumber = (hex: string): number =>
{
  // shorthand doubles each digit, so #fb7 means #ffbb77.
  return Number.parseInt(normalizeHex(hex).slice(1), 16);
};

/**
 * Finds where a light sits, as J-Lighting places it: at the event's Game_CharacterBase#screenX and #screenY, which is
 * where its sprite stands, centred across its tile and at the tile's foot (six pixels up for a character that is not an
 * object), taken from the page giving the light. That is where the game's light pool is centred, so the ring is too.
 * @param {RmmzMapEvent} event The event.
 * @param {RmmzEventPage} page The page giving the light.
 * @param {number} tileSize The tile size.
 * @returns {{ x: number, y: number }} The light's spot, in world pixels.
 */
const lightCentre = (event: RmmzMapEvent, page: RmmzEventPage, tileSize: number): { x: number; y: number } =>
{
  const { x, y } = eventPlacement(event.x, event.y, page.image, page.priorityType, false, tileSize);
  return { x, y };
};

/**
 * Lists the rings a map's lights show: one per light on the page each event shows its lights from, the first page that
 * gives any unless another choice is handed over, so an event giving several lights shows several rings about one spot.
 * @param {readonly (RmmzMapEvent | null)[]} events The map's events, with empty slots.
 * @param {LightDefaults} defaults What the lights fall back to.
 * @param {number} tileSize The tile size.
 * @param {LightPageChoice} choosePage Picks the page whose lights an event shows.
 * @returns {LightRing[]} The rings, by event, then in the order the page writes its lights.
 */
const lightRingsOf = (
  events: readonly (RmmzMapEvent | null)[],
  defaults: LightDefaults,
  tileSize: number,
  choosePage: LightPageChoice = firstLitPage): LightRing[] =>
{
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
    return lit.lights.map(light => ({ x, y, radius: light.radius * tileSize, color: colorNumber(light.color) }));
  });
};

/**
 * Reports whether two lists of rings draw the same.
 * @param {readonly LightRing[]} left One list.
 * @param {readonly LightRing[]} right The other.
 * @returns {boolean} True when they hold the same rings in the same order.
 */
const sameRings = (left: readonly LightRing[], right: readonly LightRing[]): boolean =>
{
  if (left.length !== right.length)
  {
    return false;
  }

  return left.every((ring, index) =>
  {
    const other = right[index];
    return ring.x === other.x && ring.y === other.y && ring.radius === other.radius && ring.color === other.color;
  });
};

/**
 * Draws rings in passes, washes first and dots last, so no ring's dark band ever covers another ring's edge.
 * @param {Graphics} graphics Where to draw; whatever it held goes.
 * @param {readonly LightRing[]} rings The rings.
 */
const paintRings = (graphics: Graphics, rings: readonly LightRing[]): void =>
{
  const { washAlpha, bandColor, bandAlpha, bandWidth, edgeAlpha, dotRadius } = RING_STYLE;
  graphics.clear();
  rings.forEach(ring =>
  {
    graphics.circle(ring.x, ring.y, ring.radius).fill({ color: ring.color, alpha: washAlpha });
  });
  rings.forEach(ring =>
  {
    graphics.circle(ring.x, ring.y, ring.radius).stroke({ color: bandColor, alpha: bandAlpha, width: bandWidth });
  });
  rings.forEach(ring =>
  {
    graphics.circle(ring.x, ring.y, ring.radius)
      .stroke({ color: ring.color, alpha: edgeAlpha, width: 1, pixelLine: true });
  });
  rings.forEach(ring =>
  {
    graphics.circle(ring.x, ring.y, dotRadius)
      .fill({ color: ring.color, alpha: 1 })
      .stroke({ color: bandColor, alpha: bandAlpha, width: 1, pixelLine: true });
  });
};

/**
 * J-Lighting's light rings in one map view: every light on the map shows how far it reaches, as a ring about the spot
 * the game centres it on, its radius the tag's reach in tiles, in the light's colour.
 *
 * Asked to draw whenever anything on the map but its tiles changed, it works the rings out again, which is cheap, and
 * redraws them only when one moved, grew, changed colour, came or went, so an edit elsewhere on the map costs it a
 * comparison and a brush stroke costs it nothing at all. Nothing about a ring moves with time, so the clock moving
 * costs it nothing either.
 */
class LightRings implements LightingDrawing
{
  #graphics = new Graphics();

  #defaults: LightDefaults;

  #tileSize: number;

  #choosePage: LightPageChoice;

  #drawn: readonly LightRing[] = [];

  /**
   * @param {LightingStage} stage Where the rings draw.
   * @param {LightDefaults} defaults What the lights fall back to.
   * @param {LightPageChoice} choosePage Picks the page whose lights an event shows; by default, the first giving any.
   */
  constructor(stage: LightingStage, defaults: LightDefaults, choosePage: LightPageChoice = firstLitPage)
  {
    this.#defaults = defaults;
    this.#tileSize = stage.tileSize;
    this.#choosePage = choosePage;
    stage.layer.addChild(this.#graphics);
  }

  draw(frame: LightingFrame): void
  {
    const rings = lightRingsOf(frame.document.events, this.#defaults, this.#tileSize, this.#choosePage);
    if (sameRings(rings, this.#drawn))
    {
      return;
    }

    this.#drawn = rings;
    paintRings(this.#graphics, rings);
  }

  /**
   * Moves on with the clock, which changes no ring: a ring marks how far a light reaches, and however its light gutters,
   * its reach stays where the tag puts it.
   * @returns {boolean} False, always.
   */
  tick(): boolean
  {
    return false;
  }

  destroy(): void
  {
    this.#graphics.destroy();
  }
}

export { colorNumber, lightCentre, LightRings, lightRingsOf, RING_STYLE, sameRings };
export type { LightRing };
