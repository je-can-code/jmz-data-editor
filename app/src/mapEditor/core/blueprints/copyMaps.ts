import { MapEditorApiError } from '../api/MapEditorApi.ts';
import type { DocumentHub, HubEvent } from '../history/DocumentHub.ts';
import { documentsOfStep, writesThrough, type HistoryStep } from '../history/HistoryStep.ts';
import { documentKeyForProjectPath, mapDocumentKey, parseDocumentKey, TILESETS_KEY, type DocumentKey } from '../model/documentKeys.ts';
import type { EditorDocument } from '../model/EditorDocument.ts';
import { jsonEquals } from '../model/json.ts';
import { MapDocument } from '../model/MapDocument.ts';
import { invertPatch, type Patch } from '../model/patches.ts';
import type { RmmzMap } from '../model/rmmzTypes.ts';
import type { TemplateMapSource } from './blueprintPlacement.ts';
import type { BlueprintCopy, BlueprintCopyCounter } from './blueprintCopies.ts';
import { BLUEPRINTS_DOCUMENT } from './blueprints.ts';
import { BLUEPRINT_USES_DOCUMENT, readableUses, spotsOfBlueprint, spotsOnMap, type BlueprintSpot } from './blueprintUses.ts';
import { moveThrough, partChangesOf } from './blueprintUsesKeeper.ts';

/**
 * What the copy maps read every blueprint's copies from: the window's count of them, from the maps' notes.
 */
type CopySource = Pick<BlueprintCopyCounter, 'start' | 'subscribe' | 'getSnapshot' | 'copiesOf' | 'copiesOnDisk' | 'settledElsewhere'>;

/**
 * What keeping the maps a blueprint's change may write needs from the window.
 */
type CopyMapsOptions = {
  /**
   * The window's documents.
   */
  readonly hub: DocumentHub;

  /**
   * The count of every blueprint's copies.
   */
  readonly copies: CopySource;

  /**
   * Lists the other live windows holding a document.
   */
  readonly holders: (key: DocumentKey) => readonly string[];

  /**
   * Listens for what the other windows hold changing.
   */
  readonly onHoldingChange: (listener: (key: DocumentKey) => void) => () => void;

  /**
   * Holds a document here: another window's live copy when one holds it, the file otherwise.
   */
  readonly openDocument: (key: DocumentKey) => Promise<EditorDocument>;

  /**
   * Reads a map's file as it stands on disk; null for a window with no server, which reaches no file.
   */
  readonly readMap: ((mapId: number) => Promise<RmmzMap>) | null;

  /**
   * Which maps a plugin copies its events from while the game runs, which no blueprint's change ever touches.
   */
  readonly templates: TemplateMapSource;
};

/**
 * Why a change to a blueprint waits for the window's plugins: until they are read, which maps hold a plugin's patterns,
 * and so must never be touched, is not known.
 */
const PLUGINS_UNREAD = 'This blueprint can\'t change until the project\'s plugins have been read; try again in a moment.';

/**
 * Why a change to a blueprint waits for its copies to be counted: until then a copy could be missed.
 */
const COPIES_UNCOUNTED = 'This blueprint can\'t change until its copies have been found; try again in a moment.';

/**
 * Says why a change to a blueprint waits for a map it reaches.
 * @param {number} mapId The map.
 * @returns {string} The words.
 */
const mapNotReady = (mapId: number): string =>
{
  return `This blueprint can't change until Map ${mapId}, which holds a copy, has been read; try again in a moment.`;
};

/**
 * Says why a change to a blueprint waits on a map whose file changed while it held unsaved edits.
 * @param {number} mapId The map.
 * @returns {string} The words.
 */
const mapConflicted = (mapId: number): string =>
{
  return `This blueprint can't change while Map ${mapId}, which holds a copy, waits for a choice about changes made elsewhere.`;
};

/**
 * Reports whether a patch goes into a map's file as it stands: whether the file still holds what the patch replaces.
 * Only the kinds a blueprint's change writes are told apart: tiles, and values set at a path.
 * @param {MapDocument} file The file.
 * @param {Patch} patch The patch.
 * @returns {boolean} True when it fits.
 */
