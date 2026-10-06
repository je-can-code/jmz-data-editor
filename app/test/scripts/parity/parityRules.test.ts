import { describe, expect, it } from 'vitest';
import type { ProbeEvent } from '../../../../scripts/parity/probeTypes.ts';
import {
  animates,
  coverAxis,
  darkLightsOf,
  eventsKeyOf,
  explainCell,
  explainDarkCell,
  gameParityHolds,
  hasSkyOver,
  lightReaches,
  probeMapFor,
  skyProbeMapFor,
  snapshotPredictions,
  spriteCovers,
  steadyLighting,
  type DarkLight,
  type MapFile,
} from '../../../../scripts/parity/parityRules.ts';
import type { RmmzMapEvent } from '../../../src/mapEditor/core/model/rmmzTypes.ts';
import { command, event, page } from '../../mapEditor/support/eventKindFixtures.ts';

/*
 * The parity check's verdict rests on these rules. The views must cover every cell of a map as the engine would
 * allow the display to sit; maps with moving water must be compared at every animation step, and maps whose note
 * declares darkness dark as well; a difference in the events pass counts as explained only by an event the game draws
 * differently from its first page, and never under a plainly drawn event, however much its neighbours move; a
 * difference in the dark pass counts as explained only within the reach of a light the game shows from another page
 * than the first one giving light, which is the editor's; snapshot.js differences count as predicted only on star-order
 * and table cells; and any cell left unexplained, in any pass, fails the check.
 *
 * A map is drawn under its sky only when it has one: a map tagged <noToneChange> is refused rather than compared at an
 * hour it ignores. Its views and steps are any pass's, at the time of day asked for, and the events that explain its
 * differences are the ones the game showed at that hour, kept apart from the same map's other passes.
 *
 * The game copy the check runs holds every light steady, each effect's depth at 0 and the rest of its config as it was,
 * so every frame of the game shows every light at full strength, as the editor draws them.
 */

/**
 * Builds a map file with the given tiles on layer 1, by cell index, and the given note and events.
 * @param {number} width The width.
 * @param {number} height The height.
 * @param {Record<number, number>} tiles Tile ids by (z * height + y) * width + x.
 * @param {string} note The note.
 * @param {(RmmzMapEvent | null)[]} events The events, slot 0 empty.
 * @returns {MapFile} The map.
 */
const mapFile = (width: number, height: number, tiles: Record<number, number> = {}, note = '', events: (RmmzMapEvent | null)[] = []): MapFile =>
{
  const data = new Array<number>(width * height * 6).fill(0);
  Object.entries(tiles).forEach(([ index, id ]) =>
  {
    data[Number(index)] = id;
  });
  return { width, height, tilesetId: 1, data, note, events };
};

/**
 * Builds a light event standing at a cell, with the given pages' comments, one list of lines per page.
 * @param {number} id The event id.
 * @param {number} x The column.
 * @param {number} y The row.
 * @param {string[][]} pages Each page's comment lines.
 * @returns {RmmzMapEvent} The event.
 */
const lightEvent = (id: number, x: number, y: number, pages: string[][]): RmmzMapEvent =>
{
  return { ...event(id, pages.map(lines => page(lines.map(line => command(108, [ line ]))))), x, y };
};

/**
 * Builds an event as the probe reports it.
 * @param {Partial<ProbeEvent>} overrides What differs from a plainly drawn 48x48 character at (5, 5).
 * @returns {ProbeEvent} The event.
 */
const probeEvent = (overrides: Partial<ProbeEvent> = {}): ProbeEvent => ({
  id: 1,
  page: 0,
  visible: true,
  characterName: 'Actor1',
  tileId: 0,
  x: 5,
  y: 5,
  width: 48,
  height: 48,
  departures: [],
  ...overrides,
});

