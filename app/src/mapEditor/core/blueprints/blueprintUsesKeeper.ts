import type { MapEditorApi } from '../api/MapEditorApi.ts';
import { BLUEPRINT_USES, requireReadable } from '../editorData/editorData.ts';
import type { DocumentHub, HubEvent, HubSource } from '../history/DocumentHub.ts';
import { documentHistoryKey } from '../history/historyKeys.ts';
import type { HistoryStep } from '../history/HistoryStep.ts';
import { mapDocumentKey, parseDocumentKey, type DocumentKey } from '../model/documentKeys.ts';
import type { JsonValue } from '../model/json.ts';
import {
  BLUEPRINT_USES_DOCUMENT,
  changeMapSpots,
  placementsByMap,
  readableUses,
  samePlacement,
  sameSpots,
  spotsOfEntry,
  spotsOnMap,
  type BlueprintSpot,
} from './blueprintUses.ts';
import { BlueprintUsesWriter } from './blueprintUsesWriter.ts';

/**
 * How one step changed one map's placements: what the record held for the map before the step, and after it.
 */
type MapPartChange = {
  readonly mapId: number;
  readonly before: readonly BlueprintSpot[];
  readonly after: readonly BlueprintSpot[];
};

/**
 * What keeping the record needs from the window.
 */
type BlueprintUsesKeeperOptions = {
  /**
   * The window's documents, the record among them once it is held.
   */
  readonly hub: DocumentHub;

  /**
   * The server, which reads the record's file and merges each map's part into it.
   */
  readonly api: Pick<MapEditorApi, 'loadEditorData' | 'mergeBlueprintUses'>;

  /**
   * Lists the other live windows holding a document, as the sync peer hears them: a window holding the record writes the
   * placements of the maps it saves itself, so no other window writes them again.
   * @param {DocumentKey} key The document.
   * @returns {readonly string[]} Their client ids.
   */
  readonly holders: (key: DocumentKey) => readonly string[];

  /**
   * Tells the author why the placements could not be written.
   * @param {string} message The words.
   */
  readonly onProblem: (message: string) => void;
};

/**
 * What a map's placements are called in the history panel's refusals when they change because the record's file changed
 * on disk: the step itself is never listed, but an undo it stands in the way of names it.
 */
const CHANGED_ON_DISK = 'Blueprint placements changed on disk';

/**
 * Reads how a step changed each map's placements, from its patches on the record: a step setting one map's entry more
 * than once changed it from the first value to the last.
 * @param {HistoryStep} step The step.
 * @returns {MapPartChange[]} Each map's change, in the order the step first touched it.
 */
const partChangesOf = (step: HistoryStep): MapPartChange[] =>
{
  const byMap = new Map<number, { before: readonly BlueprintSpot[]; after: readonly BlueprintSpot[] }>();
  step.entries.forEach(({ document, patch }) =>
  {
    const isMapEntry = document === BLUEPRINT_USES_DOCUMENT
      && patch.kind === 'set'
      && patch.path.length === 3
      && patch.path[0] === 'data'
      && patch.path[1] === 'maps';
    if (isMapEntry === false)
    {
      return;
    }

    const mapId = Number(patch.path[2]);
    const after = spotsOfEntry(mapId, patch.after);
    byMap.set(mapId, { before: byMap.get(mapId)?.before ?? spotsOfEntry(mapId, patch.before), after });
  });

  return [ ...byMap ].map(([ mapId, change ]) => ({ mapId, ...change }));
};

/**
 * Moves one map's placements through a change, forward as the step went in or backward as it came out: the placements the
 * change took out go, and the ones it put in come, each matched whole, its part placed included.
 * @param {readonly BlueprintSpot[]} spots The map's placements before the move.
 * @param {MapPartChange | undefined} change The change, or undefined for a step that left the map's placements alone.
 * @param {'forward' | 'backward'} direction Which way.
 * @returns {BlueprintSpot[]} The map's placements after the move.
 */
