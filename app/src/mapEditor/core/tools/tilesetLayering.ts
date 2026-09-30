import { TILESET_MARKS } from '../editorData/editorData.ts';
import type { DocumentHub } from '../history/DocumentHub.ts';
import { editorDataDocumentKey, TILESETS_KEY } from '../model/documentKeys.ts';
import type { TilesetsDocument } from '../model/JsonDocument.ts';
import { isJsonObject } from '../model/json.ts';
import type { MapDocument } from '../model/MapDocument.ts';
import { TilesetMode } from '../tiles/autotileShapes.ts';
import type { TilesetLayering } from '../tiles/layering.ts';
import { marksForTileset, readTilesetMarks, type TilesetMarks } from '../tiles/tilesetMarks.ts';

/**
 * The document the "goes on top" marks live in.
 */
const TILESET_MARKS_DOCUMENT = editorDataDocumentKey(TILESET_MARKS.name);

/**
 * No tile marked, for a window that does not hold the marks.
 */
const NO_MARKS: TilesetMarks = { tiles: new Set(), kinds: new Set() };

/**
 * What one answer was worked out from, so the next can be reused while none of it changed.
 */
type LayeringCacheEntry = {
  readonly tilesetId: number;
  readonly tilesetsRevision: number;
  readonly marksRevision: number;
  readonly layering: TilesetLayering;
};

/**
 * Answers the painting tools' question of how a map's tileset layers: its mode, from the tilesets the window holds,
 * and its "goes on top" marks, from the marks document the window holds. Either one missing counts as the defaults
 * (an Area tileset, nothing marked), so painting works before they arrive. Answers are kept until the map's tileset,
 * the tilesets or the marks change, since the preview asks on every move of the pointer.
 */
class TilesetLayeringSource
{
  #hub: DocumentHub;

  #cache: LayeringCacheEntry | null = null;

  /**
   * @param {DocumentHub} hub The window's documents.
   */
  constructor(hub: DocumentHub)
  {
    this.#hub = hub;
  }

  /**
   * Finds how a map's tileset layers.
   * @param {MapDocument} map The map.
   * @returns {TilesetLayering} Its tileset's mode and marks.
   */
  layeringFor(map: MapDocument): TilesetLayering
  {
    const hub = this.#hub;
    const { tilesetId } = map;
    const tilesetsRevision = hub.has(TILESETS_KEY) ? hub.document(TILESETS_KEY).revision : -1;
    const marksRevision = hub.has(TILESET_MARKS_DOCUMENT) ? hub.document(TILESET_MARKS_DOCUMENT).revision : -1;
    const cached = this.#cache;
    if (cached !== null && cached.tilesetId === tilesetId && cached.tilesetsRevision === tilesetsRevision && cached.marksRevision === marksRevision)
    {
      return cached.layering;
    }

    const layering: TilesetLayering = { mode: this.#modeOf(tilesetId), marks: this.#marksOf(tilesetId) };
    this.#cache = { tilesetId, tilesetsRevision, marksRevision, layering };
    return layering;
  }

  /**
   * Reads a tileset's mode.
   * @param {number} tilesetId The tileset.
   * @returns {number} Its mode, or Area's when the window holds no such tileset.
   */
  #modeOf(tilesetId: number): number
  {
    const hub = this.#hub;
    if (hub.has(TILESETS_KEY) === false)
    {
      return TilesetMode.area;
    }

    const tileset = (hub.document(TILESETS_KEY) as TilesetsDocument).tileset(tilesetId);
    return tileset === null
      ? TilesetMode.area
      : tileset.mode;
  }

  /**
   * Reads a tileset's marks from the marks document, which the window holds in its stored form.
   * @param {number} tilesetId The tileset.
   * @returns {TilesetMarks} Its marks; none when the window does not hold the document.
   */
  #marksOf(tilesetId: number): TilesetMarks
  {
    const hub = this.#hub;
    if (hub.has(TILESET_MARKS_DOCUMENT) === false)
    {
      return NO_MARKS;
    }

    const stored = hub.document(TILESET_MARKS_DOCUMENT).valueAt([]);
    const data = isJsonObject(stored) ? stored['data'] : undefined;
    return marksForTileset(readTilesetMarks(data), tilesetId);
  }
}

export { TILESET_MARKS_DOCUMENT, TilesetLayeringSource };
