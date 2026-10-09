import { mapIdOfDocument, type MapDocumentKey } from './documentKeys.ts';
import { DocumentListeners, type DocumentListener, type EditorDocument } from './EditorDocument.ts';
import { cloneJson, isJsonObject, jsonEquals, type JsonValue } from './json.ts';
import {
  applyJsonPatch,
  createSetPatch,
  createSplicePatch,
  invertPatch,
  PatchConflictError,
  readAt,
  type MapTiles,
  type Patch,
  type PatchPath,
  type ResizePatch,
  type TilesPatch,
} from './patches.ts';
import { patchesBetween } from './patchesBetween.ts';
import type { RmmzMap, RmmzMapEvent, RmmzMapProperties } from './rmmzTypes.ts';

/**
 * How many layers a map's tile data holds: four tile layers, then shadows, then regions.
 */
const MAP_LAYER_COUNT = 6;

/**
 * The layer indexes inside a map's tile data.
 */
const MapLayer = {
  tiles1: 0,
  tiles2: 1,
  tiles3: 2,
  tiles4: 3,
  shadow: 4,
  region: 5,
} as const;

/**
 * The largest value one cell can hold. Every RMMZ tile id is below 8192, and shadows and regions are smaller
 * still, so the cells live in a {@link Uint16Array}; anything that would not fit is refused on load.
 */
const MAX_CELL_VALUE = 0xffff;

/**
 * The top-level fields only a tiles or resize patch may change, because they must move with the tile array.
 */
const TILE_OWNED_FIELDS: ReadonlySet<string> = new Set([ 'data', 'width', 'height' ]);

/**
 * The map's own JSON with the tile data taken out: every property, plus the sparse event list.
 */
type MapRoot = RmmzMapProperties & { events: (RmmzMapEvent | null)[] };

/**
 * Checks and copies a tile array into the typed array the document keeps.
 * @param {readonly number[]} data The flattened six layers.
 * @param {number} width The map's width in tiles.
 * @param {number} height The map's height in tiles.
 * @returns {Uint16Array} The cells.
 */
const toCells = (data: readonly number[], width: number, height: number): Uint16Array =>
{
  if (Number.isInteger(width) === false || Number.isInteger(height) === false || width < 0 || height < 0)
  {
    throw new Error(`a map is a whole number of tiles wide and high, not ${width}x${height}`);
  }

  const expected = width * height * MAP_LAYER_COUNT;
  if (Array.isArray(data) === false || data.length !== expected)
  {
    throw new Error(`a ${width}x${height} map holds ${expected} cells, not ${Array.isArray(data) ? data.length : 'none'}`);
  }

  // refuse any value the typed array would silently wrap or truncate.
  const cells = new Uint16Array(expected);
  for (let index = 0; index < expected; index++)
  {
    const value = data[index];
    if (Number.isInteger(value) === false || value < 0 || value > MAX_CELL_VALUE)
    {
      throw new Error(`cell ${index} holds ${String(value)}, which is not a tile id`);
    }

    cells[index] = value;
  }

  return cells;
};

/**
 * One map, live and editable: its size, tileset, the six layers as a typed array, its events as the sparse
 * list RMMZ stores, and every other property. It is built from a map file and turns back into exactly that
 * file, field for field, which is the promise every save depends on.
 *
 * Tiles change through {@link TilesPatch} and {@link ResizePatch}; everything else changes through set and
 * splice patches addressed by the file's own paths ({@code ['events', 5, 'pages', 0, 'trigger']}).
 */
class MapDocument implements EditorDocument
{
  readonly key: MapDocumentKey;

  /**
   * The map id the key names, read once, since tools ask for it at every turn and the key never changes.
   */
  #mapId: number;

  #root: MapRoot;

  #cells: Uint16Array;

  #revision = 0;

  #listeners = new DocumentListeners();

  /**
   * @param {MapDocumentKey} key The document key.
   * @param {MapRoot} root The map's fields and events, already copied.
   * @param {Uint16Array} cells The tile data, already checked.
   */
  constructor(key: MapDocumentKey, root: MapRoot, cells: Uint16Array)
  {
    this.key = key;

    // a map document's key always names a map, so it always has a map id.
    this.#mapId = mapIdOfDocument(key) as number;
    this.#root = root;
    this.#cells = cells;
  }

