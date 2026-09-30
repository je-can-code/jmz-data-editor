import { MapEditorApiError, type MapEditorApi } from '../api/MapEditorApi.ts';
import type { DocumentHub, HistoryFailure } from '../history/DocumentHub.ts';
import { TREE_HISTORY_KEY } from '../history/historyKeys.ts';
import type { FileEffect, HistoryStep } from '../history/HistoryStep.ts';
import { MAP_INFOS_KEY, mapDocumentKey, parseDocumentKey, type DocumentKey } from '../model/documentKeys.ts';
import type { EditorDocument } from '../model/EditorDocument.ts';
import { jsonEquals, type JsonValue } from '../model/json.ts';
import type { RmmzMap, RmmzMapInfo } from '../model/rmmzTypes.ts';
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
 * afterwards, or why nothing changed, worded for the author.
 */
type TreeOutcome =
  | { readonly ok: true; readonly step: HistoryStep | null; readonly selection: readonly number[] }
  | { readonly ok: false; readonly message: string };

/**
 * What copying came to: the maps captured for the clipboard, or why nothing was.
 */
type CopyOutcome =
  | { readonly ok: true; readonly copies: readonly CopiedMap[] }
  | { readonly ok: false; readonly message: string };

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
 * Words why the history refused to move a step.
 * @param {HistoryFailure} failure The refusal.
 * @param {'backward' | 'forward'} direction Undo or redo.
 * @returns {string} The words.
 */
const describeFailure = (failure: HistoryFailure, direction: 'backward' | 'forward'): string =>
{
  const verb = direction === 'backward' ? 'undo' : 'redo';
  switch (failure.reason)
  {
    case 'nothing':
      return `Nothing to ${verb} in the map tree.`;
    case 'missing-documents':
      return `"${failure.step.label}" needs ${failure.documents.join(', ')} open to ${verb}.`;
    case 'conflict':
      return failure.blockedBy === null
        ? `"${failure.step.label}" cannot ${verb}: ${failure.message}.`
        : `"${failure.step.label}" cannot ${verb}: "${failure.blockedBy.label}" changed the same maps since.`;
  }
};

/**
 * The map tree's one way in. Every tree operation (create, rename, nest, reorder, delete, copy and paste,
 * duplicate) is worked out as a plan, recorded as one step in the tree history and written through at once, so
 * MapInfos.json and the map files always agree with the tree on screen; and every undo, redo and history jump of
 * the tree goes through here too, because a tree step carries whole map files that the history core records but
 * never writes.
 *
 * The order of writes keeps the promise that the tree never names a map without a file: new map files are written
 * first, then MapInfos.json, then removed maps' files are deleted, which the server allows only once the tree no
 * longer lists them. Before undoing or redoing a step that creates or removes files, each file is checked to still
 * hold what the step left there, so a map edited since is never silently deleted or written over. A write that
 * fails partway puts the tree and every file back the way the step found them.
 *
 * Operations queue one behind another, since each one reads the tree, waits on the server, then records its step.
 */
class MapTreeService
{
  #hub: DocumentHub;

  #api: MapEditorApi;

  #openDocument: (key: DocumentKey) => Promise<EditorDocument>;

  #queue: Promise<unknown> = Promise.resolve();

