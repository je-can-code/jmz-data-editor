import type { Container, Renderer } from 'pixi.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { RmmzEventPage, RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import {
  colorNumber,
  lightCentre,
  LightRings,
  lightRingsOf,
  sameRings,
  type LightRing,
} from '../../../../src/mapEditor/modules/lighting/lightRings.ts';
import type { LightDefaults } from '../../../../src/mapEditor/modules/lighting/lightTags.ts';
import { command, event, page, text } from '../../support/eventKindFixtures.ts';
import { buildMapJson } from '../../support/fixtures.ts';
import { ENGINE_PAGES } from '../../support/pageFixtures.ts';
import { WHOLE_VIEW } from '../../support/viewFixtures.ts';

/**
 * Every stand-in drawing made, each with the calls it was given, written out so a test reads them at a glance.
 */
const stand = vi.hoisted(() => ({
  graphics: [] as { calls: string[] }[],
}));

// the rings draw through pixi's Graphics, which needs no GPU to record shapes but hides them in its own structures; a
// stand-in writes each call down instead.
vi.mock('pixi.js', () =>
{
  /**
   * Writes a colour as six hex digits.
   * @param {number} color The colour.
   * @returns {string} The digits.
   */
  const hex = (color: number) => color.toString(16).padStart(6, '0');

  /**
   * Stands in for pixi's Graphics, writing down each call.
   */
  class Graphics
  {
    calls: string[] = [];

    constructor()
    {
      stand.graphics.push(this);
    }

    clear(): this
    {
      this.calls.push('clear');
      return this;
    }

    circle(x: number, y: number, radius: number): this
    {
      this.calls.push(`circle ${x},${y} r${radius}`);
      return this;
    }

    fill(style: { color: number; alpha: number }): this
    {
      this.calls.push(`fill ${hex(style.color)} ${style.alpha}`);
      return this;
    }

    stroke(style: { color: number; alpha: number; width: number; pixelLine?: boolean }): this
    {
      this.calls.push(`stroke ${hex(style.color)} ${style.alpha} ${style.pixelLine === true ? 'pixel' : style.width}`);
      return this;
    }

    destroy(): void
    {
      this.calls.push('destroy');
    }
  }

  return { Graphics };
});

/*
 * Every light on the map shows how far it reaches as a ring about the spot the game centres its light on: the event's
 * sprite's feet (Game_CharacterBase#screenX and #screenY), centred across its tile and at the tile's foot, six pixels
 * higher for a character that is not an object. Its radius is the tag's reach in tiles, and it is drawn in the light's
 * colour, from the page the event shows at the clock's time, as the frame's pages say: a lamp lit only by night shows no
 * ring by day, and an event no page holds for none at all. An event giving several lights shows several rings about one
 * spot.
 *
 * The rings read over a bright map without drowning it: washes, then dark bands, then one-pixel edges in the light's
 * colour, then a dot at each light, in that order so no ring's band covers another's edge. They draw again only when a
 * ring moved, grew, changed colour, came or went: asked to draw after any other change, they compare and keep what they
 * have, so an edit elsewhere costs a comparison and nothing more.
 */

/**
 * The defaults the tests draw with: a colour no tag below writes.
 */
const DEFAULTS: LightDefaults = { color: '#00ff00', intensity: 0 };

/**
 * A light event standing at a cell, with one page holding the given comment lines.
 * @param {number} id The event id.
 * @param {number} x The column.
 * @param {number} y The row.
 * @param {string[]} comments The comment lines.
 * @returns {RmmzMapEvent} The event.
 */
const lightAt = (id: number, x: number, y: number, comments: string[]): RmmzMapEvent =>
{
  return { ...event(id, [ page(comments.map(comment => command(108, [ comment ]))) ]), x, y };
};

/**
 * A map holding the given events in their slots.
 * @param {RmmzMapEvent[]} events The events.
 * @returns {MapDocument} The map.
 */
