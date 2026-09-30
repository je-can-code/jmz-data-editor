import type { TileGrid } from './tileGrid.ts';
import { autotileKind, isA5Tile, isAutotile } from './tileIds.ts';
import { autoLayerOf, isASheetTile } from './tileRoles.ts';

/**
 * The editor-data key the marks are saved under, so they live in {@code <project>/jmz-editor/tileset-marks.json}
 * and are versioned with the game. It is the key the map editor's editor-data definitions reserve for them.
 */
const TILESET_MARKS_KEY = 'tileset-marks';

/**
 * The version of the marks document's shape, stored beside it by the editor-data client.
 */
const TILESET_MARKS_SCHEMA_VERSION = 1;

/**
 * One tileset's marks as saved: the plain tiles marked (A5 tile ids), and the autotile kinds marked (A1 to A4, a
 * kind covering every one of its shapes), each ascending with no repeats.
 */
type SavedTilesetMarks = {
  tiles: number[];
  kinds: number[];
};

/**
 * The marks document: every tileset that has marks, keyed by its id. A tileset with none is simply absent, and a
 * project that has saved nothing starts from {@code { tilesets: {} }}.
 *
 * <pre>
 * {
 *   "tilesets": {
 *     "12": { "tiles": [ 1554, 1658 ], "kinds": [ 11, 106 ] }
 *   }
 * }
 * </pre>
 */
type TilesetMarksDocument = {
  tilesets: Record<string, SavedTilesetMarks>;
};

/**
 * One tileset's marks, ready to consult while painting.
 */
type TilesetMarks = {
  readonly tiles: ReadonlySet<number>;
  readonly kinds: ReadonlySet<number>;
};

/**
 * A map as the pre-fill reads it: its tileset and its tile data.
 */
type MarkSourceMap = TileGrid & { readonly tilesetId: number };

/**
 * Builds the document a project without saved marks starts from.
 * @returns {TilesetMarksDocument} A document with no tilesets.
 */
const emptyTilesetMarks = (): TilesetMarksDocument =>
{
  return { tilesets: {} };
};

/**
 * Reads a list of ids from a saved document, sorted and without repeats.
 * @param {unknown} list The saved list.
 * @param {(id: number) => boolean} isValid What an id in this list must be.
 * @param {string} where The list's place in the document, for the error.
 * @returns {number[]} The ids.
 */
const readIdList = (list: unknown, isValid: (id: number) => boolean, where: string): number[] =>
{
  if (Array.isArray(list) === false)
  {
    throw new Error(`the saved tileset marks have no list at ${where}`);
  }

  const ids = list as unknown[];
  const bad = ids.find(id => Number.isInteger(id) === false || isValid(id as number) === false);
  if (bad !== undefined)
  {
    throw new Error(`the saved tileset marks hold ${String(bad)} at ${where}, which is not a markable tile`);
  }

  return [ ...new Set(ids as number[]) ].sort((a, b) => a - b);
};

/**
 * Checks a saved marks document and tidies it: ids sorted, repeats dropped, empty tilesets left out. Anything that
 * is not a marks document is refused loudly rather than read as no marks, since saving over it would lose it.
 * @param {unknown} data The document's data, as the editor-data client loads it.
 * @returns {TilesetMarksDocument} The document.
 */