  /**
   * @param {MapTreeServiceOptions} options The hub, the server and the window's way of holding documents.
   */
  constructor(options: MapTreeServiceOptions)
  {
    this.#hub = options.hub;
    this.#api = options.api;
    this.#openDocument = options.openDocument;
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
   * Deletes maps with their branches, files and all, as one step whose undo writes every file back.
   * @param {readonly number[]} mapIds The maps.
   * @returns {Promise<TreeOutcome>} The step.
   */
  remove(mapIds: readonly number[]): Promise<TreeOutcome>
  {
    return this.#run(async () =>
    {
      const base = this.rows();
      const plan = planDelete(base, mapIds);
      const files = new Map<number, RmmzMap | null>();
      for (const mapId of plan.removed)
      {
        files.set(mapId, await this.#fileOf(mapId));
      }

      return this.#commit(base, plan, files);
    });
  }

  /**
   * Captures maps for the clipboard, each with its file as it stands now, unsaved edits included.
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
        return { ok: true as const, copies: copyMaps(this.rows(), mapIds, contents) };
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
   * Duplicates maps, each copy right after its original.
   * @param {readonly number[]} mapIds The maps.
   * @returns {Promise<TreeOutcome>} The step, and the copies to select.
   */
  duplicate(mapIds: readonly number[]): Promise<TreeOutcome>
  {
    return this.#run(async () =>
    {
      const contents = await this.#filesOf(mapIds);
      const sources = [ ...contents.entries() ].map(([ mapId, content ]) => ({ mapId, content }));
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
   * Records a plan as one step and writes it through: new files, then the tree, then removals. A tree that changed
   * while the plan waited on the server (another window's step, say) refuses the plan rather than undoing that
   * change with it.
   * @param {MapInfoRows} base The rows the plan was worked out from.
   * @param {TreePlan} plan The plan.
   * @param {ReadonlyMap<number, RmmzMap | null>} removedFiles Each removed map's file as it stood, null when it had none.
   * @returns {Promise<TreeOutcome>} The step.
   */
  async #commit(base: MapInfoRows, plan: TreePlan, removedFiles: ReadonlyMap<number, RmmzMap | null>): Promise<TreeOutcome>
  {
    if (jsonEquals(this.rows(), base) === false)
    {
      return { ok: false, message: `The map tree changed while "${plan.label}" was being worked out; try it again.` };
    }

    const step = this.#hub.edit(plan.label, [ TREE_HISTORY_KEY ], tx =>
    {
      rowPatches(base, plan.rows).forEach(({ path, value }) => tx.set(MAP_INFOS_KEY, path, value));
      plan.created.forEach(({ mapId, content }) => tx.file(mapDocumentKey(mapId), null, content as unknown as JsonValue));
      plan.removed.forEach(mapId =>
      {
        const file = removedFiles.get(mapId) ?? null;

        // a map listed with no file behind it leaves nothing to write back.
        if (file !== null)
        {
          tx.file(mapDocumentKey(mapId), file as unknown as JsonValue, null);
        }
      });
    });

    if (step === null)
    {
      return { ok: true, step: null, selection: plan.selection };
    }

    try
    {
      await this.#writeThrough(step, 'forward');
    }
    catch (error)
    {
      // part of the step never reached the disk, so it goes from history as well as from the tree.
      await this.#restore(step, 'forward');
      this.#hub.forgetStep(step.id);
      return { ok: false, message: `"${plan.label}" could not be saved: ${messageOf(error)}` };
    }

    return { ok: true, step, selection: plan.selection };
  }

  /**
   * Undoes or redoes the tree's head step once its files are known to be where it left them, then writes it
   * through.
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
      return { ok: false, message: describeFailure(check, direction) };
    }

    const refusal = await this.#checkFiles(check.step, direction);
    if (refusal !== null)
    {
      return { ok: false, message: refusal };
    }

    const moved = direction === 'backward'
      ? this.#hub.undo(TREE_HISTORY_KEY)
      : this.#hub.redo(TREE_HISTORY_KEY);
    if (moved.ok === false)
    {
      return { ok: false, message: describeFailure(moved, direction) };
    }

    try
    {
      await this.#writeThrough(moved.step, direction);
    }
    catch (error)
    {
      await this.#restore(moved.step, direction);
      return { ok: false, message: `"${moved.step.label}" could not be saved: ${messageOf(error)}` };
    }

    const arriving = (moved.step.files ?? []).filter(file => this.#arriving(file, direction) !== null);
    return { ok: true, step: moved.step, selection: arriving.map(file => mapIdOf(file.document)) };
  }

  /**
   * Checks every file a step creates or removes still holds what the step left there, before the step moves.
   * @param {HistoryStep} step The step.
   * @param {'backward' | 'forward'} direction Undo or redo.
   * @returns {Promise<string | null>} Why the step cannot move, or null when every file is as the step left it.
   */
  async #checkFiles(step: HistoryStep, direction: 'backward' | 'forward'): Promise<string | null>
  {
    for (const file of step.files ?? [])
    {
      const mapId = mapIdOf(file.document);
      const leaving = this.#leaving(file, direction);
      const current = await this.#fileOf(mapId);
      if (jsonEquals(current, leaving))
      {
        continue;
      }

      const verb = direction === 'backward' ? 'undo' : 'redo';
      if (leaving === null)
      {
        return `"${step.label}" cannot ${verb}: map ${mapId} has a file again, which it would write over.`;
      }

      return current === null
        ? `"${step.label}" cannot ${verb}: map ${mapId}'s file is gone.`
        : `"${step.label}" cannot ${verb}: map ${mapId} has changed since, and those changes would be lost.`;
    }

    return null;
  }

  /**
   * Writes a moved step through to disk: arriving files first, then the tree, then the removals, releasing each
   * removed map from this window before its file goes.
   * @param {HistoryStep} step The step.
   * @param {'backward' | 'forward'} direction Which way it moved.
   */
  async #writeThrough(step: HistoryStep, direction: 'backward' | 'forward'): Promise<void>
  {
    const files = step.files ?? [];
    for (const file of files)
    {
      const content = this.#arriving(file, direction);
      if (content !== null)
      {
        await this.#api.saveMap(mapIdOf(file.document), content as unknown as RmmzMap);
      }
    }

    await this.#hub.save(MAP_INFOS_KEY);

    const removals = files.filter(file => this.#arriving(file, direction) === null);
    removals.forEach(file =>
    {
      if (this.#hub.has(file.document))
      {
        this.#hub.release(file.document);
      }
    });
    for (const file of removals)
    {
      await this.#deleteFile(mapIdOf(file.document));
    }
  }

  /**
   * Puts the tree and every file of a step back the way the step found them, after its write-through failed.
   * Each part is attempted whatever became of the others, since this is already the way out of a failure.
   * @param {HistoryStep} step The step.
   * @param {'backward' | 'forward'} direction Which way it had moved.
   */
  async #restore(step: HistoryStep, direction: 'backward' | 'forward'): Promise<void>
  {
    // move the step back in the history, then make the disk agree with the tree again.
    const back = direction === 'forward'
      ? this.#hub.undo(TREE_HISTORY_KEY)
      : this.#hub.redo(TREE_HISTORY_KEY);
    const leavingFiles = step.files ?? [];
    for (const file of leavingFiles.filter(each => this.#leaving(each, direction) !== null))
    {
      await this.#api.saveMap(mapIdOf(file.document), this.#leaving(file, direction) as unknown as RmmzMap).catch(() => undefined);
    }

    if (back.ok)
    {
      await this.#hub.save(MAP_INFOS_KEY).catch(() => undefined);
    }

    for (const file of leavingFiles.filter(each => this.#leaving(each, direction) === null))
    {
      await this.#deleteFile(mapIdOf(file.document)).catch(() => undefined);
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
    if (this.#hub.has(key))
    {
      return this.#hub.snapshot(key).content as unknown as RmmzMap;
    }

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
}

export { MapTreeService };
export type { CopyOutcome, MapTreeServiceOptions, TreeOutcome };
