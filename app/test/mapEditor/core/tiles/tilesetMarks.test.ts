import { describe, expect, it } from 'vitest';
import { TilesetMode } from '../../../../src/mapEditor/core/tiles/autotileShapes.ts';
import { makeAutotileId, TileId } from '../../../../src/mapEditor/core/tiles/tileIds.ts';
import {
  deriveTilesetMarks,
  emptyTilesetMarks,
  isMarkedTile,
  marksForTileset,
  readTilesetMarks,
  setTileMarked,
  TILESET_MARKS_KEY,
  TILESET_MARKS_SCHEMA_VERSION,
  type TilesetMarksDocument,
} from '../../../../src/mapEditor/core/tiles/tilesetMarks.ts';
import { blankGrid, put } from './support/tileGridBuilder.ts';
import { locateShippedGame, readShippedMaps, readShippedTilesets } from './support/shippedGame.ts';

/*
 * The goes-on-top marks.
 *
 * Each tileset remembers which of its tiles lay over the ground instead of replacing it. The marks are saved through
 * the editor-data routes under the "tileset-marks" key, as { tilesets: { "<id>": { tiles, kinds } } }: plain A5
 * tiles by id, autotiles by kind so every shape counts. What gets saved is what the painter reads back, so the
 * document is tidied on the way in and refused loudly when it is not a marks document, rather than read as "no
 * marks" and then saved over.
 *
 * A project starts from the tiles its own maps already layer by hand: every A-sheet tile found above the layer MZ's
 * auto mode would give it, minus the kinds auto mode already lays on top. For Chef Adventure that is 80 tiles and
 * kinds across seven tilesets (S5's 88, less the three Field-mode pairs MZ lays itself and the five decoration kinds).
 */
const CLIFF_CORNER = TileId.A5 + 122;
const ROCK = TileId.A5 + 123;

describe('the marks document', () =>
{
  it('is saved under the key and version the editor-data definitions reserve', () =>
  {
    // Arrange: nothing to set up; these are the document's identity.

    // Act.
    const identity = [ TILESET_MARKS_KEY, TILESET_MARKS_SCHEMA_VERSION, emptyTilesetMarks() ];

    // Assert.
    expect(identity)
      .toEqual([ 'tileset-marks', 1, { tilesets: {} } ]);
  });
});

describe('readTilesetMarks', () =>
{
  it('reads back exactly what was saved, through JSON as the editor-data routes carry it', () =>
  {
    // Arrange: two tilesets' marks, built the way the palette would build them.
    const saved = setTileMarked(setTileMarked(emptyTilesetMarks(), 12, CLIFF_CORNER, true), 19, makeAutotileId(88, 3), true);

    // Act.
    const loaded = readTilesetMarks(JSON.parse(JSON.stringify(saved)));

    // Assert.
    expect(loaded)
      .toEqual({ tilesets: { '12': { tiles: [ CLIFF_CORNER ], kinds: [] }, '19': { tiles: [], kinds: [ 88 ] } } });
  });

  it('sorts each list, drops repeats, and leaves out tilesets with nothing marked', () =>
  {
    // Arrange.
    const saved = { tilesets: { '12': { tiles: [ ROCK, CLIFF_CORNER, ROCK ], kinds: [ 36, 5 ] }, '4': { tiles: [], kinds: [] } } };

    // Act.
    const document = readTilesetMarks(saved);

    // Assert.
    expect(document)
      .toEqual({ tilesets: { '12': { tiles: [ CLIFF_CORNER, ROCK ], kinds: [ 5, 36 ] } } });
  });

  it('refuses what is not a marks document', () =>
  {
    // Arrange: nothing at all, a document without tilesets, and tilesets as a list.
    const documents: unknown[] = [ null, { marks: {} }, { tilesets: [] } ];

    // Act.
    const refusals = documents.map(document => () => readTilesetMarks(document));

    // Assert.
    refusals.forEach(read => expect(read)
      .toThrow('not a marks document'));
  });

  it('refuses an entry keyed by something that is not a tileset id', () =>
  {
    // Arrange.
    const saved = { tilesets: { outside: { tiles: [], kinds: [] } } };

    // Act.
    const read = (): TilesetMarksDocument => readTilesetMarks(saved);

    // Assert.
    expect(read)
      .toThrow('which is not a tileset');
  });

  it('refuses a tile that cannot be marked: an autotile id in the tile list, a kind past A4, a fraction, or no list', () =>
  {
    // Arrange: each bad document with the refusal it should get.
    const cases: [ unknown, string ][] = [
      [ { tilesets: { '1': { tiles: [ makeAutotileId(16, 0) ], kinds: [] } } }, 'not a markable tile' ],
      [ { tilesets: { '1': { tiles: [], kinds: [ 128 ] } } }, 'not a markable tile' ],
      [ { tilesets: { '1': { tiles: [ 1.5 ], kinds: [] } } }, 'not a markable tile' ],
      [ { tilesets: { '1': { kinds: [] } } }, 'no list at 1.tiles' ],
    ];

    // Act.
    const reads = cases.map(([ saved, refusal ]) => [ () => readTilesetMarks(saved), refusal ] as const);

    // Assert.
    reads.forEach(([ read, refusal ]) => expect(read)
      .toThrow(refusal));
  });
});