const moveThrough = (spots: readonly BlueprintSpot[], change: MapPartChange | undefined, direction: 'forward' | 'backward'): BlueprintSpot[] =>
{
  if (change === undefined)
  {
    return [ ...spots ];
  }

  const from = direction === 'forward' ? change.before : change.after;
  const to = direction === 'forward' ? change.after : change.before;
  const removed = from.filter(spot => to.some(each => samePlacement(each, spot)) === false);
  const added = to.filter(spot => from.some(each => samePlacement(each, spot)) === false);
  const kept = spots.filter(spot => [ ...removed, ...added ].some(each => samePlacement(each, spot)) === false);
  return [ ...kept, ...added ];
};

/**
 * Reads what the record's file holds, as the server hands it out.
 * @param {JsonValue | null} stored The stored record, or null for a project that has none yet.
 * @returns {Map<number, readonly BlueprintSpot[]> | null} Each map's placements, by map id; null when the file holds no
 * record of placements this editor can read.
 */
const onDiskOf = (stored: JsonValue | null): Map<number, readonly BlueprintSpot[]> | null =>
{
  if (stored === null)
  {
    return new Map();
  }

  try
  {
    return placementsByMap(requireReadable(BLUEPRINT_USES, stored) as unknown as JsonValue);
  }
  catch
  {
    return null;
  }
};

/**
 * Keeps the record of where blueprints are placed on disk in step with the maps it describes, never writing it whole, so
 * the record on disk always describes the maps on disk:
 *
 * - **A map's save** writes that map's placements, and nothing of any other map's, merged into the record as the file
 *   holds it at that moment (see BlueprintUsesWriter): the placements as the saved file holds the map's tiles, worked out
 *   from the save's own list of steps, so an edit made while the save was on its way stays unsaved with the map. A save
 *   made in another window is written by that window when it holds the record, and from here when it does not, as an
 *   event window's save of its map is.
 * - **The map tree** writes the placements of the maps whose files it brings or takes away (see writeMaps).
 * - **Forgetting a placement**, which changes no map, takes that one placement off the disk at once, and nothing else of
 *   its map; taking the forgetting back puts it back on the disk only while the map's file holds its tiles.
 * - **The record's file changing on disk** outside this session is merged a map at a time, never offered as a choice:
 *   a map whose placements here are what the file held follows the file, and one whose placements hold unsaved edits
 *   keeps them, to go to disk with its own save. No step anywhere is ever thrown away.
 * - **Throwing a map's edits away**, its version on disk taken over them, takes its placements back to what the record's
 *   file holds for it, which is what its file was written with.
 *
 * The changes it makes to the record itself (a map following the file) are steps no history lists, which nothing can
 * undo, as nothing can take back the change on disk they follow; an older step those changes stand in the way of names
 * them when it is refused.
 */
class BlueprintUsesKeeper
{
  #hub: DocumentHub;

  #api: Pick<MapEditorApi, 'loadEditorData' | 'mergeBlueprintUses'>;

  #holders: (key: DocumentKey) => readonly string[];

  #writer: BlueprintUsesWriter;

  /**
   * How every step heard of changed each map's placements, by step id: what a save needs to put back a step its file holds
   * that is no longer applied here, which may have left every history since.
   */
  #changes = new Map<string, readonly MapPartChange[]>();

  /**
   * True while the keeper is making a change of its own, which it never writes again.
   */
  #making = false;

  /**
   * Counts what the keeper has learnt of the record's file, so a read from disk that lands after something newer was
   * learnt is not taken over it.
   */
  #learnt = 0;

  #unsubscribe: () => void;

