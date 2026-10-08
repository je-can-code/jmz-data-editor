import type { DocumentHub } from '../history/DocumentHub.ts';
import { documentKeyForProjectPath, mapDocumentKey, parseDocumentKey } from '../model/documentKeys.ts';
import type { RmmzMapEvent } from '../model/rmmzTypes.ts';
import { blueprintLinkOf } from './blueprintLink.ts';

/**
 * One copy of one of a blueprint's events, standing on a map: an event whose note holds a link to the blueprint.
 */
type BlueprintCopy = {
  readonly mapId: number;
  readonly eventId: number;
  readonly blueprintId: string;
  readonly blueprintEventId: number;
};

/**
 * One event's note on a map, as the server reads every map's: only the notes holding anything come.
 */
type EventNote = {
  readonly mapId: number;
  readonly eventId: number;
  readonly note: string;
};

/**
 * How many copies one blueprint has, and how many stand on each map, by map id. A copy is one event linked to one of
 * the blueprint's events, so a blueprint of three events placed twice has six.
 */
type BlueprintCopyCount = {
  readonly total: number;
  readonly maps: readonly { readonly mapId: number; readonly copies: number }[];
};

/**
 * Where the count stands: still waiting for the server's first reading of every map, counted, or not to be had, from a
 * window with no server or a reading that failed, until the next change on disk asks again.
 */
type CopyCountState = 'counting' | 'counted' | 'unavailable';

/**
 * The count of every blueprint's copies across the project, and where it stands. A blueprint with no copies has no
 * entry.
 */
type BlueprintCopyCounts = {
  readonly state: CopyCountState;
  readonly byBlueprint: ReadonlyMap<string, BlueprintCopyCount>;
};

/**
 * What a counter reads the project with.
 */
type CopyCounterOptions = {
  /**
   * The window's documents: every map it holds is counted as it stands there, unsaved edits and all.
   */
  readonly hub: DocumentHub;

  /**
   * Reads every event note holding anything on every map, as the files on disk hold them; null for a window with no
   * server, which cannot count the maps it does not hold.
   */
  readonly readNotes: (() => Promise<readonly EventNote[]>) | null;
};

/**
 * Nothing counted.
 */
const NO_COPIES: ReadonlyMap<string, BlueprintCopyCount> = new Map();

/**
 * Finds every copy among a map's events: each event whose note holds a link to a blueprint, in id order.
 * @param {number} mapId The map.
 * @param {readonly (RmmzMapEvent | null)[]} events Its events, by id, empty slots null.
 * @returns {BlueprintCopy[]} The copies.
 */
const copiesOnMap = (mapId: number, events: readonly (RmmzMapEvent | null)[]): BlueprintCopy[] =>
{
  return events.flatMap(event =>
  {
    // nearly every note is empty, which holds no link, and needs no reading.
    if (event === null || event.note === '')
    {
      return [];
    }

    const link = blueprintLinkOf(event.note);
    return link === null
      ? []
      : [ { mapId, eventId: event.id, blueprintId: link.blueprintId, blueprintEventId: link.eventId } ];
  });
};

/**
 * Finds every copy among the notes the server read, by the map each stands on.
 * @param {readonly EventNote[]} notes The notes.
 * @returns {Map<number, BlueprintCopy[]>} The copies, by map id.
 */
const copiesInNotes = (notes: readonly EventNote[]): Map<number, BlueprintCopy[]> =>
{
  const byMap = new Map<number, BlueprintCopy[]>();
  notes.forEach(({ mapId, eventId, note }) =>
  {
    const link = blueprintLinkOf(note);
    if (link !== null)
    {
      byMap.set(mapId, [ ...byMap.get(mapId) ?? [], { mapId, eventId, blueprintId: link.blueprintId, blueprintEventId: link.eventId } ]);
    }
  });

  return byMap;
};

/**
 * Counts copies by blueprint: how many in all, and how many on each map, by map id.
 * @param {readonly BlueprintCopy[]} copies The copies.
 * @returns {Map<string, BlueprintCopyCount>} The counts, by blueprint id; a blueprint with no copies has none.
 */
const tallyCopies = (copies: readonly BlueprintCopy[]): Map<string, BlueprintCopyCount> =>
{
  const perMap = new Map<string, Map<number, number>>();
  copies.forEach(({ blueprintId, mapId }) =>
  {
    const maps = perMap.get(blueprintId) ?? new Map<number, number>();
    maps.set(mapId, (maps.get(mapId) ?? 0) + 1);
    perMap.set(blueprintId, maps);
  });

  return new Map([ ...perMap ].map(([ blueprintId, maps ]) =>
  {
    const onMaps = [ ...maps ].sort(([ left ], [ right ]) => left - right).map(([ mapId, count ]) => ({ mapId, copies: count }));
    return [ blueprintId, { total: onMaps.reduce((sum, each) => sum + each.copies, 0), maps: onMaps } ];
  }));
};

