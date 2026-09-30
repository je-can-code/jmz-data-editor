import { isEditorDataName } from '../model/documentKeys.ts';
import { isJsonObject, type JsonValue } from '../model/json.ts';
import type { RmmzMap, RmmzMapInfo, RmmzTileset } from '../model/rmmzTypes.ts';

/**
 * The image folders the map editor draws from: tilesets, character sheets, faces, parallaxes and system sheets.
 */
type ImageFolder = 'tilesets' | 'characters' | 'faces' | 'parallaxes' | 'system';

/**
 * The audio folders RMMZ keeps sounds in.
 */
type AudioFolder = 'bgm' | 'bgs' | 'me' | 'se';

/**
 * The header every save carries with the saving window's id; the server repeats it on the change events the
 * save causes, so a window can tell its own saves from anyone else's.
 */
const CLIENT_HEADER = 'X-Jmz-Client';

/**
 * Every call the map editor makes to the server, behind one seam so tests can stand in for it. Nothing in the
 * map editor calls {@code fetch} directly.
 */
interface MapEditorApi
{
  /**
   * This window's id, sent with every save.
   */
  readonly clientId: string;

  /**
   * Reads a map file.
   * @param {number} mapId The map id.
   * @returns {Promise<RmmzMap>} The file's content.
   */
  loadMap(mapId: number): Promise<RmmzMap>;

  /**
   * Writes a map file, creating it when new.
   * @param {number} mapId The map id.
   * @param {RmmzMap} map The complete map, in its exact file shape.
   * @returns {Promise<void>} Settles once written.
   */
  saveMap(mapId: number, map: RmmzMap): Promise<void>;

  /**
   * Reads the map tree.
   * @returns {Promise<(RmmzMapInfo | null)[]>} The rows, index 0 null.
   */
  loadMapInfos(): Promise<(RmmzMapInfo | null)[]>;

  /**
   * Writes the map tree.
   * @param {readonly (RmmzMapInfo | null)[]} infos The complete array.
   * @returns {Promise<void>} Settles once written.
   */
  saveMapInfos(infos: readonly (RmmzMapInfo | null)[]): Promise<void>;

  /**
   * Reads the tilesets.
   * @returns {Promise<(RmmzTileset | null)[]>} The rows, index 0 null.
   */
  loadTilesets(): Promise<(RmmzTileset | null)[]>;

  /**
   * Writes the tilesets.
   * @param {readonly (RmmzTileset | null)[]} tilesets The complete array.
   * @returns {Promise<void>} Settles once written.
   */
  saveTilesets(tilesets: readonly (RmmzTileset | null)[]): Promise<void>;

  /**
   * Builds the address of a project image, for anything that loads images by URL.
   * @param {ImageFolder} folder The folder under {@code img/}.
   * @param {string} name The file name without {@code .png}.
   * @returns {string} The URL.
   */
  imageUrl(folder: ImageFolder, name: string): string;

  /**
   * Reads a project image.
   * @param {ImageFolder} folder The folder under {@code img/}.
   * @param {string} name The file name without {@code .png}.
   * @returns {Promise<Blob | null>} The image, or null when the file is missing.
   */
  loadImage(folder: ImageFolder, name: string): Promise<Blob | null>;

  /**
   * Lists the images in a folder, for pickers such as the face picker. Optional, so a client that cannot list
   * folders still serves everything else; a picker without it takes a typed name instead.
   * @param {ImageFolder} folder The folder under {@code img/}.
   * @returns {Promise<string[]>} The file names without {@code .png}, sorted; empty when the folder is missing.
   */
  listImages?(folder: ImageFolder): Promise<string[]>;

  /**
   * Builds the address of a project sound, for anything that plays sounds by URL.
   * @param {AudioFolder} folder The folder under {@code audio/}.
   * @param {string} name The file name without {@code .ogg}.
   * @returns {string} The URL.
   */
  audioUrl(folder: AudioFolder, name: string): string;

  /**
   * Reads a plugin's source, for its headers.
   * @param {string} path The plugin's path under {@code js/plugins/}, without {@code .js}; may hold subfolders.
   * @returns {Promise<string | null>} The source, or null when the file is missing.
   */
  loadPluginSource(path: string): Promise<string | null>;

  /**
   * Reads {@code js/plugins.js}, the list of installed plugins and whether each is enabled.
   * @returns {Promise<string>} The file's text.
   */
  loadPluginList(): Promise<string>;

