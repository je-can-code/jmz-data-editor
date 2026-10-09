import { MapEditorApiError, type MapEditorApi } from '../api/MapEditorApi.ts';
import { BLUEPRINT_USES } from '../editorData/editorData.ts';
import type { JsonObject } from '../model/json.ts';
import { mapEntryOf, sameSpot, sameSpots, type BlueprintSpot, type PlacedPart } from './blueprintUses.ts';

/**
 * One placement named on its own in a merge: its map, its blueprint and its corner, and, for one put in, its part placed
 * when the map's edge cut it off.
 */
type NamedPlacement = {
  readonly map: number;
  readonly blueprint: string;
  readonly x: number;
  readonly y: number;
  readonly placed?: PlacedPart;
};

/**
 * What the server merges into the record of where blueprints are placed, as it stands on disk at that moment (PUT
 * /api/editor-data/blueprint-uses/maps): the maps named in {@code maps} take the placements given, a map given null taking
 * its entry out; then each placement in {@code remove} goes from its map, wherever the file holds it; then each in
 * {@code add} goes into its map, in place of its blueprint's at the same corner. Every map named nowhere stays exactly as
 * the file holds it, which is what lets two windows save two maps at once.
 */
type BlueprintUsesMerge = {
  readonly schemaVersion: number;
  readonly maps?: Readonly<Record<string, JsonObject | null>>;
  readonly remove?: readonly NamedPlacement[];
  readonly add?: readonly NamedPlacement[];
};

/**
 * What one map owes the disk: its placements whole, as a save of the map or the map tree writes them; or single
 * placements to take out and put in, as forgetting one, or taking that back, writes, touching nothing else of the map.
 */
type OwedMap =
  | { readonly kind: 'whole'; readonly spots: readonly BlueprintSpot[] }
  | { readonly kind: 'single'; readonly removed: readonly BlueprintSpot[]; readonly added: readonly BlueprintSpot[] };

/**
 * Lists the spots not at any of some spots' corners.
 * @param {readonly BlueprintSpot[]} spots The spots.
 * @param {readonly BlueprintSpot[]} corners The spots whose corners go.
 * @returns {BlueprintSpot[]} The spots left, in their order.
 */
const awayFrom = (spots: readonly BlueprintSpot[], corners: readonly BlueprintSpot[]): BlueprintSpot[] =>
{
  return spots.filter(spot => corners.some(corner => sameSpot(corner, spot)) === false);
};

/**
 * Adds to what a map owes the disk the taking out of some placements: a map owing its placements whole owes them without
 * these, and one owing single placements owes these taken out too, any of them it was to put in no longer put in.
 * @param {OwedMap | undefined} owed What the map owed, or undefined for nothing.
 * @param {readonly BlueprintSpot[]} removed The placements taken out.
 * @returns {OwedMap} What it owes now.
 */
const withRemoved = (owed: OwedMap | undefined, removed: readonly BlueprintSpot[]): OwedMap =>
{
  if (owed === undefined)
  {
    return { kind: 'single', removed: [ ...removed ], added: [] };
  }

  return owed.kind === 'whole'
    ? { kind: 'whole', spots: awayFrom(owed.spots, removed) }
    : { kind: 'single', removed: [ ...awayFrom(owed.removed, removed), ...removed ], added: awayFrom(owed.added, removed) };
};

/**
 * Adds to what a map owes the disk the putting in of some placements, each in place of any at its corner.
 * @param {OwedMap | undefined} owed What the map owed, or undefined for nothing.
 * @param {readonly BlueprintSpot[]} added The placements put in.
 * @returns {OwedMap} What it owes now.
 */
const withAdded = (owed: OwedMap | undefined, added: readonly BlueprintSpot[]): OwedMap =>
{
  if (owed === undefined)
  {
    return { kind: 'single', removed: [], added: [ ...added ] };
  }

  return owed.kind === 'whole'
    ? { kind: 'whole', spots: [ ...awayFrom(owed.spots, added), ...added ] }
    : { kind: 'single', removed: awayFrom(owed.removed, added), added: [ ...awayFrom(owed.added, added), ...added ] };
};

/**
 * Works out what a map owes the disk when something it owed is followed by something newer: placements given whole replace
 * everything before them, and single ones go on top.
 * @param {OwedMap | undefined} earlier What it owed first, or undefined for nothing.
 * @param {OwedMap} later What it owes since.
 * @returns {OwedMap} What it owes in all.
 */
const followedBy = (earlier: OwedMap | undefined, later: OwedMap): OwedMap =>
{
  return later.kind === 'whole'
    ? later
    : withAdded(withRemoved(earlier, later.removed), later.added);
};

/**
 * Works out a map's placements on disk once what it owes has landed.
 * @param {readonly BlueprintSpot[]} spots Its placements on disk before.
 * @param {OwedMap} owed What it owes.
 * @returns {BlueprintSpot[]} Its placements on disk after.
 */