  /**
   * Builds a document from a map file's JSON, copying it so the caller's object is never shared.
   * @param {MapDocumentKey} key The document key.
   * @param {RmmzMap} json The map file's content.
   * @returns {MapDocument} The document.
   */
  static fromJson(key: MapDocumentKey, json: RmmzMap): MapDocument
  {
    const { root, cells } = MapDocument.#split(json);
    return new MapDocument(key, root, cells);
  }

  /**
   * Separates a map file into the root the document keeps and its checked cells.
   * @param {RmmzMap} json The map file's content.
   * @returns {{ root: MapRoot, cells: Uint16Array }} The two halves.
   */
  static #split(json: RmmzMap): { root: MapRoot; cells: Uint16Array }
  {
    if (isJsonObject(json) === false || Array.isArray(json.events) === false)
    {
      throw new Error('a map file is an object with an events list');
    }

    const cells = toCells(json.data, json.width, json.height);

    // copy everything but the tile data, which now lives in the typed array.
    const { data: _data, ...rest } = json;
    return { root: cloneJson(rest), cells };
  }

  /**
   * The map id this document edits: a map's own, or, for a blueprint opened as a map, the id below zero that names it.
   * @returns {number} The id.
   */
  get mapId(): number
  {
    return this.#mapId;
  }

  get revision(): number
  {
    return this.#revision;
  }

  /**
   * The map's width in tiles.
   * @returns {number} The width.
   */
  get width(): number
  {
    return this.#root.width;
  }

  /**
   * The map's height in tiles.
   * @returns {number} The height.
   */
  get height(): number
  {
    return this.#root.height;
  }

  /**
   * The tileset the map draws with.
   * @returns {number} The tileset id.
   */
  get tilesetId(): number
  {
    return this.#root.tilesetId;
  }

  /**
   * The live tile data, in RMMZ's layout. Read it freely; change it only through patches, or no listener
   * hears the change and no history can undo it.
   * @returns {Uint16Array} The cells.
   */
  get cells(): Uint16Array
  {
    return this.#cells;
  }

  /**
   * The live event list: index is the event id, and empty slots are null.
   * @returns {readonly (RmmzMapEvent | null)[]} The events.
   */
  get events(): readonly (RmmzMapEvent | null)[]
  {
    return this.#root.events;
  }

  /**
   * Reads one of the map's properties.
   * @param {K} name The property.
   * @returns {RmmzMapProperties[K]} Its live value.
   */
  property<K extends keyof RmmzMapProperties>(name: K): RmmzMapProperties[K]
  {
    return this.#root[name];
  }

  /**
   * Finds where a cell sits in the flattened tile data.
   * @param {number} x The column.
   * @param {number} y The row.
   * @param {number} z The layer, 0 to 5 (see {@link MapLayer}).
   * @returns {number} The flat index.
   */
  cellIndex(x: number, y: number, z: number): number
  {
    return (z * this.height + y) * this.width + x;
  }

  /**
   * Reads one cell.
   * @param {number} x The column.
   * @param {number} y The row.
   * @param {number} z The layer, 0 to 5.
   * @returns {number} The tile id, shadow bits or region id there; 0 outside the map.
   */
  cellAt(x: number, y: number, z: number): number
  {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height || z < 0 || z >= MAP_LAYER_COUNT)
    {
      return 0;
    }

