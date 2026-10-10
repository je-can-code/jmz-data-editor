import { MapEditorApiError, type MapEditorApi } from '../api/MapEditorApi.ts';
import { changeMapSpots, mapEntryOf, readableUses, spotsOfEntry, spotsOnMap, type BlueprintSpot } from '../blueprints/blueprintUses.ts';
import type { BlueprintUsesKeeper } from '../blueprints/blueprintUsesKeeper.ts';
import type { DocumentHub, DocumentSnapshot, HistoryFailure } from '../history/DocumentHub.ts';
import { TREE_HISTORY_KEY } from '../history/historyKeys.ts';
import type { FileEffect, HistoryStep } from '../history/HistoryStep.ts';
import { createDocument } from '../model/createDocument.ts';
import { MAP_INFOS_KEY, mapDocumentKey, parseDocumentKey, type DocumentKey } from '../model/documentKeys.ts';
import type { EditorDocument } from '../model/EditorDocument.ts';
import { jsonEquals, type JsonValue } from '../model/json.ts';
import { invertPatch, PatchConflictError } from '../model/patches.ts';
import type { RmmzMap, RmmzMapInfo } from '../model/rmmzTypes.ts';
import { documentName } from '../../views/documentLabels.ts';
import { TREE_ROOT, type MapInfoRows } from './MapTreeModel.ts';
import {
  copyMaps,
  newMapContent,
  planCreate,
  planDelete,
  planDuplicate,
  planMove,
  planPaste,
  planRename,
  rowPatches,
  type CopiedMap,
  type TreePlace,
  type TreePlan,
} from './treePlans.ts';

/**
 * What a tree operation, an undo or a redo came to: the step it recorded or moved and the maps worth selecting
 * afterwards, or why nothing changed, worded for the author. {@code alarm} marks a failure that could not be put
 * back cleanly, leaving the disk short of what the tree's history holds, which the author must see until they
 * dismiss it.
 */
type TreeOutcome =
  | { readonly ok: true; readonly step: HistoryStep | null; readonly selection: readonly number[] }
  | { readonly ok: false; readonly message: string; readonly alarm?: true };

/**
 * What copying came to: the maps captured for the clipboard, or why nothing was.
 */
type CopyOutcome =
  | { readonly ok: true; readonly copies: readonly CopiedMap[] }
  | { readonly ok: false; readonly message: string };

/**
 * A map file as a delete finds it on disk: its content, its exact text when that is known to be the same file, and its
 * placements of blueprints as the record on disk holds them beside it, its entry or null for none, when they are known.
 */
type CapturedFile = {
  readonly content: RmmzMap | null;
  readonly text: string | undefined;
  readonly placements?: JsonValue;
};

/**
 * What the tree asks of whoever keeps the record of where blueprints are placed: what the record's file holds, read
 * afresh, and to write the placements of the maps whose files a step brought or took away.
 */
type TreePlacements = Pick<BlueprintUsesKeeper, 'placementsOnDisk' | 'writeMaps'>;

/**
 * How far a step's write-through got: the step once it exists, the files it wrote and removed, whether its rows
 * moved and the tree's file was saved, the maps this window took up from the step's held copies, and the copies of
 * the maps it let go of. A failure puts back exactly these and nothing else, so a file the step never reached is
 * never touched.
 */
type WriteProgress = {
  step: HistoryStep | null;
  readonly written: FileEffect[];
  readonly deleted: FileEffect[];
  readonly adopted: DocumentKey[];
  readonly released: DocumentSnapshot[];
  rowsMoved: boolean;
  treeSaved: boolean;
};

/**
 * A step refused partway, after its files were written: the tree moved on meanwhile. Whatever it had done is put
 * back before the refusal reaches the author.
 */
class TreeRefusal extends Error
{
  /**
   * @param {string} message Why, worded for the author.
   */
  constructor(message: string)
  {
    super(message);
    this.name = 'TreeRefusal';
  }
}

/**
 * A file found where a step brings one, written after the step checked there was none: someone else's, and never
 * written over by a new step, an undo or a redo.
 */
class FileTakenError extends Error
{
  readonly mapId: number;

  /**
   * @param {number} mapId The map whose file is there.
   */
  constructor(mapId: number)
  {
    super(`map ${mapId} has a file again`);
    this.name = 'FileTakenError';
    this.mapId = mapId;
  }
}

/**
 * What checking a step's files came to: why the step cannot move, or the files that already hold what the step
 * brings, which moving it leaves as they are.
 */
type FileCheck =
  | { readonly refusal: string }
  | { readonly refusal: null; readonly inPlace: ReadonlySet<DocumentKey> };

/**
 * What the tree service needs from the window.
 */
type MapTreeServiceOptions = {
  /**
   * The window's documents and histories; the tree's steps live in its tree history.
   */
  readonly hub: DocumentHub;

  /**
   * The server, for reading, writing and removing map files.
   */
  readonly api: MapEditorApi;

  /**
   * Holds a document the way the window does: another window's live copy when one holds it, the file otherwise.
   * @param {DocumentKey} key The document.
   * @returns {Promise<EditorDocument>} The document.
   */
  readonly openDocument: (key: DocumentKey) => Promise<EditorDocument>;

  /**
   * Whoever keeps the record of where blueprints are placed, which a step writes the placements of the maps it brings or
   * takes away through; left out, or null, no step writes any.
   */
  readonly placements?: TreePlacements | null;
};

/**
 * The tileset a new map gets when it has no parent map to take one from.
 */
const DEFAULT_TILESET_ID = 1;

/**
 * How many times a new map's id is re-picked when the file for the one picked already exists.
 */
const MAX_ID_ATTEMPTS = 20;

/**
 * Reads a map id back out of the document key a file effect names.
 * @param {DocumentKey} key The key.
 * @returns {number} The map id.
 */
const mapIdOf = (key: DocumentKey): number =>
{
  const parsed = parseDocumentKey(key);
  if (parsed.kind !== 'map')
  {
    throw new Error(`${key} is not a map`);
  }

  return parsed.mapId;
};

/**
 * Words a failure for the author.
 * @param {unknown} error What was thrown.
 * @returns {string} The words.
 */
const messageOf = (error: unknown): string =>
{
  return error instanceof Error
    ? error.message
    : String(error);
};

/**
 * Words why the history refused to move a step, naming each document as the author knows it, a map as the map tree
 * shows it.
 * @param {HistoryFailure} failure The refusal.
 * @param {'backward' | 'forward'} direction Undo or redo.
 * @param {(mapId: number) => string} mapName Names a map as the map tree shows it.
 * @returns {string} The words.
 */
