import { describe, expect, it } from 'vitest';
import type { ProbeEvent, WeatherLayerProbe } from '../../../../scripts/parity/probeTypes.ts';
import {
  animates,
  canonicalJson,
  compareSky,
  compareWeather,
  coverAxis,
  editorWeatherDepth,
  gameWeatherDepth,
  parseSkyWeatherFixtures,
  parseWeatherFixtures,
  sharesAgree,
  skyWeatherKeyOf,
  skyWeatherProbeMapFor,
  spreadsAgree,
  weatherProbeMapFor,
  darkLightsOf,
  dateFixtureMap,
  dateTagsAround,
  editorPagesOf,
  editorVerdictsOf,
  eventsKeyOf,
  explainCell,
  explainDarkCell,
  gameParityHolds,
  lightReaches,
  pageDifferencesOf,
  pagesProbeMapFor,
  pagesWords,
  parityPageRule,
  parseSeasonFixtures,
  probeMapFor,
  questGatedPagesOf,
  seasonKeyOf,
  seasonMomentOf,
  seasonProbeMapFor,
  skyProbeMapFor,
  snapshotPredictions,
  spriteCovers,
  startingPartyOf,
  steadyLighting,
  tallyPages,
  timeGatedPagesOf,
  timeOfCapture,
  verdictDifferencesOf,
  verdictWords,
  type DarkLight,
  type MapFile,
} from '../../../../scripts/parity/parityRules.ts';
import type { JsonValue } from '../../../src/mapEditor/core/model/json.ts';
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
 * Whenever the game lists J-OMNI-Quests enabled, the editor's rule judges its page tags too, against the quests a new
 * game starts with, from the game's own config, holding back every quest-gated page when there is none. A map holding
 * quest-gated events is visited and drawn nowhere, and every page of every event there is judged on both sides, the
 * game's judgement of a page compared with the editor's one by one: a page whose judging threw in the game, or that the
 * game has no judgement of, differs; an event a plugin put on the map has nothing to compare. The tally counts the
 * events on the editor's page and the pages judged alike, the quest-gated apart, and lists the quest-gated pages judged
 * differently, each worded with how both sides judged it.
 *
 * Every map holding a time-gated page, one carrying any of J-TIME's page tags, is judged at moments: a season, by name or
 * by J-TIME's number for it, at a time of day, its date the one the editor's clock moves the game's start to, which the
 * game's clock is set to as well. The tally then counts the time-gated pages apart, at the moment's season and hour. A
 * date fixture, built for the game copy alone, holds an event for each tag reading the date on each date judged, with a
 * near miss either side of it, one for each season by name and by number, each date's season gated by a night's hours,
 * and one whose pages run through the seasons, each on a tile of its own. Where the game could pick no page, the words
 * say so.
 *
 * The game copy the check runs holds every light steady, each effect's depth at 0 and the rest of its config as it was,
 * so every frame of the game shows every light at full strength, as the editor draws them.
 *
 * A map's weather is read where the game's whole screen lies on the map, its display in the map's middle, at the time of
 * day asked for if any, and compared by its numbers, since every particle is rolled at random on both sides: the layer
 * as J-Weather resolved it, its pictures, count, tint, blend and how many particles wait must match exactly, whatever
 * order the keys were written in; the spread of each rolled number agrees when the means lie within a fifth of the wider
 * spread and the ranges reach into each other; and a share of the population, on screen or in a second life, within
 * three standard errors of what chance alone strays by for populations that size, never tighter than a twentieth. The
 * engine's blend numbers read as pixi's names. Both sides must draw the weather inside what the screen's tone
 * colours, after the map and its characters, and beneath the dark.
 *
 * A map's weather may be read under a sky too: a map, a condition and a strength, a season by name or number and an
 * hour, keyed by all of them so one map is read under several skies. The game arrives on the date the editor's clock
 * moves the game's start to for that season, at that hour, holding that sky, read from the map's middle as any weather
 * is; and the sky each side hands J-Weather, its face, strength and condition, must match exactly.
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
 * @param {Partial<ProbeEvent>} overrides What differs from a plainly drawn 48x48 character at (5, 5), with no pages of
 * its own judged.
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
  meets: [],
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
 * J-OMNI-Quests as Chef Adventure's js/plugins.js lists it.
 * @param {boolean} status Whether it is enabled.
 * @returns {PluginsJsEntry} The entry.
 */
const jQuests = (status: boolean): PluginsJsEntry => ({ name: 'j/omni/ext/J-OMNI-Quests', status, description: '', parameters: {} });

/**
 * The game's quest config, as the game holds it: a delivery with objectives 0 and 1.
 */
