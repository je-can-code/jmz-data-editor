import type { MapEditorApi } from '../api/MapEditorApi.ts';
import { TILESET_MARKS } from '../editorData/editorData.ts';
import type { DocumentHub } from '../history/DocumentHub.ts';
import { documentHistoryKey } from '../history/historyKeys.ts';
import type { HistoryStep } from '../history/HistoryStep.ts';
import { editorDataDocumentKey, type DocumentKey, type EditorDataDocumentKey } from '../model/documentKeys.ts';
import type { EditorDocument } from '../model/EditorDocument.ts';
import type { JsonValue } from '../model/json.ts';
import { TilesetMode } from '../tiles/autotileShapes.ts';
import {
  deriveTilesetMarks,
  isMarkedTile,
  marksForTileset,
  readTilesetMarks,
  setTileMarked,
  type MarkSourceMap,
  type TilesetMarksDocument,
} from '../tiles/tilesetMarks.ts';
import { isASheetTile } from '../tiles/tileRoles.ts';
import { describeTile } from './paletteLayout.ts';

/**
 * The document the "goes on top" marks live in: {@code <project>/jmz-editor/tileset-marks.json}, held in its stored
 * form, the marks under {@code data} beside the shape's version.
 */
const TILESET_MARKS_DOCUMENT: EditorDataDocumentKey = editorDataDocumentKey(TILESET_MARKS.name);

/**
 * How many map files seeding the marks reads at once.
 */
const SEED_READS_AT_ONCE = 8;

/**
 * Reads the marks out of the document the hub holds.
 * @param {EditorDocument} document The marks document, in its stored form.
 * @returns {TilesetMarksDocument} The marks; a document that is not a marks document is refused loudly.
 */
const marksOf = (document: EditorDocument): TilesetMarksDocument =>
{
  return readTilesetMarks(document.valueAt([ 'data' ]));
};

/**
 * Marks a tile to go on top, or unmarks it, for one tileset: one step on the marks document, whose own history
 * nothing but this writes to. An autotile is marked by its kind, so every shape of it goes with it. B to E tiles
 * always stack on layers 3 and 4, so marking one changes nothing.
 * @param {DocumentHub} hub The window's documents; the marks document must be held.
 * @param {number} tilesetId The tileset.
 * @param {number} tileId The tile, in any shape.
 * @returns {HistoryStep | null} The step, or null when nothing changed.
 */
const toggleTileMark = (hub: DocumentHub, tilesetId: number, tileId: number): HistoryStep | null =>
{
  const current = marksOf(hub.document(TILESET_MARKS_DOCUMENT));
  const marked = isMarkedTile(marksForTileset(current, tilesetId), tileId);
  const next = setTileMarked(current, tilesetId, tileId, marked === false);
  if (next === current)
  {
    return null;
  }

  // only this tileset's entry changes; one left with nothing marked leaves the document.
  const key = String(tilesetId);
  const entry = next.tilesets[key] as unknown as JsonValue | undefined;
  const label = marked
    ? `${describeTile(tileId)}: no longer goes on top`
    : `${describeTile(tileId)}: goes on top`;
  return hub.edit(label, [ documentHistoryKey(TILESET_MARKS_DOCUMENT) ], tx =>
  {
    tx.set(TILESET_MARKS_DOCUMENT, [ 'data', 'tilesets', key ], entry);
  });
};

/**
 * Reports whether a tile can be marked to go on top: only A-sheet tiles can.
 * @param {number} tileId The tile id.
 * @returns {boolean} True for A1 to A5.
 */
const isMarkableTile = (tileId: number): boolean =>
{
  return isASheetTile(tileId);
};

/**
 * Runs a task over every item, a few at a time.
 * @param {readonly T[]} items The items.
 * @param {number} atOnce How many run together.
 * @param {(item: T) => Promise<void>} task The task.
 * @returns {Promise<void>} Settles once every task has.
 */
const forEachAtOnce = async <T, >(items: readonly T[], atOnce: number, task: (item: T) => Promise<void>): Promise<void> =>
{
  let next = 0;
  const worker = async (): Promise<void> =>
  {
    while (next < items.length)
    {
      const item = items[next];
      next += 1;
      await task(item);
    }
  };

  await Promise.all(Array.from({ length: Math.min(atOnce, items.length) }, () => worker()));
};