const mapWith = (events: RmmzMapEvent[]): MapDocument =>
{
  const json = buildMapJson();
  json.width = 10;
  json.height = 10;
  json.data = new Array<number>(10 * 10 * 6).fill(0);
  json.events = [ null, ...events ];
  return MapDocument.fromJson('map:1', json);
};

/**
 * Builds rings in a stand-in stage.
 * @returns {{ rings: LightRings, children: unknown[], calls: string[] }} The rings, what the stage holds, and the calls
 * their drawing was given.
 */
const buildRings = () =>
{
  const children: unknown[] = [];
  const layer = { addChild: (child: unknown) => children.push(child) } as unknown as Container;
  const rings = new LightRings({ layer, tileSize: 48, castTone: () => undefined }, DEFAULTS);
  const [ drawing ] = stand.graphics.slice(-1);
  return { rings, children, drawing, calls: drawing.calls };
};

/**
 * Hands a drawing the map, as the view does in a frame.
 * @param {LightRings} rings The rings.
 * @param {MapDocument} document The map.
 */
const drawOn = (rings: LightRings, document: MapDocument): void =>
{
  rings.draw({ document, renderer: {} as Renderer, context: 1, clock: { frames: 0, animating: true, timeOfDay: 0 }, pages: ENGINE_PAGES, view: WHOLE_VIEW });
};