const QUESTS = {
  quests: [ { name: 'Herbalist Delivery', key: 'herbalist_delivery', objectives: [ { id: 0 }, { id: 1 } ] } ],
  tags: [],
  categories: [],
} as unknown as JsonValue;

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
      const pages = [ 1320, 840 ].map(timeOfDay => [ ...editorPagesOf(map, rule, { timeOfDay }) ]);

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
      const pages = [ 1320, 840 ].map(timeOfDay => [ ...editorPagesOf(map, rule, { timeOfDay }) ]);

      // Assert: the lamp's last page and the creature's only page hold at every hour.
      expect([ rule.conditions, pages ])
        .toStrictEqual([ [], [ [ [ 1, 1 ], [ 2, 0 ], [ 3, 0 ] ], [ [ 1, 1 ], [ 2, 0 ], [ 3, 0 ] ] ] ]);
    });
  });

  describe('parityPageRule over J-OMNI-Quests', () =>
  {
    // a quest-giver: a blank first page, its offer while the delivery is inactive, and its errand while objective 1 is
    // active; and a door whose second page waits on switch 4.
    const map = mapFile(10, 10, {}, '', [
      null,
      taggedEvent(1, [ [], [ '<pageQuestCondition:[herbalist_delivery, -1, inactive]>' ], [ '<pageQuestCondition:[herbalist_delivery, 1]>' ] ]),
      taggedEvent(2, [ [], [] ], [ {}, { switch1Valid: true, switch1Id: 4 } ]),
    ]);

    it('judges J-OMNI-Quests\' page tags against a new game\'s quests while the game lists it enabled', () =>
    {
      // Arrange.
      const rule = parityPageRule([ jQuests(true) ], [ 1 ], new Map([ [ 'quest', QUESTS ] ]));

      // Act.
      const pages = [ ...editorPagesOf(map, rule, { timeOfDay: 840 }) ];

      // Assert: the giver offers the delivery, its errand held back; the door on its first page.
      expect([ rule.conditions.map(condition => condition.id), pages ])
        .toStrictEqual([ [ 'quest.pages' ], [ [ 1, 1 ], [ 2, 0 ] ] ]);
    });

    it('holds back every quest-gated page while the game lists J-OMNI-Quests enabled but has no quest config', () =>
    {
      // Arrange: nothing handed over for the config.
      const rule = parityPageRule([ jQuests(true) ], [ 1 ]);

      // Act.
      const pages = [ ...editorPagesOf(map, rule, { timeOfDay: 840 }) ];

      // Assert.
      expect(pages)
        .toStrictEqual([ [ 1, 0 ], [ 2, 0 ] ]);
    });

    it('judges no page by a quest while J-OMNI-Quests is not enabled', () =>
    {
      // Arrange.
      const rule = parityPageRule([ jQuests(false) ], [ 1 ], new Map([ [ 'quest', QUESTS ] ]));

      // Act.
      const pages = [ ...editorPagesOf(map, rule, { timeOfDay: 840 }) ];

      // Assert: the giver's last page, which no condition of its own holds back.
      expect([ rule.conditions, pages ])
        .toStrictEqual([ [], [ [ 1, 2 ], [ 2, 0 ] ] ]);
    });
  });

  describe('pagesProbeMapFor', () =>
  {
    it('visits a map to record its events and draws nothing there', () =>
    {
      // Arrange: a map holding quest-gated events.
      const mapId = 20;

      // Act.
      const probed = pagesProbeMapFor(mapId);

      // Assert.
      expect(probed)
        .toStrictEqual({ mapId: 20, views: [], steps: [ 0 ], dark: false });
    });
  });

  describe('questGatedPagesOf', () =>
  {
    it('lists each event\'s pages carrying a quest tag, passing over a choice\'s tag and events with none', () =>
    {
      // Arrange: a giver gated on its second and third pages; an event whose tag gates a choice; a plain sign.
      const map = mapFile(10, 10, {}, '', [
        null,
        taggedEvent(1, [ [], [ '<pageQuestCondition:[herbalist_delivery, -1, inactive]>' ], [ '<pageQuestCondition:[herbalist_delivery, 1]>' ] ]),
        taggedEvent(2, [ [ '<choiceQuestCondition:[herbalist_delivery]>' ] ]),
        taggedEvent(3, [ [ 'a sign' ] ]),
      ]);

      // Act.
      const gated = [ ...questGatedPagesOf(map) ];

      // Assert.
      expect(gated)
        .toStrictEqual([ [ 1, [ 1, 2 ] ] ]);
    });
  });

  describe('editorVerdictsOf', () =>
  {
    it('judges every page of every event as the editor does at the hour, whichever page each event shows', () =>
    {
      // Arrange: a giver over a new game's quests; a door whose second page waits on switch 4; a lamp lit by night.
      const map = mapFile(10, 10, {}, '', [
        null,
        taggedEvent(1, [ [], [ '<pageQuestCondition:[herbalist_delivery, -1, inactive]>' ], [ '<pageQuestCondition:[herbalist_delivery, 1]>' ] ]),
        taggedEvent(2, [ [], [] ], [ {}, { switch1Valid: true, switch1Id: 4 } ]),
        taggedEvent(3, [ [ '<light:[3]>' ], [ '<hourRangePage:18-5>' ] ]),
      ]);
      const rule = parityPageRule([ jQuests(true), jTime(true) ], [ 1 ], new Map([ [ 'quest', QUESTS ] ]));

      // Act: at 14:00, then 22:00.
      const verdicts = [ 840, 1320 ].map(timeOfDay => [ ...editorVerdictsOf(map, rule, { timeOfDay }) ]);

      // Assert.
      expect(verdicts)
        .toStrictEqual([
          [ [ 1, [ true, true, false ] ], [ 2, [ true, false ] ], [ 3, [ true, false ] ] ],
          [ [ 1, [ true, true, false ] ], [ 2, [ true, false ] ], [ 3, [ true, true ] ] ],
        ]);
    });
  });

  describe('verdictDifferencesOf', () =>
  {
    // the editor's judgement: a giver offering its quest but not its errand, and a door on its first page only.
    const verdicts = new Map([ [ 1, [ true, true, false ] ], [ 2, [ true, false ] ] ]);

    it('lists nothing while the game judges every page as the editor does', () =>
    {
      // Arrange.
      const events = [ probeEvent({ id: 1, page: 1, meets: [ true, true, false ] }), probeEvent({ id: 2, meets: [ true, false ] }) ];

      // Act.
      const differences = verdictDifferencesOf(events, verdicts);

      // Assert.
      expect(differences)
        .toStrictEqual([]);
    });

    it('lists a page held on one side only, one whose judging threw in the game, and one the game has no judgement of', () =>
    {
      // Arrange: the giver's offer threw in the game and its errand held there; the game judged only the door's first
      // page.
      const events = [ probeEvent({ id: 1, page: 2, meets: [ true, null, true ] }), probeEvent({ id: 2, meets: [ true ] }) ];

      // Act.
      const differences = verdictDifferencesOf(events, verdicts);

      // Assert.
      expect(differences)
        .toStrictEqual([
          { id: 1, page: 1, game: null, editor: true },
          { id: 1, page: 2, game: true, editor: false },
          { id: 2, page: 1, game: null, editor: false },
        ]);
    });

    it('passes over an event the editor has no pages for, as one a plugin put on the map', () =>
    {
      // Arrange.
      const events = [ probeEvent({ id: 9, meets: [ false ] }) ];

      // Act.
      const differences = verdictDifferencesOf(events, verdicts);

      // Assert.
      expect(differences)
        .toStrictEqual([]);
    });
  });

  describe('tallyPages', () =>
  {
    // the giver and the door, over a new game's quests.
    const map = mapFile(10, 10, {}, '', [
      null,
      taggedEvent(1, [ [], [ '<pageQuestCondition:[herbalist_delivery, -1, inactive]>' ], [ '<pageQuestCondition:[herbalist_delivery, 1]>' ] ]),
      taggedEvent(2, [ [], [] ], [ {}, { switch1Valid: true, switch1Id: 4 } ]),
    ]);
    const rule = parityPageRule([ jQuests(true) ], [ 1 ], new Map([ [ 'quest', QUESTS ] ]));

    it('counts every event on the editor\'s page and every page judged alike, the quest-gated apart', () =>
    {
      // Arrange: the game shows the giver's offer and the door's first page, judging every page as the editor does.
      const events = [ probeEvent({ id: 1, page: 1, meets: [ true, true, false ] }), probeEvent({ id: 2, page: 0, meets: [ true, false ] }) ];

      // Act.
      const tally = tallyPages(map, events, rule, { timeOfDay: 840 });

      // Assert.
      expect(tally)
        .toStrictEqual({
          events: 2,
          eventsAlike: 2,
          gatedEvents: 1,
          gatedEventsAlike: 1,
          pages: 5,
          pagesAlike: 5,
          gatedPages: 2,
          gatedPagesAlike: 2,
          gatedDiffer: [],
        });
    });

    it('counts apart what the game shows and judges otherwise, listing the quest-gated pages judged differently', () =>
    {
      // Arrange: the game holds back the giver's offer, shows the door's second page, and has an event a plugin put on
      // the map.
      const events = [
        probeEvent({ id: 1, page: 0, meets: [ true, false, false ] }),
        probeEvent({ id: 2, page: 1, meets: [ true, true ] }),
        probeEvent({ id: 9, page: 0, meets: [ true ] }),
      ];

      // Act.
      const tally = tallyPages(map, events, rule, { timeOfDay: 840 });

      // Assert.
      expect(tally)
        .toStrictEqual({
          events: 3,
          eventsAlike: 0,
          gatedEvents: 1,
          gatedEventsAlike: 0,
          pages: 5,
          pagesAlike: 3,
          gatedPages: 2,
          gatedPagesAlike: 1,
          gatedDiffer: [ { id: 1, page: 1, game: false, editor: true } ],
        });
    });
  });

  describe('the season pass', () =>
  {
    /**
     * Chef Adventure's new game: 16 December 2026, at the top of the minute.
     */
    const START = { seconds: 0, days: 16, months: 12, years: 2026 };

    it('reads seasons by name in any case or by number, each at a time of day, and refuses anything else', () =>
    {
      // Arrange.
      const lists = [ 'summer@02:00,SPRING@5:30,3@23:59', '' ];

      // Act.
      const read = lists.map(parseSeasonFixtures);
      const refused = [ 'summer', 'fall@10:00', '4@10:00', 'summer@24:00' ].map(list => () => parseSeasonFixtures(list));

      // Assert.
      expect(read)
        .toStrictEqual([ [ { season: 1, time: 120 }, { season: 0, time: 330 }, { season: 3, time: 1439 } ], [] ]);
      refused.forEach(parse => expect(parse)
        .toThrow('--seasons takes seasons'));
    });

    it('sets the game\'s clock to the season\'s date as the editor moves the start, at the hour, keyed by both', () =>
    {
      // Arrange: Summer at 22:00, and Winter, the season the game starts in, at 05:30.
      const fixtures = [ { season: 1, time: 1320 }, { season: 3, time: 330 } ];

      // Act.
      const moments = fixtures.map(fixture => seasonMomentOf(START, fixture));

      // Assert.
      expect([ moments, fixtures.map(seasonKeyOf) ])
        .toStrictEqual([
          [
            { key: 'summer@1320', years: 2027, months: 6, days: 16, hours: 22, minutes: 0, seconds: 0 },
            { key: 'winter@330', years: 2026, months: 12, days: 16, hours: 5, minutes: 30, seconds: 0 },
          ],
          [ 'summer@1320', 'winter@330' ],
        ]);
    });

    it('visits a map to judge its pages at each moment, and draws nothing there', () =>
    {
      // Arrange: Summer's date at 22:00.
      const moment = { key: 'summer@1320', years: 2027, months: 6, days: 16, hours: 22, minutes: 0, seconds: 0 };

      // Act.
      const probed = seasonProbeMapFor(337, [ moment ]);

      // Assert.
      expect(probed)
        .toStrictEqual({ mapId: 337, views: [], steps: [ 0 ], dark: false, moments: [ moment ] });
    });

    it('lists each event\'s pages carrying a time tag, passing over a choice\'s tag and events with none', () =>
    {
      // Arrange: a lamp lit by night on its second page and in Summer on its third; an event whose tag gates a choice; a
      // plain sign.
      const map = mapFile(10, 10, {}, '', [
        null,
        taggedEvent(1, [ [], [ '<hourRangePage:18-5>' ], [ '<seasonOfYearPage:summer>' ] ]),
        taggedEvent(2, [ [ '<timeOfDayChoice:night>' ] ]),
        taggedEvent(3, [ [ 'a sign' ] ]),
      ]);

      // Act.
      const gated = [ ...timeGatedPagesOf(map) ];

      // Assert.
      expect(gated)
        .toStrictEqual([ [ 1, [ 1, 2 ] ] ]);
    });

    it('writes each tag reading the date that holds on it, with the near misses either side', () =>
    {
      // Arrange: Summer's date, 16 June 2027.
      const date = { seconds: 0, days: 16, months: 6, years: 2027 };

      // Act.
      const tags = dateTagsAround(date);

      // Assert.
      expect(tags)
        .toStrictEqual([
          '<dayPage:16>',
          '<dayPage:15>',
          '<dayPage:17>',
          '<monthPage:6>',
          '<monthPage:5>',
          '<monthPage:7>',
          '<yearPage:2027>',
          '<yearPage:2026>',
          '<yearPage:2028>',
          '<dayRangePage:15-17>',
          '<dayRangePage:13-15>',
          '<dayRangePage:17-19>',
          '<dayRangePage:17-16>',
          '<monthRangePage:6-6>',
          '<monthRangePage:4-5>',
          '<monthRangePage:7-8>',
          '<monthRangePage:7-6>',
          '<yearRangePage:2027-2028>',
          '<yearRangePage:2026-2027>',
          '<yearRangePage:2028-2029>',
          '<fullDateRangePage:[0,0,16,6,2027]-[59,23,16,6,2027]>',
          '<fullDateRangePage:[0,0,15,6,2027]-[59,23,15,6,2027]>',
          '<fullDateRangePage:[0,0,17,6,2027]-[59,23,17,6,2027]>',
        ]);
    });

    it('builds the date fixture as a blank map of single-page events, one for each tag once, then the seasons\' own events', () =>
    {
      // Arrange: Spring's and Summer's dates, which share their day and year, on tileset 2.
      const dates = [ { seconds: 0, days: 16, months: 3, years: 2027 }, { seconds: 0, days: 16, months: 6, years: 2027 } ];

      // Act.
      const fixture = dateFixtureMap(dates, 2);

      // Assert: four seasons by name and by number, 23 tags around the first date and 9 more around the second (its day,
      // year and their spans shared, and one month span the same), two seasons by night, and the event of every season.
      const placed = fixture.events.slice(1);
      const events = placed.map(each => each?.pages.map(shown => shown.list.filter(line => line.code === 108).map(line => line.parameters[0])));
      const cells = new Set(placed.map(each => `${each?.x},${each?.y}`));
      expect([ fixture.tilesetId, fixture.events[0], events.length, events.slice(0, 2), events.slice(-3), cells.size, fixture.data.length ])
        .toStrictEqual([
          2,
          null,
          8 + 23 + 9 + 2 + 1,
          [ [ [ '<seasonOfYearPage:spring>' ] ], [ [ '<seasonOfYearPage:summer>' ] ] ],
          [
            [ [ '<seasonOfYearPage:spring>', '<hourRangePage:18-5>' ] ],
            [ [ '<seasonOfYearPage:summer>', '<hourRangePage:18-5>' ] ],
            [ [], [ '<seasonOfYearPage:spring>' ], [ '<seasonOfYearPage:summer>' ], [ '<seasonOfYearPage:autumn>' ], [ '<seasonOfYearPage:winter>' ] ],
          ],
          43,
          17 * 13 * 6,
        ]);
    });

    it('tallies the time-gated pages apart at a season and an hour, and words a page the game could not pick', () =>
    {
      // Arrange: a stall open in Summer on its second page, and a sign; at noon in Summer the game judged the stall's
      // pages as the editor does but picked no page for it, and showed the sign's.
      const map = mapFile(10, 10, {}, '', [
        null,
        taggedEvent(1, [ [], [ '<seasonOfYearPage:summer>' ] ]),
        taggedEvent(2, [ [ 'a sign' ] ]),
      ]);
      const rule = parityPageRule([ jTime(true) ], [ 1 ]);
      const judged = [ { id: 1, page: null, meets: [ true, true ] }, { id: 2, page: 0, meets: [ true ] } ];

      // Act.
      const tally = tallyPages(map, judged, rule, { timeOfDay: 720, season: 1 }, timeGatedPagesOf(map));
      const words = pageDifferencesOf(judged, editorPagesOf(map, rule, { timeOfDay: 720, season: 1 })).map(({ game, editor }) => pagesWords(game, editor));

      // Assert.
      expect([ tally, words ])
        .toStrictEqual([
          {
            events: 2,
            eventsAlike: 1,
            gatedEvents: 1,
            gatedEventsAlike: 0,
            pages: 3,
            pagesAlike: 3,
            gatedPages: 1,
            gatedPagesAlike: 1,
            gatedDiffer: [],
          },
          [ 'shows no page it could pick in the game, page 2 in the editor' ],
        ]);
    });

    it('judges the stall\'s Summer page at the season the moment names, and the start\'s season without one', () =>
    {
      // Arrange: a stall open in Summer on its second page.
      const map = mapFile(10, 10, {}, '', [ null, taggedEvent(1, [ [], [ '<seasonOfYearPage:summer>' ] ]) ]);
      const rule = parityPageRule([ jTime(true) ], [ 1 ]);

      // Act: at noon in Summer, in Autumn, and with no season named.
      const verdicts = [ { timeOfDay: 720, season: 1 }, { timeOfDay: 720, season: 2 }, { timeOfDay: 720 } ].map(moment => [ ...editorVerdictsOf(map, rule, moment) ]);

      // Assert.
      expect(verdicts)
        .toStrictEqual([ [ [ 1, [ true, true ] ] ], [ [ 1, [ true, false ] ] ], [ [ 1, [ true, false ] ] ] ]);
    });
  });

  describe('verdictWords', () =>
  {
    it('words how each side judged a page, and a page whose judging stopped the game', () =>
    {
      // Arrange.
      const differences = [ { id: 52, page: 2, game: true, editor: false }, { id: 53, page: 0, game: null, editor: true } ];

      // Act.
      const words = differences.map(verdictWords);

      // Assert.
      expect(words)
        .toStrictEqual([
          'event 52 page 3 holds in the game, does not hold in the editor',
          'event 53 page 1 stops the game when judged, holds in the editor',
        ]);
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

  describe('parseWeatherFixtures and weatherProbeMapFor', () =>
  {
    it('reads maps, each with an optional time of day, and refuses anything else', () =>
    {
      // Arrange.
      const lists = [ '65,102,309@22:00', '' ];

      // Act.
      const read = lists.map(parseWeatherFixtures);

      // Assert.
      expect(read)
        .toStrictEqual([ [ { mapId: 65 }, { mapId: 102 }, { mapId: 309, time: 1320 } ], [] ]);
      expect(() => parseWeatherFixtures('65@25:00'))
        .toThrow('--weather takes maps, each with an optional time, such as 65 or 309@22:00, not 65@25:00');
    });

    it('reads a map\'s weather from the middle of the map, so the game\'s whole screen lies on it, at the time asked for', () =>
    {
      // Arrange: a 45 by 55 map under a 40 by 22.5 tile screen, and a map no bigger than the screen.
      const big = mapFile(45, 55);
      const small = mapFile(30, 20);
      const screen = { width: 1920, height: 1080 };

      // Act.
      const orders = [ weatherProbeMapFor({ mapId: 65 }, big, screen), weatherProbeMapFor({ mapId: 309, time: 1320 }, big, screen), weatherProbeMapFor({ mapId: 7 }, small, screen) ];

      // Assert.
      expect(orders)
        .toStrictEqual([
          { mapId: 65, views: [], steps: [ 0 ], dark: false, weather: { x: 2, y: 16 } },
          { mapId: 309, views: [], steps: [ 0 ], dark: false, weather: { x: 2, y: 16 }, time: 1320 },
          { mapId: 7, views: [], steps: [ 0 ], dark: false, weather: { x: 0, y: 0 } },
        ]);
    });
  });

  describe('parseSkyWeatherFixtures, skyWeatherKeyOf and skyWeatherProbeMapFor', () =>
  {
    it('reads maps under a sky, each at a season by name or number and an hour, and refuses anything else', () =>
    {
      // Arrange.
      const lists = [ '337:rain:heavy@winter@12:00,56:clear:light@1@22:00', '' ];

      // Act.
      const read = lists.map(parseSkyWeatherFixtures);

      // Assert.
      expect(read)
        .toStrictEqual([
          [ { mapId: 337, condition: 'rain', strength: 'heavy', season: 3, time: 720 }, { mapId: 56, condition: 'clear', strength: 'light', season: 1, time: 1320 } ],
          [],
        ]);
      [ '337:rain@winter@12:00', '337:rain:heavy@monsoon@12:00', '337:rain:heavy@winter', 'rain:heavy@winter@12:00' ].forEach(entry =>
      {
        expect(() => parseSkyWeatherFixtures(entry))
          .toThrow(`--sky-weather takes maps under a sky, at a season and an hour, such as 337:rain:heavy@winter@12:00, not ${entry}`);
      });
    });

    it('keys each map under a sky by the map, the sky, the season and the hour, so one map is read under several', () =>
    {
      // Arrange: Map337 under two skies.
      const fixtures = parseSkyWeatherFixtures('337:rain:heavy@winter@12:00,337:clear:moderate@Summer@22:00');

      // Act.
      const keys = fixtures.map(skyWeatherKeyOf);

      // Assert.
      expect(keys)
        .toStrictEqual([ '337:rain:heavy@winter@720', '337:clear:moderate@summer@1320' ]);
    });

    it('arrives on the date the editor\'s clock moves the start to for the season, at the hour, holding the sky, read mid-map', () =>
    {
      // Arrange: a 45 by 55 map under a clear summer night and a winter rain, a new game starting on 16 December 2026.
      const [ summer, winter ] = parseSkyWeatherFixtures('337:clear:moderate@summer@22:00,337:rain:heavy@winter@12:00');
      const start = { seconds: 5, days: 16, months: 12, years: 2026 };
      const screen = { width: 1920, height: 1080 };

      // Act.
      const orders = [ skyWeatherProbeMapFor(summer, mapFile(45, 55), screen, start), skyWeatherProbeMapFor(winter, mapFile(45, 55), screen, start) ];

      // Assert.
      expect(orders)
        .toStrictEqual([
          {
            mapId: 337,
            views: [],
            steps: [ 0 ],
            dark: false,
            weather: { x: 2, y: 16 },
            time: 1320,
            date: { years: 2027, months: 6, days: 16, seconds: 5 },
            sky: { type: 'clear', intensity: 'moderate', key: '337:clear:moderate@summer@1320' },
          },
          {
            mapId: 337,
            views: [],
            steps: [ 0 ],
            dark: false,
            weather: { x: 2, y: 16 },
            time: 720,
            date: { years: 2026, months: 12, days: 16, seconds: 5 },
            sky: { type: 'rain', intensity: 'heavy', key: '337:rain:heavy@winter@720' },
          },
        ]);
    });
  });

  describe('compareSky', () =>
  {
    it('holds when both sides hand J-Weather the same face, strength and condition, whatever order the keys came in', () =>
    {
      // Arrange: the game's starfall, the editor's written in another order, and one differing in each part or missing.
      const game = { preset: 'starfall', intensity: 'moderate', type: 'clear' };
      const editors = [
        { type: 'clear', intensity: 'moderate', preset: 'starfall' },
        { ...game, preset: 'fireflies' },
        { ...game, intensity: 'heavy' },
        { ...game, type: 'breezy' },
        null,
      ];

      // Act.
      const checks = editors.map(editor => compareSky(game, editor));

      // Assert.
      expect([ checks.map(check => check.holds), checks[0].name, checks[4].editor ])
        .toStrictEqual([ [ true, false, false, false, false ], 'sky', 'null' ]);
    });
  });

  describe('compareWeather', () =>
  {
    /**
     * One layer of moderate rain as a side reads it, with any part named otherwise.
     * @param {Partial<WeatherLayerProbe>} parts The parts to change.
     * @returns {WeatherLayerProbe} The layer.
     */
    const rainLayer = (parts: Partial<WeatherLayerProbe> = {}): WeatherLayerProbe => ({
      asset: 'Rain_01A',
      becomesAsset: 'Particles',
      pictureSize: [ 18, 36 ],
      becomesPictureSize: [ 64, 64 ],
      blend: 'normal',
      tint: 0xffffff,
      layer: { edge: 'top', speedY: 6.8, jitterY: 5.1, becomes: { edge: 'anywhere', growth: 0.011 } },
      stats: {
        count: 1833,
        firstLife: 1500,
        secondLife: 333,
        waiting: 0,
        onScreen: 0.61,
        velocityX: { min: 0, max: 0, mean: 0 },
        velocityY: { min: 6.8, max: 11.9, mean: 9.35 },
        scaleX: { min: 1, max: 1, mean: 1 },
        scaleY: { min: 1, max: 1, mean: 1 },
        rotation: { min: 0, max: 0, mean: 0 },
        life: { min: 31, max: 162, mean: 110 },
        opacity: { min: 0, max: 255, mean: 206 },
      },
      ...parts,
    });

    it('agrees on a layer resolved alike, keys in any order, the engine\'s blend number read as pixi\'s name', () =>
    {
      // Arrange: the game's layer with its keys written in another order and its blend as the engine's 0, and its rolled
      // numbers a little off the editor's.
      const game = rainLayer({
        blend: 0,
        layer: { becomes: { growth: 0.011, edge: 'anywhere' }, jitterY: 5.1, speedY: 6.8, edge: 'top' },
        stats: { ...rainLayer().stats, velocityY: { min: 6.81, max: 11.88, mean: 9.4 }, onScreen: 0.6 },
      });

      // Act.
      const checks = compareWeather({ current: { preset: 'rain', intensity: 'moderate' }, layers: [ game ] }, { current: { preset: 'rain', intensity: 'moderate' }, layers: [ rainLayer() ] });

      // Assert: every check holds, the speed down worded with both sides' numbers.
      expect([ checks.length, checks.filter(check => check.holds === false), checks.find(check => check.name === 'layer 1 speed down') ])
        .toStrictEqual([ 18, [], { name: 'layer 1 speed down', game: '6.810..9.400..11.880', editor: '6.800..9.350..11.900', holds: true } ]);
    });

    it('differs on a layer resolved otherwise, another picture, count, tint, blend or wait, and on another look', () =>
    {
      // Arrange: a game layer differing from the editor's in every exact part, under another strength.
      const game = rainLayer({
        layer: { edge: 'top', speedY: 8, jitterY: 6, becomes: { edge: 'anywhere', growth: 0.011 } },
        pictureSize: [ 18, 37 ],
        becomesPictureSize: null,
        tint: 0xfff6d6,
        blend: 1,
        stats: { ...rainLayer().stats, count: 1832, waiting: 3 },
      });

      // Act.
      const checks = compareWeather({ current: { preset: 'rain', intensity: 'heavy' }, layers: [ game ] }, { current: { preset: 'rain', intensity: 'moderate' }, layers: [ rainLayer() ] });

      // Assert.
      expect(checks.filter(check => check.holds === false).map(check => check.name))
        .toStrictEqual([ 'weather', 'layer 1 effect', 'layer 1 picture', 'layer 1 stage picture', 'layer 1 count', 'layer 1 tint', 'layer 1 blend', 'layer 1 waiting' ]);
    });

    it('differs on a rolled number spread otherwise, a share out by more than chance allows, and a layer missing', () =>
    {
      // Arrange: rain falling slower in the game, more of it on screen, more of it landed, and a second layer the
      // editor lacks.
      const game = rainLayer({ stats: { ...rainLayer().stats, velocityY: { min: 4, max: 9, mean: 6.5 }, onScreen: 0.75, secondLife: 600 } });

      // Act.
      const checks = compareWeather({ current: null, layers: [ game, rainLayer() ] }, { current: null, layers: [ rainLayer() ] });

      // Assert.
      expect(checks.filter(check => check.holds === false).map(check => check.name))
        .toStrictEqual([ 'layers', 'layer 1 speed down', 'layer 1 on screen', 'layer 1 second life' ]);
    });
  });

  describe('sharesAgree', () =>
  {
    it('lets a small population stray further by chance than a large one, and never holds a share tighter than a twentieth', () =>
    {
      // Arrange: 33 bubbles 0.12 apart (three standard errors is 0.28 there), 2000 flakes 0.06 apart (0.047 there), and
      // two shares at nothing 0.04 apart.
      const pairs: [ number, number, number, number ][] = [ [ 0.879, 33, 0.758, 33 ], [ 0.51, 2000, 0.45, 2000 ], [ 0.04, 2000, 0, 2000 ] ];

      // Act.
      const agreed = pairs.map(([ game, gameCount, editor, editorCount ]) => sharesAgree(game, gameCount, editor, editorCount));

      // Assert.
      expect(agreed)
        .toStrictEqual([ true, false, true ]);
    });
  });

  describe('spreadsAgree', () =>
  {
    it('agrees within a fifth of the wider spread when the ranges reach into each other', () =>
    {
      // Arrange: means 1 apart on spreads 5 wide, 1.1 apart on the same, ranges apart, and two spreads of one value.
      const pairs = [
        [ { min: 0, max: 5, mean: 2.5 }, { min: 0.5, max: 5, mean: 3.5 } ],
        [ { min: 0, max: 5, mean: 2.5 }, { min: 0, max: 5, mean: 3.6 } ],
        [ { min: 0, max: 1, mean: 0.5 }, { min: 2, max: 3, mean: 2.5 } ],
        [ { min: 1, max: 1, mean: 1 }, { min: 1, max: 1, mean: 1 } ],
      ];

      // Act.
      const agreed = pairs.map(([ game, editor ]) => spreadsAgree(game, editor));

      // Assert.
      expect(agreed)
        .toStrictEqual([ true, false, false, true ]);
    });
  });

  describe('canonicalJson', () =>
  {
    it('writes the same values alike whatever order their keys came in, at every depth', () =>
    {
      // Arrange.
      const values = [ { b: 1, a: { d: [ 2, { f: 3, e: 4 } ], c: null } }, { a: { c: null, d: [ 2, { e: 4, f: 3 } ] }, b: 1 } ];

      // Act.
      const written = values.map(canonicalJson);

      // Assert.
      expect(written)
        .toStrictEqual([ '{"a":{"c":null,"d":[2,{"e":4,"f":3}]},"b":1}', '{"a":{"c":null,"d":[2,{"e":4,"f":3}]},"b":1}' ]);
    });
  });

  describe('weather depth', () =>
  {
    it('finds the game\'s weather in the toned base sprite after the tilemap, under the light mask, and no other way', () =>
    {
      // Arrange: Chef Adventure's tree, then the plane before the tilemap, then a base sprite with no colour filter.
      const depth = {
        spriteset: [ 'BaseSprite', 'Weather', 'LightMask', 'Sprite' ],
        baseIndex: 0,
        baseFilters: [ 'ColorFilter' ],
        base: [ 'ScreenSprite', 'TilingSprite', 'Tilemap', 'WeatherPlane' ],
        planeIndex: 3,
        maskIndex: 2,
        tone: [ 0, 0, 0, 0 ],
      };
      const beneath = { ...depth, base: [ 'ScreenSprite', 'WeatherPlane', 'Tilemap' ], planeIndex: 1 };
      const untoned = { ...depth, baseFilters: [] };

      // Act.
      const judged = [ gameWeatherDepth(depth), gameWeatherDepth(beneath), gameWeatherDepth(untoned) ];

      // Assert.
      expect([ judged.map(each => each.holds), judged[0].words ])
        .toStrictEqual([
          [ true, false, false ],
          'plane is child 4 of 4 in the base sprite [ScreenSprite, TilingSprite, Tilemap, WeatherPlane], filtered by [ColorFilter];'
            + ' base sprite is spriteset child 1, light mask child 3 of [BaseSprite, Weather, LightMask, Sprite]; tone [0,0,0,0]',
        ]);
    });

    it('finds the editor\'s weather in the game container after the upper tiles, under the lighting, and no other way', () =>
    {
      // Arrange: the renderer's tree, then the weather before the upper tiles, then the lighting under the game container.
      const depth = {
        world: [ 'game', 'lighting', 'markers' ],
        game: [ 'backdrop', 'parallax', 'lowerTiles', 'events', 'events', 'upperTiles', 'events', 'weatherClip', 'weather' ],
        gameFilters: 1,
        weatherIndex: 8,
        gameIndex: 0,
        lightingIndex: 1,
      };
      const beneath = { ...depth, game: [ 'backdrop', 'weather', 'upperTiles' ], weatherIndex: 1 };
      const unlit = { ...depth, gameIndex: 1, lightingIndex: 0 };

      // Act.
      const judged = [ editorWeatherDepth(depth), editorWeatherDepth(beneath), editorWeatherDepth(unlit) ];

      // Assert.
      expect([ judged.map(each => each.holds), judged[0].words ])
        .toStrictEqual([
          [ true, false, false ],
          'weather is child 9 of 9 in the game container [backdrop, parallax, lowerTiles, events, events, upperTiles, events, weatherClip, weather],'
            + ' which carries 1 tone filter(s); game container is world child 1, lighting child 2',
        ]);
    });
  });
});
