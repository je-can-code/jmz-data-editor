import { describe, expect, it } from 'vitest';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { RmmzEventPage, RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import type { LightingClock } from '../../../../src/mapEditor/core/renderer/lightingLayer.ts';
import { mapAmbient, type AmbientSource } from '../../../../src/mapEditor/modules/lighting/ambientTags.ts';
import { darkSceneOf, lightIdOf, maskLightsOf, type DarkSetup, type LightStrength } from '../../../../src/mapEditor/modules/lighting/darkScene.ts';
import { firstLitPage, type LightPageChoice } from '../../../../src/mapEditor/modules/lighting/lightTags.ts';
import { command, event, page } from '../../support/eventKindFixtures.ts';
import { buildMapJson } from '../../support/fixtures.ts';

/*
 * The dark over a map is worked out as J-Lighting composes it: every source's darkness compounded and the colour of the
 * dark settled among the sources naming one (lightingComposition's own tests hold those rules), then the mask's fill
 * from the two. A map nobody calls dark, or calls dark at 0, has no dark at all, however many lights it holds, since the
 * game never masks a map for its lights alone.
 *
 * Every light cuts through it from the page its event shows its lights from, the first page giving any unless another
 * choice is handed over, centred where the game centres it and where its ring is drawn (the tile's middle, at its foot,
 * six pixels up for a character that is not an object), its reach in pixels, its colour and intensity as its tag gives
 * them or the project's when it gives none, and its name as J-Lighting gives it: its event's source and its place among
 * that page's lights. Each burns at the strength handed over for it at the view's clock, asked after by its map, its name
 * and its effect.
 */

/**
 * The project's light defaults: a colour no tag below writes, and a soft pool.
 */
const DEFAULTS = { color: '#00ff00', intensity: 0 };

/**
 * The view's clock two seconds in, animating.
 */
const CLOCK: LightingClock = { frames: 120, animating: true };

/**
 * Every light at full strength, as it burns with no effect running.
 * @returns {number} 1.
 */
const steady: LightStrength = () => 1;

/**
 * An event at a cell with one page holding the given comment lines.
 * @param {number} id The event id.
 * @param {number} x The column.
 * @param {number} y The row.
 * @param {string[]} comments The comment lines.
 * @param {Partial<RmmzEventPage>} overrides Anything else to change on the page.
 * @returns {RmmzMapEvent} The event.
 */
const lightAt = (id: number, x: number, y: number, comments: string[], overrides: Partial<RmmzEventPage> = {}): RmmzMapEvent =>
{
  return { ...event(id, [ page(comments.map(comment => command(108, [ comment ])), overrides) ]), x, y };
};

/**
 * A 10x10 map with the given note and events in their slots.
 * @param {string} note The note.
 * @param {(RmmzMapEvent | null)[]} events The events, slot 0 empty.
 * @returns {MapDocument} The map.
 */
const mapWith = (note: string, events: (RmmzMapEvent | null)[]): MapDocument =>
{
  return MapDocument.fromJson('map:6', { ...buildMapJson(), width: 10, height: 10, data: new Array(10 * 10 * 6).fill(0), note, events });
};

/**
 * What the dark is worked out from: the map's own darkness in black, and any further sources.
 * @param {AmbientSource[]} extra Sources joining the map's.
 * @param {LightPageChoice} choosePage The page choice.
 * @param {LightStrength} strengthOf How brightly each light burns.
 * @returns {DarkSetup} The setup.
 */
const setupWith = (extra: AmbientSource[] = [], choosePage: LightPageChoice = firstLitPage, strengthOf: LightStrength = steady): DarkSetup =>
{
  return { sources: [ mapAmbient('#000000'), ...extra ], defaults: DEFAULTS, tileSize: 48, choosePage, strengthOf };
};

describe('darkScene', () =>
{
  describe('darkSceneOf', () =>
  {
    it('has no dark for a map nobody calls dark, however many lights it holds', () =>
    {
      // Arrange: a lit torch on a map whose note says nothing of darkness.
      const field = mapWith('<noToneChange>', [ null, lightAt(1, 2, 2, [ '<light:[4]>' ]) ]);

      // Act.
      const scene = darkSceneOf(field, setupWith(), CLOCK);

      // Assert.
      expect(scene)
        .toBeNull();
    });

    it('has no dark for a map called dark at 0', () =>
    {
      // Arrange.
      const dusk = mapWith('<ambient:[0]>', [ null, lightAt(1, 2, 2, [ '<light:[4]>' ]) ]);

      // Act.
      const scene = darkSceneOf(dusk, setupWith(), CLOCK);

      // Assert.
      expect(scene)
        .toBeNull();
    });

    it('fills a dark map\'s mask from its darkness, with every light on it cutting through', () =>
    {
      // Arrange: a cave at 85% holding a torch, a battler giving no light, and an empty slot.
      const cave = mapWith('<ambient:[85]>', [ null, lightAt(1, 2, 3, [ '<light:[4, #ffbb73, 40, flicker]>' ]), lightAt(2, 5, 5, [ '<enemyId:3>' ]), null ]);

      // Act.
      const scene = darkSceneOf(cave, setupWith(), CLOCK);

      // Assert.
      expect(scene)
        .toStrictEqual({
          darkness: 0.85,
          tint: 0x262626,
          lights: [ { id: 'page:1#0', x: 120, y: 186, radius: 192, color: '#ffbb73', intensity: 0.4, effect: 'flicker', strength: 1 } ],
        });
    });

    it('compounds every source\'s darkness, and takes the colour from the one naming it', () =>
    {
      // Arrange: a teal cave at 30%, and a clock at 40% naming no colour.
      const cave = mapWith('<ambient:[30, #0a2a2a]>', [ null ]);
      const clock: AmbientSource = () => ({ darkness: 0.4, color: [ 0, 0, 0 ], declaresColor: false, source: 'time' });

      // Act.
      const scene = darkSceneOf(cave, setupWith([ clock ]), CLOCK);

      // Assert.
      expect([ scene?.darkness, scene?.tint ])
        .toStrictEqual([ 0.5800000000000001, 0x718383 ]);
    });
  });

  describe('maskLightsOf', () =>
  {
    it('cuts one pool per light on the page each event shows its lights from, by event and then in page order', () =>
    {
      // Arrange: an empty slot; a brazier giving two lights; a lamp lit only on its second page; an event giving none.
      const brazier = lightAt(1, 0, 0, [ '<light:[2]>', '<light:[3, #88ffcc, 70, pulse]>' ]);
      const lamp: RmmzMapEvent = { ...event(2, [ page([]), page([ command(108, [ '<light:[1.5, #fff]>' ]) ]) ]), x: 4, y: 1 };
      const crate = lightAt(3, 6, 6, [ '<light:5>' ]);

      // Act.
      const lights = maskLightsOf(mapWith('', [ null, brazier, lamp, crate ]), setupWith(), CLOCK);

      // Assert.
      expect(lights)
        .toStrictEqual([
          { id: 'page:1#0', x: 24, y: 42, radius: 96, color: '#00ff00', intensity: 0, effect: 'steady', strength: 1 },
          { id: 'page:1#1', x: 24, y: 42, radius: 144, color: '#88ffcc', intensity: 0.7, effect: 'pulse', strength: 1 },
          { id: 'page:2#0', x: 216, y: 90, radius: 72, color: '#fff', intensity: 0, effect: 'steady', strength: 1 },
        ]);
    });

    it('centres an object\'s pool at its tile\'s very foot, where the game stands an object', () =>
    {
      // Arrange: a torch drawn from an object sheet.
      const torch = lightAt(1, 2, 3, [ '<light:[4]>' ], { image: { tileId: 0, characterName: '!Other2', direction: 2, pattern: 0, characterIndex: 7 } });

      // Act.
      const [ light ] = maskLightsOf(mapWith('', [ null, torch ]), setupWith(), CLOCK);

      // Assert.
      expect([ light.x, light.y ])
        .toStrictEqual([ 120, 192 ]);
    });

    it('reads lights from the page the choice handed over picks', () =>
    {
      // Arrange: a lamp lit on both pages, and a choice picking its second.
      const lamp: RmmzMapEvent = { ...event(1, [ page([ command(108, [ '<light:[2]>' ]) ]), page([ command(108, [ '<light:[5]>' ]) ]) ]), x: 0, y: 0 };
      const second: LightPageChoice = (chosen, defaults) => ({ page: chosen.pages[1], pageIndex: 1, lights: [ { radius: 5, color: defaults.color, intensity: 0, effect: 'steady' } ] });

      // Act.
      const lights = maskLightsOf(mapWith('', [ null, lamp ]), setupWith([], second), CLOCK);

      // Assert.
      expect(lights.map(light => light.radius))
        .toStrictEqual([ 240 ]);
    });

    it('burns each light at the strength handed over for it, asked by its map, its name and its effect, at the clock', () =>
    {
      // Arrange: a flickering torch and a steady lamp on map 6, and a strength dimming only what flickers.
      const torch = lightAt(1, 0, 0, [ '<light:[2, flicker]>' ]);
      const lamp = lightAt(2, 3, 0, [ '<light:[2]>' ]);
      const asked: string[] = [];
      const strengthOf: LightStrength = (light, clock) =>
      {
        asked.push(`${light.mapId} ${light.id} ${light.effect} at ${clock.frames}`);
        return light.effect === 'flicker' ? 0.8 : 1;
      };

      // Act.
      const lights = maskLightsOf(mapWith('', [ null, torch, lamp ]), setupWith([], firstLitPage, strengthOf), CLOCK);

      // Assert.
      expect([ lights.map(light => light.strength), asked ])
        .toStrictEqual([ [ 0.8, 1 ], [ '6 page:1#0 flicker at 120', '6 page:2#0 steady at 120' ] ]);
    });
  });

  describe('lightIdOf', () =>
  {
    it('names a light by its event\'s source and its place among its page\'s lights', () =>
    {
      // Arrange.
      const places: [ number, number ][] = [ [ 12, 0 ], [ 12, 1 ], [ 3, 0 ] ];

      // Act.
      const ids = places.map(([ eventId, ordinal ]) => lightIdOf(eventId, ordinal));

      // Assert.
      expect(ids)
        .toStrictEqual([ 'page:12#0', 'page:12#1', 'page:3#0' ]);
    });
  });
});
