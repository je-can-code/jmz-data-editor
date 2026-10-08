import type { DocumentHub, DocumentSnapshot } from '../history/DocumentHub.ts';
import { documentKeyForProjectPath, mapDocumentKey, parseDocumentKey, type DocumentKey } from '../model/documentKeys.ts';
import type { RmmzMap, RmmzMapEvent } from '../model/rmmzTypes.ts';
import type { SyncPeer } from '../sync/SyncPeer.ts';
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
 * What a counter asks of the other windows, through the sync between them: which maps each holds, told whenever one
 * takes a map up, lets it go or moves it on, and a look at a map one holds, unsaved edits included, without holding it.
 */
type CopySync = Pick<SyncPeer, 'onHoldingChange' | 'documentsHeldElsewhere' | 'holders' | 'requestSnapshot' | 'whenDiscovered'>;

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

  /**
   * The other windows, whose copies of the maps this window does not hold are counted as they stand there, unsaved edits
   * and all; left out, or null, for a window with no others to ask, which counts those maps as the disk has them.
   */
  readonly sync?: CopySync | null;
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
 * - every map another window holds and this one does not is counted from that window's copy, unsaved placements and
 *   all, looked at through the sync between windows without being held here: once when counting starts, and again
 *   whenever that window moves the map on, one look at a map at a time, a map moved on while its look was on its way
 *   looked at once more after;
 * - every other map is counted from the server's reading of every map's notes, read again whenever a map's file changes
 *   on disk, from this window's saves, another window's, MZ's or a script's, and whenever the change stream comes back,
 *   since changes made while it was down were never announced. The server keeps each map's reading until its file
 *   changes, so reading again costs one map.
 *
 * Nothing is read until something first listens, which only the Blueprints section of the Stamps panel does, or until an
 * undo or a redo that would take a blueprint away must know its count, so a window that never shows the count and never
 * takes a blueprint away never asks the server for it. Until the server's first answer the count is still being
 * worked out, and a count that could not be had says so: neither is ever taken for a blueprint having no copies. Nor is
 * the count shown while a reading asked for after a map's file changed is on its way, while the other windows have not
 * all been heard from, while a look at another window's map is on its way, or while a window still holding a map did
 * not answer the last look at it: the cards keep the count they had, but no one blueprint's count is handed out (see
 * {@link countOf}), since a delete trusting it could miss a copy just placed.
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

  #sync: CopySync | null;

  #stopSync: (() => void) | null = null;

  /**
   * Whether the other windows are still to be heard from, which they are from the moment counting starts until the sync's
   * discovery is over and every map they hold has been asked about.
   */
  #discovering = false;

  /**
   * The copies on each map another window holds and this one does not, by map, as that window's copy last showed them.
   */
  #elsewhere = new Map<number, BlueprintCopy[]>();

  /**
   * The maps another window holds whose look is on its way.
   */
  #looking = new Set<number>();

  /**
   * The maps moved on in another window while their look was on its way, to be looked at once more after it.
   */
  #lookAgain = new Set<number>();

  /**
   * The maps whose holder did not answer the last look at them.
   */
  #unanswered = new Set<number>();

  /**
   * @param {CopyCounterOptions} options The window's documents, how to read every map's notes on disk, and the other
   * windows, if any.
   */
  constructor(options: CopyCounterOptions)
  {
    this.#hub = options.hub;
    this.#readNotes = options.readNotes;
    this.#sync = options.sync ?? null;
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
    this.start();
    return () =>
    {
      this.#listeners.delete(listener);
    };
  };

  /**
   * Finds how many copies one blueprint has across the project, and where, once that can be told. While a reading asked
   * for after a map's file changed is on its way, none can: a copy just saved in another window, or placed in MZ, could
   * be missing from the count still shown, and a blueprint deleted on that count would lose it. Nor while another
   * window's copies are still to be looked at (see {@link #elsewhereUnsettled}).
   * @param {string} blueprintId The blueprint.
   * @returns {BlueprintCopyCount | null} The count, none for a blueprint without copies; or null while the copies are
   * still being counted, or counted again, or cannot be.
   */
  countOf(blueprintId: string): BlueprintCopyCount | null
  {
    if (this.#counts.state !== 'counted' || this.#stale || this.#elsewhereUnsettled())
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
   * asks come while one waits to begin, the one reading answers them all. A map whose holder did not answer the last
   * look at it is looked at again too.
   */
  readAgain(): void
  {
    if (this.#started === false)
    {
      return;
    }

    [ ...this.#unanswered ].forEach(mapId => this.#followElsewhere(mapDocumentKey(mapId)));

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
   * Starts counting, once: following the maps this window holds, and asking the server for the rest. The first listener
   * starts it, and so does whatever must know a count before anything listens, such as an undo that would take a
   * blueprint away; asked again, it does nothing.
   */
  start(): void
  {
    if (this.#started)
    {
      return;
    }

    this.#started = true;
    this.#stopHub = this.#hub.subscribe(() => this.#followHeld());
    this.#followHeld();
    this.#followOthers();
    this.readAgain();
  }

  /**
   * Stops following the window's documents and the other windows; a reading or a look on its way still lands.
   */
  stop(): void
  {
    this.#stopHub?.();
    this.#stopHub = null;
    this.#stopSync?.();
    this.#stopSync = null;
  }

  /**
   * Starts following the maps the other windows hold: every one they take up, let go of or move on from now, and, once
   * the sync has heard from them all, every one they hold already. A window with no others to ask follows nothing.
   */
  #followOthers(): void
  {
    const sync = this.#sync;
    if (sync === null)
    {
      return;
    }

    this.#discovering = true;
    this.#stopSync = sync.onHoldingChange(key => this.#followElsewhere(key));
    sync.whenDiscovered()
      .then(() =>
      {
        this.#discovering = false;
        sync.documentsHeldElsewhere().forEach(key => this.#followElsewhere(key));
        this.#publish();
      })
      .catch(() => undefined);
  }

  /**
   * Follows one document as the other windows hold it: a map another window holds and this one does not is looked at
   * there; a map held here counts as it stands here, and one no other window holds any more counts as the disk has it,
   * so either is let go of. Anything but a map holds no copies.
   * @param {DocumentKey} key The document.
   */
  #followElsewhere(key: DocumentKey): void
  {
    const parsed = parseDocumentKey(key);
    if (parsed.kind !== 'map')
    {
      return;
    }

    const { mapId } = parsed;
    if (this.#isElsewhere(mapId) === false)
    {
      this.#lookAgain.delete(mapId);
      this.#unanswered.delete(mapId);
      if (this.#elsewhere.delete(mapId))
      {
        this.#publish();
      }

      return;
    }

    this.#look(mapId);
  }

  /**
   * Reports whether a map is one only other windows hold, so it counts as their copy has it.
   * @param {number} mapId The map.
   * @returns {boolean} True when some other live window holds it and this one does not.
   */
  #isElsewhere(mapId: number): boolean
  {
    const key = mapDocumentKey(mapId);
    return this.#hub.has(key) === false && (this.#sync as CopySync).holders(key).length > 0;
  }

  /**
   * Looks at a map another window holds, holding nothing: one look at a map at a time, and a map moved on while its look
   * is on its way is looked at once more after it.
   * @param {number} mapId The map.
   */
  #look(mapId: number): void
  {
    if (this.#looking.has(mapId))
    {
      this.#lookAgain.add(mapId);
      return;
    }

    this.#looking.add(mapId);
    (this.#sync as CopySync).requestSnapshot(mapDocumentKey(mapId))
      .then(snapshot => this.#landLook(mapId, snapshot))
      .catch(() => undefined);
  }

  /**
   * Takes what a look at another window's map found: its copies, unless the map moved on meanwhile, which has it followed
   * afresh. A window that did not answer leaves the map unanswered, so no count is trusted while that window holds it,
   * until a later look is answered. What is kept counts only while some other window holds the map and this one does
   * not (see {@link #publish}), so a map taken up here, or let go of everywhere, meanwhile needs nothing more.
   * @param {number} mapId The map.
   * @param {DocumentSnapshot | null} snapshot That window's copy, or null when no window answered in time.
   */
  #landLook(mapId: number, snapshot: DocumentSnapshot | null): void
  {
    this.#looking.delete(mapId);
    if (this.#lookAgain.delete(mapId))
    {
      this.#followElsewhere(mapDocumentKey(mapId));
      return;
    }

    if (snapshot === null)
    {
      this.#unanswered.add(mapId);
      this.#publish();
      return;
    }

    this.#unanswered.delete(mapId);
    this.#elsewhere.set(mapId, copiesOnMap(mapId, (snapshot.content as unknown as RmmzMap).events));
    this.#publish();
  }

  /**
   * Reports whether what the other windows hold is not settled enough to count from: they are still to be heard from, a
   * look is on its way, or a window still holding a map did not answer the last look at it.
   * @returns {boolean} True while no count is to be trusted for it.
   */
  #elsewhereUnsettled(): boolean
  {
    return this.#discovering
      || this.#looking.size > 0
      || [ ...this.#unanswered ].some(mapId => this.#isElsewhere(mapId));
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
   * held, whose copies the server's reading counts again, or another window's copy where another window holds them.
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

    // a map let go of here may still be held in another window, whose copy is looked at then.
    const released = [ ...this.#held.keys() ].filter(mapId => held.has(mapId) === false);
    released.forEach(mapId =>
    {
      this.#held.delete(mapId);
      moved = true;
    });
    if (this.#sync !== null)
    {
      released.forEach(mapId => this.#followElsewhere(mapDocumentKey(mapId)));
    }

    if (moved)
    {
      this.#publish();
    }
  }

  /**
   * Works the count out afresh, the maps held here standing in for what the disk says of them, and the maps only other
   * windows hold, as their copies were last looked at, standing in for the disk too, for as long as some window still
   * holds them; and tells every listener when it says anything new.
   */
  #publish(): void
  {
    const elsewhere = [ ...this.#elsewhere ].filter(([ mapId ]) => this.#isElsewhere(mapId));
    const counted = new Set([ ...this.#held.keys(), ...elsewhere.map(([ mapId ]) => mapId) ]);
    const fromDisk = [ ...this.#disk ?? [] ].filter(([ mapId ]) => counted.has(mapId) === false).flatMap(([ , copies ]) => copies);
    const fromHeld = [ ...this.#held.values() ].flatMap(({ copies }) => copies);
    const fromElsewhere = elsewhere.flatMap(([ , copies ]) => copies);
    const byBlueprint = tallyCopies([ ...fromDisk, ...fromHeld, ...fromElsewhere ]);
    if (this.#counts.state === this.#state && sameCounts(this.#counts.byBlueprint, byBlueprint))
    {
      return;
    }

    this.#counts = { state: this.#state, byBlueprint };
    [ ...this.#listeners ].forEach(listener => listener());
  }
}

export { BlueprintCopyCounter, copiesInNotes, copiesOnMap, copyCountWords, tallyCopies };
export type { BlueprintCopy, BlueprintCopyCount, BlueprintCopyCounts, CopyCountState, CopyCounterOptions, CopySync, EventNote };