describe('isMarkedTile', () =>
{
  it('marks an autotile through its kind in any shape, and a plain tile by id, but not its neighbour', () =>
  {
    // Arrange: kind 36 and the cliff corner marked for tileset 12.
    const marks = marksForTileset({ tilesets: { '12': { tiles: [ CLIFF_CORNER ], kinds: [ 36 ] } } }, 12);

    // Act.
    const answers = [ makeAutotileId(36, 0), makeAutotileId(36, 45), makeAutotileId(37, 0), CLIFF_CORNER, ROCK ]
      .map(tileId => isMarkedTile(marks, tileId));

    // Assert.
    expect(answers)
      .toEqual([ true, true, false, true, false ]);
  });

  it('marks nothing for a tileset the document does not name', () =>
  {
    // Arrange.
    const marks = marksForTileset({ tilesets: { '12': { tiles: [ CLIFF_CORNER ], kinds: [] } } }, 13);

    // Act.
    const marked = isMarkedTile(marks, CLIFF_CORNER);

    // Assert.
    expect(marked)
      .toBe(false);
  });

  it('never marks a B to E tile, even one whose id is listed', () =>
  {
    // Arrange: a document read without checks, listing B tile 5.
    const marks = { tiles: new Set([ 5 ]), kinds: new Set<number>() };

    // Act.
    const marked = isMarkedTile(marks, 5);

    // Assert.
    expect(marked)
      .toBe(false);
  });
});

describe('setTileMarked', () =>
{
  it('marks a kind through any shape of it, without changing the document it was given', () =>
  {
    // Arrange.
    const before = emptyTilesetMarks();

    // Act.
    const after = setTileMarked(before, 12, makeAutotileId(36, 20), true);

    // Assert.
    expect([ after, before ])
      .toEqual([ { tilesets: { '12': { tiles: [], kinds: [ 36 ] } } }, { tilesets: {} } ]);
  });

  it('keeps each list sorted as tiles are added', () =>
  {
    // Arrange.
    const document = setTileMarked(emptyTilesetMarks(), 12, ROCK, true);

    // Act.
    const after = setTileMarked(document, 12, CLIFF_CORNER, true);

    // Assert.
    expect(after.tilesets['12'].tiles)
      .toEqual([ CLIFF_CORNER, ROCK ]);
  });

  it('unmarks a tile, and drops the tileset once nothing is left', () =>
  {
    // Arrange.
    const document: TilesetMarksDocument = { tilesets: { '12': { tiles: [ CLIFF_CORNER, ROCK ], kinds: [] } } };

    // Act.
    const one = setTileMarked(document, 12, CLIFF_CORNER, false);
    const none = setTileMarked(one, 12, ROCK, false);

    // Assert.
    expect([ one, none ])
      .toEqual([ { tilesets: { '12': { tiles: [ ROCK ], kinds: [] } } }, { tilesets: {} } ]);
  });

  it('hands back the same document when nothing changes, and ignores B to E tiles', () =>
  {
    // Arrange.
    const document: TilesetMarksDocument = { tilesets: { '12': { tiles: [ CLIFF_CORNER ], kinds: [] } } };

    // Act.
    const already = setTileMarked(document, 12, CLIFF_CORNER, true);
    const upper = setTileMarked(document, 12, 5, true);

    // Assert.
    expect([ already === document, upper === document ])
      .toEqual([ true, true ]);
  });
});