const fits = (file: MapDocument, patch: Patch): boolean =>
{
  switch (patch.kind)
  {
    case 'tiles':
      return patch.indices.every((index, position) => file.cells[index] === patch.before[position]);
    case 'set':
      return jsonEquals(file.valueAt(patch.path), patch.before);
    default:
      return false;
  }
};

/**
 * Lists a step's patches on one document, in the order they went in.
 * @param {HistoryStep} step The step.
 * @param {DocumentKey} key The document.
 * @returns {Patch[]} The patches.
 */
const entriesOn = (step: HistoryStep, key: DocumentKey): Patch[] =>
{
  return step.entries.filter(entry => entry.document === key).map(entry => entry.patch);
};

/**
 * Lists the ways a step can reach one map's file, the likelier first: what the file takes in place of the map's own
 * patches, where the step recorded one (see HistoryStep's fileVersions), then the map's own patches, which a map's file
 * holds once the map was saved with the step in it.
 * @param {HistoryStep} step The step.
 * @param {DocumentKey} key The map.
 * @returns {Patch[][]} The ways, each the patches in the order they go in.
 */
const waysToFile = (step: HistoryStep, key: DocumentKey): Patch[][] =>
{
  const version = step.fileVersions?.find(each => each.document === key);
  const own = entriesOn(step, key);
  return version === undefined
    ? [ own ]
    : [ [ ...version.patches ], own ];
};

/**
 * Turns patches going in into the patches taking them back out: each inverted, newest first.
 * @param {readonly Patch[]} patches The patches, in the order they went in.
 * @returns {Patch[]} The patches that take them out, in the order they go.
 */
const takenOut = (patches: readonly Patch[]): Patch[] =>
{
  return [ ...patches ].reverse().map(invertPatch);
};

/**
 * Reads a step as a blueprint's change: a step changing a blueprint opened as a map, which reaches the files of the maps
 * its copies stand on the moment it is made, undone or redone.
 * @param {HistoryStep} step The step.
 * @returns {boolean} True for such a step.
 */
const isBlueprintChange = (step: HistoryStep): boolean =>
{
  return step.entries.some(entry => parseDocumentKey(entry.document).kind === 'blueprint-map');
};

/**
 * Lists the maps a step changes, by id: real maps alone, never a blueprint opened as a map.
 * @param {HistoryStep} step The step.
 * @returns {number[]} The maps' ids.
 */
const mapsChangedBy = (step: HistoryStep): number[] =>
{
  return documentsOfStep(step).flatMap(key =>
  {
    const parsed = parseDocumentKey(key);
    return parsed.kind === 'map' ? [ parsed.mapId ] : [];
  });
};

/**
 * Lists the maps one blueprint's copies stand on.
 * @param {readonly BlueprintCopy[]} copies The copies.
 * @returns {number[]} The maps' ids.
 */
const mapsOf = (copies: readonly BlueprintCopy[]): number[] =>
{
  return copies.map(copy => copy.mapId);
};

/**
 * Keeps the maps a change to a blueprint being edited in this window may write, as their files hold them: the window
 * plans what each copy on disk takes against these, never against a map's unsaved edits, so writing a change at once
 * never saves those edits. Every blueprint open as a map in this window (in a tab of its own, or an event of it in its own
 * window) has the maps its copies stand on gathered here, found from the record of where blueprints are placed, from the
 * copies' links counted on every map (as this window holds them, as other windows hold theirs, and as the disk holds
 * them, unsaved edits left out), and from the record's part each held map's file holds:
 *
 * - **a map held here** is changed in place by the change; its file is kept too while the map holds unsaved edits, read
 *   from disk, so the file's own copies can be planned apart from the map's;
 * - **a map only another window holds** is brought into this window, so the change reaches its unsaved copies in the same
 *   step, and that window repeats the step on its own copy;
 * - **a map nobody holds** is read from disk and kept, never held: the change writes it through to its file.
 *
 * Each kept file follows every blueprint change made, undone or redone, here or in another window, exactly as whoever
 * writes the change to disk writes it (see {@link follow}), so it is always the file as it will be once every write on
 * its way has landed; a map's file follows its saves; and a file changed by anything else on disk is read again, once no
 * write of this window's to it is on its way. Maps holding a plugin's patterns, such as J-ABS's action map, are never
 * among these, whatever links or records name them. A map kept here that this window then opens from its file takes up
 * the changes the file holds (see DocumentHub's attachSteps), so undo reaches them from the map too.
 */