  /**
   * Reads an editor-only document.
   * @param {string} key Its name: lowercase letters, digits and hyphens.
   * @returns {Promise<JsonValue | null>} The document, or null when none has been saved yet.
   */
  loadEditorData(key: string): Promise<JsonValue | null>;

  /**
   * Writes an editor-only document.
   * @param {string} key Its name: lowercase letters, digits and hyphens.
   * @param {JsonValue} document The complete document.
   * @returns {Promise<void>} Settles once written.
   */
  saveEditorData(key: string, document: JsonValue): Promise<void>;

  /**
   * Builds the address of the server's file-change stream.
   * @returns {string} The URL.
   */
  fileChangesUrl(): string;
}

/**
 * A request the server answered with something other than success.
 */
class MapEditorApiError extends Error
{
  /**
   * The HTTP status, or 0 when the answer was not understood at all.
   */
  readonly status: number;

  /**
   * @param {string} message What went wrong, naming the route.
   * @param {number} status The HTTP status.
   */
  constructor(message: string, status: number)
  {
    super(message);
    this.name = 'MapEditorApiError';
    this.status = status;
  }
}

/**
 * Options for the HTTP client.
 */
type HttpMapEditorApiOptions = {
  /**
   * The server's origin, such as {@code http://127.0.0.1:8080}.
   */
  apiBase: string;

  /**
   * This window's id.
   */
  clientId: string;

  /**
   * The fetch to use; the global one by default.
   */
  fetch?: typeof fetch;
};

/**
 * Encodes each segment of a path for a URL, keeping the slashes between them.
 * @param {string} path The path.
 * @returns {string} The encoded path.
 */
const encodePath = (path: string): string =>
{
  return path.split('/').map(segment => encodeURIComponent(segment)).join('/');
};

/**
 * Checks a map id before it becomes part of a URL.
 * @param {number} mapId The map id.
 * @returns {number} The same id.
 */
const requireMapId = (mapId: number): number =>
{
  if (Number.isInteger(mapId) === false || mapId < 1)
  {
    throw new MapEditorApiError(`a map id is a positive integer, not ${mapId}`, 0);
  }

  return mapId;
};

/**
 * Checks an editor-data key before it becomes part of a URL; the server would refuse anything else.
 * @param {string} key The key.
 * @returns {string} The same key.
 */
const requireEditorDataKey = (key: string): string =>
{
  if (isEditorDataName(key) === false)
  {
    throw new MapEditorApiError(`an editor-data key is lowercase letters, digits and hyphens, not "${key}"`, 0);
  }

  return key;
};

/**
 * The map editor's client for the Go server. JSON reads come back in the server's envelope
 * ({@code {path, error, data}}), which is unwrapped here; anything else is an error rather than a guess, so a
 * route that changed shape fails loudly on the first call instead of handing the editor {@code undefined}.
 * Saves are {@code PUT}s of the exact RMMZ shape, carrying this window's id.
 */
class HttpMapEditorApi implements MapEditorApi
{
  readonly clientId: string;

  #base: string;

  #fetch: typeof fetch;

  /**
   * @param {HttpMapEditorApiOptions} options Where the server is, and who this window is.
   */
  constructor(options: HttpMapEditorApiOptions)
  {
    this.#base = options.apiBase.replace(/\/+$/u, '');
    this.clientId = options.clientId;
    this.#fetch = options.fetch ?? ((input, init) => fetch(input, init));
  }

  async loadMap(mapId: number): Promise<RmmzMap>
  {
    return this.#getJson<RmmzMap>(`/api/maps/${requireMapId(mapId)}`);
  }

  async saveMap(mapId: number, map: RmmzMap): Promise<void>
  {
    return this.#put(`/api/maps/${requireMapId(mapId)}`, map);
  }

  async loadMapInfos(): Promise<(RmmzMapInfo | null)[]>
  {
    return this.#getJson<(RmmzMapInfo | null)[]>('/api/mapinfos');
  }

  async saveMapInfos(infos: readonly (RmmzMapInfo | null)[]): Promise<void>
  {
    return this.#put('/api/mapinfos', infos);
  }

  async loadTilesets(): Promise<(RmmzTileset | null)[]>
  {
    return this.#getJson<(RmmzTileset | null)[]>('/api/tilesets');
  }

  async saveTilesets(tilesets: readonly (RmmzTileset | null)[]): Promise<void>
  {
    return this.#put('/api/tilesets', tilesets);
  }