const landed = (spots: readonly BlueprintSpot[], owed: OwedMap): BlueprintSpot[] =>
{
  return owed.kind === 'whole'
    ? [ ...owed.spots ]
    : [ ...awayFrom(spots, [ ...owed.removed, ...owed.added ]), ...owed.added ];
};

/**
 * Names one placement on its own, for a merge.
 * @param {number} mapId Its map.
 * @param {BlueprintSpot} spot The placement.
 * @param {boolean} withPart True to say the part placed, as a placement put in does; one taken out goes by its corner.
 * @returns {NamedPlacement} The placement named.
 */
const named = (mapId: number, spot: BlueprintSpot, withPart: boolean): NamedPlacement =>
{
  const { blueprintId, x, y, placed } = spot;
  return withPart && placed !== undefined
    ? { map: mapId, blueprint: blueprintId, x, y, placed: { x: placed.x, y: placed.y, width: placed.width, height: placed.height } }
    : { map: mapId, blueprint: blueprintId, x, y };
};

/**
 * Builds the merge that writes everything some maps owe, stamped with the version of the record's shape this editor
 * writes.
 * @param {ReadonlyMap<number, OwedMap>} owed What each map owes.
 * @returns {BlueprintUsesMerge} The merge.
 */
const mergeOf = (owed: ReadonlyMap<number, OwedMap>): BlueprintUsesMerge =>
{
  const maps: Record<string, JsonObject | null> = {};
  const remove: NamedPlacement[] = [];
  const add: NamedPlacement[] = [];
  owed.forEach((owing, mapId) =>
  {
    if (owing.kind === 'whole')
    {
      maps[String(mapId)] = mapEntryOf(owing.spots) ?? null;
      return;
    }

    owing.removed.forEach(spot => remove.push(named(mapId, spot, false)));
    owing.added.forEach(spot => add.push(named(mapId, spot, true)));
  });

  return {
    schemaVersion: BLUEPRINT_USES.schemaVersion,
    ...(Object.keys(maps).length > 0 ? { maps } : {}),
    ...(remove.length > 0 ? { remove } : {}),
    ...(add.length > 0 ? { add } : {}),
  };
};

/**
 * Words why a write failed, in the server's own words when it gave any.
 * @param {unknown} error What the write threw.
 * @returns {string} The words.
 */
const reasonOf = (error: unknown): string =>
{
  if (error instanceof MapEditorApiError && error.detail !== '')
  {
    return error.detail;
  }

  return error instanceof Error
    ? error.message
    : String(error);
};

/**
 * Writes the record of where blueprints are placed to disk a map at a time, merged there into the file as it stands (see
 * {@link BlueprintUsesMerge}), and keeps what the file holds as far as this window knows: as read from disk, with every
 * write of this window's put on top as it lands.
 *
 * One merge is on its way at a time. Whatever is asked for meanwhile waits, each map's owing gathered into one (see
 * {@link followedBy}), and goes in the next merge, so a map's placements are never written out of order. A merge that
 * fails gives its owing back, under anything owed since, and the author hears why; it is tried again with the next write
 * asked for, since nothing else would ever carry it to disk.
 */
class BlueprintUsesWriter
{
  #api: Pick<MapEditorApi, 'mergeBlueprintUses'>;

  #onProblem: (message: string) => void;

  /**
   * What each map owes the disk and has not been sent yet.
   */
  #owed = new Map<number, OwedMap>();

  /**
   * What the merge on its way carries, or null while none is.
   */
  #sending: Map<number, OwedMap> | null = null;

  /**
   * Settles once the merge on its way has landed or failed.
   */
  #sent: Promise<void> = Promise.resolve();

  /**
   * Each map's placements as the record's file holds them, as far as this window knows; null while it does not know.
   */
  #onDisk: Map<number, readonly BlueprintSpot[]> | null = null;

  /**
   * @param {Pick<MapEditorApi, 'mergeBlueprintUses'>} api The server client.
   * @param {(message: string) => void} onProblem Tells the author why a write failed.
   */
  constructor(api: Pick<MapEditorApi, 'mergeBlueprintUses'>, onProblem: (message: string) => void)
  {
    this.#api = api;
    this.#onProblem = onProblem;
  }

  /**
   * Each map's placements as the record's file holds them, as far as this window knows: as last read from disk, with this
   * window's writes put on top as each landed.
   * @returns {ReadonlyMap<number, readonly BlueprintSpot[]> | null} The placements, by map id, a map with none left out;
   * null while the file has not been read, or holds no record of placements.
   */
  get onDisk(): ReadonlyMap<number, readonly BlueprintSpot[]> | null
  {
    return this.#onDisk;
  }

  /**
   * Takes what the record's file holds, as just read from disk. Whatever this window owes it, or is writing, stays owed,
   * and goes on top once it lands.
   * @param {Map<number, readonly BlueprintSpot[]> | null} onDisk Each map's placements, by map id, or null for a file
   * holding no record of placements.
   */
  learn(onDisk: Map<number, readonly BlueprintSpot[]> | null): void
  {
    this.#onDisk = onDisk;
  }

