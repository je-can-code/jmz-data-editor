import { MapEditorApiError, type MapEditorApi } from '../../../src/mapEditor/core/api/MapEditorApi.ts';
import type { BlueprintUsesMerge, NamedPlacement } from '../../../src/mapEditor/core/blueprints/blueprintUsesWriter.ts';
import { isJsonObject, type JsonObject, type JsonValue } from '../../../src/mapEditor/core/model/json.ts';

/**
 * A merge on its way, held until the test lets it go, or fails it.
 */
type HeldMerge = {
  readonly merge: BlueprintUsesMerge;
  readonly release: () => void;
  readonly fail: (error: Error) => void;
};

/**
 * Lists a blueprint's placements on one map without the one at a corner.
 * @param {JsonValue[]} spots The placements.
 * @param {number} x The corner's column.
 * @param {number} y The corner's row.
 * @returns {JsonValue[]} The rest, in their order.
 */
const awayFromCorner = (spots: readonly JsonValue[], x: number, y: number): JsonValue[] =>
{
  return spots.filter(spot => (isJsonObject(spot) && spot['x'] === x && spot['y'] === y) === false);
};

/**
 * Writes one placement named on its own as an entry lists it.
 * @param {NamedPlacement} placement The placement.
 * @returns {JsonObject} The placement as written.
 */
const spotOf = (placement: NamedPlacement): JsonObject =>
{
  const { x, y, placed } = placement;
  return placed === undefined
    ? { x, y }
    : { x, y, placed: { x: placed.x, y: placed.y, width: placed.width, height: placed.height } };
};

/**
 * Orders an entry's blueprints by id, the way the server keeps them.
 * @param {JsonObject} entry The entry.
 * @returns {JsonObject} The same blueprints, in order.
 */
const sortedEntry = (entry: JsonObject): JsonObject =>
{
  return Object.fromEntries(Object.keys(entry).sort().map(key => [ key, entry[key] ]));
};

/**
 * Merges one merge into the record as a file holds it, the way the server does (see the server's blueprintuses
 * package): the maps given whole first, then the placements taken out, then those put in; every map named nowhere left
 * exactly as it was, and the record raised to the merge's version. A project with no record is given none while the
 * merge leaves nothing to record.
 * @param {JsonValue | null} stored The record as the file holds it, or null for none yet.
 * @param {BlueprintUsesMerge} merge The merge.
 * @returns {JsonObject | null} The record as the file holds it after, or null while there is still no file.
 * @throws {MapEditorApiError} A 500 for a file that is no record of placements, and a 409 for a record of a newer
 * version than the merge's.
 */
const mergeInto = (stored: JsonValue | null, merge: BlueprintUsesMerge): JsonObject | null =>
{
  const readable = stored === null
    || (isJsonObject(stored) && isJsonObject(stored['data']) && isJsonObject(stored['data']['maps']));
  if (readable === false)
  {
    const words = 'jmz-editor/blueprint-uses.json is not a record of placements, so it is never written over';
    throw new MapEditorApiError(`PUT /api/editor-data/blueprint-uses/maps answered 500: ${words}`, 500, words);
  }

  const record = structuredClone(stored ?? { schemaVersion: merge.schemaVersion, data: { maps: {} } }) as {
    schemaVersion: number;
    data: { maps: Record<string, JsonObject> };
  };
  if (record.schemaVersion > merge.schemaVersion)
  {
    const words = `jmz-editor/blueprint-uses.json was written by a newer editor (version ${record.schemaVersion})`;
    throw new MapEditorApiError(`PUT /api/editor-data/blueprint-uses/maps answered 409: ${words}`, 409, words);
  }

  const { maps } = record.data;
  Object.entries(merge.maps ?? {}).forEach(([ mapKey, entry ]) =>
  {
    if (entry === null || Object.keys(entry).length === 0)
    {
      delete maps[mapKey];
      return;
    }

    maps[mapKey] = structuredClone(entry);
  });

  (merge.remove ?? []).forEach(({ map, blueprint, x, y }) =>
  {
    const entry = maps[String(map)];
    const spots = entry?.[blueprint];
    if (Array.isArray(spots) === false)
    {
      return;
    }

    const left = awayFromCorner(spots as JsonValue[], x, y);
    if (left.length > 0)
    {
      entry[blueprint] = left;
      return;
    }

    delete entry[blueprint];
    if (Object.keys(entry).length === 0)
    {
      delete maps[String(map)];
    }
  });

  (merge.add ?? []).forEach(placement =>
  {
    const entry = maps[String(placement.map)] ?? {};
    const spots = [ ...awayFromCorner((entry[placement.blueprint] ?? []) as JsonValue[], placement.x, placement.y), spotOf(placement) ];
    spots.sort((left, right) => ((left as JsonObject)['y'] as number) - ((right as JsonObject)['y'] as number)
      || ((left as JsonObject)['x'] as number) - ((right as JsonObject)['x'] as number));
    maps[String(placement.map)] = sortedEntry({ ...entry, [placement.blueprint]: spots });
  });

  // no file is started to hold nothing.
  if (stored === null && Object.keys(maps).length === 0)
  {
    return null;
  }

  record.schemaVersion = merge.schemaVersion;
  return record as unknown as JsonObject;
};

