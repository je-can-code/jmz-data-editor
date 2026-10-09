import { describe, expect, it } from 'vitest';
import { linkGateFor, placeBlueprint } from '../../../../src/mapEditor/core/blueprints/blueprintPlacement.ts';
import { BLUEPRINT_USES_DOCUMENT, usesOf, type PlacedSpot } from '../../../../src/mapEditor/core/blueprints/blueprintUses.ts';
import { checkPlacement } from '../../../../src/mapEditor/core/blueprints/placementMatch.ts';
import { mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import { blueprintMapId } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import { createMapEvent } from '../../../../src/mapEditor/core/model/eventModel.ts';
import type { RmmzMap, RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { resizeMap } from '../../../../src/mapEditor/core/properties/mapPropertyEdits.ts';
import type { Stamp } from '../../../../src/mapEditor/core/stamps/stamp.ts';
import type { StampPlacement } from '../../../../src/mapEditor/core/stamps/stampPlacement.ts';
import { TilesetMode } from '../../../../src/mapEditor/core/tiles/autotileShapes.ts';
import { autotileKind, makeAutotileId } from '../../../../src/mapEditor/core/tiles/tileIds.ts';
import { holdBlueprints, holdBlueprintUses } from '../../support/blueprintFixtures.ts';
import { hubWithMaps, mapFileOf, spotsOf } from '../../support/eventFixtures.ts';
import { stampOf, tiledMap } from '../../support/stampFixtures.ts';

/*
 * Placing a blueprint drops linked copies. It goes down exactly as placing its stamp would, as one step of the map's
 * history that one undo takes back to the very file it found: its tiles painted as a plain copy with their autotile edges
 * refreshed, its events where they stand inside it with fresh ids. Every event placed carries a link in its note, on a
 * line of its own after whatever the note already says, naming the blueprint and which of its events it is a copy of.
 * When its tiles go down, the cell its corner landed on is recorded among the blueprint's placements in that same step,
 * so undo takes the record back with the tiles and redo puts it back; its events alone, or its tiles left out on a map of
 * another tileset, record nothing. A map that may hold no link refuses it whole with the map's reason, so does a
 * blueprint gone since it was picked, so do tiles to place while the window holds no record of placements it can read,
 * and so does a blueprint whose event's note could not take a link and read the same otherwise, as does anything placing
 * its stamp would refuse.
 *
 * The link gate is what says which maps may hold no link: every map whose events a plugin module says its plugin copies
 * while the game runs, J-ABS's action map among them, and every map before the modules have switched on at all, when
 * which maps those are cannot be told; a plugin list that could not be read says so, with why, since waiting will not
 * tell.
 *
 * The blueprint, "Goblin camp" (k3x9q2mf), was saved from map 12: two cells of dirt with event 7 on the left one and event
 * 9, whose note reads "Guard captain", on the right. Map 1, drawn with the same tileset, is 4 by 3, with event 1 at 3, 2;
 * map 3 is map 1 drawn with another tileset.
 */
const DIRT = 18;

/**
 * Builds the camp's stamp.
 * @param {string} note What event 9's note says.
 * @returns {Stamp} The stamp.
 */
const campStamp = (note = 'Guard captain'): Stamp =>
{
  const dirt = makeAutotileId(DIRT, 0);
  return stampOf({
    id: 'window-a:4',
    mapId: 12,
    width: 2,
    tiles: { layers: [ 0 ], values: [ dirt, dirt ], calledFor: [ 0, 0 ] },
    events: [
      { ...createMapEvent(7, 0, 0), name: 'Goblin', note: '' },
      { ...createMapEvent(9, 1, 0), name: 'Captain', note },
    ],
  });
};

/**
 * Builds map 1, or the same map drawn with another tileset.
 * @param {number} tilesetId The tileset.
 * @returns {RmmzMap} The map's file.
 */
const target = (tilesetId = 4): RmmzMap => tiledMap(4, 3, () => undefined, [ null, [ 3, 2 ] ], tilesetId);

/**
 * Builds a window holding maps 1 and 3, the camp blueprint, and a record of placements, empty unless told otherwise.
 * @param {Stamp} stamp The camp's stamp.
 * @param {readonly PlacedSpot[] | null} record The placements the record holds, or null for a window holding none.
 * @returns {ReturnType<typeof hubWithMaps>} The window's documents.
 */
const windowWithCamp = (stamp: Stamp = campStamp(), record: readonly PlacedSpot[] | null = []) =>
{
  const hub = hubWithMaps({ 1: target(), 3: target(9) });
  holdBlueprints(hub, { k3x9q2mf: { name: 'Goblin camp', stamp } });
  if (record !== null)
  {
    holdBlueprintUses(hub, record);
  }

  return hub;
};

/**
 * Lists every placement the window's record holds.
 * @param {ReturnType<typeof hubWithMaps>} hub The window's documents.
 * @returns {PlacedSpot[]} The placements.
 */
const recorded = (hub: ReturnType<typeof hubWithMaps>): PlacedSpot[] => usesOf(hub.document(BLUEPRINT_USES_DOCUMENT));

/**
 * Builds a placement with the blueprint's corner on a cell, on a map that may hold links unless told otherwise.
 * @param {number} x The column.
 * @param {number} y The row.
 * @param {string | null} linkRefusal Why the map may hold no link, or null when it may.
 * @returns {StampPlacement} The placement.
 */
const at = (x: number, y: number, linkRefusal: string | null = null): StampPlacement =>
{
  return { at: { x, y }, shaping: 'auto', mode: TilesetMode.area, linkRefusal };
};

/**
 * Reads the notes of a map's events, by id, empty slots as null.
 * @param {RmmzMap} file The map.
 * @returns {(string | null)[]} The notes.
 */
const notesOf = (file: RmmzMap): (string | null)[] =>
{
  return file.events.map(event => (event === null ? null : (event as RmmzMapEvent).note));
};

describe('linkGateFor', () =>
{
  /**
   * Names map 2 as J-ABS's action map, as J-ABS's module does from the game's plugin list, and no other map.
   * @param {number} mapId The map asked about.
   * @returns {{ owner: string, holds: string } | null} What the map holds, for map 2.
   */
  const actionMapTwo = (mapId: number) => (mapId === 2 ? { owner: 'J-ABS', holds: 'action templates' } : null);

  it('keeps every map from holding a link until the plugin modules have switched on', () =>
  {
    // Arrange: modules not yet switched on, which name no map.
    const gate = linkGateFor({ revision: 0, listProblem: null, templateMapOf: () => null });

    // Act.
    const reasons = [ gate(2), gate(5) ];

    // Assert.
    expect(reasons)
      .toStrictEqual([
        'the project\'s plugins are still being read; try again in a moment',
        'the project\'s plugins are still being read; try again in a moment',
      ]);
  });

  it('keeps every map from holding a link while the plugin list cannot be read, saying why rather than asking to wait', () =>
  {
    // Arrange: modules never switched on, since the server could not give js/plugins.js.
    const gate = linkGateFor({ revision: 0, listProblem: 'js/plugins.js does not exist', templateMapOf: () => null });

    // Act.
    const reasons = [ gate(2), gate(5) ];

    // Assert.
    expect(reasons)
      .toStrictEqual([
        'the project\'s plugin list could not be read (js/plugins.js does not exist)',
        'the project\'s plugin list could not be read (js/plugins.js does not exist)',
      ]);
  });

  it('goes by the modules switched on when a later reading of the plugin list fails, as they still stand', () =>
  {
    // Arrange: J-ABS switched on from the list, which a later reading could not read.
    const gate = linkGateFor({ revision: 1, listProblem: 'js/plugins.js does not exist', templateMapOf: actionMapTwo });

    // Act.
    const reasons = [ gate(2), gate(3) ];

    // Assert.
    expect(reasons)
      .toStrictEqual([ 'this map holds J-ABS\'s action templates, which the game reads, so blueprints stay off it', null ]);
  });

  it('keeps a blueprint opened as a map from holding a link, whatever the plugin modules say, and lets every map hold one', () =>
  {
    // Arrange: the modules switched on, naming no map, and still being read.
    const switchedOn = linkGateFor({ revision: 1, listProblem: null, templateMapOf: () => null });
    const reading = linkGateFor({ revision: 0, listProblem: null, templateMapOf: () => null });
    const camp = blueprintMapId('k3x9q2mf');

    // Act.
    const reasons = [ switchedOn(camp), switchedOn(3), reading(camp) ];

    // Assert.
    expect(reasons)
      .toStrictEqual([ 'a blueprint holds no copies of blueprints', null, 'a blueprint holds no copies of blueprints' ]);
  });

  it('keeps a map a plugin copies events from from holding a link, saying what it holds, and lets every other hold one', () =>
  {
    // Arrange: J-ABS copies its actions from map 2.
    const gate = linkGateFor({ revision: 1, listProblem: null, templateMapOf: actionMapTwo });

    // Act.
    const reasons = [ gate(2), gate(3) ];

    // Assert.
    expect(reasons)
      .toStrictEqual([ 'this map holds J-ABS\'s action templates, which the game reads, so blueprints stay off it', null ]);
  });
});

describe('placeBlueprint', () =>
{
  it('places the tiles and the events as one step named for the blueprint, each event linked to the one it copies', () =>
  {
    // Arrange.
    const hub = windowWithCamp();

    // Act.
    const outcome = placeBlueprint(hub, 1, 'k3x9q2mf', at(1, 0));

    // Assert: the copies are events 2 and 3, a link appended to the captain's words; event 1 untouched; dirt laid; and the
    // corner's cell recorded in the same step.
    const placed = mapFileOf(hub, 1);
    expect([
      outcome.ok && [ outcome.step?.label, outcome.step?.histories, outcome.eventIds, outcome.notes ],
      notesOf(placed),
      spotsOf(placed),
      [ placed.data[1], placed.data[2] ].map(autotileKind),
      recorded(hub),
      outcome.ok && outcome.step?.entries.filter(entry => entry.document === BLUEPRINT_USES_DOCUMENT).length,
    ])
      .toStrictEqual([
        [ 'Place blueprint "Goblin camp"', [ mapHistoryKey(1) ], [ 2, 3 ], [] ],
        [ null, 'event 1', '<blueprint:[k3x9q2mf, 7]>', 'Guard captain\n<blueprint:[k3x9q2mf, 9]>' ],
        [ null, [ 3, 2 ], [ 1, 0 ], [ 2, 0 ] ],
        [ DIRT, DIRT ],
        [ { blueprintId: 'k3x9q2mf', x: 1, y: 0, mapId: 1 } ],
        1,
      ]);
  });

  it('is taken back by one undo to the very file it found, its placement with it, and put back by a redo', () =>
  {
    // Arrange: a placement of the camp already recorded on map 1, at 0, 2.
    const hub = windowWithCamp(campStamp(), [ { blueprintId: 'k3x9q2mf', mapId: 1, x: 0, y: 2 } ]);
    placeBlueprint(hub, 1, 'k3x9q2mf', at(1, 0));
    const placed = mapFileOf(hub, 1);

    // Act.
    hub.undo(mapHistoryKey(1));
    const undone = [ mapFileOf(hub, 1), recorded(hub) ];
    hub.redo(mapHistoryKey(1));

    // Assert.
    expect([ undone, mapFileOf(hub, 1), recorded(hub) ])
      .toStrictEqual([
        [ target(), [ { blueprintId: 'k3x9q2mf', x: 0, y: 2, mapId: 1 } ] ],
        placed,
        [ { blueprintId: 'k3x9q2mf', x: 1, y: 0, mapId: 1 }, { blueprintId: 'k3x9q2mf', x: 0, y: 2, mapId: 1 } ],
      ]);
  });

  it('records the same placement once, the blueprint put down twice at one cell being one placement', () =>
  {
    // Arrange: the camp placed at 1, 0, its events then cleared away so it can go down there again.
    const hub = windowWithCamp();
    placeBlueprint(hub, 1, 'k3x9q2mf', at(1, 0));
    hub.edit('Clear', [ mapHistoryKey(1) ], tx => [ 3, 2 ].forEach(id => tx.apply('map:1', hub.map('map:1').removeEventPatch(id))));

    // Act.
    const again = placeBlueprint(hub, 1, 'k3x9q2mf', at(1, 0));

    // Assert: the second step changed the map, and nothing in the record.
    expect([ again.ok && again.step?.entries.some(entry => entry.document === BLUEPRINT_USES_DOCUMENT), recorded(hub) ])
      .toStrictEqual([ false, [ { blueprintId: 'k3x9q2mf', x: 1, y: 0, mapId: 1 } ] ]);
  });

  it('records the part of it the map\'s edge cuts off, so the match check finds it where it was however the map grows', () =>
  {
    // Arrange: the camp placed with its corner on map 1's last column, its right cell past the edge.
    const hub = windowWithCamp();
    placeBlueprint(hub, 1, 'k3x9q2mf', at(3, 0));
    const [ placed ] = recorded(hub);
    const before = checkPlacement(hub.map('map:1'), placed, campStamp());

    // Act: the map grown two columns to the right, which leaves the new cells empty.
    resizeMap(hub, 1, 6, 3, 'top-left');
    const [ afterGrowing ] = recorded(hub);

    // Assert: the cut cell is never compared, before or after.
    expect([ placed, before, afterGrowing, checkPlacement(hub.map('map:1'), afterGrowing, campStamp()) ])
      .toStrictEqual([
        { blueprintId: 'k3x9q2mf', x: 3, y: 0, placed: { x: 0, y: 0, width: 1, height: 1 }, mapId: 1 },
        { kind: 'in-place', matched: 1, compared: 1 },
        { blueprintId: 'k3x9q2mf', x: 3, y: 0, placed: { x: 0, y: 0, width: 1, height: 1 }, mapId: 1 },
        { kind: 'in-place', matched: 1, compared: 1 },
      ]);
  });

  it('links the events alone on a map of another tileset, saying so, and records no placement', () =>
  {
    // Arrange.
    const hub = windowWithCamp();

    // Act.
    const outcome = placeBlueprint(hub, 3, 'k3x9q2mf', at(0, 1));

    // Assert.
    const placed = mapFileOf(hub, 3);
    expect([ outcome.ok && outcome.notes, notesOf(placed).slice(2), placed.data, recorded(hub) ])
      .toStrictEqual([
        [ 'This map uses another tileset, so only the stamp\'s events went down.' ],
        [ '<blueprint:[k3x9q2mf, 7]>', 'Guard captain\n<blueprint:[k3x9q2mf, 9]>' ],
        target(9).data,
        [],
      ]);
  });

  it('records no placement for a blueprint of events alone, which places with no record held at all', () =>
  {
    // Arrange: the camp without its dirt, in a window holding no record, beside one holding an empty record.
    const bare = windowWithCamp({ ...campStamp(), tiles: null }, null);
    const held = windowWithCamp({ ...campStamp(), tiles: null });

    // Act.
    const outcomes = [ placeBlueprint(bare, 1, 'k3x9q2mf', at(1, 0)), placeBlueprint(held, 1, 'k3x9q2mf', at(1, 0)) ];

    // Assert.
    expect([ outcomes.map(outcome => outcome.ok && outcome.eventIds), recorded(held) ])
      .toStrictEqual([ [ [ 2, 3 ], [ 2, 3 ] ], [] ]);
  });

  it('refuses tiles to place while the window holds no record of placements it can read, changing nothing', () =>
  {
    // Arrange: one window holding no record, and one holding something that is not a record.
    const missing = windowWithCamp(campStamp(), null);
    const broken = windowWithCamp(campStamp(), null);
    broken.adopt(BLUEPRINT_USES_DOCUMENT, { schemaVersion: 1, data: { maps: [] } });

    // Act.
    const outcomes = [ placeBlueprint(missing, 1, 'k3x9q2mf', at(1, 0)), placeBlueprint(broken, 1, 'k3x9q2mf', at(1, 0)) ];

    // Assert.
    const refusal = { ok: false, message: 'Blueprints with tiles can\'t be placed until the record of where blueprints are placed can be read.' };
    expect([ outcomes, mapFileOf(missing, 1), mapFileOf(broken, 1) ])
      .toStrictEqual([ [ refusal, refusal ], target(), target() ]);
  });

  it('records only its own placement, whatever placements its stamp was copied with', () =>
  {
    // Arrange: a camp whose stamp somehow holds another blueprint's placement.
    const hub = windowWithCamp({ ...campStamp(), spots: [ { blueprintId: 'zz99', x: 0, y: 0, width: 1, height: 1 } ] });

    // Act.
    placeBlueprint(hub, 1, 'k3x9q2mf', at(1, 0));

    // Assert.
    expect(recorded(hub))
      .toStrictEqual([ { blueprintId: 'k3x9q2mf', x: 1, y: 0, mapId: 1 } ]);
  });

  it('refuses a map that may hold no link, with its reason, changing nothing', () =>
  {
    // Arrange.
    const hub = windowWithCamp();

    // Act.
    const outcome = placeBlueprint(hub, 1, 'k3x9q2mf', at(1, 0, 'this map holds J-ABS\'s action templates, which the game reads, so blueprints stay off it'));

    // Assert.
    expect([ outcome, mapFileOf(hub, 1), hub.history(mapHistoryKey(1)).rows.length ])
      .toStrictEqual([
        {
          ok: false,
          message: 'Blueprints can\'t be placed here: this map holds J-ABS\'s action templates, which the game reads, so blueprints stay off it.',
        },
        target(),
        0,
      ]);
  });

  it('refuses a blueprint no longer there, changing nothing', () =>
  {
    // Arrange.
    const hub = windowWithCamp();

    // Act.
    const outcome = placeBlueprint(hub, 1, 'zz99', at(1, 0));

    // Assert.
    expect([ outcome, mapFileOf(hub, 1) ])
      .toStrictEqual([ { ok: false, message: 'That blueprint is no longer there.' }, target() ]);
  });

  it('refuses what placing its stamp would refuse, such as an event landing on another', () =>
  {
    // Arrange: event 1 stands at 3, 2, where the captain would land.
    const hub = windowWithCamp();

    // Act.
    const outcome = placeBlueprint(hub, 1, 'k3x9q2mf', at(2, 2));

    // Assert.
    expect([ outcome, mapFileOf(hub, 1) ])
      .toStrictEqual([ { ok: false, message: '1 of the stamp\'s 2 events would land on other events.' }, target() ]);
  });

  it('refuses a blueprint whose event\'s note could not take the link and read the same, changing nothing', () =>
  {
    // Arrange: the captain's note leaves a tag open, which would swallow the link.
    const hub = windowWithCamp(campStamp('odd <tag: never closed'));

    // Act.
    const outcome = placeBlueprint(hub, 1, 'k3x9q2mf', at(1, 0));

    // Assert.
    expect([ outcome, mapFileOf(hub, 1), hub.history(mapHistoryKey(1)).rows.length ])
      .toStrictEqual([
        {
          ok: false,
          message: '"Goblin camp" can\'t be placed: in Captain\'s note, a stray < in it gets mixed up with the blueprint link; '
            + 'take that < out, or finish its tag with a >, then try again.',
        },
        target(),
        0,
      ]);
  });
});