  /**
   * Reports whether a map owes the disk anything not yet written, sent or not.
   * @param {number} mapId The map.
   * @returns {boolean} True when it does.
   */
  owes(mapId: number): boolean
  {
    return this.#owed.has(mapId) || (this.#sending?.has(mapId) ?? false);
  }

  /**
   * Works out a map's placements as the record's file will hold them once everything this window owes it has landed.
   * @param {number} mapId The map.
   * @returns {BlueprintSpot[] | null} The placements, or null while what the file holds is not known.
   */
  intended(mapId: number): BlueprintSpot[] | null
  {
    if (this.#onDisk === null)
    {
      return null;
    }

    // what is on its way lands first, then what waits behind it.
    const owings = [ this.#sending?.get(mapId), this.#owed.get(mapId) ].filter((owing): owing is OwedMap => owing !== undefined);
    return owings.reduce((spots: BlueprintSpot[], owing) => landed(spots, owing), [ ...this.#onDisk.get(mapId) ?? [] ]);
  }

  /**
   * Writes a map's placements whole, as a save of the map or the map tree writes them; nothing when the file already
   * holds exactly these and nothing else is owed.
   * @param {number} mapId The map.
   * @param {readonly BlueprintSpot[]} spots Its placements.
   */
  writeWhole(mapId: number, spots: readonly BlueprintSpot[]): void
  {
    const onFile = this.#onDisk?.get(mapId) ?? [];
    if (this.owes(mapId) === false && this.#onDisk !== null && sameSpots(onFile, spots))
    {
      return;
    }

    this.#owe(mapId, { kind: 'whole', spots: [ ...spots ] });
  }

  /**
   * Takes single placements out of a map on disk, wherever the file holds them, and nothing else of it.
   * @param {number} mapId The map.
   * @param {readonly BlueprintSpot[]} spots The placements.
   */
  writeRemoved(mapId: number, spots: readonly BlueprintSpot[]): void
  {
    if (spots.length > 0)
    {
      this.#owe(mapId, withRemoved(undefined, spots));
    }
  }

  /**
   * Puts single placements into a map on disk, each in place of any at its corner, and nothing else of it.
   * @param {number} mapId The map.
   * @param {readonly BlueprintSpot[]} spots The placements.
   */
  writeAdded(mapId: number, spots: readonly BlueprintSpot[]): void
  {
    if (spots.length > 0)
    {
      this.#owe(mapId, withAdded(undefined, spots));
    }
  }

  /**
   * Settles once no merge is on its way: every write asked for so far has landed or failed.
   * @returns {Promise<void>} Settles then; never rejects.
   */
  async whenWritten(): Promise<void>
  {
    while (this.#sending !== null)
    {
      await this.#sent;
    }
  }

  /**
   * Adds to what a map owes the disk, and sends it.
   * @param {number} mapId The map.
   * @param {OwedMap} owing What it owes now, on top of anything it owed.
   */
  #owe(mapId: number, owing: OwedMap): void
  {
    this.#owed.set(mapId, followedBy(this.#owed.get(mapId), owing));
    this.#send();
  }

  /**
   * Sends everything owed in one merge, unless one is on its way, which sends it once it lands.
   */
  #send(): void
  {
    if (this.#sending !== null || this.#owed.size === 0)
    {
      return;
    }

    const sending = this.#owed;
    this.#owed = new Map();
    this.#sending = sending;
    this.#sent = this.#api.mergeBlueprintUses(mergeOf(sending)).then(
      () =>
      {
        this.#landed(sending);
        this.#sending = null;
        this.#send();
      },
      (error: unknown) =>
      {
        this.#sending = null;
        this.#giveBack(sending);
        this.#onProblem(`The blueprint placements could not be saved: ${reasonOf(error)}. They are tried again with the next save.`);
      },
    );
  }

  /**
   * Puts what a merge wrote on top of what the file is known to hold.
   * @param {ReadonlyMap<number, OwedMap>} sent What the merge carried.
   */
  #landed(sent: ReadonlyMap<number, OwedMap>): void
  {
    const onDisk = this.#onDisk;
    if (onDisk === null)
    {
      return;
    }

    sent.forEach((owing, mapId) =>
    {
      const spots = landed(onDisk.get(mapId) ?? [], owing);
      if (spots.length === 0)
      {
        onDisk.delete(mapId);
        return;
      }

      onDisk.set(mapId, spots);
    });
  }

  /**
   * Gives a failed merge's owing back, beneath anything owed since, so it goes with the next merge.
   * @param {ReadonlyMap<number, OwedMap>} failed What the merge carried.
   */
  #giveBack(failed: ReadonlyMap<number, OwedMap>): void
  {
    const since = this.#owed;
    this.#owed = new Map(failed);
    since.forEach((owing, mapId) => this.#owed.set(mapId, followedBy(this.#owed.get(mapId), owing)));
  }
}

export { BlueprintUsesWriter, followedBy, mergeOf };
export type { BlueprintUsesMerge, NamedPlacement, OwedMap };