describe('deriveTilesetMarks', () =>
{
  it('marks A tiles found above their auto layer, and leaves out overlays, the ground and upper tiles', () =>
  {
    // Arrange: one map on tileset 12 holding, above layer 1, the cliff corner, a waterfall, tall grass (an overlay)
    // and a tree; on layer 1, the rock.
    const map = { ...blankGrid(5, 1), tilesetId: 12 };
    put(map, 0, 0, 1, CLIFF_CORNER);
    put(map, 1, 0, 2, makeAutotileId(5, 1));
    put(map, 2, 0, 2, makeAutotileId(36, 0));
    put(map, 3, 0, 3, 7);
    put(map, 4, 0, 0, ROCK);

    // Act.
    const document = deriveTilesetMarks([ map ], () => TilesetMode.area);

    // Assert.
    expect(document)
      .toEqual({ tilesets: { '12': { tiles: [ CLIFF_CORNER ], kinds: [ 5 ] } } });
  });

  it('leaves out a Field tileset\'s paired base column on layer 2, but not the same kind on an Area tileset', () =>
  {
    // Arrange: kind 17 on layer 2 of a map on tileset 1 (Field) and of one on tileset 2 (Area).
    const field = put({ ...blankGrid(1, 1), tilesetId: 1 }, 0, 0, 1, makeAutotileId(17, 0));
    const area = put({ ...blankGrid(1, 1), tilesetId: 2 }, 0, 0, 1, makeAutotileId(17, 0));

    // Act.
    const document = deriveTilesetMarks([ field, area ], tilesetId => (tilesetId === 1 ? TilesetMode.field : TilesetMode.area));

    // Assert.
    expect(document)
      .toEqual({ tilesets: { '2': { tiles: [], kinds: [ 17 ] } } });
  });
});

const game = locateShippedGame();

describe.skipIf(game === null)('the marks Chef Adventure starts with', () =>
{
  it('pre-fills the 80 tiles and kinds its maps layer by hand, across seven tilesets', () =>
  {
    // Arrange.
    const root = game as string;
    const tilesets = readShippedTilesets(root);
    const modeOf = (tilesetId: number): number =>
    {
      const tileset = tilesets.get(tilesetId);
      if (tileset === undefined)
      {
        throw new Error(`a map uses tileset ${tilesetId}, which Tilesets.json does not have`);
      }

      return tileset.mode;
    };

    // Act.
    const document = deriveTilesetMarks(readShippedMaps(root), modeOf);

    // Assert: the count, the tilesets, the cliff corner S5 used, and the overlay kinds and Field pairs left out.
    const entries = Object.values(document.tilesets);
    const count = entries.reduce((sum, entry) => sum + entry.tiles.length + entry.kinds.length, 0);
    const outside = document.tilesets['12'];
    expect({
      count,
      tilesets: Object.keys(document.tilesets),
      cliffCorner: outside.tiles.includes(1658),
      tallGrass: outside.kinds.includes(36),
      fieldPairs: document.tilesets['1'] === undefined,
    })
      .toEqual({ count: 80, tilesets: [ '4', '12', '14', '15', '16', '18', '19' ], cliffCorner: true, tallGrass: false, fieldPairs: true });
  });
});
