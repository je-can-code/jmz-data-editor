import { describe, expect, it } from 'vitest';
import type { ProbeEvent } from '../../../../scripts/parity/probeTypes.ts';
import {
  animates,
  coverAxis,
  darkLightsOf,
  editorPagesOf,
  eventsKeyOf,
  explainCell,
  explainDarkCell,
  gameParityHolds,
  lightReaches,
  pageDifferencesOf,
  parityPageRule,
  probeMapFor,
  skyProbeMapFor,
  snapshotPredictions,
  spriteCovers,
  startingPartyOf,
  steadyLighting,
  timeOfCapture,
  type DarkLight,
  type MapFile,
} from '../../../../scripts/parity/parityRules.ts';
import type { RmmzEventConditions, RmmzMapEvent } from '../../../src/mapEditor/core/model/rmmzTypes.ts';
import type { PluginsJsEntry } from '../../../src/services/plugins/PluginsJsReader.ts';
import { command, event, page } from '../../mapEditor/support/eventKindFixtures.ts';

/*
 * The parity check's verdict rests on these rules. The views must cover every cell of a map as the engine would
 * allow the display to sit; maps with moving water must be compared at every animation step, and maps whose note
 * declares darkness dark as well; snapshot.js differences count as predicted only on star-order and table cells; and
 * any cell left unexplained, in any pass, fails the check.
 *
 * Both sides judge every event's page at one hour: the one the game's clock read on arriving at the map, which for a
 * map drawn at a time of day is that time, or for a game with no clock the time asked for, if any. The editor shows
 * the page a fresh save would show then, under the engine's conditions with the starting party (the members with a row
 * in the actors' file) and J-TIME's page tags whenever the game lists J-TIME enabled; the events the game shows on
 * another page are listed, an event the editor has no page for showing none there. A difference in the events pass
 * counts as explained only by an event the game shows on another page than the editor's, hides, or draws otherwise
 * than its page, and never under an event both sides draw alike, however much its neighbours move; a difference in the
 * dark or sky pass only within the reach of a light the game shows from another page than the editor's, where one of
 * the two pages gives light.
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

/**
 * J-TIME as Chef Adventure's js/plugins.js lists it: a new game at 14:00:00 on 16 December 2026.
 * @param {boolean} status Whether it is enabled.
 * @returns {PluginsJsEntry} The entry.
 */
const jTime = (status: boolean): PluginsJsEntry => ({
  name: 'j/time/J-TIME',
  status,
  description: '',
  parameters: { useRealTime: 'false', startingSecond: '0', startingMinute: '0', startingHour: '14', startingDay: '16', startingMonth: '12', startingYear: '2026' },
});

/**
 * Builds an event whose pages each hold the given comment lines, under the given conditions.
 * @param {number} id The event id.
 * @param {string[][]} pages Each page's comment lines.
 * @param {Partial<RmmzEventConditions>[]} conditions Each page's conditions, by page; none by default.
 * @returns {RmmzMapEvent} The event.
 */