/**
 * Words how many copies a blueprint has, for its card: how many and on how many maps once counted, and otherwise that
 * they are still being counted, or cannot be.
 * @param {BlueprintCopyCounts} counts The count of every blueprint's copies.
 * @param {string} blueprintId The blueprint.
 * @returns {string} The words, such as "3 copies on 2 maps", "1 copy" or "No copies yet".
 */
const copyCountWords = (counts: BlueprintCopyCounts, blueprintId: string): string =>
{
  if (counts.state === 'counting')
  {
    return 'Counting copies';
  }

  if (counts.state === 'unavailable')
  {
    return 'Copies can\'t be counted';
  }

  const count = counts.byBlueprint.get(blueprintId);
  if (count === undefined)
  {
    return 'No copies yet';
  }

  if (count.total === 1)
  {
    return '1 copy';
  }

  return `${count.total} copies on ${count.maps.length === 1 ? '1 map' : `${count.maps.length} maps`}`;
};

/**
 * Reports whether two counts say the same of every blueprint.
 * @param {ReadonlyMap<string, BlueprintCopyCount>} left One count.
 * @param {ReadonlyMap<string, BlueprintCopyCount>} right The other.
 * @returns {boolean} True when they match blueprint for blueprint and map for map.
 */
const sameCounts = (left: ReadonlyMap<string, BlueprintCopyCount>, right: ReadonlyMap<string, BlueprintCopyCount>): boolean =>
{
  return left.size === right.size && [ ...left ].every(([ blueprintId, count ]) =>
  {
    const other = right.get(blueprintId);
    return other !== undefined
      && other.total === count.total
      && other.maps.length === count.maps.length
      && other.maps.every((each, index) => each.mapId === count.maps[index].mapId && each.copies === count.maps[index].copies);
  });
};

/**
 * Counts every blueprint's copies across the project, and keeps the count right as the maps change. The maps' notes are
 * the only record of which events are copies, so the count is always worked out from them, never kept anywhere of its
 * own:
 *
 * - every map this window holds is counted from its live document, unsaved placements, deletions and undos included,
 *   afresh whenever its revision moves, which any step, undo, redo, reload or copy taken from another window does;
 * - every other map is counted from the server's reading of every map's notes, read again whenever a map's file changes
 *   on disk, from this window's saves, another window's, MZ's or a script's, and whenever the change stream comes back,
 *   since changes made while it was down were never announced. The server keeps each map's reading until its file
 *   changes, so reading again costs one map.
 *
 * Nothing is read until something first listens, which only the Blueprints section of the Stamps panel does, so a window
 * that never shows the count never asks the server for it. Until the server's first answer the count is still being
 * worked out, and a count that could not be had says so: neither is ever taken for a blueprint having no copies. Nor is
 * the count shown while a reading asked for after a map's file changed is on its way: the cards keep it, but no one
 * blueprint's count is handed out (see {@link countOf}), since a delete trusting it could miss a copy just saved.
 */
class BlueprintCopyCounter
{
  #hub: DocumentHub;

  #readNotes: (() => Promise<readonly EventNote[]>) | null;

  /**
   * The copies on disk, by map, from the server's last reading; null before the first.
   */
  #disk: Map<number, BlueprintCopy[]> | null = null;

  /**
   * The copies on each map this window holds, by map, with the revision of its document they were counted at.
   */
  #held = new Map<number, { readonly revision: number; readonly copies: BlueprintCopy[] }>();

  #state: CopyCountState = 'counting';

  #counts: BlueprintCopyCounts = { state: 'counting', byBlueprint: NO_COPIES };

  #listeners = new Set<() => void>();

  #started = false;

  #stopHub: (() => void) | null = null;

  #reading: Promise<void> = Promise.resolve();

  #waiting = false;

  /**
   * Whether a reading of the disk has been asked for and has not landed yet: a map's file changed since the last reading,
   * so what the disk says of the maps this window does not hold may have moved on, and no count is trusted until it lands.
   */
  #stale = false;

  /**
   * @param {CopyCounterOptions} options The window's documents, and how to read every map's notes on disk.
   */
  constructor(options: CopyCounterOptions)
  {
    this.#hub = options.hub;
    this.#readNotes = options.readNotes;
  }

  /**
   * Reads the count as it stands, for React's {@code useSyncExternalStore}.
   * @returns {BlueprintCopyCounts} The count; replaced, never changed, whenever it changes.
   */
  getSnapshot = (): BlueprintCopyCounts =>
  {
    return this.#counts;
  };

  /**
   * Listens for changes to the count. The first listener starts the counting.
   * @param {() => void} listener Called after every change.
   * @returns {() => void} Stops listening.
   */
  subscribe = (listener: () => void): (() => void) =>
  {
    this.#listeners.add(listener);
    this.#start();
    return () =>
    {
      this.#listeners.delete(listener);
    };
  };

