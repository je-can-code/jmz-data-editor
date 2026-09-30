import type { ImageFolder, MapEditorApi } from '../core/api/MapEditorApi.ts';
import type { RmmzTileset } from '../core/model/rmmzTypes.ts';
import type { TextureImage, TextureSource } from '../core/renderer/MapRenderer.ts';
import { decodeTextureImage } from './textureImages.ts';

/**
 * Loads project images for renderers, decoded once and shared by every map view in the window: a map opened a second
 * time, or in a second pane, finds its tileset and character sheets already decoded.
 */
class ProjectImages implements TextureSource
{
  #api: MapEditorApi;

  #decode: (blob: Blob) => Promise<TextureImage>;

  #images = new Map<string, Promise<TextureImage | null>>();

  /**
   * @param {MapEditorApi} api Where images come from.
   * @param {(blob: Blob) => Promise<TextureImage>} decode Turns a file into an image.
   */
  constructor(api: MapEditorApi, decode: (blob: Blob) => Promise<TextureImage> = decodeTextureImage)
  {
    this.#api = api;
    this.#decode = decode;
  }

  image(folder: ImageFolder, name: string): Promise<TextureImage | null>
  {
    const key = `${folder}/${name}`;
    const cached = this.#images.get(key);
    if (cached !== undefined)
    {
      return cached;
    }

    const loading = this.#api.loadImage(folder, name)
      .then(blob => (blob === null ? null : this.#decode(blob)));

    // a failed load is not remembered, so the next request tries again.
    loading.catch(() => this.#images.delete(key));
    this.#images.set(key, loading);
    return loading;
  }

  /**
   * Loads a tileset's nine sheets.
   * @param {RmmzTileset} tileset The tileset.
   * @returns {Promise<(TextureImage | null)[]>} The sheets in RMMZ order, null where the tileset names none or the
   * file is missing.
   */
  tilesetSheets(tileset: RmmzTileset): Promise<(TextureImage | null)[]>
  {
    return Promise.all(tileset.tilesetNames.map(name => (name === '' ? Promise.resolve(null) : this.image('tilesets', name))));
  }
}

/**
 * One image cache per server client, so every view in a window shares one.
 */
const caches = new WeakMap<MapEditorApi, ProjectImages>();

/**
 * Finds the window's image cache for a server client.
 * @param {MapEditorApi} api The client.
 * @returns {ProjectImages} The cache.
 */
const projectImagesFor = (api: MapEditorApi): ProjectImages =>
{
  const existing = caches.get(api);
  if (existing !== undefined)
  {
    return existing;
  }

  const created = new ProjectImages(api);
  caches.set(api, created);
  return created;
};

export { ProjectImages, projectImagesFor };