const taggedEvent = (id: number, pages: string[][], conditions: Partial<RmmzEventConditions>[] = []): RmmzMapEvent =>
{
  return event(id, pages.map((lines, index) =>
  {
    const shown = page(lines.map(line => command(108, [ line ])));
    return { ...shown, conditions: { ...shown.conditions, ...conditions[index] } };
  }));
};

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

    // the editor shows event 1 its first page, and its neighbours 2 and 3 their second.
    const editorPages = new Map([ [ 1, 0 ], [ 2, 1 ], [ 3, 1 ] ]);

    it('explains a cell by an event the game shows on the editor\'s page but draws its own way, or hides', () =>
    {
      // Arrange.
      const swaying = probeEvent({ departures: [ 'scaled 1.02x0.98' ] });
      const hidden = probeEvent({ visible: false });

      // Act.
      const reasons = [ explainCell(cell, [ swaying ], editorPages), explainCell(cell, [ hidden ], editorPages) ];

      // Assert.
      expect(reasons)
        .toStrictEqual([ 'event 1 scaled 1.02x0.98', 'event 1 is hidden in the game' ]);
    });

    it('explains a cell by an event the game shows on another page than the editor, naming both before anything else', () =>
    {
      // Arrange: event 1 on its second page in the game, drawn plainly; then on its second page, turned; then on none.
      const turned = probeEvent({ page: 1 });
      const turnedAndFacing = probeEvent({ page: 1, departures: [ 'faces 4 instead of 2' ] });
      const gone = probeEvent({ page: -1, width: 0, height: 0 });

      // Act.
      const reasons = [ turned, turnedAndFacing, gone ].map(shown => explainCell(cell, [ shown ], editorPages));

      // Assert.
      expect(reasons)
        .toStrictEqual([
          'event 1 shows page 2 in the game, page 1 in the editor',
          'event 1 shows page 2 in the game, page 1 in the editor, faces 4 instead of 2',
          'event 1 shows no page in the game, page 1 in the editor',
        ]);
    });

    it('explains a cell by an event the editor has no page for, as showing none there', () =>
    {
      // Arrange: event 9, which a plugin put on the map, shown plainly on its first page in the game.
      const spawned = probeEvent({ id: 9 });

      // Act.
      const reason = explainCell(cell, [ spawned ], editorPages);

      // Assert.
      expect(reason)
        .toBe('event 9 shows page 1 in the game, no page in the editor');
    });

    it('leaves a cell unexplained under an event both sides draw alike, however much a neighbour moves', () =>
    {
      // Arrange: a plain chest on the cell, on the editor's page; a swaying battler beside it.
      const chest = probeEvent({ id: 2, page: 1 });
      const battler = probeEvent({ id: 3, x: 6, page: 1, departures: [ 'scaled 1.02x0.98' ] });

      // Act.
      const reason = explainCell(cell, [ chest, battler ], editorPages);

      // Assert.
      expect(reason)
        .toBeNull();
    });

    it('leaves a cell unexplained with no event near it', () =>
    {
      // Arrange: an event far away, both departing and on another page.
      const far = probeEvent({ x: 20, y: 20, page: 1, departures: [ 'opacity 128' ] });

      // Act.
      const reason = explainCell(cell, [ far ], editorPages);

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
    it('lists every lit event once, with the page the editor shows, the pages giving light, and the furthest any reaches', () =>
    {
      // Arrange: a torch the editor shows no page of, as a lamp by day; a lamp lit small on page 2 and larger on page 3,
      // which the editor shows; a battler giving no light; empty slots.
      const map = mapFile(10, 10, {}, '<ambient:[85]>', [
        null,
        lightEvent(1, 2, 3, [ [ '<light:[4, #ffbb73, 40]>' ] ]),
        lightEvent(2, 6, 1, [ [ '<enemyId:3>' ], [ '<light:[1.5]>' ], [ '<light:[3.5]>' ] ]),
        lightEvent(3, 8, 8, [ [ '<enemyId:3>' ] ]),
        null,
      ]);
      const editorPages = new Map([ [ 1, -1 ], [ 2, 2 ], [ 3, 0 ] ]);

      // Act.
      const lights = darkLightsOf(map, editorPages);

      // Assert.
      expect(lights)
        .toStrictEqual([
          { eventId: 1, pageIndex: -1, litPages: [ 0 ], x: 120, y: 192, reach: 192 },
          { eventId: 2, pageIndex: 2, litPages: [ 1, 2 ], x: 312, y: 96, reach: 168 },
        ]);
    });
  });

  describe('lightReaches', () =>
  {
    it('reaches the cells within the light\'s square, and a cell beyond each side', () =>
    {
      // Arrange: a light reaching one tile from the foot of cell 5, 5: the square spans columns 4 to 6 and rows 5 to 6,
      // widened to columns 3 to 7 and rows 4 to 7.
      const light: DarkLight = { eventId: 1, pageIndex: 0, litPages: [ 0 ], x: 264, y: 288, reach: 48 };
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
    // a lamp unlit on its first page, lit on its second and third, shown on its second by the editor.
    const lamp: DarkLight = { eventId: 2, pageIndex: 1, litPages: [ 1, 2 ], x: 312, y: 96, reach: 168 };
    const cell = { x: 6, y: 2 };

    it('explains a cell within the reach of a light the game shows from another lit page', () =>
    {
      // Arrange: the game shows the lamp's third page; another event sits on the editor's page.
      const events = [ probeEvent({ id: 1, page: 1 }), probeEvent({ id: 2, page: 2 }) ];

      // Act.
      const reason = explainDarkCell(cell, [ lamp ], events);

      // Assert.
      expect(reason)
        .toBe('event 2 shows page 3 in the game, page 2 in the editor');
    });

    it('explains a cell within the reach of a light the editor shows whose event shows no page in the game, or is not there at all', () =>
    {
      // Arrange: the lamp with no page whose conditions hold; and a game reporting no such event.
      const unlit = [ probeEvent({ id: 2, page: -1 }) ];
      const missing = [ probeEvent({ id: 9, page: 1 }) ];

      // Act.
      const reasons = [ explainDarkCell(cell, [ lamp ], unlit), explainDarkCell(cell, [ lamp ], missing) ];

      // Assert.
      expect(reasons)
        .toStrictEqual([ 'event 2 shows no page in the game, page 2 in the editor', 'event 2 shows no page in the game, page 2 in the editor' ]);
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

    it('leaves a cell unexplained where the two sides show different pages, neither of them giving light', () =>
    {
      // Arrange: the editor shows the lamp no page, as a lamp by day, and the game its unlit first page.
      const dayLamp: DarkLight = { ...lamp, pageIndex: -1 };
      const events = [ probeEvent({ id: 2, page: 0 }) ];

      // Act.
      const reason = explainDarkCell(cell, [ dayLamp ], events);

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

  describe('timeOfCapture', () =>
  {
    it('takes the hour the game\'s clock read on arriving at the capture\'s map, for a sky as for any other pass', () =>
    {
      // Arrange: map 4 arrived at 14:03; map 337 arrived at with its clock set to 14:00, and to 22:00 though it read a
      // minute past, which the editor follows.
      const clocks = { 4: 843, '337@1320': 1321, '337@840': 840 };

      // Act.
      const times = [ { mapId: 4 }, { mapId: 337, time: 1320 }, { mapId: 337, time: 840 } ].map(capture => timeOfCapture(capture, clocks));

      // Assert.
      expect(times)
        .toStrictEqual([ 843, 1321, 840 ]);
    });

    it('takes the hour asked for, or none, from a game with no clock', () =>
    {
      // Arrange: a game without J-TIME, its clock read as -1 on every map.
      const clocks = { 4: -1, '337@1320': -1 };

      // Act.
      const times = [ { mapId: 4 }, { mapId: 337, time: 1320 } ].map(capture => timeOfCapture(capture, clocks));

      // Assert.
      expect(times)
        .toStrictEqual([ null, 1320 ]);
    });
  });

  describe('startingPartyOf', () =>
  {
    it('keeps the starting members with a row in the actors\' file, in the system\'s order', () =>
    {
      // Arrange: members 3, 1 and 2, each with a row.
      const actors = [ null, { id: 1 }, { id: 2 }, { id: 3 } ];

      // Act.
      const party = startingPartyOf([ 3, 1, 2 ], actors);

      // Assert.
      expect(party)
        .toStrictEqual([ 3, 1, 2 ]);
    });

    it('drops a member whose row is empty or past the end of the file', () =>
    {
      // Arrange: member 2's row is empty, member 9 has none; member 1 has one.
      const actors = [ null, { id: 1 }, null, { id: 3 } ];

      // Act.
      const party = startingPartyOf([ 2, 1, 9 ], actors);

      // Assert.
      expect(party)
        .toStrictEqual([ 1 ]);
    });
  });

  describe('parityPageRule and editorPagesOf', () =>
  {
    // a lamp cold on its first page and lit from 18:00 to 05:00 on its second; a creature out from 16:00 to 04:00 on
    // its only page; a door whose second page waits on switch 4; an empty slot.
    const map = mapFile(10, 10, {}, '', [
      null,
      taggedEvent(1, [ [ '<light:[3]>' ], [ '<hourRangePage:18-5>' ] ]),
      taggedEvent(2, [ [ '<timeRangePage:16:00-4:00>' ] ]),
      taggedEvent(3, [ [], [] ], [ {}, { switch1Valid: true, switch1Id: 4 } ]),
    ]);

    it('judges J-TIME\'s page tags at the hour while the game lists J-TIME enabled, carrying the starting party', () =>
    {
      // Arrange.
      const rule = parityPageRule([ jTime(true) ], [ 1, 2 ]);

      // Act.
      const pages = [ 1320, 840 ].map(timeOfDay => [ ...editorPagesOf(map, rule, timeOfDay) ]);

      // Assert: the lamp lit and the creature out by night, and neither by day; the door on its first page throughout.
      expect([ rule.save.party, rule.conditions.map(condition => condition.id), pages ])
        .toStrictEqual([
          [ 1, 2 ],
          [ 'time.pages' ],
          [ [ [ 1, 1 ], [ 2, 0 ], [ 3, 0 ] ], [ [ 1, 0 ], [ 2, -1 ], [ 3, 0 ] ] ],
        ]);
    });

    it('judges no page by the hour while J-TIME is not enabled', () =>
    {
      // Arrange.
      const rule = parityPageRule([ jTime(false) ], [ 1 ]);

      // Act.
      const pages = [ 1320, 840 ].map(timeOfDay => [ ...editorPagesOf(map, rule, timeOfDay) ]);

      // Assert: the lamp's last page and the creature's only page hold at every hour.
      expect([ rule.conditions, pages ])
        .toStrictEqual([ [], [ [ [ 1, 1 ], [ 2, 0 ], [ 3, 0 ] ], [ [ 1, 1 ], [ 2, 0 ], [ 3, 0 ] ] ] ]);
    });
  });

  describe('pageDifferencesOf', () =>
  {
    it('lists the events the game shows on another page, an event the editor has no page for showing none there', () =>
    {
      // Arrange: event 1 on the editor's page; 2 shown by the game but not the editor; 3 the reverse; 9 put on the map by
      // a plugin.
      const editorPages = new Map([ [ 1, 1 ], [ 2, -1 ], [ 3, 0 ] ]);
      const events = [ probeEvent({ id: 1, page: 1 }), probeEvent({ id: 2, page: 0 }), probeEvent({ id: 3, page: -1 }), probeEvent({ id: 9, page: 0 }) ];

      // Act.
      const differences = pageDifferencesOf(events, editorPages);

      // Assert.
      expect(differences)
        .toStrictEqual([ { id: 2, game: 0, editor: -1 }, { id: 3, game: -1, editor: 0 }, { id: 9, game: 0, editor: -1 } ]);
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
