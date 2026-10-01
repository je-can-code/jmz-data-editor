import type { MapEditorApi } from '../api/MapEditorApi.ts';
import type { RmmzTileset } from '../model/rmmzTypes.ts';

/**
 * The part of the server a tileset row is read from.
 */
type TilesetSource = Pick<MapEditorApi, 'loadTilesets'>;

/**
 * Reads the one tileset a map draws with, straight from the server, for the graphic picker's tile pictures. The event
 * window never holds the tilesets document for it: every window holding a document counts as keeping a copy of it, so
 * the window that edits the tilesets would close without asking about its unsaved edits while an event window held
 * them, though an event window can neither show those edits nor save them. The picker needs only the sheet names,
 * which nothing in the map editor edits, so the copy on disk serves it.
 * @param {TilesetSource} source The server.
 * @param {number} tilesetId The map's tileset.
 * @returns {Promise<RmmzTileset | null>} The tileset, or null when the project has none by that id.
 */
const loadTilesetRow = async (source: TilesetSource, tilesetId: number): Promise<RmmzTileset | null> =>
{
  const tilesets = await source.loadTilesets();
  return tilesets[tilesetId] ?? null;
};

export { loadTilesetRow };
export type { TilesetSource };
