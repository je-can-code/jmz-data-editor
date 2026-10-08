import { describe, expect, it } from 'vitest';
import { linkGateFor, placeBlueprint } from '../../../../src/mapEditor/core/blueprints/blueprintPlacement.ts';
import { mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import { createMapEvent } from '../../../../src/mapEditor/core/model/eventModel.ts';
import type { RmmzMap, RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import type { Stamp } from '../../../../src/mapEditor/core/stamps/stamp.ts';
import type { StampPlacement } from '../../../../src/mapEditor/core/stamps/stampPlacement.ts';
import { TilesetMode } from '../../../../src/mapEditor/core/tiles/autotileShapes.ts';
import { autotileKind, makeAutotileId } from '../../../../src/mapEditor/core/tiles/tileIds.ts';
import { holdBlueprints } from '../../support/blueprintFixtures.ts';
import { hubWithMaps, mapFileOf, spotsOf } from '../../support/eventFixtures.ts';
import { stampOf, tiledMap } from '../../support/stampFixtures.ts';

/*
 * Placing a blueprint drops linked copies. It goes down exactly as placing its stamp would, as one step of the map's
 * history that one undo takes back to the very file it found: its tiles painted as a plain copy with their autotile edges
 * refreshed, its events where they stand inside it with fresh ids. Every event placed carries a link in its note, on a
 * line of its own after whatever the note already says, naming the blueprint and which of its events it is a copy of. A
 * map that may hold no link refuses it whole with the map's reason, so does a blueprint gone since it was picked, and so
 * does a blueprint whose event's note could not take a link and read the same otherwise, as does anything placing its
 * stamp would refuse.
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
 * Builds a window holding maps 1 and 3 and the camp blueprint.
 * @param {Stamp} stamp The camp's stamp.
 * @returns {ReturnType<typeof hubWithMaps>} The window's documents.
 */
const windowWithCamp = (stamp: Stamp = campStamp()) =>
{
  const hub = hubWithMaps({ 1: target(), 3: target(9) });
  holdBlueprints(hub, { k3x9q2mf: { name: 'Goblin camp', stamp } });
  return hub;
};

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
  it('keeps every map from holding a link until the plugin modules have switched on', () =>
  {
    // Arrange: modules not yet switched on, which name no map.
    const gate = linkGateFor({ revision: 0, listProblem: null, templateMapOwner: () => null });

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
    const gate = linkGateFor({ revision: 0, listProblem: 'js/plugins.js does not exist', templateMapOwner: () => null });

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
    const gate = linkGateFor({ revision: 1, listProblem: 'js/plugins.js does not exist', templateMapOwner: mapId => (mapId === 2 ? 'J-ABS' : null) });

    // Act.
    const reasons = [ gate(2), gate(3) ];

    // Assert.
    expect(reasons)
      .toStrictEqual([ 'this map\'s events are patterns J-ABS copies while the game runs', null ]);
  });

  it('keeps a map a plugin copies events from from holding a link, naming the plugin, and lets every other hold one', () =>
  {
    // Arrange: J-ABS copies its actions from map 2.
    const gate = linkGateFor({ revision: 1, listProblem: null, templateMapOwner: mapId => (mapId === 2 ? 'J-ABS' : null) });

    // Act.
    const reasons = [ gate(2), gate(3) ];

    // Assert.
    expect(reasons)
      .toStrictEqual([ 'this map\'s events are patterns J-ABS copies while the game runs', null ]);
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

    // Assert: the copies are events 2 and 3, a link appended to the captain's words; event 1 untouched; dirt laid.
    const placed = mapFileOf(hub, 1);
    expect([
      outcome.ok && [ outcome.step?.label, outcome.step?.histories, outcome.eventIds, outcome.notes ],
      notesOf(placed),
      spotsOf(placed),
      [ placed.data[1], placed.data[2] ].map(autotileKind),
    ])
      .toStrictEqual([
        [ 'Place blueprint "Goblin camp"', [ mapHistoryKey(1) ], [ 2, 3 ], [] ],
        [ null, 'event 1', '<blueprint:[k3x9q2mf, 7]>', 'Guard captain\n<blueprint:[k3x9q2mf, 9]>' ],
        [ null, [ 3, 2 ], [ 1, 0 ], [ 2, 0 ] ],
        [ DIRT, DIRT ],
      ]);
  });

  it('is taken back by one undo to the very file it found', () =>
  {
    // Arrange.
    const hub = windowWithCamp();
    placeBlueprint(hub, 1, 'k3x9q2mf', at(1, 0));

    // Act.
    hub.undo(mapHistoryKey(1));

    // Assert.
    expect(mapFileOf(hub, 1))
      .toStrictEqual(target());
  });

  it('links the events alone on a map of another tileset, saying so', () =>
  {
    // Arrange.
    const hub = windowWithCamp();

    // Act.
    const outcome = placeBlueprint(hub, 3, 'k3x9q2mf', at(0, 1));

    // Assert.
    const placed = mapFileOf(hub, 3);
    expect([ outcome.ok && outcome.notes, notesOf(placed).slice(2), placed.data ])
      .toStrictEqual([
        [ 'This map uses another tileset, so only the stamp\'s events went down.' ],
        [ '<blueprint:[k3x9q2mf, 7]>', 'Guard captain\n<blueprint:[k3x9q2mf, 9]>' ],
        target(9).data,
      ]);
  });

  it('refuses a map that may hold no link, with its reason, changing nothing', () =>
  {
    // Arrange.
    const hub = windowWithCamp();

    // Act.
    const outcome = placeBlueprint(hub, 1, 'k3x9q2mf', at(1, 0, 'this map\'s events are patterns J-ABS copies while the game runs'));

    // Assert.
    expect([ outcome, mapFileOf(hub, 1), hub.history(mapHistoryKey(1)).rows.length ])
      .toStrictEqual([
        { ok: false, message: 'Blueprints can\'t be placed here: this map\'s events are patterns J-ABS copies while the game runs.' },
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
          message: '"Goblin camp" can\'t be placed: in Captain\'s note, the note would not read back with its link as asked; '
            + 'look for a stray < in it.',
        },
        target(),
        0,
      ]);
  });
});