const describeFailure = (failure: HistoryFailure, direction: 'backward' | 'forward', mapName: (mapId: number) => string): string =>
{
  const verb = direction === 'backward' ? 'undo' : 'redo';
  switch (failure.reason)
  {
    case 'nothing':
      return `Nothing to ${verb} in the map tree.`;
    case 'missing-documents':
      return `"${failure.step.label}" needs ${failure.documents.map(key => documentName(key, mapName)).join(', ')} open to ${verb}.`;
    case 'conflict':
    case 'moved':
    case 'untracked':
      return failure.blockedBy === null
        ? `"${failure.step.label}" cannot ${verb}: ${failure.message}.`
        : `"${failure.step.label}" cannot ${verb}: "${failure.blockedBy.label}" changed the same maps since.`;
  }
};

/**
 * Words the refusal of an undo or redo that would write a file over one that is there: found by the check before
 * the step moves, or by the server when the file arrived after that check.
 * @param {HistoryStep} step The step.
 * @param {'backward' | 'forward'} direction Undo or redo.
 * @param {string} name The map whose file is there, as the map tree shows it.
 * @returns {string} The words.
 */
const fileTakenRefusal = (step: HistoryStep, direction: 'backward' | 'forward', name: string): string =>
{
  const verb = direction === 'backward' ? 'undo' : 'redo';
  return `"${step.label}" cannot ${verb}: ${name} has a file again, which it would write over.`;
};

/**
 * Words the refusal of a new step whose new map's id got a file of its own after the step picked it, which the step
 * leaves alone. Trying again picks an id with no file behind it.
 * @param {string} label The step's label.
 * @param {number} mapId The map whose file arrived.
 * @returns {string} The words.
 */
const newFileTakenRefusal = (label: string, mapId: number): string =>
{
  return `Map ${mapId} got a file of its own while "${label}" was being saved, so it was left alone; try it again.`;
};

/**
 * Reports whether the server refused a write because a file is already where it would land. Restoring a file's text
 * answers 409 and creating a map answers 412, and neither writes anything.
 * @param {unknown} error What the write threw.
 * @returns {boolean} True for that refusal.
 */
const refusedForFileThere = (error: unknown): boolean =>
{
  return error instanceof MapEditorApiError && (error.status === 409 || error.status === 412);
};

/**
 * Words the refusal of an undo or redo that would list a map again whose file is gone: a step made outside the
 * editor carries no files, and the change it recorded may have taken the map's file away along with its row.
 * @param {HistoryStep} step The step.
 * @param {'backward' | 'forward'} direction Undo or redo.
 * @param {string} name The map it would list, as the map tree would show it.
 * @returns {string} The words.
 */
const missingFileRefusal = (step: HistoryStep, direction: 'backward' | 'forward', name: string): string =>
{
  const verb = direction === 'backward' ? 'undo' : 'redo';
  return `"${step.label}" cannot ${verb}: ${name} has no file, so the tree would list a map that is not there.`;
};

/**
 * Words the refusal of an undo or redo that would take away a map changed since the step, losing the change.
 * @param {HistoryStep} step The step.
 * @param {'backward' | 'forward'} direction Undo or redo.
 * @param {string} name The changed map, as the map tree shows it.
 * @returns {string} The words.
 */
const changedRefusal = (step: HistoryStep, direction: 'backward' | 'forward', name: string): string =>
{
  const verb = direction === 'backward' ? 'undo' : 'redo';
  return `"${step.label}" cannot ${verb}: ${name} has changed since, and those changes would be lost.`;
};

/**
 * Words a write-through that failed and was put back, cleanly or not. A clean put-back is an ordinary failure; one
 * that could not finish is an alarm, naming what is missing and, while the step is still in the history, saying
 * that its files are safe there for as long as the window stays open.
 * @param {string} label The step's label.
 * @param {unknown} error Why the write-through failed.
 * @param {readonly string[]} problems What the put-back could not do; empty when it did everything.
 * @param {boolean} kept True when the step is still in the tree's history, holding its files.
 * @returns {TreeOutcome} The failure.
 */
const failedWrite = (label: string, error: unknown, problems: readonly string[], kept: boolean): TreeOutcome =>
{
  const failure = `"${label}" could not be saved: ${messageOf(error)}`;
  if (problems.length === 0)
  {
    return { ok: false, message: failure };
  }

  const safety = kept
    ? ' Nothing is lost: the map tree\'s history still holds every map it touched. Keep this window open, and undo or redo it once saving works again.'
    : '';
  return { ok: false, alarm: true, message: `${failure}. Putting it back failed too: ${problems.join('; ')}.${safety}` };
};

/**
 * The map tree's one way in. Every tree operation (create, rename, nest, reorder, delete, copy and paste,
 * duplicate) is worked out as a plan, recorded as one step in the tree history and written through at once, so
 * MapInfos.json and the map files always agree with the tree on screen; and every undo, redo and history jump of
 * the tree goes through here too, because a tree step carries whole map files that the history core records but
 * never writes.
 *
 * The order of writes keeps the promise that the tree never names a map without a file, on screen as on disk: files
 * a step brings are written first, then its rows move in the tree every panel reads, then MapInfos.json is saved,
 * then the files it takes away are deleted, which the server allows only once the tree no longer lists them. A
 * panel waiting on a map that comes back therefore always finds its file. Before undoing or redoing a step that
 * creates or removes files, each file is checked to still hold what the step left there, so a map edited since is
 * never silently deleted or written over; and a step that would list a map again is refused when that map has no
 * file, which is what a change made outside the editor leaves behind when it took a map away, file and all. A write that fails partway puts back exactly what it had changed, removed
 * files first, so the tree never lists a map whose file is missing. When even that cannot finish, the step stays in
 * the history holding every file, the tree stays where it agrees with the disk, and the outcome is an alarm; moving
 * the step again once the disk recovers finishes the job, keeping any file that already holds what the step brings.
 *
 * Operations queue one behind another, since each one reads the tree, waits on the server, then records its step.
 *
 * Once a step's write-through has finished, the placements of blueprints of every map whose file it brought or took
 * away go to the record on disk as the step left them (see {@link FileEffect}): a map it brings with the placements it
 * was made with, a deleted map coming back with the placements the record held for it when it went, and a map it takes
 * away with none. A write-through that failed and was put back leaves the record as it was.
 */
class MapTreeService
{
  #hub: DocumentHub;

  #api: MapEditorApi;

  #openDocument: (key: DocumentKey) => Promise<EditorDocument>;

  #placements: TreePlacements | null;

  #queue: Promise<unknown> = Promise.resolve();

  /**
   * @param {MapTreeServiceOptions} options The hub, the server, the window's way of holding documents, and whoever keeps
   * the record of where blueprints are placed.
   */
  constructor(options: MapTreeServiceOptions)
  {
    this.#hub = options.hub;
    this.#api = options.api;
    this.#openDocument = options.openDocument;
    this.#placements = options.placements ?? null;
  }