describe('lightRings', () =>
{
  beforeEach(() =>
  {
    stand.graphics.splice(0);
  });

  describe('colorNumber', () =>
  {
    it('reads six digits as they are', () =>
    {
      // Arrange.
      const hex = '#ffbb73';

      // Act.
      const color = colorNumber(hex);

      // Assert.
      expect(color)
        .toBe(0xffbb73);
    });

    it('doubles each of three digits, in either case', () =>
    {
      // Arrange.
      const shorthands = [ '#fb7', '#FB7' ];

      // Act.
      const colors = shorthands.map(colorNumber);

      // Assert.
      expect(colors)
        .toStrictEqual([ 0xffbb77, 0xffbb77 ]);
    });
  });

  describe('lightCentre', () =>
  {
    it('centres a light across its tile at the sprite\'s feet, six pixels higher for a character that is no object', () =>
    {
      // Arrange: at 2, 3, with no picture, a big character, an object, a big object, and a tile.
      const lamp = { ...event(1, []), x: 2, y: 3 };
      const pictures: RmmzEventPage[] = [
        page([]),
        page([], { image: { tileId: 0, characterName: '$Torch', direction: 2, pattern: 0, characterIndex: 0 } }),
        page([], { image: { tileId: 0, characterName: '!Flame', direction: 2, pattern: 0, characterIndex: 0 } }),
        page([], { image: { tileId: 0, characterName: '$!Lamp', direction: 2, pattern: 0, characterIndex: 0 } }),
        page([], { image: { tileId: 12, characterName: '', direction: 2, pattern: 0, characterIndex: 0 } }),
      ];

      // Act.
      const centres = pictures.map(picture => lightCentre(lamp, picture, 48));

      // Assert.
      expect(centres)
        .toStrictEqual([ { x: 120, y: 186 }, { x: 120, y: 186 }, { x: 120, y: 192 }, { x: 120, y: 192 }, { x: 120, y: 192 } ]);
    });
  });

  describe('lightRingsOf', () =>
  {
    it('lists a ring for every light on the page each event shows, and none for an empty slot or an unlit event', () =>
    {
      // Arrange: an empty slot, a sign, a torch lit on its second page, and a ghost giving two lights.
      const sign = event(2, [ page(text([ 'Welcome.' ])) ]);
      const torch = { ...event(3, [ page([]), page([ command(108, [ '<light:[4, #ffbb73]>' ]) ]) ]), x: 1, y: 0 };
      const ghost = lightAt(4, 0, 2, [ '<light:[2.5]>', '<light:[1, #fff]>' ]);

      // Act.
      const rings = lightRingsOf([ null, sign, torch, ghost ], DEFAULTS, 48, ENGINE_PAGES);

      // Assert.
      expect(rings)
        .toStrictEqual([
          { x: 72, y: 42, radius: 192, color: 0xffbb73 },
          { x: 24, y: 138, radius: 120, color: 0x00ff00 },
          { x: 24, y: 138, radius: 48, color: 0xffffff },
        ]);
    });

    it('lists the rings of the page each event shows, whichever that is, and none while it shows an unlit page or none', () =>
    {
      // Arrange: a torch lit on both pages, red on its second; a lamp cold on its second page; and the pages answered as
      // the second for the first two and none for a third, lit, event.
      const torch = { ...event(3, [ page([ command(108, [ '<light:[4]>' ]) ]), page([ command(108, [ '<light:[1, #ff0000]>' ]) ]) ]), x: 0, y: 0 };
      const lamp = { ...event(4, [ page([ command(108, [ '<light:[4]>' ]) ]), page([]) ]), x: 2, y: 0 };
      const gone = lightAt(5, 4, 0, [ '<light:[4]>' ]);
      const pages = { activePage: (shown: RmmzMapEvent) => (shown.id === 5 ? -1 : 1) };

      // Act.
      const rings = lightRingsOf([ torch, lamp, gone ], DEFAULTS, 48, pages);

      // Assert.
      expect(rings)
        .toStrictEqual([ { x: 24, y: 42, radius: 48, color: 0xff0000 } ]);
    });
  });

  describe('sameRings', () =>
  {
    /**
     * A ring to compare against.
     */
    const ring: LightRing = { x: 24, y: 42, radius: 96, color: 0xffbb73 };

    it('holds two lists of the same rings the same', () =>
    {
      // Arrange.
      const left = [ ring, { ...ring, x: 72 } ];
      const right = [ { ...ring }, { ...ring, x: 72 } ];

      // Act.
      const same = sameRings(left, right);

      // Assert.
      expect(same)
        .toBe(true);
    });

    it('tells lists of different lengths apart', () =>
    {
      // Arrange.
      const left = [ ring ];
      const right = [ ring, ring ];

      // Act.
      const same = sameRings(left, right);

      // Assert.
      expect(same)
        .toBe(false);
    });

    it('tells apart rings differing in any one thing', () =>
    {
      // Arrange: a ring moved across, moved down, grown, and recoloured.
      const others = [ { ...ring, x: 25 }, { ...ring, y: 43 }, { ...ring, radius: 97 }, { ...ring, color: 0xffbb74 } ];

      // Act.
      const same = others.map(other => sameRings([ ring ], [ other ]));

      // Assert.
      expect(same)
        .toStrictEqual([ false, false, false, false ]);
    });
  });

  describe('LightRings', () =>
  {
    it('adds its drawing to the stage it is made for', () =>
    {
      // Arrange: nothing beyond the stage.

      // Act.
      const { children, drawing } = buildRings();

      // Assert.
      expect(children)
        .toStrictEqual([ drawing ]);
    });

    it('draws washes, then dark bands, then edges in each light\'s colour, then a dot at each light', () =>
    {
      // Arrange: two lights, one in the default colour.
      const { rings, calls } = buildRings();
      const map = mapWith([ lightAt(1, 0, 0, [ '<light:[2, #ffbb73]>' ]), lightAt(2, 1, 1, [ '<light:[1]>' ]) ]);

      // Act.
      drawOn(rings, map);

      // Assert.
      expect(calls)
        .toStrictEqual([
          'clear',
          'circle 24,42 r96', 'fill ffbb73 0.07',
          'circle 72,90 r48', 'fill 00ff00 0.07',
          'circle 24,42 r96', 'stroke 000000 0.45 3',
          'circle 72,90 r48', 'stroke 000000 0.45 3',
          'circle 24,42 r96', 'stroke ffbb73 1 pixel',
          'circle 72,90 r48', 'stroke 00ff00 1 pixel',
          'circle 24,42 r3', 'fill ffbb73 1', 'stroke 000000 0.45 pixel',
          'circle 72,90 r3', 'fill 00ff00 1', 'stroke 000000 0.45 pixel',
        ]);
    });

    it('draws nothing again when asked after a change that leaves every ring as it was', () =>
    {
      // Arrange: a lamp drawn once, then a sign beside it renamed and moved.
      const { rings, calls } = buildRings();
      const map = mapWith([ lightAt(1, 0, 0, [ '<light:[2]>' ]), { ...event(2, [ page(text([ 'Hi.' ])) ]), x: 3, y: 3 } ]);
      drawOn(rings, map);
      const drawn = calls.length;
      map.apply(map.setPatch([ 'events', 2, 'name' ], 'Signpost'));
      map.apply(map.setPatch([ 'events', 2, 'x' ], 4));

      // Act.
      drawOn(rings, map);
      drawOn(rings, map);

      // Assert.
      expect([ drawn > 0, calls.length ])
        .toStrictEqual([ true, drawn ]);
    });

    it('draws again when a light moves, its tag changes, or the page it shows changes, and not for a page it does not show', () =>
    {
      // Arrange: a torch lit on its second page, drawn once.
      const torch = { ...event(1, [ page([]), page([ command(108, [ '<light:[2]>' ]) ]) ]), x: 0, y: 0 };
      const { rings, calls } = buildRings();
      const map = mapWith([ torch ]);
      drawOn(rings, map);

      /**
       * Applies an edit, draws, and reads the first ring drawn since.
       * @param {(string | number)[]} path Where to write.
       * @param {JsonValue} value What to write.
       * @returns {string | undefined} The first ring's circle call, or nothing when the rings were not drawn again.
       */
      const redrawAfter = (path: (string | number)[], value: JsonValue): string | undefined =>
      {
        const before = calls.length;
        map.apply(map.setPatch(path, value));
        drawOn(rings, map);
        return calls.slice(before).find(call => call.startsWith('circle'));
      };
      const litFirstPage = [ command(108, [ '<light:[1]>' ]), command(0) ] as unknown as JsonValue;

      // Act: moved across, given a longer reach, given a smaller light on its first page, which it does not show, then its
      // second page put behind switch 4, which a new game has off, so it shows its first.
      const moved = redrawAfter([ 'events', 1, 'x' ], 2);
      const retagged = redrawAfter([ 'events', 1, 'pages', 1, 'list', 0, 'parameters', 0 ], '<light:[3]>');
      const unshown = redrawAfter([ 'events', 1, 'pages', 0, 'list' ], litFirstPage);
      const repaged = redrawAfter([ 'events', 1, 'pages', 1, 'conditions', 'switch1Valid' ], true);

      // Assert.
      expect([ moved, retagged, unshown, repaged ])
        .toStrictEqual([ 'circle 120,42 r96', 'circle 120,42 r144', undefined, 'circle 120,42 r48' ]);
    });

    it('draws nothing as the clock moves, however its lights gutter', () =>
    {
      // Arrange: a flickering torch drawn once.
      const { rings, calls } = buildRings();
      const map = mapWith([ lightAt(1, 0, 0, [ '<light:[2, flicker]>' ]) ]);
      drawOn(rings, map);
      const before = calls.length;

      // Act: two frames on.
      const moved = [ rings.tick(), rings.tick() ];

      // Assert.
      expect([ moved, calls.length ])
        .toStrictEqual([ [ false, false ], before ]);
    });

    it('clears the rings when the last light goes out', () =>
    {
      // Arrange: a lamp drawn once.
      const { rings, calls } = buildRings();
      const map = mapWith([ lightAt(1, 0, 0, [ '<light:[2]>' ]) ]);
      drawOn(rings, map);
      const before = calls.length;

      // Act: its tag no longer gives light.
      map.apply(map.setPatch([ 'events', 1, 'pages', 0, 'list', 0, 'parameters', 0 ], '<light:[0]>'));
      drawOn(rings, map);

      // Assert.
      expect(calls.slice(before))
        .toStrictEqual([ 'clear' ]);
    });

    it('lets its drawing go', () =>
    {
      // Arrange.
      const { rings, calls } = buildRings();

      // Act.
      rings.destroy();

      // Assert.
      expect(calls)
        .toStrictEqual([ 'destroy' ]);
    });
  });
});