/**
 * Works out the marks a project starts with from its maps on disk: every A-sheet tile its maps lay above the layer
 * MZ's auto mode would, more often than on it (see {@link deriveTilesetMarks}). Every map the tree lists is read; a
 * map whose file cannot be read is left out rather than stopping the rest.
 * @param {MapEditorApi} api The server.
 * @returns {Promise<TilesetMarksDocument>} The marks.
 */
const seedTilesetMarks = async (api: MapEditorApi): Promise<TilesetMarksDocument> =>
{
  const [ infos, tilesets ] = await Promise.all([ api.loadMapInfos(), api.loadTilesets() ]);
  const mapIds = infos.flatMap(info => (info === null ? [] : [ info.id ]));
  const maps: MarkSourceMap[] = [];
  await forEachAtOnce(mapIds, SEED_READS_AT_ONCE, async mapId =>
  {
    try
    {
      const map = await api.loadMap(mapId);
      maps.push({ width: map.width, height: map.height, cells: Uint16Array.from(map.data), tilesetId: map.tilesetId });
    }
    catch
    {
      // a map the tree lists without a readable file adds nothing to the marks.
    }
  });

  // a map on a tileset the project no longer has is read as Area mode, the mode of every tileset but a world map's.
  const modeOf = (tilesetId: number): number => tilesets[tilesetId]?.mode ?? TilesetMode.area;
  return deriveTilesetMarks(maps, modeOf);
};

/**
 * What opening the marks needs from the window: the server, and how the window holds documents.
 */
type MarksOpener = {
  readonly api: MapEditorApi | null;
  readonly hub: DocumentHub;
  openDocument(key: DocumentKey): Promise<EditorDocument>;
};

/**
 * Opens the marks document, seeding it first when the project has never saved one. Reading every map takes a while,
 * so the marks are looked for again before the seed is saved: marks another window saved in the meantime win, and the
 * seed is dropped rather than written over them.
 * @param {MarksOpener} opener The window's server and documents.
 * @returns {Promise<EditorDocument>} The marks document.
 */
const seedAndOpen = async (opener: MarksOpener): Promise<EditorDocument> =>
{
  const { api, hub } = opener;
  if (hub.has(TILESET_MARKS_DOCUMENT) || api === null)
  {
    return opener.openDocument(TILESET_MARKS_DOCUMENT);
  }

  const saved = await api.loadEditorData(TILESET_MARKS.name);
  if (saved === null)
  {
    const seed = await seedTilesetMarks(api);

    // only a project still without marks takes the seed.
    const savedSince = await api.loadEditorData(TILESET_MARKS.name);
    if (savedSince === null)
    {
      await api.saveEditorData(TILESET_MARKS.name, { schemaVersion: TILESET_MARKS.schemaVersion, data: seed as unknown as JsonValue });
    }
  }

  return opener.openDocument(TILESET_MARKS_DOCUMENT);
};

/**
 * The open under way in each window, by its hub, so the palette and the stack view opening the marks together read
 * the project's maps once between them.
 */
const opening = new WeakMap<DocumentHub, Promise<EditorDocument>>();

/**
 * Holds the marks document. A project that has never saved one is seeded from its maps first and the seed saved, so
 * the tiles its maps already layer by hand start out marked, unless another window saved marks while the maps were
 * read; after that the saved document is the only source, and a tile unmarked by hand stays unmarked. A window
 * already holding the document, or another window's copy, is used as it is, and asking again while an open is under
 * way waits for that one. Once an open settles it is forgotten, so an open that failed is tried afresh on the next ask,
 * and one that worked answers at once from the document now held.
 * @param {MarksOpener} opener The window's server and documents.
 * @returns {Promise<EditorDocument>} The marks document.
 */
const openTilesetMarks = (opener: MarksOpener): Promise<EditorDocument> =>
{
  const { hub } = opener;
  const underWay = opening.get(hub);
  if (underWay !== undefined)
  {
    return underWay;
  }

  const open = seedAndOpen(opener).finally(() => opening.delete(hub));
  opening.set(hub, open);
  return open;
};

export { isMarkableTile, marksOf, openTilesetMarks, seedTilesetMarks, TILESET_MARKS_DOCUMENT, toggleTileMark };
export type { MarksOpener };