class CopyMaps
{
  #hub: DocumentHub;

  #copies: CopySource;

  #holders: (key: DocumentKey) => readonly string[];

  #onHoldingChange: (listener: (key: DocumentKey) => void) => () => void;

  #openDocument: (key: DocumentKey) => Promise<EditorDocument>;

  #readMap: ((mapId: number) => Promise<RmmzMap>) | null;

  #templates: TemplateMapSource;

  /**
   * Each kept map's file, by map id, as it will be once every write on its way has landed.
   */
  #files = new Map<number, MapDocument>();

  /**
   * For each kept map nobody here holds, the changes this window wrote through to its file, in order: what the map takes up
   * once it is opened here.
   */
  #through = new Map<number, HistoryStep[]>();

  /**
   * For each map, how many of this window's writes to its file have not landed yet, waiting or on their way: a read of the
   * file meanwhile could miss any of them.
   */
  #unwritten = new Map<number, number>();

  /**
   * For each map, how many of this window's writes to it have started, so a read that lands after a write it may not have
   * seen is not kept.
   */
  #writes = new Map<number, number>();

  /**
   * The maps whose file is being read, and those whose copy is being brought in from another window.
   */
  #reading = new Set<number>();

  #bringing = new Set<number>();

  /**
   * The maps whose file the server no longer has, which no change can write.
   */
  #gone = new Set<number>();

  /**
   * Whether the documents every change is planned with have been asked for: the blueprints, the record of placements and
   * the tilesets.
   */
  #asked = false;

  /**
   * Why each copy last reached by a change could not take it, by map and event: what the where-used list shows beside it.
   */
  #drift = new Map<string, string>();

  #stops: (() => void)[] = [];

  /**
   * @param {CopyMapsOptions} options The window's documents, its count of copies, the other windows, and how to read a map.
   */
  constructor(options: CopyMapsOptions)
  {
    this.#hub = options.hub;
    this.#copies = options.copies;
    this.#holders = options.holders;
    this.#onHoldingChange = options.onHoldingChange;
    this.#openDocument = options.openDocument;
    this.#readMap = options.readMap;
    this.#templates = options.templates;
  }