  imageUrl(folder: ImageFolder, name: string): string
  {
    return `${this.#base}/api/img/${encodeURIComponent(folder)}/${encodeURIComponent(name)}`;
  }

  async loadImage(folder: ImageFolder, name: string): Promise<Blob | null>
  {
    const response = await this.#fetch(this.imageUrl(folder, name), { method: 'GET' });
    if (response.status === 404)
    {
      return null;
    }

    await this.#requireOk(response, `GET img/${folder}/${name}`);
    return response.blob();
  }

  async listImages(folder: ImageFolder): Promise<string[]>
  {
    // the server leaves an empty list out of its envelope, as it does every empty answer.
    const names = await this.#getJson<string[] | undefined>(`/api/img/${encodeURIComponent(folder)}`);
    return names ?? [];
  }

  audioUrl(folder: AudioFolder, name: string): string
  {
    return `${this.#base}/api/audio/${encodeURIComponent(folder)}/${encodeURIComponent(name)}`;
  }

  async loadPluginSource(path: string): Promise<string | null>
  {
    const response = await this.#fetch(`${this.#base}/api/plugin-source/${encodePath(path)}`, { method: 'GET' });
    if (response.status === 404)
    {
      return null;
    }

    await this.#requireOk(response, `GET plugin-source/${path}`);
    return response.text();
  }

  async loadPluginList(): Promise<string>
  {
    const response = await this.#fetch(`${this.#base}/api/plugin-metadata`, { method: 'GET' });
    await this.#requireOk(response, 'GET plugin-metadata');
    return response.text();
  }

  async loadEditorData(key: string): Promise<JsonValue | null>
  {
    return this.#getJson<JsonValue>(`/api/editor-data/${requireEditorDataKey(key)}`, true);
  }

  async saveEditorData(key: string, document: JsonValue): Promise<void>
  {
    return this.#put(`/api/editor-data/${requireEditorDataKey(key)}`, document);
  }

  fileChangesUrl(): string
  {
    return `${this.#base}/api/file-changes`;
  }

  /**
   * Reads a JSON route and unwraps the server's envelope.
   * @param {string} route The route, from {@code /api} on.
   * @param {boolean} allowMissing True to answer null for a 404 instead of throwing.
   * @returns {Promise<T>} The envelope's data.
   */
  async #getJson<T>(route: string, allowMissing = false): Promise<T>
  {
    const response = await this.#fetch(`${this.#base}${route}`, { method: 'GET' });
    if (allowMissing && response.status === 404)
    {
      return null as T;
    }

    await this.#requireOk(response, `GET ${route}`);
    const text = await response.text();
    let envelope: unknown;
    try
    {
      envelope = JSON.parse(text);
    }
    catch
    {
      throw new MapEditorApiError(`GET ${route} did not answer with JSON`, response.status);
    }

    // the envelope names the project path; a body without one is some other shape entirely.
    if (isJsonObject(envelope) === false || typeof envelope['path'] !== 'string')
    {
      throw new MapEditorApiError(`GET ${route} did not answer in the API envelope`, response.status);
    }

    const { error, data } = envelope;
    if (typeof error === 'string' && error !== '')
    {
      throw new MapEditorApiError(`GET ${route}: ${error}`, response.status);
    }

    return data as T;
  }

  /**
   * Writes a whole document with a PUT, carrying this window's id.
   * @param {string} route The route, from {@code /api} on.
   * @param {unknown} body The complete document.
   * @returns {Promise<void>} Settles once the server confirms the write.
   */
  async #put(route: string, body: unknown): Promise<void>
  {
    const response = await this.#fetch(`${this.#base}${route}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        [CLIENT_HEADER]: this.clientId,
      },
      body: JSON.stringify(body),
    });
    await this.#requireOk(response, `PUT ${route}`);
  }

  /**
   * Throws, naming the route and the server's words, unless the response succeeded.
   * @param {Response} response The response.
   * @param {string} what The request, for the message.
   */
  async #requireOk(response: Response, what: string): Promise<void>
  {
    if (response.ok)
    {
      return;
    }

    const detail = (await response.text()).trim();
    throw new MapEditorApiError(`${what} answered ${response.status}${detail === '' ? '' : `: ${detail}`}`, response.status);
  }
}

export { CLIENT_HEADER, HttpMapEditorApi, MapEditorApiError };
export type { AudioFolder, HttpMapEditorApiOptions, ImageFolder, MapEditorApi };