  /**
   * @param {BlueprintUsesKeeperOptions} options The window's documents, the server, who else holds the record, and how
   * the author hears of a problem.
   */
  constructor(options: BlueprintUsesKeeperOptions)
  {
    this.#hub = options.hub;
    this.#api = options.api;
    this.#holders = options.holders;
    this.#writer = new BlueprintUsesWriter(options.api, options.onProblem);
    this.#unsubscribe = this.#hub.subscribe(event => this.#heard(event));

    // a record the window already holds came from somewhere the keeper never saw, so the file is read for itself.
    if (this.#hub.has(BLUEPRINT_USES_DOCUMENT))
    {
      this.#readFile().catch(() => undefined);
    }
  }

  /**
   * Stops keeping the record; writes already asked for still land.
   */
  stop(): void
  {
    this.#unsubscribe();
  }

  /**
   * Settles once every write asked for so far has landed or failed.
   * @returns {Promise<void>} Settles then; never rejects.
   */
  whenWritten(): Promise<void>
  {
    return this.#writer.whenWritten();
  }

  /**
   * Reports whether any map's placements have not reached the disk yet, on their way or refused and waiting to be tried
   * again: work no document's unsaved mark shows, which closing the window now would lose.
   * @returns {boolean} True when something is still unwritten.
   */
  hasUnwritten(): boolean
  {
    return this.#writer.hasUnwritten();
  }

  /**
   * Tries again whatever placements a refused write left waiting, as a save does.
   */
  retry(): void
  {
    this.#writer.retry();
  }

  /**
   * Writes the placements of maps whose files the map tree just wrote or removed, as the tree's step leaves them: a map it
   * brings, with those it was made with, and one it takes away, with none.
   * @param {ReadonlyMap<number, readonly BlueprintSpot[]>} parts Each map's placements, by map id.
   */
  writeMaps(parts: ReadonlyMap<number, readonly BlueprintSpot[]>): void
  {
    parts.forEach((spots, mapId) => this.#writer.writeWhole(mapId, spots));
  }

  /**
   * Reads the record's file afresh, for what it holds of maps about to be taken away, which a tree step carries so that
   * undoing it puts their placements back as the disk had them.
   * @returns {Promise<ReadonlyMap<number, readonly BlueprintSpot[]> | null>} Each map's placements, by map id; null when the
   * file holds no record of placements, or could not be read. Never rejects.
   */
  async placementsOnDisk(): Promise<ReadonlyMap<number, readonly BlueprintSpot[]> | null>
  {
    return this.#readFile().catch(() => null);
  }

  /**
   * Hears one event of the window's documents.
   * @param {HubEvent} event The event.
   */
  #heard(event: HubEvent): void
  {
    switch (event.type)
    {
      case 'adopted':
        this.#adopted(event.document, event.source);
        break;
      case 'committed':
      case 'redone':
        this.#moved(event.step, 'forward', event.source);
        break;
      case 'undone':
        this.#moved(event.step, 'backward', event.source);
        break;
      case 'saved':
        this.#saved(event.document, event.marker, event.source, event.origin);
        break;
      case 'outside':
        this.#outside(event.document, event.content);
        break;
      case 'reloaded':
        this.#reloaded(event.document);
        break;
      default:
        break;
    }
  }

  /**
   * Learns what the record's file holds when the window takes the record up: from the very file it was loaded from, or,
   * for a copy handed over by another window, which may hold that window's unsaved placements, read afresh.
   * @param {DocumentKey} key The document taken up.
   * @param {HubSource} source Whether it came from disk, or from another window.
   */
  #adopted(key: DocumentKey, source: HubSource): void
  {
    if (key !== BLUEPRINT_USES_DOCUMENT)
    {
      return;
    }

    if (source === 'remote')
    {
      this.#readFile().catch(() => undefined);
      return;
    }

    this.#learn(onDiskOf(this.#hub.document(key).toJson()));
  }

  /**
   * Notes how a step changes maps' placements, and writes what forgetting a placement changed, made, undone or redone in
   * this window: a step changing the record and nothing else, which no map's save would carry to disk. Each placement it
   * took out goes from the disk at once; each it put back goes back only while its map's file holds the placement, so a
   * placement never saved, forgotten and then put back, stays off the disk with the rest of its map's unsaved edits.
   * @param {HistoryStep} step The step.
   * @param {'forward' | 'backward'} direction Whether it went in, made or redone, or came out, undone.
   * @param {HubSource} source Whether it moved here or in another window, which writes its own.
   */
  #moved(step: HistoryStep, direction: 'forward' | 'backward', source: HubSource): void
  {
    const changes = partChangesOf(step);
    if (changes.length === 0)
    {
      return;
    }

    this.#changes.set(step.id, changes);
    const recordOnly = step.files === undefined && step.entries.every(entry => entry.document === BLUEPRINT_USES_DOCUMENT);
    if (source !== 'local' || this.#making || recordOnly === false)
    {
      return;
    }

    changes.forEach(change =>
    {
      const from = direction === 'forward' ? change.before : change.after;
      const to = direction === 'forward' ? change.after : change.before;
      const removed = from.filter(spot => to.some(each => samePlacement(each, spot)) === false);
      const added = to.filter(spot => from.some(each => samePlacement(each, spot)) === false);

      // what the map's file holds is its placements as of its saved steps, worked out from what the step just left; one
      // put back that the file lacks stays off, and one that cannot be told goes back, the record never short of a file.
      const saved = this.#partAsOf(change.mapId, this.#hub.savedSteps(mapDocumentKey(change.mapId)), to);
      const onFile = added.filter(spot => saved === null || saved.some(each => samePlacement(each, spot)));
      this.#writer.writeRemoved(change.mapId, removed);
      this.#writer.writeAdded(change.mapId, onFile);
    });
  }

  /**
   * Writes a map's placements once its file was written: by this window, or by one that does not hold the record, as an
   * event window does. A window holding the record writes its own saves' placements, so they are left to it.
   * @param {DocumentKey} key The document saved.
   * @param {readonly string[]} marker The steps its file holds.
   * @param {HubSource} source Whether the save happened here or in another window.
   * @param {string} origin The window that wrote the file.
   */
  #saved(key: DocumentKey, marker: readonly string[], source: HubSource, origin: string): void
  {
    const parsed = parseDocumentKey(key);
    const uses = readableUses(this.#hub);
    if (parsed.kind !== 'map' || uses === null)
    {
      return;
    }

    if (source === 'remote' && this.#holders(BLUEPRINT_USES_DOCUMENT).includes(origin))
    {
      return;
    }

    // a step the file holds that this window cannot replay leaves the placements as they stand, which is the nearest.
    const { mapId } = parsed;
    const current = spotsOnMap(uses, mapId);
    this.#writer.writeWhole(mapId, this.#partAsOf(mapId, marker, current) ?? current);
  }

  /**
   * Works out a map's placements as of some of its steps, as a file holding those steps would have them: its placements as
   * they stand here, with every step applied since that state taken back out, newest first, and every step the state holds
   * that is undone here put back, oldest first. A step no longer applied is found in the histories that list it, or among
   * the steps heard of, which keeps one no history lists any more. A map this window does not hold has no steps here, and
   * stands as it is.
   * @param {number} mapId The map.
   * @param {readonly string[]} marker The steps, oldest first.
   * @param {readonly BlueprintSpot[]} current The map's placements as they stand here.
   * @returns {BlueprintSpot[] | null} The placements; null when a step the state holds is unknown here.
   */
  #partAsOf(mapId: number, marker: readonly string[], current: readonly BlueprintSpot[]): BlueprintSpot[] | null
  {
    const key = mapDocumentKey(mapId);
    if (this.#hub.has(key) === false)
    {
      return [ ...current ];
    }

    // the steps the map and the state share from the start need nothing done.
    const applied = this.#hub.appliedSteps(key);
    let shared = 0;
    while (shared < applied.length && shared < marker.length && applied[shared].id === marker[shared])
    {
      shared += 1;
    }

    const changeOn = (changes: readonly MapPartChange[]): MapPartChange | undefined => changes.find(change => change.mapId === mapId);
    let part = applied.slice(shared).reverse().reduce((spots, step) => moveThrough(spots, changeOn(partChangesOf(step)), 'backward'), [ ...current ]);
    for (const stepId of marker.slice(shared))
    {
      const step = applied.find(each => each.id === stepId) ?? this.#hub.knownStep(stepId);
      const changes = step === null ? this.#changes.get(stepId) : partChangesOf(step);
      if (changes === undefined)
      {
        return null;
      }

      part = moveThrough(part, changeOn(changes), 'forward');
    }

    return part;
  }

  /**
   * Merges a change to the record's file made outside this session, a map at a time: a map whose placements here are what
   * the file held for it before follows the file, and a map holding placements the file never had keeps them, as does
   * one this window is still writing. The change is a step no history lists.
   * @param {DocumentKey} key The document whose file changed.
   * @param {JsonValue | null} content The file's content, or null when it was removed.
   */
  #outside(key: DocumentKey, content: JsonValue | null): void
  {
    if (key !== BLUEPRINT_USES_DOCUMENT)
    {
      return;
    }

    // a file holding no record of placements leaves nothing to merge, and nothing to judge the next change by.
    const before = this.#writer.onDisk;
    const now = onDiskOf(content);
    this.#learn(now);
    const uses = readableUses(this.#hub);
    if (before === null || now === null || uses === null)
    {
      return;
    }

    const mapIds = [ ...new Set([ ...before.keys(), ...now.keys() ]) ].sort((left, right) => left - right);
    const following = mapIds.filter(mapId =>
    {
      const was = before.get(mapId) ?? [];
      const held = spotsOnMap(uses, mapId);
      return sameSpots(was, now.get(mapId) ?? []) === false && this.#writer.owes(mapId) === false && sameSpots(held, was);
    });

    this.#make(CHANGED_ON_DISK, following.map(mapId => [ mapId, now.get(mapId) ?? [] ]));
  }

  /**
   * Takes a map's placements back to what the record's file holds for it, once the window threw the map's edits away and
   * took its version on disk: the placements its file was written with, as this window's writes leave them. That is heard
   * the moment the map is reloaded, before anything can be done to it again. While what the file holds is not known, as
   * when it holds no record of placements, the map's placements are left as they are.
   * @param {DocumentKey} key The document whose edits were thrown away.
   */
  #reloaded(key: DocumentKey): void
  {
    const parsed = parseDocumentKey(key);
    const uses = readableUses(this.#hub);
    const onFile = parsed.kind === 'map' ? this.#writer.intended(parsed.mapId) : null;
    if (parsed.kind !== 'map' || uses === null || onFile === null)
    {
      return;
    }

    const { mapId } = parsed;
    if (sameSpots(spotsOnMap(uses, mapId), onFile) === false)
    {
      this.#make(`Load the version of Map ${mapId} on disk`, [ [ mapId, onFile ] ]);
    }
  }

  /**
   * Changes some maps' placements in the record as one step no history lists, since nothing can take back the change on
   * disk it follows; the change is never written again.
   * @param {string} label What an undo the step stands in the way of calls it.
   * @param {readonly (readonly [ number, readonly BlueprintSpot[] ])[]} parts Each map's placements, by map id.
   */
  #make(label: string, parts: readonly (readonly [ number, readonly BlueprintSpot[] ])[]): void
  {
    if (parts.length === 0)
    {
      return;
    }

    this.#making = true;
    let step: HistoryStep | null;
    try
    {
      step = this.#hub.edit(label, [ documentHistoryKey(BLUEPRINT_USES_DOCUMENT) ], tx =>
      {
        parts.forEach(([ mapId, spots ]) => changeMapSpots(tx, this.#hub, mapId, () => spots));
      });
    }
    finally
    {
      this.#making = false;
    }

    if (step !== null)
    {
      this.#hub.forgetStep(step.id);
    }
  }

  /**
   * Reads the record's file from disk, and learns it unless something newer was learnt while the read was on its way.
   * @returns {Promise<Map<number, readonly BlueprintSpot[]> | null>} What the file holds, by map id; null when it holds no
   * record of placements this editor can read.
   */
  async #readFile(): Promise<Map<number, readonly BlueprintSpot[]> | null>
  {
    const before = this.#learnt;
    const onDisk = onDiskOf(await this.#api.loadEditorData(BLUEPRINT_USES.name));
    if (this.#learnt === before)
    {
      this.#learn(onDisk);
    }

    return onDisk;
  }

  /**
   * Learns what the record's file holds.
   * @param {Map<number, readonly BlueprintSpot[]> | null} onDisk Each map's placements, by map id, or null for a file
   * holding no record of placements.
   */
  #learn(onDisk: Map<number, readonly BlueprintSpot[]> | null): void
  {
    this.#learnt += 1;
    this.#writer.learn(onDisk);
  }
}

export { BlueprintUsesKeeper, moveThrough, partChangesOf };
export type { BlueprintUsesKeeperOptions, MapPartChange };