  /**
   * Finds how many copies one blueprint has across the project, and where, once that can be told. While a reading asked
   * for after a map's file changed is on its way, none can: a copy just saved in another window, or placed in MZ, could
   * be missing from the count still shown, and a blueprint deleted on that count would lose it.
   * @param {string} blueprintId The blueprint.
   * @returns {BlueprintCopyCount | null} The count, none for a blueprint without copies; or null while the copies are
   * still being counted, or counted again, or cannot be.
   */
  countOf(blueprintId: string): BlueprintCopyCount | null
  {
    if (this.#counts.state !== 'counted' || this.#stale)
    {
      return null;
    }

    return this.#counts.byBlueprint.get(blueprintId) ?? { total: 0, maps: [] };
  }

  /**
   * Hears that a project file changed on disk: a map's file has the server's reading asked for again, once counting has
   * started. Any other file changes no copy.
   * @param {string} path The file, relative to the project root, as the change stream names it.
   */
  fileChanged(path: string): void
  {
    const key = documentKeyForProjectPath(path);
    if (key !== null && parseDocumentKey(key).kind === 'map')
    {
      this.readAgain();
    }
  }

  /**
   * Asks the server for every map's notes again, once counting has started: one reading at a time, and however many
   * asks come while one waits to begin, the one reading answers them all.
   */
  readAgain(): void
  {
    if (this.#started === false)
    {
      return;
    }

    // what the disk says is not to be trusted from now until the reading asked for lands.
    this.#stale = true;
    if (this.#waiting)
    {
      return;
    }

    this.#waiting = true;
    this.#reading = this.#reading.then(() =>
    {
      this.#waiting = false;
      return this.#read();
    });
  }

  /**
   * Waits for every reading asked for so far to settle.
   * @returns {Promise<void>} Settles once they have; never rejects.
   */
  settled(): Promise<void>
  {
    return this.#reading;
  }

  /**
   * Stops following the window's documents; a reading on its way still lands.
   */
  stop(): void
  {
    this.#stopHub?.();
    this.#stopHub = null;
  }

  /**
   * Starts counting, once: following the maps this window holds, and asking the server for the rest.
   */
  #start(): void
  {
    if (this.#started)
    {
      return;
    }

    this.#started = true;
    this.#stopHub = this.#hub.subscribe(() => this.#followHeld());
    this.#followHeld();
    this.readAgain();
  }

  /**
   * Reads every map's notes from the server, and counts from them; a reading that fails leaves the count unavailable
   * until the next one. Never rejects.
   * @returns {Promise<void>} Settles once read.
   */
  async #read(): Promise<void>
  {
    if (this.#readNotes === null)
    {
      this.#state = 'unavailable';
      this.#publish();
      return;
    }

    try
    {
      this.#disk = copiesInNotes(await this.#readNotes());
      this.#state = 'counted';
    }
    catch
    {
      this.#state = 'unavailable';
    }

    // a reading asked for while this one was on its way waits to begin, and the count is not to be trusted until it lands.
    this.#stale = this.#waiting;
    this.#publish();
  }

  /**
   * Counts afresh every held map whose document moved since it was last counted, and lets go of the maps no longer
   * held, whose copies the server's reading counts again.
   */
  #followHeld(): void
  {
    const held = new Set<number>();
    let moved = false;
    this.#hub.documentKeys().forEach(key =>
    {
      const parsed = parseDocumentKey(key);
      if (parsed.kind !== 'map')
      {
        return;
      }

      held.add(parsed.mapId);
      const map = this.#hub.map(mapDocumentKey(parsed.mapId));
      const known = this.#held.get(parsed.mapId);
      if (known === undefined || known.revision !== map.revision)
      {
        this.#held.set(parsed.mapId, { revision: map.revision, copies: copiesOnMap(parsed.mapId, map.events) });
        moved = true;
      }
    });

    [ ...this.#held.keys() ].filter(mapId => held.has(mapId) === false).forEach(mapId =>
    {
      this.#held.delete(mapId);
      moved = true;
    });

    if (moved)
    {
      this.#publish();
    }
  }

  /**
   * Works the count out afresh, the maps held standing in for what the disk says of them, and tells every listener when
   * it says anything new.
   */
  #publish(): void
  {
    const fromDisk = [ ...this.#disk ?? [] ].filter(([ mapId ]) => this.#held.has(mapId) === false).flatMap(([ , copies ]) => copies);
    const fromHeld = [ ...this.#held.values() ].flatMap(({ copies }) => copies);
    const byBlueprint = tallyCopies([ ...fromDisk, ...fromHeld ]);
    if (this.#counts.state === this.#state && sameCounts(this.#counts.byBlueprint, byBlueprint))
    {
      return;
    }

    this.#counts = { state: this.#state, byBlueprint };
    [ ...this.#listeners ].forEach(listener => listener());
  }
}

export { BlueprintCopyCounter, copiesInNotes, copiesOnMap, copyCountWords, tallyCopies };
export type { BlueprintCopy, BlueprintCopyCount, BlueprintCopyCounts, CopyCountState, CopyCounterOptions, EventNote };