const readTilesetMarks = (data: unknown): TilesetMarksDocument =>
{
  if (typeof data !== 'object' || data === null || Object.hasOwn(data, 'tilesets') === false)
  {
    throw new Error('the saved tileset marks are not a marks document');
  }

  const { tilesets } = data as { tilesets: unknown };
  if (typeof tilesets !== 'object' || tilesets === null || Array.isArray(tilesets))
  {
    throw new Error('the saved tileset marks are not a marks document');
  }

  const document = emptyTilesetMarks();
  Object.entries(tilesets as Record<string, unknown>).forEach(([ tilesetId, saved ]) =>
  {
    if (/^\d+$/u.test(tilesetId) === false || typeof saved !== 'object' || saved === null)
    {
      throw new Error(`the saved tileset marks hold an entry for "${tilesetId}", which is not a tileset`);
    }

    const { tiles, kinds } = saved as { tiles?: unknown; kinds?: unknown };
    const entry = {
      tiles: readIdList(tiles, isA5Tile, `${tilesetId}.tiles`),
      kinds: readIdList(kinds, kind => kind >= 0 && kind < 128, `${tilesetId}.kinds`),
    };

    // a tileset with nothing marked is left out, so the file only names tilesets that have marks.
    if (entry.tiles.length > 0 || entry.kinds.length > 0)
    {
      document.tilesets[tilesetId] = entry;
    }
  });

  return document;
};

/**
 * Finds one tileset's marks.
 * @param {TilesetMarksDocument} document The marks document.
 * @param {number} tilesetId The tileset.
 * @returns {TilesetMarks} Its marks; none when the document has no entry for it.
 */
const marksForTileset = (document: TilesetMarksDocument, tilesetId: number): TilesetMarks =>
{
  const saved = document.tilesets[String(tilesetId)];
  return saved === undefined
    ? { tiles: new Set(), kinds: new Set() }
    : { tiles: new Set(saved.tiles), kinds: new Set(saved.kinds) };
};

/**
 * Reports whether a tile is marked to go on top. Only A-sheet tiles can be: B to E tiles always stack on layers 3
 * and 4. An autotile is marked through its kind, so every shape of a marked kind counts.
 * @param {TilesetMarks} marks The tileset's marks.
 * @param {number} tileId The tile id.
 * @returns {boolean} True when the tile goes on top.
 */
const isMarkedTile = (marks: TilesetMarks, tileId: number): boolean =>
{
  if (isAutotile(tileId))
  {
    return marks.kinds.has(autotileKind(tileId));
  }

  return isA5Tile(tileId) && marks.tiles.has(tileId);
};

/**
 * Marks or unmarks a tile for one tileset, leaving the document it was given untouched.
 * @param {TilesetMarksDocument} document The marks document.
 * @param {number} tilesetId The tileset.
 * @param {number} tileId The tile; for an autotile, its kind is what gets marked.
 * @param {boolean} marked Whether the tile should go on top.
 * @returns {TilesetMarksDocument} The document with the change, or the same document when nothing changes.
 */
const setTileMarked = (document: TilesetMarksDocument, tilesetId: number, tileId: number, marked: boolean): TilesetMarksDocument =>
{
  if (isASheetTile(tileId) === false || isMarkedTile(marksForTileset(document, tilesetId), tileId) === marked)
  {
    return document;
  }

  // edit a copy of this tileset's lists, in the list the tile belongs to.
  const key = String(tilesetId);
  const saved = document.tilesets[key] ?? { tiles: [], kinds: [] };
  const listName = isAutotile(tileId)
    ? 'kinds'
    : 'tiles';
  const id = isAutotile(tileId)
    ? autotileKind(tileId)
    : tileId;
  const list = marked
    ? [ ...saved[listName], id ].sort((a, b) => a - b)
    : saved[listName].filter(existing => existing !== id);
  const entry = { ...saved, [listName]: list };

  // an entry left with nothing marked leaves the document.
  const tilesets = { ...document.tilesets, [key]: entry };
  if (entry.tiles.length === 0 && entry.kinds.length === 0)
  {
    delete tilesets[key];
  }

  return { tilesets };
};

/**
 * How often one tile was placed on the ground layer and above it.
 */
type PlacementCount = { onGround: number; above: number };