  /**
   * Starts keeping maps: whenever a blueprint opens as a map here, its copies are counted and their maps gathered, and
   * again whenever the copies, the record or what other windows hold move on.
   */
  start(): void
  {
    this.#stops.push(
      this.#hub.subscribe(event => this.#heard(event)),
      this.#onHoldingChange(() => this.gather()),
      this.#copies.subscribe(() => this.gather()),
    );
    this.gather();
  }

  /**
   * Stops keeping maps; reads on their way still land.
   */
  stop(): void
  {
    this.#stops.splice(0).forEach(stop => stop());
  }

  /**
   * Lists the blueprints open as maps in this window, whose changes this window plans.
   * @returns {string[]} Their ids.
   */
  editedBlueprints(): string[]
  {
    return this.#hub.documentKeys().flatMap(key =>
    {
      const parsed = parseDocumentKey(key);
      return parsed.kind === 'blueprint-map' ? [ parsed.blueprintId ] : [];
    });
  }

  /**
   * Lists every map a change to a blueprint may reach: each map the record places its tiles on, each map holding a copy
   * of its events, here, in another window or on disk, and each map held here whose file still places it; never a map
   * holding a plugin's patterns, nor one whose file is gone.
   * @param {string} blueprintId The blueprint.
   * @returns {number[]} The maps' ids, ascending.
   */
  mapsWithCopies(blueprintId: string): number[]
  {
    // a map without unsaved edits places on file what the record places, which is counted already.
    const uses = readableUses(this.#hub);
    const placed = uses === null ? [] : spotsOfBlueprint(uses, blueprintId).map(spot => spot.mapId);
    const dirty = this.#heldMapIds().filter(mapId => this.#hub.isDirty(mapDocumentKey(mapId)));
    const onFile = uses === null ? [] : dirty.filter(mapId => this.fileSpots(mapId, blueprintId).length > 0);
    const found = [ ...placed, ...mapsOf(this.#copies.copiesOf(blueprintId)), ...mapsOf(this.#copies.copiesOnDisk(blueprintId)), ...onFile ];
    return [ ...new Set(found) ]
      .filter(mapId => this.#templates.templateMapOf(mapId) === null && this.#gone.has(mapId) === false)
      .sort((left, right) => left - right);
  }

  /**
   * Says why a change to a blueprint cannot be planned yet, or null when it can: the plugins are still being read; its
   * copies are still being counted, here or in other windows; a map it reaches is still being brought in from another
   * window, or read from disk; or a map it reaches waits for a choice about changes made on disk. Whatever is missing is
   * asked for on the way.
   * @param {string} blueprintId The blueprint.
   * @returns {string | null} Why it must wait, in words for the author, or null.
   */
  readiness(blueprintId: string): string | null
  {
    if (this.#templates.revision === 0)
    {
      return PLUGINS_UNREAD;
    }

    if (this.#copies.getSnapshot().state === 'counting' || this.#copies.settledElsewhere() === false)
    {
      this.#copies.start();
      return COPIES_UNCOUNTED;
    }

    for (const mapId of this.mapsWithCopies(blueprintId))
    {
      const waiting = this.#mapWaits(mapId);
      if (waiting !== null)
      {
        return waiting;
      }
    }

    return null;
  }

  /**
   * Finds a kept map's file, as it will be once every write on its way has landed.
   * @param {number} mapId The map.
   * @returns {MapDocument | null} The file, or null while it is not known.
   */
  file(mapId: number): MapDocument | null
  {
    return this.#files.get(mapId) ?? null;
  }

  /**
   * Lists a blueprint's placements on one map as the map's file has them: the record's, as this window holds it, with the
   * placements of the map's unsaved edits taken back out, newest first, for a map held here holding unsaved edits. A map
   * whose file holds steps since undone here keeps the record's as they stand, which is the nearest.
   * @param {number} mapId The map.
   * @param {string} blueprintId The blueprint.
   * @returns {BlueprintSpot[]} The placements.
   */
  fileSpots(mapId: number, blueprintId: string): BlueprintSpot[]
  {
    const uses = readableUses(this.#hub);
    if (uses === null)
    {
      return [];
    }

    const key = mapDocumentKey(mapId);
    const current = spotsOnMap(uses, mapId);
    if (this.#hub.has(key) === false || this.#hub.isDirty(key) === false)
    {
      return current.filter(spot => spot.blueprintId === blueprintId);
    }

    // the steps the map and its file share from the start need nothing taken out.
    const applied = this.#hub.appliedSteps(key);
    const saved = this.#hub.savedSteps(key);
    let shared = 0;
    while (shared < applied.length && shared < saved.length && applied[shared].id === saved[shared])
    {
      shared += 1;
    }

    const asSaved = shared < saved.length
      ? current
      : applied.slice(shared).reverse().reduce((spots, step) => moveThrough(spots, partChangesOf(step).find(change => change.mapId === mapId), 'backward'), [ ...current ]);
    return asSaved.filter(spot => spot.blueprintId === blueprintId);
  }

  /**
   * Notes why each copy a change just reached could not take it, and that every other copy it reached took it.
   * @param {number} mapId The map.
   * @param {readonly number[]} reached The copies the change was planned for.
   * @param {readonly { eventId: number, reason: string }[]} drifted Those that could not take it, with why.
   */
  noteDrift(mapId: number, reached: readonly number[], drifted: readonly { readonly eventId: number; readonly reason: string }[]): void
  {
    reached.forEach(eventId => this.#drift.delete(`${mapId}:${eventId}`));
    drifted.forEach(({ eventId, reason }) => this.#drift.set(`${mapId}:${eventId}`, reason));
  }

  /**
   * Says why a copy could not take the last change that reached it, while that is so.
   * @param {number} mapId The map.
   * @param {number} eventId The copy.
   * @returns {string | null} Why, or null when the last change reached it.
   */
  driftOf(mapId: number, eventId: number): string | null
  {
    return this.#drift.get(`${mapId}:${eventId}`) ?? null;
  }

  /**
   * Moves the kept files through a blueprint's change made, undone or redone, here or in another window, exactly as
   * whoever writes it to disk writes it, and says what each map's file takes. A map's file takes what the step recorded
   * for it in place of the map's own patches (see HistoryStep's fileVersions), or else the map's own patches, whichever
   * the file holds to start from: the map's own, once the map was saved with the step in it. A kept file neither fits is
   * no longer known, and is read again once needed. When this window writes the change, each map it reaches counts one
   * more write on its way (see {@link landed}); a map nobody here holds keeps the changes this window wrote through to it,
   * for it to take up once opened here.
   * @param {HistoryStep} step The step.
   * @param {'forward' | 'backward'} direction Made or redone, or undone.
   * @param {boolean} writes True when this window writes the change to disk, false when another window does, or when it
   * is being taken back after its write failed, which leaves the files as they were.
   * @returns {Map<number, Patch[]>} What each map's file takes, by map id, in the order the patches go; none for a step
   * that is no blueprint's change.
   */
  follow(step: HistoryStep, direction: 'forward' | 'backward', writes: boolean): Map<number, Patch[]>
  {
    const taken = new Map<number, Patch[]>();
    if (isBlueprintChange(step) === false)
    {
      return taken;
    }

    mapsChangedBy(step).forEach(mapId =>
    {
      const ways = waysToFile(step, mapDocumentKey(mapId)).map(patches => (direction === 'forward' ? patches : takenOut(patches)));
      const file = this.#files.get(mapId);
      const way = file === undefined ? ways[0] : ways.find(patches => patches.every(patch => fits(file, patch)));
      if (way === undefined)
      {
        // the file holds neither way: it is no longer known, and the write the first way makes will say so.
        this.#forget(mapId);
        taken.set(mapId, ways[0]);
      }
      else
      {
        way.forEach(patch => file?.apply(patch));
        this.#noteThrough(mapId, step, direction);
        taken.set(mapId, way);
      }

      if (writes)
      {
        this.#unwritten.set(mapId, (this.#unwritten.get(mapId) ?? 0) + 1);
        this.#writes.set(mapId, (this.#writes.get(mapId) ?? 0) + 1);
      }
    });

    return taken;
  }

  /**
   * Hears that writes {@link follow} counted have landed, or will never be made, their changes taken back: once a map has
   * none left on their way its file can be read again. A write that failed leaves the files it would have changed unknown,
   * since whatever made it fail was on disk.
   * @param {readonly number[]} mapIds The maps written, once for each write.
   * @param {boolean} ok True when the writes landed; false when they failed.
   */
  landed(mapIds: readonly number[], ok: boolean): void
  {
    mapIds.forEach(mapId =>
    {
      const left = (this.#unwritten.get(mapId) ?? 0) - 1;
      if (left > 0)
      {
        this.#unwritten.set(mapId, left);
      }
      else
      {
        this.#unwritten.delete(mapId);
      }

      if (ok === false)
      {
        this.#forget(mapId);
      }
    });

    this.gather();
  }

  /**
   * Gathers the maps every blueprint open here may reach: a map only another window holds is brought in, and a map nobody
   * holds, or held here with unsaved edits, has its file read. The blueprints, the record of placements and the tilesets
   * are asked for first, once.
   */
  gather(): void
  {
    const edited = this.editedBlueprints();
    if (edited.length === 0)
    {
      return;
    }

    this.#copies.start();
    if (this.#asked === false)
    {
      this.#asked = true;
      const planned: readonly DocumentKey[] = [ BLUEPRINTS_DOCUMENT, BLUEPRINT_USES_DOCUMENT, TILESETS_KEY ];
      planned.forEach(key => this.#openDocument(key).catch(() => undefined));
    }

    new Set(edited.flatMap(blueprintId => this.mapsWithCopies(blueprintId))).forEach(mapId => this.#mapWaits(mapId));
  }

  /**
   * Hears that a project file changed on disk. A kept file nobody here holds is read again unless a window of this
   * session wrote it, since each of those writes is followed here as it is made.
   * @param {string} path The file, as the change stream names it.
   * @param {boolean} bySession True when a window of this session wrote it.
   */
  fileChanged(path: string, bySession: boolean): void
  {
    const key = documentKeyForProjectPath(path);
    const parsed = key === null ? null : parseDocumentKey(key);
    if (bySession || parsed === null || parsed.kind !== 'map' || this.#files.has(parsed.mapId) === false || this.#hub.has(key as DocumentKey))
    {
      return;
    }

    this.#forget(parsed.mapId);
    this.#read(parsed.mapId);
  }

  /**
   * Says what a map a change reaches still waits for, asking for it on the way: a map held here waits only for a choice
   * about changes made on disk, or, holding unsaved edits, for its file to be read; a map only another window holds waits
   * to be brought in; and any other map waits for its file. A map held here without unsaved edits holds what its file
   * does, so its file is kept from it at once, and keeps following the file from then on, whatever is edited on the map.
   * @param {number} mapId The map.
   * @returns {string | null} Why it waits, or null when it does not.
   */
  #mapWaits(mapId: number): string | null
  {
    const key = mapDocumentKey(mapId);
    if (this.#hub.has(key))
    {
      if (this.#hub.isConflicted(key))
      {
        return mapConflicted(mapId);
      }

      if (this.#files.has(mapId))
      {
        return null;
      }

      if (this.#hub.isDirty(key))
      {
        return this.#read(mapId);
      }

      this.#files.set(mapId, MapDocument.fromJson(key, this.#hub.committedContent(key) as unknown as RmmzMap));
      return null;
    }

    if (this.#holders(key).length > 0)
    {
      this.#bring(mapId);
      return mapNotReady(mapId);
    }

    return this.#files.has(mapId) ? null : this.#read(mapId);
  }

  /**
   * Brings a map only another window holds into this one, once at a time.
   * @param {number} mapId The map.
   */
  #bring(mapId: number): void
  {
    if (this.#bringing.has(mapId))
    {
      return;
    }

    this.#bringing.add(mapId);
    this.#openDocument(mapDocumentKey(mapId))
      .catch(() => undefined)
      .finally(() => this.#bringing.delete(mapId));
  }

  /**
   * Reads a map's file from disk, once at a time, and only while no write of this window's to it is on its way, which the
   * read could miss; a read landing after such a write started is read again. A map opened here meanwhile keeps the read,
   * which is still its file. A map the server no longer has is gone.
   * @param {number} mapId The map.
   * @returns {string} Why the change waits meanwhile.
   */
  #read(mapId: number): string
  {
    const readMap = this.#readMap;
    if (readMap === null || this.#reading.has(mapId) || (this.#unwritten.get(mapId) ?? 0) > 0)
    {
      return mapNotReady(mapId);
    }

    this.#reading.add(mapId);
    const writesBefore = this.#writes.get(mapId) ?? 0;
    readMap(mapId)
      .then(content =>
      {
        this.#reading.delete(mapId);
        if ((this.#writes.get(mapId) ?? 0) !== writesBefore)
        {
          this.gather();
          return;
        }

        this.#files.set(mapId, MapDocument.fromJson(mapDocumentKey(mapId), content));
        this.#through.delete(mapId);
        this.gather();
      })
      .catch((error: unknown) =>
      {
        this.#reading.delete(mapId);
        if (error instanceof MapEditorApiError && error.status === 404)
        {
          this.#gone.add(mapId);
        }
      });

    return mapNotReady(mapId);
  }

  /**
   * Hears one event of the window's documents: a document taken up, a map's save, the file taking the map as it stood, and
   * a map let go of, thrown back to its file, or found changed on disk while it held unsaved edits; and a change to the
   * record of placements, which may name new maps to gather.
   * @param {HubEvent} event The event.
   */
  #heard(event: HubEvent): void
  {
    switch (event.type)
    {
      case 'adopted':
        this.#adopted(event.document);
        break;
      case 'saved':
        this.#saved(event.document, event.marker);
        break;
      case 'released':
      case 'reloaded':
      case 'conflicted':
        this.#forgetDocument(event.document);
        break;
      case 'committed':
      case 'undone':
      case 'redone':
        if (event.step.entries.some(entry => entry.document === BLUEPRINT_USES_DOCUMENT))
        {
          this.gather();
        }
        break;
      default:
        break;
    }
  }

  /**
   * Hears a document taken up: a blueprint opened as a map gathers its maps, and a map whose file this window wrote through
   * takes up the changes that file holds, or, holding something else, has its file forgotten.
   * @param {DocumentKey} key The document.
   */
  #adopted(key: DocumentKey): void
  {
    const parsed = parseDocumentKey(key);
    if (parsed.kind === 'blueprint-map')
    {
      this.gather();
      return;
    }

    if (parsed.kind !== 'map')
    {
      return;
    }

    const through = this.#through.get(parsed.mapId) ?? [];
    this.#through.delete(parsed.mapId);
    if (through.length > 0 && this.#hub.attachSteps(key, through) === false)
    {
      this.#forget(parsed.mapId);
    }
  }

  /**
   * Keeps a map's file as a save left it: the map as it stood at the steps the file now holds, which is the map with every
   * step applied since taken back out, when the save's steps are where the map's applied steps start. Otherwise the file
   * is no longer known.
   * @param {DocumentKey} key The document saved.
   * @param {readonly string[]} marker The steps its file holds.
   */
  #saved(key: DocumentKey, marker: readonly string[]): void
  {
    const parsed = parseDocumentKey(key);
    if (parsed.kind !== 'map' || this.#files.has(parsed.mapId) === false || this.#hub.has(key) === false)
    {
      return;
    }

    const applied = this.#hub.appliedSteps(key);
    const startsWithMarker = marker.length <= applied.length && marker.every((id, index) => applied[index].id === id);
    if (startsWithMarker === false)
    {
      this.#forget(parsed.mapId);
      return;
    }

    const map = this.#hub.map(mapDocumentKey(parsed.mapId));
    const since = applied.slice(marker.length).flatMap(step => entriesOn(step, key));
    this.#files.set(parsed.mapId, MapDocument.fromJson(map.key, map.toJsonWithout(since)));
  }

  /**
   * Forgets the file kept for a map document let go of, thrown back to its file, or found changed on disk.
   * @param {DocumentKey} key The document.
   */
  #forgetDocument(key: DocumentKey): void
  {
    const parsed = parseDocumentKey(key);
    if (parsed.kind === 'map')
    {
      this.#forget(parsed.mapId);
    }
  }

  /**
   * Forgets a map's kept file, and the changes this window wrote through to it.
   * @param {number} mapId The map.
   */
  #forget(mapId: number): void
  {
    this.#files.delete(mapId);
    this.#through.delete(mapId);
  }

  /**
   * Notes a change this window wrote through to a map nobody here holds going into its file or coming out.
   * @param {number} mapId The map.
   * @param {HistoryStep} step The step.
   * @param {'forward' | 'backward'} direction Which way it moved.
   */
  #noteThrough(mapId: number, step: HistoryStep, direction: 'forward' | 'backward'): void
  {
    const key = mapDocumentKey(mapId);
    if (this.#hub.has(key) || writesThrough(step, key) === false)
    {
      return;
    }

    const kept = (this.#through.get(mapId) ?? []).filter(each => each.id !== step.id);
    this.#through.set(mapId, direction === 'forward' ? [ ...kept, step ] : kept);
  }

  /**
   * Lists the maps held here, by id.
   * @returns {number[]} The ids.
   */
  #heldMapIds(): number[]
  {
    return this.#hub.documentKeys().flatMap(key =>
    {
      const parsed = parseDocumentKey(key);
      return parsed.kind === 'map' ? [ parsed.mapId ] : [];
    });
  }
}

export { CopyMaps, isBlueprintChange };
export type { CopyMapsOptions, CopySource };