    return this.#cells[this.cellIndex(x, y, z)];
  }

  /**
   * Reads one event.
   * @param {number} id The event id.
   * @returns {RmmzMapEvent | null} The live event, or null when the slot is empty or beyond the list.
   */
  event(id: number): RmmzMapEvent | null
  {
    return this.#root.events[id] ?? null;
  }

  /**
   * Lists the ids of every event on the map, in id order.
   * @returns {number[]} The ids.
   */
  eventIds(): number[]
  {
    const ids: number[] = [];
    this.#root.events.forEach((event, id) =>
    {
      if (event !== null)
      {
        ids.push(id);
      }
    });

    return ids;
  }

  /**
   * Names the id a new event takes: the slot just past the end of the list, never an empty slot inside it. A slot a
   * delete emptied keeps its id unused for good, because a self switch in a save, a command in another event or a
   * plugin's parameters may still name that id, and a new event there would answer for the one that was deleted.
   * Slot 0 is never used.
   * @returns {number} The id a new event would take.
   */
  nextFreeEventId(): number
  {
    return Math.max(this.#root.events.length, 1);
  }

  valueAt(path: PatchPath): JsonValue | undefined
  {
    // the tile data is part of the file's shape even though the document keeps it apart.
    if (path.length > 0 && path[0] === 'data')
    {
      return readAt({ data: Array.from(this.#cells) }, path);
    }

    return readAt(this.#root, path);
  }

  apply(patch: Patch): void
  {
    switch (patch.kind)
    {
      case 'tiles':
        this.#applyTiles(patch);
        break;
      case 'resize':
        this.#applyResize(patch);
        break;
      default:
        // tile data and size move together, so only tile patches may touch them.
        if (patch.path.length === 0 || TILE_OWNED_FIELDS.has(String(patch.path[0])))
        {
          throw new PatchConflictError('tile data and map size change through tiles and resize patches', patch);
        }

        applyJsonPatch(this.#root, patch);
        break;
    }

    this.#revision += 1;
    this.#listeners.notify({ kind: 'patched', key: this.key, patch, revision: this.#revision });
  }

  /**
   * Checks a tiles patch against the current cells, then writes it.
   * @param {TilesPatch} patch The change.
   */
  #applyTiles(patch: TilesPatch): void
  {
    const { indices, before, after } = patch;
    if (indices.length !== before.length || indices.length !== after.length)
    {
      throw new PatchConflictError('a tiles patch needs one before and one after value per cell', patch);
    }

    // check every cell before writing any, so a conflict leaves the map untouched.
    for (let position = 0; position < indices.length; position++)
    {
      const index = indices[position];
      const value = after[position];
      if (Number.isInteger(index) === false || index < 0 || index >= this.#cells.length)
      {
        throw new PatchConflictError(`cell ${index} is outside the map`, patch);
      }

      if (this.#cells[index] !== before[position])
      {
        throw new PatchConflictError(`cell ${index} no longer holds the tile this change replaced`, patch);
      }

      if (Number.isInteger(value) === false || value < 0 || value > MAX_CELL_VALUE)
      {
        throw new PatchConflictError(`cell ${index} cannot hold ${value}`, patch);
      }
    }

    for (let position = 0; position < indices.length; position++)
    {
      this.#cells[indices[position]] = after[position];
    }
  }

  /**
   * Checks a resize patch against the current size and cells, then swaps both.
   * @param {ResizePatch} patch The change.
   */
  #applyResize(patch: ResizePatch): void
  {
    const current: MapTiles = { width: this.width, height: this.height, data: Array.from(this.#cells) };
    if (jsonEquals(current, patch.before) === false)
    {
      throw new PatchConflictError('the map no longer has the size and tiles this resize replaced', patch);
    }

    const { width, height, data } = patch.after;
    this.#cells = toCells(data, width, height);
    this.#root.width = width;
    this.#root.height = height;
  }

  replace(content: JsonValue): void
  {
    const { root, cells } = MapDocument.#split(content as unknown as RmmzMap);
    this.#root = root;
    this.#cells = cells;
    this.#revision += 1;
    this.#listeners.notify({ kind: 'replaced', key: this.key, revision: this.#revision });
  }

  /**
   * Produces the map file, field for field.
   * @returns {RmmzMap} An independent copy, ready to save.
   */
  toJson(): RmmzMap
  {
    const { events, ...properties } = cloneJson(this.#root);
    return { ...properties, data: Array.from(this.#cells), events };
  }

  toJsonWithout(patches: readonly Patch[]): RmmzMap
  {
    const file = this.toJson();

    // newest first, so each inverse finds exactly what its patch left; tiles live in the file's data array here.
    [ ...patches ].reverse().forEach(patch =>
    {
      const inverse = invertPatch(patch);
      switch (inverse.kind)
      {
        case 'tiles':
          inverse.indices.forEach((index, position) =>
          {
            file.data[index] = inverse.after[position];
          });
          break;
        case 'resize':
          file.width = inverse.after.width;
          file.height = inverse.after.height;
          file.data = [ ...inverse.after.data ];
          break;
        default:
          applyJsonPatch(file, inverse);
          break;
      }
    });

    return file;
  }

  /**
   * Works out the patches that turn this map into another file of it. The tiles change by one tiles patch naming
   * only the cells that differ, or by one resize when the size changed too, since size and tiles move together; every
   * other field, and the events, change by sets and splices reaching down only to what differs.
   * @param {JsonValue} content The other file.
   * @returns {Patch[]} The patches, tiles first; empty when the two are the same.
   * @throws {Error} When the content is not a map file, or holds a cell that is not a tile id.
   */
  patchesTo(content: JsonValue): Patch[]
  {
    // splitting the file checks it is a map at all, cells included, before anything is compared.
    const next = MapDocument.#split(content as unknown as RmmzMap);
    const tiles = this.#tilePatchesTo(next.root.width, next.root.height, next.cells);

    // the size moves only with the tiles, so it stays out of the fields compared; both sides are objects, so a
    // patch can always say how they differ.
    const { width: _width, height: _height, ...fields } = this.#root;
    const { width: _nextWidth, height: _nextHeight, ...nextFields } = next.root;
    const fieldPatches = patchesBetween(fields as unknown as JsonValue, nextFields as unknown as JsonValue) as Patch[];
    return [ ...tiles, ...fieldPatches ];
  }

  /**
   * Works out how this map's tiles become another set of tiles: one resize when the size differs, otherwise one tiles
   * patch naming the cells that differ, or nothing when none does.
   * @param {number} width The other width.
   * @param {number} height The other height.
   * @param {Uint16Array} cells The other cells, already checked.
   * @returns {Patch[]} The patch, or none.
   */
  #tilePatchesTo(width: number, height: number, cells: Uint16Array): Patch[]
  {
    if (width !== this.width || height !== this.height)
    {
      return [ this.resizePatch({ width, height, data: Array.from(cells) }) ];
    }

    const changed: [ number, number ][] = [];
    cells.forEach((value, index) =>
    {
      if (this.#cells[index] !== value)
      {
        changed.push([ index, value ]);
      }
    });

    return changed.length === 0
      ? []
      : [ this.tilesPatch(changed) ];
  }

  subscribe(listener: DocumentListener): () => void
  {
    return this.#listeners.add(listener);
  }

  /**
   * Builds the patch that puts an event into its slot: a set when the slot exists, or a splice that grows the
   * list with empty slots up to it, which is the only way to grow it that reverses exactly.
   * @param {RmmzMapEvent} event The event; its id names the slot.
   * @returns {Patch} The patch, not yet applied.
   */
  placeEventPatch(event: RmmzMapEvent): Patch
  {
    const { events } = this.#root;
    const eventJson = event as unknown as JsonValue;
    if (event.id < events.length)
    {
      return createSetPatch(this.#root, [ 'events', event.id ], eventJson);
    }

    const gap: JsonValue[] = new Array(event.id - events.length).fill(null);
    return createSplicePatch(this.#root, [ 'events' ], events.length, 0, [ ...gap, eventJson ]);
  }

  /**
   * Builds the patch that empties an event's slot, leaving the list its length as MZ does.
   * @param {number} id The event id.
   * @returns {Patch} The patch, not yet applied.
   */
  removeEventPatch(id: number): Patch
  {
    return createSetPatch(this.#root, [ 'events', id ], null);
  }

  /**
   * Builds the patch that sets any value at a path, capturing what it replaces.
   * @param {PatchPath} path Where to write.
   * @param {JsonValue | undefined} value The new value, or undefined to remove the key.
   * @returns {Patch} The patch, not yet applied.
   */
  setPatch(path: PatchPath, value: JsonValue | undefined): Patch
  {
    return createSetPatch(this.#root, path, value);
  }

  /**
   * Builds the patch that changes cells, capturing what each held. Cells that would not change are left out.
   * @param {Iterable<readonly [ number, number ]>} cells Pairs of flat index and new value.
   * @returns {TilesPatch} The patch, not yet applied.
   */
  tilesPatch(cells: Iterable<readonly [ number, number ]>): TilesPatch
  {
    const indices: number[] = [];
    const before: number[] = [];
    const after: number[] = [];
    const seen = new Set<number>();
    for (const [ index, value ] of cells)
    {
      // one cell once, and only when it actually changes.
      if (seen.has(index) || this.#cells[index] === value)
      {
        continue;
      }

      seen.add(index);
      indices.push(index);
      before.push(this.#cells[index]);
      after.push(value);
    }

    return { kind: 'tiles', indices, before, after };
  }

  /**
   * Builds the patch that gives the map a new size and tile array.
   * @param {MapTiles} next The new size and the full tile data for it.
   * @returns {ResizePatch} The patch, not yet applied.
   */
  resizePatch(next: MapTiles): ResizePatch
  {
    return {
      kind: 'resize',
      before: { width: this.width, height: this.height, data: Array.from(this.#cells) },
      after: { width: next.width, height: next.height, data: [ ...next.data ] },
    };
  }
}

export { MAP_LAYER_COUNT, MapDocument, MapLayer };
export type { MapRoot };