/**
 * Counts, per tileset, where each ground-role A-sheet tile sits: on layer 1, where MZ's auto mode puts it, or above
 * it, where only somebody layering it by hand could have put it. Autotiles count by kind.
 * @param {Iterable<MarkSourceMap>} maps Every map in the project.
 * @param {(tilesetId: number) => number} modeOf The mode of a tileset.
 * @returns {Map<number, Map<number, PlacementCount>>} The counts, by tileset and then by tile id or kind; a kind is
 * keyed as its negative minus one, so it never collides with a tile id.
 */
const countPlacements = (maps: Iterable<MarkSourceMap>, modeOf: (tilesetId: number) => number): Map<number, Map<number, PlacementCount>> =>
{
  const counts = new Map<number, Map<number, PlacementCount>>();
  for (const map of maps)
  {
    const { width, height, cells, tilesetId } = map;
    const mode = modeOf(tilesetId);
    const plane = width * height;
    const tileset = counts.get(tilesetId) ?? new Map<number, PlacementCount>();
    counts.set(tilesetId, tileset);

    for (let index = 0; index < plane * 4; index++)
    {
      // only tiles auto mode lays on the ground can be found above it by hand.
      const tileId = cells[index];
      if (isASheetTile(tileId) === false || autoLayerOf(tileId, mode) !== 0)
      {
        continue;
      }

      const key = isAutotile(tileId)
        ? -1 - autotileKind(tileId)
        : tileId;
      const count = tileset.get(key) ?? { onGround: 0, above: 0 };
      if (index < plane)
      {
        count.onGround += 1;
      }
      else
      {
        count.above += 1;
      }

      tileset.set(key, count);
    }
  }

  return counts;
};

/**
 * Works out the marks a project starts with: every A-sheet tile its maps place above the layer MZ's auto mode puts
 * it on more often than on it. Being found above at all is the fingerprint of layering by hand, but a tile mostly
 * painted as ground is ground (Chef Adventure's wall top 98 on tileset 16 sits on layer 1 8,220 times against 643
 * above), and marking it would bury every wall later painted under it. The kinds auto mode already lays over the
 * ground (the A2 decorations, the ocean overlays, and a Field tileset's paired base columns) are left out, since
 * auto mode already puts them on top.
 *
 * A project with no saved marks is seeded with this once, and the result saved; after that the saved document is
 * the only source, so a tile unmarked by hand stays unmarked.
 * @param {Iterable<MarkSourceMap>} maps Every map in the project.
 * @param {(tilesetId: number) => number} modeOf The mode of a tileset.
 * @returns {TilesetMarksDocument} The seed document.
 */
const deriveTilesetMarks = (maps: Iterable<MarkSourceMap>, modeOf: (tilesetId: number) => number): TilesetMarksDocument =>
{
  const document = emptyTilesetMarks();
  const counts = countPlacements(maps, modeOf);

  // write the tilesets in id order, each list ascending, leaving out tilesets with nothing mostly layered by hand.
  [ ...counts.keys() ].sort((a, b) => a - b).forEach((tilesetId) =>
  {
    const tiles: number[] = [];
    const kinds: number[] = [];
    (counts.get(tilesetId) as Map<number, PlacementCount>).forEach(({ onGround, above }, key) =>
    {
      if (above <= onGround)
      {
        return;
      }

      if (key < 0)
      {
        kinds.push(-1 - key);
      }
      else
      {
        tiles.push(key);
      }
    });

    if (tiles.length > 0 || kinds.length > 0)
    {
      document.tilesets[String(tilesetId)] = {
        tiles: tiles.sort((a, b) => a - b),
        kinds: kinds.sort((a, b) => a - b),
      };
    }
  });

  return document;
};

export {
  deriveTilesetMarks,
  emptyTilesetMarks,
  isMarkedTile,
  marksForTileset,
  readTilesetMarks,
  setTileMarked,
  TILESET_MARKS_KEY,
  TILESET_MARKS_SCHEMA_VERSION,
};
export type { MarkSourceMap, SavedTilesetMarks, TilesetMarks, TilesetMarksDocument };