/**
 * The record of where blueprints are placed, as a server keeps it on disk: read back as the editor-data route hands it
 * out, and changed only by merges, each of which it keeps a list of. A test can hold merges on their way, to land two at
 * once or to make one wait, and fail them.
 */
class UsesServer
{
  /**
   * The record as its file holds it, or null while there is no file.
   */
  stored: JsonValue | null;

  /**
   * Every merge asked for, in the order asked, landed or not.
   */
  readonly merges: BlueprintUsesMerge[] = [];

  /**
   * Merges held on their way, oldest first.
   */
  readonly held: HeldMerge[] = [];

  /**
   * Whether merges wait to be let go.
   */
  holding = false;

  /**
   * The error the next merge fails with, or null for none.
   */
  failNext: Error | null = null;

  /**
   * @param {JsonValue | null} stored The record its file starts holding, or null for none.
   */
  constructor(stored: JsonValue | null = null)
  {
    this.stored = structuredClone(stored);
  }

  /**
   * The server as the editor reaches it, for the record alone.
   * @returns {Pick<MapEditorApi, 'loadEditorData' | 'mergeBlueprintUses'>} The client.
   */
  get api(): Pick<MapEditorApi, 'loadEditorData' | 'mergeBlueprintUses'>
  {
    return {
      loadEditorData: async (name: string) =>
      {
        if (name !== 'blueprint-uses')
        {
          throw new Error(`this server keeps no ${name}`);
        }

        return structuredClone(this.stored);
      },
      mergeBlueprintUses: (merge: BlueprintUsesMerge) => this.#merge(merge),
    };
  }

  /**
   * Reads the placements one map holds in the file, as written.
   * @param {number} mapId The map.
   * @returns {JsonValue | undefined} Its entry, or undefined for none.
   */
  entryOf(mapId: number): JsonValue | undefined
  {
    const maps = isJsonObject(this.stored) && isJsonObject(this.stored['data']) ? this.stored['data']['maps'] : undefined;
    return isJsonObject(maps) ? maps[String(mapId)] : undefined;
  }

  /**
   * Lets every merge on its way land, oldest first, and stops holding them.
   */
  releaseAll(): void
  {
    this.holding = false;
    this.held.splice(0).forEach(each => each.release());
  }

  /**
   * Merges into the file now, or once let go while holding; a merge the file refuses rejects, as the client's request
   * does, and never throws.
   * @param {BlueprintUsesMerge} merge The merge.
   * @returns {Promise<void>} Settles once landed.
   */
  async #merge(merge: BlueprintUsesMerge): Promise<void>
  {
    const copy = structuredClone(merge);
    this.merges.push(copy);
    const failure = this.failNext;
    this.failNext = null;
    if (failure !== null)
    {
      throw failure;
    }

    if (this.holding === false)
    {
      this.stored = mergeInto(this.stored, copy);
      return;
    }

    await new Promise<void>((resolve, reject) =>
    {
      this.held.push({
        merge: copy,
        release: () =>
        {
          try
          {
            this.stored = mergeInto(this.stored, copy);
            resolve();
          }
          catch (error)
          {
            reject(error);
          }
        },
        fail: reject,
      });
    });
  }
}

export { mergeInto, UsesServer };