  /**
   * Holds the map tree, loading it the first time.
   * @returns {Promise<EditorDocument>} The map tree's document.
   */
  tree(): Promise<EditorDocument>
  {
    return this.#openDocument(MAP_INFOS_KEY);
  }

  /**
   * Reads the tree's rows as they stand. The tree must be held already.
   * @returns {(RmmzMapInfo | null)[]} A copy of the rows, index 0 null.
   */
  rows(): (RmmzMapInfo | null)[]
  {
    return this.#hub.document(MAP_INFOS_KEY).toJson() as unknown as (RmmzMapInfo | null)[];
  }

  /**
   * Creates a map under a parent, drawing with the parent's tileset.
   * @param {number} parentId The map it goes under, or {@link TREE_ROOT} for the top level.
   * @returns {Promise<TreeOutcome>} The step, and the new map to select.
   */
  create(parentId: number): Promise<TreeOutcome>
  {
    return this.#run(async () =>
    {
      const parent = parentId === TREE_ROOT
        ? null
        : await this.#fileOf(parentId);
      const content = newMapContent(parent?.tilesetId ?? DEFAULT_TILESET_ID);
      const base = this.rows();
      const plan = await this.#withFreeIds(skip => planCreate(base, parentId, content, skip));
      return this.#commit(base, plan, new Map());
    });
  }

  /**
   * Renames a map.
   * @param {number} mapId The map.
   * @param {string} name The new name.
   * @returns {Promise<TreeOutcome>} The step, or none when the name did not change.
   */
  rename(mapId: number, name: string): Promise<TreeOutcome>
  {
    return this.#run(async () =>
    {
      const base = this.rows();
      return this.#commit(base, planRename(base, mapId, name), new Map());
    });
  }

  /**
   * Moves maps, each with its branch: nesting under a new parent, or reordering among siblings.
   * @param {readonly number[]} mapIds The maps.
   * @param {TreePlace} place Where they land.
   * @returns {Promise<TreeOutcome>} The step, or none when nothing moved.
   */
  move(mapIds: readonly number[], place: TreePlace): Promise<TreeOutcome>
  {
    return this.#run(async () =>
    {
      const base = this.rows();
      return this.#commit(base, planMove(base, mapIds, place), new Map());
    });
  }

  /**
   * Deletes maps with their branches, files and all, as one step whose undo writes every file back exactly as the
   * disk had it, and their placements of blueprints back into the record as the record on disk held them. A map this
   * window holds goes with its copy, so the undo also brings it back as it was being edited: its own undo history
   * returns, and unsaved edits come back unsaved, its unsaved placements among them.
   * @param {readonly number[]} mapIds The maps.
   * @returns {Promise<TreeOutcome>} The step.
   */
  remove(mapIds: readonly number[]): Promise<TreeOutcome>
  {
    return this.#run(async () =>
    {
      const base = this.rows();
      const plan = planDelete(base, mapIds);
      const onDisk = this.#placements === null
        ? null
        : await this.#placements.placementsOnDisk();
      const files = new Map<number, CapturedFile>();
      for (const mapId of plan.removed)
      {
        // a record that could not be read says nothing of what the maps held, and an undo leaves it as it finds it.
        const captured = await this.#capture(mapId);
        files.set(mapId, onDisk === null ? captured : { ...captured, placements: mapEntryOf(onDisk.get(mapId) ?? []) ?? null });
      }

      return this.#commit(base, plan, files);
    });
  }

  /**
   * Captures maps for the clipboard, each with its file as it stands now, unsaved edits included, and the placements of
   * blueprints the record holds for it now, which pasting it records for the new map.
   * @param {readonly number[]} mapIds The maps.
   * @returns {Promise<CopyOutcome>} The copies.
   */
  copy(mapIds: readonly number[]): Promise<CopyOutcome>
  {
    return this.#run(async () =>
    {
      try
      {
        const contents = await this.#filesOf(mapIds);
        const spots = await this.#spotsOf(mapIds);
        return { ok: true as const, copies: copyMaps(this.rows(), mapIds, contents, spots) };
      }
      catch (error)
      {
        return { ok: false as const, message: messageOf(error) };
      }
    });
  }

  /**
   * Pastes copied maps as new maps under a parent.
   * @param {readonly CopiedMap[]} copies The clipboard's maps.
   * @param {number} parentId Where they land, or {@link TREE_ROOT} for the top level.
   * @returns {Promise<TreeOutcome>} The step, and the new maps to select.
   */
  paste(copies: readonly CopiedMap[], parentId: number): Promise<TreeOutcome>
  {
    return this.#run(async () =>
    {
      const base = this.rows();
      const plan = await this.#withFreeIds(skip => planPaste(base, copies, parentId, skip));
      return this.#commit(base, plan, new Map());
    });
  }

  /**
   * Duplicates maps, each copy right after its original, with the placements of blueprints its original holds.
   * @param {readonly number[]} mapIds The maps.
   * @returns {Promise<TreeOutcome>} The step, and the copies to select.
   */
  duplicate(mapIds: readonly number[]): Promise<TreeOutcome>
  {
    return this.#run(async () =>
    {
      const contents = await this.#filesOf(mapIds);
      const spots = await this.#spotsOf(mapIds);
      const sources = [ ...contents.entries() ].map(([ mapId, content ]) => ({ mapId, content, spots: spots.get(mapId) ?? [] }));
      const base = this.rows();
      const plan = await this.#withFreeIds(skip => planDuplicate(base, sources, skip));
      return this.#commit(base, plan, new Map());
    });
  }

  /**
   * Undoes the tree's newest step, files and all.
   * @returns {Promise<TreeOutcome>} The step undone, or why not.
   */
  undo(): Promise<TreeOutcome>
  {
    return this.#run(() => this.#move('backward'));
  }

  /**
   * Redoes the tree's most recently undone step, files and all.
   * @returns {Promise<TreeOutcome>} The step redone, or why not.
   */
  redo(): Promise<TreeOutcome>
  {
    return this.#run(() => this.#move('forward'));
  }

  /**
   * Moves the tree's history to just after one of its steps, the way a click on a history panel row does, one
   * step at a time, stopping at the first step that cannot move.
   * @param {string | null} stepId The step to end on, or null for before the first.
   * @returns {Promise<TreeOutcome>} The last step moved, or why it stopped.
   */
  jumpTo(stepId: string | null): Promise<TreeOutcome>
  {
    return this.#run(async () =>
    {
      const target = this.#positionAfter(stepId);
      if (target === null)
      {
        return { ok: false as const, message: 'That step is not in the map tree\'s history.' };
      }

      let outcome: TreeOutcome = { ok: true, step: null, selection: [] };
      while (outcome.ok && this.#hub.history(TREE_HISTORY_KEY).position !== target)
      {
        outcome = await this.#move(this.#hub.history(TREE_HISTORY_KEY).position > target ? 'backward' : 'forward');
      }

      return outcome;
    });
  }

  /**
   * Runs one operation after every one before it, turning a refusal into an outcome rather than a throw.
   * @param {() => Promise<T>} task The operation.
   * @returns {Promise<T | TreeOutcome>} What it came to.
   */
  #run<T>(task: () => Promise<T>): Promise<T | { ok: false; message: string }>
  {
    const next = this.#queue.then(async () =>
    {
      try
      {
        await this.tree();
        return await task();
      }
      catch (error)
      {
        return { ok: false as const, message: messageOf(error) };
      }
    });
    this.#queue = next.catch(() => undefined);
    return next;
  }

  /**
   * Records a plan as one step and writes it through: new files, then the step and its rows, then the tree's file,
   * then removals. A tree that changed while the plan waited on the server (another window's step, say) refuses the
   * plan rather than undoing that change with it. The record of where blueprints are placed changes in the same step,
   * when the window holds it: a map that goes takes its placements with it, and a map that comes holds exactly the
   * placements it was copied with, a brand new one none, so one undo puts the record back with the maps.
   * @param {MapInfoRows} base The rows the plan was worked out from.
   * @param {TreePlan} plan The plan.
   * @param {ReadonlyMap<number, CapturedFile>} removedFiles Each removed map's file as it stood.
   * @returns {Promise<TreeOutcome>} The step.
   */
  async #commit(base: MapInfoRows, plan: TreePlan, removedFiles: ReadonlyMap<number, CapturedFile>): Promise<TreeOutcome>
  {
    const changedMeanwhile = `The map tree changed while "${plan.label}" was being worked out; try it again.`;
    if (jsonEquals(this.rows(), base) === false)
    {
      return { ok: false, message: changedMeanwhile };
    }

    const files = this.#fileEffects(plan, removedFiles);
    const progress: WriteProgress = { step: null, written: [], deleted: [], adopted: [], released: [], rowsMoved: false, treeSaved: false };
    try
    {
      // the new maps' files land before the tree lists them, so nothing showing the tree finds a map without one.
      await this.#arrive(files, 'forward', progress, new Set());
      if (jsonEquals(this.rows(), base) === false)
      {
        throw new TreeRefusal(changedMeanwhile);
      }

      // a removed map this window holds goes with its copy, histories and unsaved edits included, taken in the same
      // moment the map is let go of, so no edit can fall between the two.
      const held = new Map(files
        .filter(file => file.after === null && this.#hub.has(file.document))
        .map(file => [ file.document, this.#hub.snapshot(file.document) ]));
      const step = this.#hub.edit(plan.label, [ TREE_HISTORY_KEY ], tx =>
      {
        rowPatches(base, plan.rows).forEach(({ path, value }) => tx.set(MAP_INFOS_KEY, path, value));
        files.forEach(file => tx.file(file.document, file.before, file.after, {
          before: file.beforeText,
          after: file.afterText,
          beforeHeld: held.get(file.document),
          beforePlacements: file.beforePlacements,
          afterPlacements: file.afterPlacements,
        }));
        plan.created.forEach(({ mapId, spots }) => changeMapSpots(tx, this.#hub, mapId, () => spots));
        plan.removed.forEach(mapId => changeMapSpots(tx, this.#hub, mapId, () => []));
      });
      if (step === null)
      {
        return { ok: true, step: null, selection: plan.selection };
      }

      progress.step = step;
      progress.rowsMoved = true;
      this.#releaseLeaving(files, 'forward', progress);
      await this.#settle(files, 'forward', progress);
    }
    catch (error)
    {
      // part of the step never reached the disk, so once everything is back it goes from history as well; a step
      // that could not be put back is kept, since it may hold the only copy of a map.
      const problems = await this.#restore('forward', progress);
      const { step } = progress;
      if (problems.length === 0 && step !== null)
      {
        this.#hub.forgetStep(step.id);
      }

      if (problems.length === 0 && error instanceof FileTakenError)
      {
        return { ok: false, message: newFileTakenRefusal(plan.label, error.mapId) };
      }

      return error instanceof TreeRefusal && problems.length === 0
        ? { ok: false, message: error.message }
        : failedWrite(plan.label, error, problems, step !== null && problems.length > 0);
    }

    // the files are where the step leaves them, so their placements follow them to disk; the record's own writes are
    // never part of the write-through, and a problem writing them is said without taking the step back.
    this.#writePlacements(files, 'forward');
    return { ok: true, step: progress.step, selection: plan.selection };
  }

  /**
   * Undoes or redoes the tree's head step once its files are known to be where it left them, writing it through in
   * the same order as a new step: arriving files, then the rows, then the tree's file, then the removals.
   * @param {'backward' | 'forward'} direction Undo or redo.
   * @returns {Promise<TreeOutcome>} The step moved, or why not.
   */
  async #move(direction: 'backward' | 'forward'): Promise<TreeOutcome>
  {
    const check = direction === 'backward'
      ? this.#hub.canUndo(TREE_HISTORY_KEY)
      : this.#hub.canRedo(TREE_HISTORY_KEY);
    if (check.ok === false)
    {
      return { ok: false, message: describeFailure(check, direction, mapId => this.#rowName(mapId)) };
    }

    const { step } = check;
    const checked = await this.#checkFiles(step, direction);
    if (checked.refusal !== null)
    {
      return { ok: false, message: checked.refusal };
    }

    // a map the step lists again needs a file to open, which a step made outside the editor never brings.
    const unlisted = await this.#checkListedFiles(step, direction);
    if (unlisted !== null)
    {
      return { ok: false, message: unlisted };
    }

    const files = step.files ?? [];
    const progress: WriteProgress = { step, written: [], deleted: [], adopted: [], released: [], rowsMoved: false, treeSaved: false };
    try
    {
      // the maps coming back are on disk, and held again as they were being edited, before their rows are, so a
      // panel waiting on one finds it; the maps going are let go of in the same moment their rows go.
      await this.#arrive(files, direction, progress, checked.inPlace);
      this.#confirmLeaving(step, direction);
      this.#adoptArriving(files, direction, progress);
      this.#moveRows(step, direction);
      progress.rowsMoved = true;
      this.#releaseLeaving(files, direction, progress);
      await this.#settle(files, direction, progress);
    }
    catch (error)
    {
      const problems = await this.#restore(direction, progress);
      if (problems.length === 0 && error instanceof FileTakenError)
      {
        return { ok: false, message: fileTakenRefusal(step, direction, this.#movedName(step, direction, error.mapId)) };
      }

      return error instanceof TreeRefusal && problems.length === 0
        ? { ok: false, message: error.message }
        : failedWrite(step.label, error, problems, true);
    }

    // the files are where the step leaves them, so their placements follow them to disk.
    this.#writePlacements(files, direction);
    const arriving = files.filter(file => this.#arriving(file, direction) !== null);
    return { ok: true, step, selection: arriving.map(file => mapIdOf(file.document)) };
  }

  /**
   * Moves a step's rows in the tree: undoes or redoes it in the history, once it is certain to still be the step to
   * move, since another window's step can land on the tree while this one's files are written.
   * @param {HistoryStep} step The step whose files were just written.
   * @param {'backward' | 'forward'} direction Undo or redo.
   */
  #moveRows(step: HistoryStep, direction: 'backward' | 'forward'): void
  {
    const head = direction === 'backward'
      ? this.#hub.canUndo(TREE_HISTORY_KEY)
      : this.#hub.canRedo(TREE_HISTORY_KEY);
    if (head.ok === false)
    {
      throw new TreeRefusal(describeFailure(head, direction, mapId => this.#rowName(mapId)));
    }

    if (head.step.id !== step.id)
    {
      throw new TreeRefusal(`The map tree changed while "${step.label}" was being written; try it again.`);
    }

    const moved = direction === 'backward'
      ? this.#hub.undo(TREE_HISTORY_KEY)
      : this.#hub.redo(TREE_HISTORY_KEY);
    if (moved.ok === false)
    {
      throw new TreeRefusal(describeFailure(moved, direction, mapId => this.#rowName(mapId)));
    }
  }

  /**
   * Moves a step's rows back after its write-through failed, but only while it is still the step at the history's
   * head: another window's step may have landed on the tree meanwhile, and that one must never be moved in its place.
   * @param {HistoryStep | null} step The step whose rows moved.
   * @param {'backward' | 'forward'} direction Which way they had moved.
   * @returns {boolean} True when the rows are back.
   */
  #moveRowsBack(step: HistoryStep | null, direction: 'backward' | 'forward'): boolean
  {
    const head = direction === 'forward'
      ? this.#hub.canUndo(TREE_HISTORY_KEY)
      : this.#hub.canRedo(TREE_HISTORY_KEY);
    if (step === null || head.ok === false || head.step.id !== step.id)
    {
      return false;
    }

    const back = direction === 'forward'
      ? this.#hub.undo(TREE_HISTORY_KEY)
      : this.#hub.redo(TREE_HISTORY_KEY);
    return back.ok;
  }

  /**
   * Confirms, in the moment before the rows move, that every map about to be let go of in this window still holds
   * what the step recorded: its held copy when the step carries one, its file otherwise. The check before the step
   * moved waited on the server, and an edit made meanwhile would be lost with the map.
   * @param {HistoryStep} step The step.
   * @param {'backward' | 'forward'} direction Undo or redo.
   */
  #confirmLeaving(step: HistoryStep, direction: 'backward' | 'forward'): void
  {
    for (const file of step.files ?? [])
    {
      const leaving = this.#leaving(file, direction);
      if (leaving === null || this.#arriving(file, direction) !== null || this.#hub.has(file.document) === false)
      {
        continue;
      }

      const expected = this.#leavingHeld(file, direction)?.content ?? leaving;
      if (jsonEquals(this.#hub.snapshot(file.document).content, expected) === false)
      {
        throw new TreeRefusal(changedRefusal(step, direction, this.#movedName(step, direction, mapIdOf(file.document))));
      }
    }
  }

  /**
   * Holds again, as they were being edited, the maps a step brings back with the copies this window held of them:
   * their histories return with them, and their unsaved edits stay unsaved, over a file the disk had all along.
   * @param {readonly FileEffect[]} files The step's files.
   * @param {'backward' | 'forward'} direction Which way the step moves.
   * @param {WriteProgress} progress Where to note each map taken up.
   */
  #adoptArriving(files: readonly FileEffect[], direction: 'backward' | 'forward', progress: WriteProgress): void
  {
    files.forEach(file =>
    {
      const held = this.#arrivingHeld(file, direction);
      if (held !== undefined)
      {
        this.#hub.adoptSnapshot(held);
        progress.adopted.push(file.document);
      }
    });
  }

  /**
   * Lets go of every map a step takes away that this window holds, keeping each copy in the progress so a failure can
   * take it up again exactly as it was.
   * @param {readonly FileEffect[]} files The step's files.
   * @param {'backward' | 'forward'} direction Which way the step moved.
   * @param {WriteProgress} progress Where to note each copy let go of.
   */
  #releaseLeaving(files: readonly FileEffect[], direction: 'backward' | 'forward', progress: WriteProgress): void
  {
    files
      .filter(file => this.#arriving(file, direction) === null && this.#hub.has(file.document))
      .forEach(file =>
      {
        progress.released.push(this.#hub.snapshot(file.document));
        this.#hub.release(file.document);
      });
  }

  /**
   * Lists the whole files a plan creates and removes, as its step will carry them.
   * @param {TreePlan} plan The plan.
   * @param {ReadonlyMap<number, CapturedFile>} removedFiles Each removed map's file as it stood.
   * @returns {FileEffect[]} The files, created ones first.
   */
  #fileEffects(plan: TreePlan, removedFiles: ReadonlyMap<number, CapturedFile>): FileEffect[]
  {
    // a new map's file holds exactly the placements it was made with, a brand new one none.
    const created: FileEffect[] = plan.created.map(({ mapId, content, spots }) => ({
      document: mapDocumentKey(mapId),
      before: null,
      after: content as unknown as JsonValue,
      afterPlacements: mapEntryOf(spots) ?? null,
    }));

    // a map listed with no file behind it leaves nothing to write back.
    const removed = plan.removed.flatMap((mapId): FileEffect[] =>
    {
      const file = removedFiles.get(mapId);
      if (file === undefined || file.content === null)
      {
        return [];
      }

      return [ {
        document: mapDocumentKey(mapId),
        before: file.content as unknown as JsonValue,
        after: null,
        ...(file.text === undefined ? {} : { beforeText: file.text }),
        ...(file.placements === undefined ? {} : { beforePlacements: file.placements }),
      } ];
    });

    return [ ...created, ...removed ];
  }

  /**
   * Writes the placements of blueprints of every map whose file a step just brought or took away, as the step leaves
   * them: a map it brings takes those its side of the step carries, and one it takes away takes none. A side carrying
   * none, as a delete made while the record could not be read does, leaves the map's placements on disk as they are.
   * @param {readonly FileEffect[]} files The step's files.
   * @param {'backward' | 'forward'} direction Which way the step moved.
   */
  #writePlacements(files: readonly FileEffect[], direction: 'backward' | 'forward'): void
  {
    if (this.#placements === null)
    {
      return;
    }

    const parts = new Map<number, readonly BlueprintSpot[]>();
    files.forEach(file =>
    {
      const mapId = mapIdOf(file.document);
      const placements = direction === 'forward' ? file.afterPlacements : file.beforePlacements;
      if (this.#arriving(file, direction) === null)
      {
        parts.set(mapId, []);
      }
      else if (placements !== undefined)
      {
        parts.set(mapId, spotsOfEntry(mapId, placements === null ? undefined : placements));
      }
    });

    this.#placements.writeMaps(parts);
  }

  /**
   * Checks every file a step creates or removes still holds what the step left there, before the step moves. A map
   * the step took away with this window's copy of it is checked twice over: its file against the file the step
   * recorded, and the copy held here against the copy the step carries, so an edit made since in either place is
   * never lost. A file that already holds exactly what the step brings has nothing to lose, and is noted to be left
   * as it is: a step whose failed write-through could not be put back leaves such files behind, and moving it again
   * keeps them.
   * @param {HistoryStep} step The step.
   * @param {'backward' | 'forward'} direction Undo or redo.
   * @returns {Promise<FileCheck>} Why the step cannot move, or the files already in place.
   */
  async #checkFiles(step: HistoryStep, direction: 'backward' | 'forward'): Promise<FileCheck>
  {
    const inPlace = new Set<DocumentKey>();
    for (const file of step.files ?? [])
    {
      const mapId = mapIdOf(file.document);
      const leaving = this.#leaving(file, direction);
      const arriving = this.#arriving(file, direction);
      const held = this.#leavingHeld(file, direction);
      const current = held === undefined
        ? await this.#fileOf(mapId)
        : await this.#diskFileOf(mapId);
      const heldChanged = held !== undefined
        && this.#hub.has(file.document)
        && jsonEquals(this.#hub.snapshot(file.document).content, held.content) === false;
      if (jsonEquals(current, leaving) && heldChanged === false)
      {
        continue;
      }

      if (leaving === null && arriving !== null && jsonEquals(current, arriving))
      {
        inPlace.add(file.document);
        continue;
      }

      // a refusal names the map as the map tree shows it, or would once the step brings it back.
      const name = this.#movedName(step, direction, mapId);
      if (leaving === null)
      {
        return { refusal: fileTakenRefusal(step, direction, name) };
      }

      const verb = direction === 'backward' ? 'undo' : 'redo';
      return {
        refusal: current === null
          ? `"${step.label}" cannot ${verb}: ${name}'s file is gone.`
          : changedRefusal(step, direction, name),
      };
    }

    return { refusal: null, inPlace };
  }

  /**
   * Checks that every map a step would list in the tree again has a file to open: one the step brings itself, or one
   * already on disk. Moving a step writes back only the files it carries, and a step made outside the editor carries
   * none, while the change it recorded may have taken a map's file away with its row, as a checkout that removes a map
   * does; listing that map again would name a map that is not there. A map the window holds a copy of still counts as
   * having no file, since a copy is not on disk.
   * @param {HistoryStep} step The step.
   * @param {'backward' | 'forward'} direction Undo or redo.
   * @returns {Promise<string | null>} Why the step cannot move, worded for the author, or null when every map it lists
   * has a file.
   */
  async #checkListedFiles(step: HistoryStep, direction: 'backward' | 'forward'): Promise<string | null>
  {
    const brought = new Set((step.files ?? [])
      .filter(file => this.#arriving(file, direction) !== null)
      .map(file => file.document));

    for (const [ mapId, name ] of this.#mapsListedBy(step, direction))
    {
      if (brought.has(mapDocumentKey(mapId)) === false && (await this.#diskFileOf(mapId)) === null)
      {
        return missingFileRefusal(step, direction, documentName(mapDocumentKey(mapId), () => name));
      }
    }

    return null;
  }

  /**
   * Lists the maps a step would put back into the tree, by moving its rows on a copy of the tree as it stands: every
   * map with a row once the step has moved that has none now.
   * @param {HistoryStep} step The step.
   * @param {'backward' | 'forward'} direction Undo or redo.
   * @returns {[ number, string ][]} Each such map's id and name; none when the rows no longer fit the tree, which the
   * move itself then refuses.
   */
  #mapsListedBy(step: HistoryStep, direction: 'backward' | 'forward'): [ number, string ][]
  {
    const before = this.rows();
    const copy = createDocument(MAP_INFOS_KEY, before as unknown as JsonValue);
    const patches = step.entries
      .filter(entry => entry.document === MAP_INFOS_KEY)
      .map(entry => entry.patch);
    const moving = direction === 'forward'
      ? patches
      : [ ...patches ].reverse().map(invertPatch);

    try
    {
      moving.forEach(patch => copy.apply(patch));
    }
    catch (error)
    {
      if ((error instanceof PatchConflictError) === false)
      {
        throw error;
      }

      return [];
    }

    const after = copy.toJson() as unknown as (RmmzMapInfo | null)[];
    return after.flatMap((row, mapId): [ number, string ][] => (row !== null && (before[mapId] ?? null) === null ? [ [ mapId, row.name ] ] : []));
  }

  /**
   * Reads a map's name in the tree as it stands.
   * @param {number} mapId The map.
   * @returns {string} The name its row gives it; nothing for a map the tree does not list.
   */
  #rowName(mapId: number): string
  {
    const row = this.rows()[mapId] ?? null;
    return row === null
      ? ''
      : row.name;
  }

  /**
   * Names a map a step moves as the map tree shows it, for a refusal: by its row in the tree as it stands, or, for a map
   * the step would list again, by the row the step lists it with; as "Map N" where neither gives it a name.
   * @param {HistoryStep} step The step.
   * @param {'backward' | 'forward'} direction Undo or redo.
   * @param {number} mapId The map.
   * @returns {string} Its name, such as "Cave", or "Map 5".
   */
  #movedName(step: HistoryStep, direction: 'backward' | 'forward', mapId: number): string
  {
    const listed = this.#mapsListedBy(step, direction).find(([ id ]) => id === mapId);
    return documentName(mapDocumentKey(mapId), id => (listed === undefined ? this.#rowName(id) : listed[1]));
  }

  /**
   * Writes the files a step brings, before its rows move: the tree must never list a map, even for a moment and
   * even only on screen, whose file is not there yet, since a panel showing the map loads it the moment its row
   * appears. Each file written is noted in the progress as it lands.
   * @param {readonly FileEffect[]} files The step's files.
   * @param {'backward' | 'forward'} direction Which way the step moves.
   * @param {WriteProgress} progress Where to note what was done.
   * @param {ReadonlySet<DocumentKey>} inPlace Arriving files already on disk as the step brings them, left alone.
   */
  async #arrive(files: readonly FileEffect[], direction: 'backward' | 'forward', progress: WriteProgress, inPlace: ReadonlySet<DocumentKey>): Promise<void>
  {
    for (const file of files)
    {
      const content = this.#arriving(file, direction);
      if (content !== null && inPlace.has(file.document) === false)
      {
        await this.#writeFile(mapIdOf(file.document), content, this.#arrivingText(file, direction), false);
        progress.written.push(file);
      }
    }
  }

  /**
   * Finishes a step whose rows have moved, and whose removed maps this window has let go of: saves the tree's file,
   * then removes the files the step takes away, the reverse of arriving, so the tree has stopped listing a map
   * before its file goes. Everything done is noted in the progress as it happens.
   * @param {readonly FileEffect[]} files The step's files.
   * @param {'backward' | 'forward'} direction Which way the step moved.
   * @param {WriteProgress} progress Where to note what was done.
   */
  async #settle(files: readonly FileEffect[], direction: 'backward' | 'forward', progress: WriteProgress): Promise<void>
  {
    await this.#hub.save(MAP_INFOS_KEY);
    progress.treeSaved = true;

    for (const file of files.filter(each => this.#arriving(each, direction) === null))
    {
      await this.#deleteFile(mapIdOf(file.document));
      progress.deleted.push(file);
    }
  }

  /**
   * Puts back what a failed write-through changed, and only that, in the order that never lets the tree list a map
   * without a file: every file it removed comes back first, then the copies of the maps it let go of, then the tree,
   * then the maps it took up are let go again and the files it wrote go. It stops at the first part that cannot be
   * done, since each later part leans on it: while a removed file is missing, the tree stays where the step left it,
   * which does not list that map, and while the tree cannot be put back, the files it lists stay. Nothing here is
   * swallowed; whatever could not be done is handed back for the author.
   * @param {'backward' | 'forward'} direction Which way the step had moved.
   * @param {WriteProgress} progress What the write-through had done.
   * @returns {Promise<string[]>} What could not be put back, worded for the author; empty when everything was.
   */
  async #restore(direction: 'backward' | 'forward', progress: WriteProgress): Promise<string[]>
  {
    const problems: string[] = [];
    for (const file of progress.deleted)
    {
      const mapId = mapIdOf(file.document);
      try
      {
        await this.#writeFile(mapId, this.#leaving(file, direction) as JsonValue, this.#leavingText(file, direction), true);
      }
      catch (error)
      {
        problems.push(`map ${mapId}'s file could not be written back (${messageOf(error)})`);
      }
    }

    if (problems.length > 0)
    {
      return problems;
    }

    // every map let go of is held again exactly as it was, before its row comes back.
    progress.released.forEach(snapshot => this.#hub.adoptSnapshot(snapshot));

    // move the step back in the history, then make the tree's file agree again if the step had reached it.
    if (progress.rowsMoved)
    {
      if (this.#moveRowsBack(progress.step, direction) === false)
      {
        return [ 'the map tree could not be moved back past a change made to it meanwhile' ];
      }

      if (progress.treeSaved)
      {
        try
        {
          await this.#hub.save(MAP_INFOS_KEY);
        }
        catch (error)
        {
          return [ `the map tree could not be saved again (${messageOf(error)})` ];
        }
      }
    }

    // the tree no longer lists the maps the step took up, so this window lets them go before their files do.
    progress.adopted
      .filter(key => this.#hub.has(key))
      .forEach(key => this.#hub.release(key));

    for (const file of progress.written)
    {
      const mapId = mapIdOf(file.document);
      try
      {
        await this.#deleteFile(mapId);
      }
      catch (error)
      {
        problems.push(`map ${mapId}'s new file could not be removed again (${messageOf(error)})`);
      }
    }

    return problems;
  }

  /**
   * Writes a map file where a step brings one, only where no file is: from its exact text when that is known, which
   * the server writes back byte for byte, or from its content in MZ's layout otherwise, as a new map's file is. The
   * server checks and writes under one lock, so its refusal (a file is there) means one was written after the step
   * checked, which is someone else's: a new step, an undo or a redo refuses rather than write over it. Only putting
   * back a failed step, whose job is to restore what it removed, writes over a file found there, in that file's own
   * layout.
   * @param {number} mapId The map.
   * @param {JsonValue} content The file's content.
   * @param {string | undefined} text The file's exact text, when known.
   * @param {boolean} restoring True when putting back a failed step, which may write over a file found there.
   */
  async #writeFile(mapId: number, content: JsonValue, text: string | undefined, restoring: boolean): Promise<void>
  {
    const map = content as unknown as RmmzMap;
    if (restoring && text === undefined)
    {
      await this.#api.saveMap(mapId, map);
      return;
    }

    try
    {
      await (text === undefined ? this.#api.createMap(mapId, map) : this.#api.restoreMapFile(mapId, text));
    }
    catch (error)
    {
      if (refusedForFileThere(error) === false)
      {
        throw error;
      }

      if (restoring === false)
      {
        throw new FileTakenError(mapId);
      }

      await this.#api.saveMap(mapId, map);
    }
  }

  /**
   * Reads a map file as a delete finds it on disk: its content, and its exact text when the text is that same
   * content. A map this window holds is read from disk too, unsaved edits or not: its copy, edits and histories
   * included, travels with the step beside the file, so the file itself comes back exactly as the disk had it. Only
   * a held map with no file at all comes back from its copy.
   * @param {number} mapId The map.
   * @returns {Promise<CapturedFile>} The file.
   */
  async #capture(mapId: number): Promise<CapturedFile>
  {
    const key = mapDocumentKey(mapId);
    const onDisk = await this.#diskFileOf(mapId);
    if (onDisk === null)
    {
      const content = this.#hub.has(key)
        ? this.#hub.snapshot(key).content as unknown as RmmzMap
        : null;
      return { content, text: undefined };
    }

    const text = await this.#api.loadMapFile(mapId);
    return { content: onDisk, text: text !== null && this.#sameContent(text, onDisk) ? text : undefined };
  }

  /**
   * Reports whether a file's text holds a given content: what makes a text read separately from its content safe to
   * write back in its place.
   * @param {string} text The text.
   * @param {RmmzMap} content The content.
   * @returns {boolean} True when the text parses to exactly that content.
   */
  #sameContent(text: string, content: RmmzMap): boolean
  {
    try
    {
      return jsonEquals(JSON.parse(text), content);
    }
    catch
    {
      return false;
    }
  }

  /**
   * Removes a map's file; one already gone is as good as removed.
   * @param {number} mapId The map.
   */
  async #deleteFile(mapId: number): Promise<void>
  {
    try
    {
      await this.#api.deleteMap(mapId);
    }
    catch (error)
    {
      if ((error instanceof MapEditorApiError && error.status === 404) === false)
      {
        throw error;
      }
    }
  }

  /**
   * Reads a map's file as it stands for this window: the held copy, unsaved edits included, or the file on disk.
   * @param {number} mapId The map.
   * @returns {Promise<RmmzMap | null>} The file, or null when there is none.
   */
  async #fileOf(mapId: number): Promise<RmmzMap | null>
  {
    const key = mapDocumentKey(mapId);
    return this.#hub.has(key)
      ? this.#hub.snapshot(key).content as unknown as RmmzMap
      : this.#diskFileOf(mapId);
  }

  /**
   * Reads a map's file on disk, whatever this window holds of it.
   * @param {number} mapId The map.
   * @returns {Promise<RmmzMap | null>} The file, or null when there is none.
   */
  async #diskFileOf(mapId: number): Promise<RmmzMap | null>
  {
    try
    {
      return await this.#api.loadMap(mapId);
    }
    catch (error)
    {
      if (error instanceof MapEditorApiError && error.status === 404)
      {
        return null;
      }

      throw error;
    }
  }

  /**
   * Reads the placements of blueprints for several maps as their files stand for this window, the way {@link #fileOf}
   * reads the files: a map held here with those the record holds for it now, unsaved ones included, and any other map,
   * whose file is read from disk, with those the record's file holds for it, since another window's unsaved placements on
   * it are in the record here but not in that file. While the record's file cannot be read, the record here stands in.
   * @param {readonly number[]} mapIds The maps.
   * @returns {Promise<Map<number, BlueprintSpot[]>>} Each map's placements, by map id; none while the window holds no
   * record it can read.
   */
  async #spotsOf(mapIds: readonly number[]): Promise<Map<number, BlueprintSpot[]>>
  {
    const uses = readableUses(this.#hub);
    if (uses === null)
    {
      return new Map();
    }

    // the record's file is read only when some map's file is.
    const fromDisk = mapIds.some(mapId => this.#hub.has(mapDocumentKey(mapId)) === false) && this.#placements !== null
      ? await this.#placements.placementsOnDisk()
      : null;
    return new Map(mapIds.map(mapId =>
    {
      const spots = fromDisk === null || this.#hub.has(mapDocumentKey(mapId))
        ? spotsOnMap(uses, mapId)
        : [ ...fromDisk.get(mapId) ?? [] ];
      return [ mapId, spots ];
    }));
  }

  /**
   * Reads several maps' files, refusing a map with none.
   * @param {readonly number[]} mapIds The maps.
   * @returns {Promise<Map<number, RmmzMap>>} The files, by map id.
   */
  async #filesOf(mapIds: readonly number[]): Promise<Map<number, RmmzMap>>
  {
    const contents = new Map<number, RmmzMap>();
    for (const mapId of mapIds)
    {
      const content = await this.#fileOf(mapId);
      if (content === null)
      {
        throw new Error(`Map ${mapId} has no file.`);
      }

      contents.set(mapId, content);
    }

    return contents;
  }

  /**
   * Works out a plan whose new maps all have ids with no file behind them yet, re-picking past any that do: a
   * stray map file the tree does not list is never written over.
   * @param {(skip: ReadonlySet<number>) => TreePlan} plan Works out the plan, passing over the ids to skip.
   * @returns {Promise<TreePlan>} The plan.
   */
  async #withFreeIds(plan: (skip: ReadonlySet<number>) => TreePlan): Promise<TreePlan>
  {
    const skip = new Set<number>();
    for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt++)
    {
      const candidate = plan(skip);
      const taken: number[] = [];
      for (const { mapId } of candidate.created)
      {
        if ((await this.#fileOf(mapId)) !== null)
        {
          taken.push(mapId);
        }
      }

      if (taken.length === 0)
      {
        return candidate;
      }

      taken.forEach(mapId => skip.add(mapId));
    }

    throw new Error('Could not find a free map id without a stray file behind it.');
  }

  /**
   * Finds the history position just after a step: how many steps are done once the history stands there.
   * @param {string | null} stepId The step, or null for before the first.
   * @returns {number | null} The position, or null when the step is not in the tree's history.
   */
  #positionAfter(stepId: string | null): number | null
  {
    if (stepId === null)
    {
      return 0;
    }

    const index = this.#hub.history(TREE_HISTORY_KEY).rows.findIndex(row => row.id === stepId);
    return index < 0
      ? null
      : index + 1;
  }

  /**
   * Reads what a file holds once a step has moved.
   * @param {FileEffect} file The file effect.
   * @param {'backward' | 'forward'} direction Which way the step moves.
   * @returns {JsonValue | null} The content, or null when the file goes.
   */
  #arriving(file: FileEffect, direction: 'backward' | 'forward'): JsonValue | null
  {
    return direction === 'forward'
      ? file.after
      : file.before;
  }

  /**
   * Reads what a file must hold before a step moves.
   * @param {FileEffect} file The file effect.
   * @param {'backward' | 'forward'} direction Which way the step moves.
   * @returns {JsonValue | null} The content, or null when there must be no file.
   */
  #leaving(file: FileEffect, direction: 'backward' | 'forward'): JsonValue | null
  {
    return direction === 'forward'
      ? file.before
      : file.after;
  }

  /**
   * Reads the exact text a file holds once a step has moved, when the step read it.
   * @param {FileEffect} file The file effect.
   * @param {'backward' | 'forward'} direction Which way the step moves.
   * @returns {string | undefined} The text, or undefined when only the content is known.
   */
  #arrivingText(file: FileEffect, direction: 'backward' | 'forward'): string | undefined
  {
    return direction === 'forward'
      ? file.afterText
      : file.beforeText;
  }

  /**
   * Reads the exact text a file holds before a step moves, when the step read it.
   * @param {FileEffect} file The file effect.
   * @param {'backward' | 'forward'} direction Which way the step moves.
   * @returns {string | undefined} The text, or undefined when only the content is known.
   */
  #leavingText(file: FileEffect, direction: 'backward' | 'forward'): string | undefined
  {
    return direction === 'forward'
      ? file.beforeText
      : file.afterText;
  }

  /**
   * Reads the copy of a map this window held that a step brings back with its file. Only the before side carries
   * one, since only taking a map away can find it held.
   * @param {FileEffect} file The file effect.
   * @param {'backward' | 'forward'} direction Which way the step moves.
   * @returns {DocumentSnapshot | undefined} The copy, or undefined when the step brings none.
   */
  #arrivingHeld(file: FileEffect, direction: 'backward' | 'forward'): DocumentSnapshot | undefined
  {
    return direction === 'backward'
      ? file.beforeHeld
      : undefined;
  }

  /**
   * Reads the copy of a map this window held that a step recorded for the map it takes away.
   * @param {FileEffect} file The file effect.
   * @param {'backward' | 'forward'} direction Which way the step moves.
   * @returns {DocumentSnapshot | undefined} The copy, or undefined when the step recorded none.
   */
  #leavingHeld(file: FileEffect, direction: 'backward' | 'forward'): DocumentSnapshot | undefined
  {
    return direction === 'forward'
      ? file.beforeHeld
      : undefined;
  }
}

export { MapTreeService };
export type { CopyOutcome, MapTreeServiceOptions, TreeOutcome };
