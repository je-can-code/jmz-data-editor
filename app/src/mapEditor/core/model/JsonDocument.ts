import type { DocumentKey } from './documentKeys.ts';
import { DocumentListeners, type DocumentListener, type EditorDocument } from './EditorDocument.ts';
import { cloneJson, type JsonValue } from './json.ts';
import {
  applyJsonPatch,
  createSetPatch,
  createSplicePatch,
  invertPatch,
  PatchConflictError,
  readAt,
  type Patch,
  type PatchPath,
} from './patches.ts';
import type { RmmzMapInfo, RmmzTileset } from './rmmzTypes.ts';

/**
 * A document whose whole content is one JSON value, changed by set and splice patches: the map tree, the
 * tilesets and every editor-only document. The content is kept in its file shape, so saving is a copy.
 */
class JsonDocument implements EditorDocument
{
  readonly key: DocumentKey;

  #content: JsonValue;

  #revision = 0;

  #listeners = new DocumentListeners();

  /**
   * @param {DocumentKey} key The document key.
   * @param {JsonValue} content The content in its file shape; it is copied, never shared.
   */
  constructor(key: DocumentKey, content: JsonValue)
  {
    this.key = key;
    this.#content = cloneJson(content);
  }

  get revision(): number
  {
    return this.#revision;
  }

  /**
   * The live content. Read it freely; change it only through patches.
   * @returns {JsonValue} The content.
   */
  get content(): JsonValue
  {
    return this.#content;
  }

  apply(patch: Patch): void
  {
    if (patch.kind !== 'set' && patch.kind !== 'splice')
    {
      throw new PatchConflictError(`a ${this.key} document has no tiles`, patch);
    }

    applyJsonPatch(this.#content, patch);
    this.#revision += 1;
    this.#listeners.notify({ kind: 'patched', key: this.key, patch, revision: this.#revision });
  }

  replace(content: JsonValue): void
  {
    this.#content = cloneJson(content);
    this.#revision += 1;
    this.#listeners.notify({ kind: 'replaced', key: this.key, revision: this.#revision });
  }

  valueAt(path: PatchPath): JsonValue | undefined
  {
    return readAt(this.#content, path);
  }

  toJson(): JsonValue
  {
    return cloneJson(this.#content);
  }

  toJsonWithout(patches: readonly Patch[]): JsonValue
  {
    const content = cloneJson(this.#content);

    // newest first, so each inverse finds exactly what its patch left.
    [ ...patches ].reverse().forEach(patch =>
    {
      const inverse = invertPatch(patch);
      if (inverse.kind === 'set' || inverse.kind === 'splice')
      {
        applyJsonPatch(content, inverse);
      }
    });

    return content;
  }

  subscribe(listener: DocumentListener): () => void
  {
    return this.#listeners.add(listener);
  }

  /**
   * Builds the patch that sets a value at a path, capturing what it replaces.
   * @param {PatchPath} path Where to write.
   * @param {JsonValue | undefined} value The new value, or undefined to remove the key.
   * @returns {Patch} The patch, not yet applied.
   */
  setPatch(path: PatchPath, value: JsonValue | undefined): Patch
  {
    return createSetPatch(this.#content, path, value);
  }

  /**
   * Builds the patch that splices an array at a path, capturing what it removes.
   * @param {PatchPath} path The array.
   * @param {number} index Where to start.
   * @param {number} deleteCount How many items to remove.
   * @param {readonly JsonValue[]} inserted What to insert.
   * @returns {Patch} The patch, not yet applied.
   */
  splicePatch(path: PatchPath, index: number, deleteCount: number, inserted: readonly JsonValue[]): Patch
  {
    return createSplicePatch(this.#content, path, index, deleteCount, inserted);
  }
}

/**
 * The map tree, {@code data/MapInfos.json}: one row per map, index is the map id, and index 0 is null.
 */
class MapInfosDocument extends JsonDocument
{
  /**
   * The live rows.
   * @returns {readonly (RmmzMapInfo | null)[]} The rows, by map id.
   */
  get infos(): readonly (RmmzMapInfo | null)[]
  {
    return this.content as unknown as (RmmzMapInfo | null)[];
  }

  /**
   * Reads one map's row.
   * @param {number} mapId The map id.
   * @returns {RmmzMapInfo | null} The row, or null when the map does not exist.
   */
  info(mapId: number): RmmzMapInfo | null
  {
    return this.infos[mapId] ?? null;
  }
}

/**
 * The tilesets, {@code data/Tilesets.json}: one row per tileset, index is the tileset id, and index 0 is null.
 */
class TilesetsDocument extends JsonDocument
{
  /**
   * The live rows.
   * @returns {readonly (RmmzTileset | null)[]} The rows, by tileset id.
   */
  get tilesets(): readonly (RmmzTileset | null)[]
  {
    return this.content as unknown as (RmmzTileset | null)[];
  }

  /**
   * Reads one tileset.
   * @param {number} tilesetId The tileset id.
   * @returns {RmmzTileset | null} The row, or null when it does not exist.
   */
  tileset(tilesetId: number): RmmzTileset | null
  {
    return this.tilesets[tilesetId] ?? null;
  }
}

export { JsonDocument, MapInfosDocument, TilesetsDocument };