describe('parityRules', () =>
{
  describe('coverAxis and probeMapFor', () =>
  {
    it('covers a map with screens stepping a screen at a time, the last flush with the far edge', () =>
    {
      // Arrange: 75 tiles against a 40-tile screen; 30 against 22.5; 40 against 40.
      const axes: [ number, number ][] = [ [ 75, 40 ], [ 30, 22.5 ], [ 40, 40 ], [ 20, 40 ] ];

      // Act.
      const positions = axes.map(([ size, screen ]) => coverAxis(size, screen));

      // Assert.
      expect(positions)
        .toStrictEqual([ [ 0, 35 ], [ 0, 7.5 ], [ 0 ], [ 0 ] ]);
    });

    it('asks for every view of a map, at all four animation steps only when it has moving water', () =>
    {
      // Arrange: a 50x30 map with a waterfall (A1 kind 5) and one with only a still sea decoration (kind 2).
      const moving = mapFile(50, 30, { 0: 2048 + 5 * 48 });
      const still = mapFile(50, 30, { 0: 2048 + 2 * 48 });

      // Act.
      const orders = [ probeMapFor(7, moving, { width: 1920, height: 1080 }), probeMapFor(8, still, { width: 1920, height: 1080 }) ];

      // Assert.
      expect(orders)
        .toStrictEqual([
          { mapId: 7, views: [ { x: 0, y: 0 }, { x: 0, y: 7.5 }, { x: 10, y: 0 }, { x: 10, y: 7.5 } ], steps: [ 0, 1, 2, 3 ], dark: false },
          { mapId: 8, views: [ { x: 0, y: 0 }, { x: 0, y: 7.5 }, { x: 10, y: 0 }, { x: 10, y: 7.5 } ], steps: [ 0 ], dark: false },
        ]);
    });

    it('asks for a map under its sky at a time of day, at every view and step, drawn not as a dark map but as a sky', () =>
    {
      // Arrange: a 50x30 field with moving water and a darkness of its own, at 22:00.
      const field = mapFile(50, 30, { 0: 2048 + 5 * 48 }, '<ambient:[30]>');

      // Act.
      const order = skyProbeMapFor(337, field, { width: 1920, height: 1080 }, 1320);

      // Assert.
      expect(order)
        .toStrictEqual({ mapId: 337, views: [ { x: 0, y: 0 }, { x: 0, y: 7.5 }, { x: 10, y: 0 }, { x: 10, y: 7.5 } ], steps: [ 0, 1, 2, 3 ], dark: false, time: 1320 });
    });

    it('refuses to draw a map tagged to have no sky under one', () =>
    {
      // Arrange: a cave out from under the sky.
      const cave = mapFile(40, 23, {}, '<noToneChange>\n<ambient:[85]>');

      // Act.
      const attempt = () => skyProbeMapFor(4, cave, { width: 1920, height: 1080 }, 1320);

      // Assert.
      expect(attempt)
        .toThrow('Map004 has no sky to compare: its note carries <noToneChange>');
    });

    it('asks for a map dark as well when its note declares darkness, as J-Lighting reads a note', () =>
    {
      // Arrange: a cave, and a map whose note holds only something shaped like the tag.
      const cave = mapFile(40, 23, {}, '<noToneChange>\n<ambient:[85]>');
      const nearMiss = mapFile(40, 23, {}, '<ambient:85>');

      // Act.
      const dark = [ probeMapFor(4, cave, { width: 1920, height: 1080 }).dark, probeMapFor(5, nearMiss, { width: 1920, height: 1080 }).dark ];

      // Assert.
      expect(dark)
        .toStrictEqual([ true, false ]);
    });

    it('counts water only on the four tile layers', () =>
    {
      // Arrange: a sea tile on the region layer of a 1x1 map, where no tile draws.
      const map = mapFile(1, 1, { 5: 2048 });

      // Act.
      const moving = animates(map);

      // Assert.
      expect(moving)
        .toBe(false);
    });
  });

  describe('spriteCovers', () =>
  {
    it('covers the cells a sprite reaches, standing on its cell\'s bottom centre, and more with a margin', () =>
    {
      // Arrange: a 96x96 sprite at (5, 5) reaches from x 4 to 6 and up to row 3.
      const big = probeEvent({ width: 96, height: 96 });

      // Act.
      const covered = [ [ 4, 3 ], [ 6, 5 ], [ 7, 5 ], [ 5, 2 ], [ 5, 6 ] ].map(([ x, y ]) => spriteCovers(big, { x, y }, 0));
      const withMargin = [ [ 7, 5 ], [ 5, 6 ] ].map(([ x, y ]) => spriteCovers(big, { x, y }, 1));

      // Assert.
      expect([ covered, withMargin ])
        .toStrictEqual([ [ true, true, false, false, false ], [ true, true ] ]);
    });
  });

  describe('explainCell', () =>
  {
    const cell = { x: 5, y: 5, pixels: 10, maxDelta: 40 };

    it('explains a cell by an event the game draws its own way, or hides', () =>
    {
      // Arrange.
      const swaying = probeEvent({ departures: [ 'scaled 1.02x0.98' ] });
      const hidden = probeEvent({ visible: false });

      // Act.
      const reasons = [ explainCell(cell, [ swaying ]), explainCell(cell, [ hidden ]) ];

      // Assert.
      expect(reasons)
        .toStrictEqual([ 'event 1 scaled 1.02x0.98', 'event 1 is hidden in the game' ]);
    });

    it('leaves a cell unexplained under a plainly drawn event, however much a neighbour moves', () =>
    {
      // Arrange: a plain chest on the cell, a swaying battler beside it.
      const chest = probeEvent({ id: 2 });
      const battler = probeEvent({ id: 3, x: 6, departures: [ 'scaled 1.02x0.98' ] });

      // Act.
      const reason = explainCell(cell, [ chest, battler ]);

      // Assert.
      expect(reason)
        .toBeNull();
    });

    it('leaves a cell unexplained with no event near it', () =>
    {
      // Arrange: a departing event far away.
      const far = probeEvent({ x: 20, y: 20, departures: [ 'opacity 128' ] });

      // Act.
      const reason = explainCell(cell, [ far ]);

      // Assert.
      expect(reason)
        .toBeNull();
    });
  });

  describe('snapshotPredictions', () =>
  {
    it('predicts a star tile under a later non-star tile, a table, and the cell under a layer 2 table', () =>
    {
      // Arrange: a 3x2 map; (0,0) star on layer 1 under a plain B tile on layer 3; (1,0) a table on layer 2; (2,0) a
      // star alone; tile 2 is a star, tile 3 plain, tile 2816 a table.
      const flags: number[] = [];
      flags[2] = 0x10;
      flags[2816] = 0x80;
      const map = mapFile(3, 2, { 0: 2, [(2 * 2 + 0) * 3 + 0]: 3, [(1 * 2 + 0) * 3 + 1]: 2816, 2: 2 });

      // Act.
      const predicted = [ ...snapshotPredictions(map, flags).entries() ];

      // Assert: (2,0)'s star has nothing above it, so it draws the same either way.
      expect(predicted)
        .toStrictEqual([
          [ '0,0', 'star tile drawn above a later layer' ],
          [ '1,0', 'table legs or edge' ],
          [ '1,1', 'table legs or edge' ],
        ]);
    });
  });

  describe('gameParityHolds', () =>
  {
    it('holds only when no view of any pass leaves a differing cell unexplained', () =>
    {
      // Arrange: every view clean; one unexplained cell in an events pass; one in a tiles pass; one in a dark pass; one in
      // a sky.
      const clean = [ { pass: 'tiles', unexplained: [] }, { pass: 'events', unexplained: [] }, { pass: 'dark', unexplained: [] }, { pass: 'sky', unexplained: [] } ] as const;
      const eventsDiffer = [ { pass: 'tiles', unexplained: [] }, { pass: 'events', unexplained: [ { x: 4, y: 2 } ] } ] as const;
      const tilesDiffer = [ { pass: 'tiles', unexplained: [ { x: 0, y: 0 } ] }, { pass: 'events', unexplained: [] } ] as const;
      const darkDiffers = [ { pass: 'tiles', unexplained: [] }, { pass: 'dark', unexplained: [ { x: 9, y: 9 } ] } ] as const;
      const skyDiffers = [ { pass: 'tiles', unexplained: [] }, { pass: 'sky', unexplained: [ { x: 3, y: 1 } ] } ] as const;

      // Act.
      const verdicts = [ clean, eventsDiffer, tilesDiffer, darkDiffers, skyDiffers ].map(views => gameParityHolds(views));

      // Assert.
      expect(verdicts)
        .toStrictEqual([ true, false, false, false, false ]);
    });
  });

  describe('hasSkyOver', () =>
  {
    it('puts a map under the sky unless its note takes it out, read as the engine reads a note\'s tags', () =>
    {
      // Arrange: a field; a cave; a near miss in another case.
      const maps = [ mapFile(10, 10, {}, ''), mapFile(10, 10, {}, '<noToneChange>'), mapFile(10, 10, {}, '<NoToneChange>') ];

      // Act.
      const skies = maps.map(hasSkyOver);

      // Assert.
      expect(skies)
        .toStrictEqual([ true, false, true ]);
    });
  });

  describe('eventsKeyOf', () =>
  {
    it('keys a pass by its map, and a sky by its map and its time of day', () =>
    {
      // Arrange: a dark pass on map 4, and two skies on map 337.
      const captures = [ { mapId: 4 }, { mapId: 337, time: 1320 }, { mapId: 337, time: 840 } ];

      // Act.
      const keys = captures.map(eventsKeyOf);

      // Assert.
      expect(keys)
        .toStrictEqual([ '4', '337@1320', '337@840' ]);
    });
  });

  describe('darkLightsOf', () =>
  {
    it('lists every lit event once, from the first page giving light, reaching as far as any of its pages', () =>
    {
      // Arrange: a torch; a lamp lit small on page 2 and larger on page 3; a battler giving no light; an empty slot.
      const map = mapFile(10, 10, {}, '<ambient:[85]>', [
        null,
        lightEvent(1, 2, 3, [ [ '<light:[4, #ffbb73, 40]>' ] ]),
        lightEvent(2, 6, 1, [ [ '<enemyId:3>' ], [ '<light:[1.5]>' ], [ '<light:[3.5]>' ] ]),
        lightEvent(3, 8, 8, [ [ '<enemyId:3>' ] ]),
        null,
      ]);

      // Act.
      const lights = darkLightsOf(map);

      // Assert.
      expect(lights)
        .toStrictEqual([
          { eventId: 1, pageIndex: 0, x: 120, y: 192, reach: 192 },
          { eventId: 2, pageIndex: 1, x: 312, y: 96, reach: 168 },
        ]);
    });
  });

  describe('lightReaches', () =>
  {
    it('reaches the cells within the light\'s square, and a cell beyond each side', () =>
    {
      // Arrange: a light reaching one tile from the foot of cell 5, 5: the square spans columns 4 to 6 and rows 5 to 6,
      // widened to columns 3 to 7 and rows 4 to 7.
      const light: DarkLight = { eventId: 1, pageIndex: 0, x: 264, y: 288, reach: 48 };
      const cells = [ [ 3, 4 ], [ 7, 7 ], [ 2, 5 ], [ 8, 5 ], [ 5, 3 ], [ 5, 8 ] ];

      // Act.
      const reached = cells.map(([ x, y ]) => lightReaches(light, { x, y }));

      // Assert.
      expect(reached)
        .toStrictEqual([ true, true, false, false, false, false ]);
    });
  });

  describe('explainDarkCell', () =>
  {
    const lamp: DarkLight = { eventId: 2, pageIndex: 1, x: 312, y: 96, reach: 168 };
    const cell = { x: 6, y: 2 };

    it('explains a cell within the reach of a light the game shows from another page', () =>
    {
      // Arrange: the game shows the lamp's third page.
      const events = [ probeEvent({ id: 2, page: 2 }) ];

      // Act.
      const reason = explainDarkCell(cell, [ lamp ], events);

      // Assert.
      expect(reason)
        .toBe('event 2 shows page 3 in the game, not its lit page 2');
    });

    it('explains a cell within the reach of a light whose event shows no page in the game, or is not there at all', () =>
    {
      // Arrange: the lamp with no page whose conditions hold; and a game reporting no such event.
      const unlit = [ probeEvent({ id: 2, page: -1 }) ];
      const missing = [ probeEvent({ id: 9, page: 1 }) ];

      // Act.
      const reasons = [ explainDarkCell(cell, [ lamp ], unlit), explainDarkCell(cell, [ lamp ], missing) ];

      // Assert.
      expect(reasons)
        .toStrictEqual([ 'event 2 shows no page in the game, so gives no light', 'event 2 shows no page in the game, so gives no light' ]);
    });

    it('leaves a cell unexplained where the game shows the light from the editor\'s own page', () =>
    {
      // Arrange: the game shows the lamp's second page, as the editor does.
      const events = [ probeEvent({ id: 2, page: 1 }) ];

      // Act.
      const reason = explainDarkCell(cell, [ lamp ], events);

      // Assert.
      expect(reason)
        .toBeNull();
    });

    it('leaves a cell unexplained beyond the reach of a light the game shows differently', () =>
    {
      // Arrange: the game shows the lamp's third page, and the cell lies far across the map.
      const events = [ probeEvent({ id: 2, page: 2 }) ];

      // Act.
      const reason = explainDarkCell({ x: 30, y: 20 }, [ lamp ], events);

      // Assert.
      expect(reason)
        .toBeNull();
    });
  });

  describe('steadyLighting', () =>
  {
    it('takes every effect\'s depth to 0, keeping the rest of the config as it was', () =>
    {
      // Arrange: the config the game ships.
      const shipped = {
        light: {
          radius: 5,
          color: '#FFFFFF',
          intensity: 0,
          effects: {
            flicker: { depth: 0.2, period: 40, chance: 0, variance: 0.18 },
            pulse: { depth: 0.45, period: 165, chance: 0, variance: 0.22 },
          },
        },
        ambient: { color: '#000000' },
      };

      // Act.
      const steady = steadyLighting(shipped);

      // Assert.
      expect(steady)
        .toStrictEqual({
          light: {
            radius: 5,
            color: '#FFFFFF',
            intensity: 0,
            effects: {
              flicker: { depth: 0, period: 40, chance: 0, variance: 0.18 },
              pulse: { depth: 0, period: 165, chance: 0, variance: 0.22 },
            },
          },
          ambient: { color: '#000000' },
        });
    });
  });
});
