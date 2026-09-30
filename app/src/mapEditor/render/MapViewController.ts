import type { DocumentKey } from '../core/model/documentKeys.ts';
import { mapDocumentKey, TILESETS_KEY } from '../core/model/documentKeys.ts';
import type { EditorDocument } from '../core/model/EditorDocument.ts';
import type { TilesetsDocument } from '../core/model/JsonDocument.ts';
import type { MapDocument } from '../core/model/MapDocument.ts';
import type { RmmzTileset } from '../core/model/rmmzTypes.ts';
import type { MapRenderer, TextureImage, TextureSource } from '../core/renderer/MapRenderer.ts';

/**
 * Where a map view gets its documents: the window's services, which hand out the live copy another window holds or
 * load the file.
 */
type DocumentOpener = {
  openDocument(key: DocumentKey): Promise<EditorDocument>;
};

/**
 * Where a map view gets its pictures: tileset sheets for the tiles, and everything else events draw with.
 */
type MapImages = TextureSource & {
  tilesetSheets(tileset: RmmzTileset): Promise<(TextureImage | null)[]>;
};

/**
 * Opens maps into a renderer and keeps the renderer's tileset current: a map switched to another tileset, or a
 * tileset whose flags were edited, is redrawn with what it has now. Opening another map replaces the one before;
 * a slow open that another open overtook never lands.
 */
class MapViewController
{
  #renderer: MapRenderer;

  #documents: DocumentOpener;

  #images: MapImages;

  #generation = 0;

  #stops: (() => void)[] = [];

  #map: MapDocument | null = null;

  /**
   * @param {MapRenderer} renderer The renderer to draw with.
   * @param {DocumentOpener} documents Where documents come from.
   * @param {MapImages} images Where pictures come from.
   */
  constructor(renderer: MapRenderer, documents: DocumentOpener, images: MapImages)
  {
    this.#renderer = renderer;
    this.#documents = documents;
    this.#images = images;
    renderer.setTextureSource(images);
  }

  /**
   * The map on show.
   * @returns {MapDocument | null} The document, or null before the first open lands.
   */
  get map(): MapDocument | null
  {
    return this.#map;
  }

  /**
   * Opens a map, with its tileset, into the renderer.
   * @param {number} mapId The map id.
   * @returns {Promise<MapDocument | null>} The map, or null when a later open overtook this one.
   */
  async open(mapId: number): Promise<MapDocument | null>
  {
    const generation = this.#begin();
    const [ map, tilesets ] = await Promise.all([
      this.#documents.openDocument(mapDocumentKey(mapId)) as Promise<MapDocument>,
      this.#documents.openDocument(TILESETS_KEY) as Promise<TilesetsDocument>,
    ]);
    if (generation !== this.#generation)
    {
      return null;
    }

    const applied = await this.#applyTileset(map, tilesets, generation);
    if (applied === false)
    {
      return null;
    }

    this.#map = map;
    this.#renderer.setDocument(map);
    this.#watch(map, tilesets, generation);
    return map;
  }

  /**
   * Stops following the map on show; the renderer keeps drawing what it has.
   */
  close(): void
  {
    this.#begin();
    this.#map = null;
  }

  /**
   * Starts a new open, cancelling the one before.
   * @returns {number} The new open's generation.
   */
  #begin(): number
  {
    this.#stops.splice(0).forEach(stop => stop());
    this.#generation += 1;
    return this.#generation;
  }

  /**
   * Loads the map's tileset sheets and hands them to the renderer.
   * @param {MapDocument} map The map.
   * @param {TilesetsDocument} tilesets The tilesets.
   * @param {number} generation The open this belongs to.
   * @returns {Promise<boolean>} True when applied; false when a later open overtook it.
   */
  async #applyTileset(map: MapDocument, tilesets: TilesetsDocument, generation: number): Promise<boolean>
  {
    const tileset = tilesets.tileset(map.tilesetId);
    if (tileset === null)
    {
      throw new Error(`map ${map.mapId} draws with tileset ${map.tilesetId}, which does not exist`);
    }

    const sheets = await this.#images.tilesetSheets(tileset);
    if (generation !== this.#generation)
    {
      return false;
    }

    this.#renderer.setTileset({ tileset, sheets });
    return true;
  }

  /**
   * Follows the map's tileset choice and the tilesets' contents.
   * @param {MapDocument} map The map.
   * @param {TilesetsDocument} tilesets The tilesets.
   * @param {number} generation The open this belongs to.
   */
  #watch(map: MapDocument, tilesets: TilesetsDocument, generation: number): void
  {
    const reapply = () =>
    {
      this.#applyTileset(map, tilesets, generation).catch(() => undefined);
    };

    this.#stops.push(
      map.subscribe(change =>
      {
        // only a new tileset id, or a whole new file, can change which sheets the map draws with.
        const changedTileset = change.kind === 'replaced'
          || (change.patch.kind === 'set' && change.patch.path[0] === 'tilesetId');
        if (changedTileset)
        {
          reapply();
        }
      }),
      tilesets.subscribe(() => reapply()),
    );
  }
}

export { MapViewController };
export type { DocumentOpener, MapImages };
