import { createDocument } from '../model/createDocument.ts';
import type { DocumentKey, MapDocumentKey } from '../model/documentKeys.ts';
import type { EditorDocument } from '../model/EditorDocument.ts';
import { jsonEquals, type JsonValue } from '../model/json.ts';
import { MapDocument } from '../model/MapDocument.ts';
import { invertPatch, PatchConflictError, type Patch } from '../model/patches.ts';
import { History, type HistoryView } from './History.ts';
import { homeDocumentOf, type HistoryKey } from './historyKeys.ts';
import {
  documentsOfStep,
  documentsTouchedBy,
  type DocumentHeads,
  type HistoryStep,
  type StepEntry,
} from './HistoryStep.ts';
import { Transaction, type TransactionHost } from './Transaction.ts';

/**
 * Where documents come from and go to. In the running app it is the server; in tests, a stub.
 */
type DocumentStore = {
  /**
   * Reads a document's file.
   * @param {DocumentKey} key The document.
   * @returns {Promise<JsonValue>} The file's content.
   */
  load(key: DocumentKey): Promise<JsonValue>;

  /**
   * Writes a document's file.
   * @param {DocumentKey} key The document.
   * @param {JsonValue} content The content, in its exact file shape.
   * @returns {Promise<void>} Settles once the file is written.
   */
  save(key: DocumentKey, content: JsonValue): Promise<void>;
};

/**
 * Two copies of a document that disagree, both kept until the person chooses. The editor never settles one of
 * these by itself, because either choice throws work away.
 *
 * - {@code disk}: the file changed outside the editor while this window held unsaved edits. {@code content} is
 *   the file's new content, or null when the file was removed.
 * - {@code window}: another window's copy went its own way at the same time as this one. {@code theirs} is that
 *   window's copy, histories included, ready to adopt.
 */
type DocumentConflict =
  | { readonly kind: 'disk'; readonly content: JsonValue | null }
  | { readonly kind: 'window'; readonly peer: string; readonly theirs: DocumentSnapshot };

/**
 * Why an undo, redo or jump could not happen.
 *
 * - {@code nothing}: the history has no step in that direction.
 * - {@code missing-documents}: the step touches documents this window does not hold; open them and retry.
 * - {@code conflict}: a later edit changed something the step changed, so undoing it would overwrite that edit.
 *   {@code blockedBy} names the later step when the window can tell which one it was. The step stays where it
 *   is; the person can undo the blocking step first, or forget this one ({@link DocumentHub.forgetStep}) and go
 *   on past it.
 */
type HistoryFailure =
  | { readonly ok: false; readonly reason: 'nothing'; readonly historyKey: HistoryKey }
  | { readonly ok: false; readonly reason: 'missing-documents'; readonly step: HistoryStep; readonly documents: readonly DocumentKey[] }
  | {
    readonly ok: false;
    readonly reason: 'conflict';
    readonly step: HistoryStep;
    readonly blockedBy: HistoryStep | null;
    readonly message: string;
  };

/**
 * The answer to an undo or redo: the step it acted on, or why it could not.
 */
type HistoryCheck = { readonly ok: true; readonly step: HistoryStep } | HistoryFailure;

/**
 * The answer to a jump through the history panel.
 */
type JumpResult = { readonly ok: true } | HistoryFailure;

/**
 * Whether an event started in this window or arrived from another one. Sync forwards only local events.
 */
type HubSource = 'local' | 'remote';

/**
 * Everything the hub announces. The history panel, dirty markers, conflict banners and cross-window sync all
 * listen here. Every operation event carries the operation's id and the heads it was made against, which is
 * what other windows check before repeating it.
 */
type HubEvent =
  | { readonly type: 'committed'; readonly step: HistoryStep; readonly bases: DocumentHeads; readonly opId: string; readonly source: HubSource }
  | { readonly type: 'undone'; readonly step: HistoryStep; readonly bases: DocumentHeads; readonly opId: string; readonly source: HubSource }
  | { readonly type: 'redone'; readonly step: HistoryStep; readonly bases: DocumentHeads; readonly opId: string; readonly source: HubSource }
  | { readonly type: 'forgotten'; readonly step: HistoryStep; readonly bases: DocumentHeads; readonly opId: string; readonly source: HubSource }
  | { readonly type: 'discarded'; readonly stepIds: readonly string[] }
  | { readonly type: 'saved'; readonly document: DocumentKey; readonly marker: readonly string[]; readonly source: HubSource }
  | { readonly type: 'adopted'; readonly document: DocumentKey; readonly source: HubSource }
  | { readonly type: 'released'; readonly document: DocumentKey }
  | { readonly type: 'reloaded'; readonly document: DocumentKey }
  | { readonly type: 'conflicted'; readonly document: DocumentKey; readonly conflict: DocumentConflict }
  | { readonly type: 'conflict-cleared'; readonly document: DocumentKey }
  | { readonly type: 'out-of-sync'; readonly documents: readonly DocumentKey[]; readonly origin: string };

/**
 * Hears every hub event.
 */
type HubListener = (event: HubEvent) => void;

/**
 * An operation made in another window, to be repeated here. {@code bases} holds the head of each touched
 * document just before the operation, so a window whose copy went elsewhere can tell and sort it out.
 */
type RemoteOperation =
  | { readonly type: 'commit'; readonly origin: string; readonly opId: string; readonly step: HistoryStep; readonly bases: DocumentHeads }
  | { readonly type: 'undo'; readonly origin: string; readonly opId: string; readonly stepId: string; readonly bases: DocumentHeads }
  | { readonly type: 'redo'; readonly origin: string; readonly opId: string; readonly stepId: string; readonly bases: DocumentHeads }
  | { readonly type: 'forget'; readonly origin: string; readonly opId: string; readonly stepId: string; readonly bases: DocumentHeads }
  | { readonly type: 'saved'; readonly origin: string; readonly document: DocumentKey; readonly marker: readonly string[] };

/**
 * Everything one window knows about a document, for another window to adopt: its committed content, the
 * lineage of operations that produced it, whether it is saved, and every history that lives on it. An edit still
 * open is never part of it. Plain data, so it crosses a BroadcastChannel.
 */
type DocumentSnapshot = {
  readonly document: DocumentKey;
  readonly content: JsonValue;
  readonly lineage: readonly string[];
  readonly applied: readonly string[];
  readonly saved: readonly string[];
  readonly histories: readonly { key: HistoryKey; done: readonly HistoryStep[]; undone: readonly HistoryStep[] }[];
};

/**
 * What happened when a document's file changed outside the editor.
 *
 * - {@code ignored}: this window does not hold the document.
 * - {@code unchanged}: the file matches what the window holds.
 * - {@code reloaded}: the window held no unsaved edits, so it took the file's content.
 * - {@code conflicted}: the window holds unsaved edits, so it kept them and flagged the document.
 */
type ExternalChangeResult = 'ignored' | 'unchanged' | 'reloaded' | 'conflicted';

/**
 * Options for a hub.
 */
type DocumentHubOptions = {
  /**
   * This window's id: it prefixes every step and operation id, and saves carry it so the window can ignore their echo.
   */
  clientId: string;

  /**
   * Where documents load from and save to.
   */
  store?: DocumentStore;

  /**
   * The clock, for step timestamps.
   */
  now?: () => number;
};

/**
 * Compares two step-id lists.
 * @param {readonly string[]} left The first list.
 * @param {readonly string[]} right The second list.
 * @returns {boolean} True when both hold the same ids in the same order.
 */
const sameSequence = (left: readonly string[], right: readonly string[]): boolean =>
{
  return left.length === right.length && left.every((id, index) => id === right[index]);
};

/**
 * Names the content of a file, for the first entry of a lineage: two windows that load the same file start from
 * the same entry, so their copies are recognisably one, and a window that loaded a different version of the file
 * is recognisably not. A 32-bit FNV-1a hash of the JSON text is plenty for telling versions of one file apart.
 * @param {JsonValue} content The file's content.
 * @returns {string} The lineage entry.
 */
const diskOperationId = (content: JsonValue): string =>
{
  const text = JSON.stringify(content);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++)
  {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return `disk:${text.length.toString(36)}:${hash.toString(36)}`;
};

/**
 * Reports whether one path lies inside another, or is it.
 * @param {readonly (string | number)[]} outer The shorter path.
 * @param {readonly (string | number)[]} inner The longer path.
 * @returns {boolean} True when {@code outer} is a prefix of {@code inner}.
 */
const isPathPrefix = (outer: readonly (string | number)[], inner: readonly (string | number)[]): boolean =>
{
  return outer.length <= inner.length && outer.every((segment, index) => segment === inner[index]);
};

/**
 * Reports whether two patches on one document change any of the same data: overlapping paths, shared cells,
 * or a resize, which rewrites every cell.
 * @param {Patch} left One patch.
 * @param {Patch} right The other.
 * @returns {boolean} True when they touch the same target.
 */
const patchesOverlap = (left: Patch, right: Patch): boolean =>
{
  if (left.kind === 'resize' || right.kind === 'resize')
  {
    return true;
  }

  if (left.kind === 'tiles' || right.kind === 'tiles')
  {
    return left.kind === 'tiles' && right.kind === 'tiles' && left.indices.some(index => right.indices.includes(index));
  }

  return isPathPrefix(left.path, right.path) || isPathPrefix(right.path, left.path);
};

/**
 * One window's documents and their histories.
 *
 * Every edit is a named step of reversible patches, recorded in the history of each thing it touches. A step in
 * several histories is a transaction (a door pair, a blueprint propagating to every copy), and undoes as one step
 * from any of them.
 *
 * The undo rule: a history's newest step can be undone whenever every one of its patches still applies, meaning
 * each target still holds exactly what the step left there, however many unrelated steps came after it in this
 * or any other history. A step that a later edit changed underneath is refused, naming that edit, and nothing
 * moves; the person can undo the later edit first, or forget the step and go on past it. In the other histories a
 * transaction belongs to, it may be undone out of order; each of those histories then lists it as its next redo,
 * keeps its own newer steps undoable in their order, and drops it from its redo list the moment it records
 * something new, while the step stays redoable from any history that has not. Redo follows the same rule
 * forwards, and a redone step becomes the newest done step in every history it belongs to.
 *
 * Saving writes a document's committed content and records which steps the file now reflects; it never touches
 * history, so undo after a save works, and undoing back to the saved state makes the document clean again.
 *
 * Every operation on a document is logged by id in its lineage. Other windows holding the same documents repeat
 * this window's operations through {@link applyRemote}, and check each against the head of their own lineage, so
 * a copy that went elsewhere is always noticed and never silently written over.
 */
class DocumentHub
{
  readonly clientId: string;

  #store: DocumentStore | null;

  #now: () => number;

  #documents = new Map<DocumentKey, EditorDocument>();

  #histories = new Map<HistoryKey, History>();

  #steps = new Map<string, HistoryStep>();

  #applied = new Map<DocumentKey, string[]>();

  #saved = new Map<DocumentKey, string[]>();

  #lineage = new Map<DocumentKey, string[]>();

  #conflicts = new Map<DocumentKey, DocumentConflict>();

  #listeners = new Set<HubListener>();

  #transaction: Transaction | null = null;

  #queue: RemoteOperation[] = [];

  #counter = 0;

  #host: TransactionHost = {
    document: (key: DocumentKey) => this.document(key),
    finish: (transaction: Transaction, entries: readonly StepEntry[]) => this.#finish(transaction, entries),
    abandon: () => this.#abandon(),
  };

  /**
   * @param {DocumentHubOptions} options The window's id, and where documents live.
   */
  constructor(options: DocumentHubOptions)
  {
    this.clientId = options.clientId;
    this.#store = options.store ?? null;
    this.#now = options.now ?? Date.now;
  }

  //region documents

  /**
   * Reports whether this window holds a document.
   * @param {DocumentKey} key The document.
   * @returns {boolean} True when it is held.
   */
  has(key: DocumentKey): boolean
  {
    return this.#documents.has(key);
  }

  /**
   * Finds a held document.
   * @param {DocumentKey} key The document.
   * @returns {EditorDocument} The document.
   */
  document(key: DocumentKey): EditorDocument
  {
    const document = this.#documents.get(key);
    if (document === undefined)
    {
      throw new Error(`${key} is not open in this window`);
    }

    return document;
  }

  /**
   * Finds a held map.
   * @param {MapDocumentKey} key The map's document key.
   * @returns {MapDocument} The map.
   */
  map(key: MapDocumentKey): MapDocument
  {
    const document = this.document(key);
    if ((document instanceof MapDocument) === false)
    {
      throw new Error(`${key} is not a map`);
    }

    return document;
  }

  /**
   * Lists every held document.
   * @returns {DocumentKey[]} The keys.
   */
  documentKeys(): DocumentKey[]
  {
    return [ ...this.#documents.keys() ];
  }

  /**
   * Reads a held document's lineage: the id of every operation that produced its current state, oldest first,
   * starting from the file it was loaded from.
   * @param {DocumentKey} key The document.
   * @returns {readonly string[]} The lineage; empty when not held.
   */
  lineage(key: DocumentKey): readonly string[]
  {
    return this.#lineage.get(key) ?? [];
  }

  /**
   * Reads the id of the latest operation applied to a held document.
   * @param {DocumentKey} key The document.
   * @returns {string | null} The id, or null when not held.
   */
  head(key: DocumentKey): string | null
  {
    const lineage = this.#lineage.get(key);
    return lineage === undefined
      ? null
      : lineage[lineage.length - 1] ?? '';
  }

  /**
   * Counts the operations in a held document's lineage.
   * @param {DocumentKey} key The document.
   * @returns {number} The count, or -1 when not held.
   */
  version(key: DocumentKey): number
  {
    return this.#lineage.get(key)?.length ?? -1;
  }

  /**
   * Holds a document, loading it from the store when this window does not have it yet.
   * @param {DocumentKey} key The document.
   * @returns {Promise<EditorDocument>} The document.
   */
  async load(key: DocumentKey): Promise<EditorDocument>
  {
    const held = this.#documents.get(key);
    if (held !== undefined)
    {
      return held;
    }

    const content = await this.#requireStore().load(key);
    return this.adopt(key, content);
  }

  /**
   * Holds a document built from its file content, clean, with empty histories, and a lineage that starts from
   * that exact file. A document already held is returned as it is.
   * @param {DocumentKey} key The document.
   * @param {JsonValue} content The file's content.
   * @returns {EditorDocument} The document.
   */
  adopt(key: DocumentKey, content: JsonValue): EditorDocument
  {
    const held = this.#documents.get(key);
    if (held !== undefined)
    {
      return held;
    }

    const document = createDocument(key, content);
    this.#documents.set(key, document);
    this.#lineage.set(key, [ diskOperationId(content) ]);
    this.#applied.set(key, []);
    this.#saved.set(key, []);
    this.#emit({ type: 'adopted', document: key, source: 'local' });
    return document;
  }

  /**
   * Captures everything this window knows about a document, for another window to adopt. An edit still open is
   * left out: it may yet be cancelled, and a window that took it would keep a draft that no longer exists here.
   * @param {DocumentKey} key The document.
   * @returns {DocumentSnapshot} The snapshot.
   */
  snapshot(key: DocumentKey): DocumentSnapshot
  {
    const histories = [ ...this.#histories.values() ]
      .filter(history => homeDocumentOf(history.key) === key)
      .map(history => ({ key: history.key, done: [ ...history.done ], undone: [ ...history.undone ] }));

    return {
      document: key,
      content: this.#committedContent(key),
      lineage: [ ...this.lineage(key) ],
      applied: [ ...this.#applied.get(key) ?? [] ],
      saved: [ ...this.#saved.get(key) ?? [] ],
      histories,
    };
  }

  /**
   * Takes on another window's copy of a document, with its lineage and histories, replacing any copy held here.
   * Conflicts are left for their owner to clear.
   * @param {DocumentSnapshot} snapshot The snapshot.
   * @returns {EditorDocument} The document.
   */
  adoptSnapshot(snapshot: DocumentSnapshot): EditorDocument
  {
    const key = snapshot.document;
    const held = this.#documents.get(key);
    if (held !== undefined)
    {
      this.#requireIdle();
      held.replace(snapshot.content);
    }
    else
    {
      this.#documents.set(key, createDocument(key, snapshot.content));
    }

    this.#lineage.set(key, [ ...snapshot.lineage ]);
    this.#applied.set(key, [ ...snapshot.applied ]);
    this.#saved.set(key, [ ...snapshot.saved ]);

    // one object per step, however many histories and snapshots mention it.
    const intern = (step: HistoryStep): HistoryStep =>
    {
      const known = this.#steps.get(step.id) ?? step;
      this.#steps.set(step.id, known);
      return known;
    };

    this.#dropHistoriesOn(key);
    snapshot.histories.forEach(({ key: historyKey, done, undone }) =>
    {
      this.#histories.set(historyKey, new History(historyKey, done.map(intern), undone.map(intern)));
    });
    this.#prune();

    this.#emit({ type: 'adopted', document: key, source: 'remote' });
    return this.document(key);
  }

  /**
   * Lets go of a document and every history that lives on it.
   * @param {DocumentKey} key The document.
   */
  release(key: DocumentKey): void
  {
    this.#requireIdle();
    if (this.#documents.delete(key) === false)
    {
      return;
    }

    this.#lineage.delete(key);
    this.#applied.delete(key);
    this.#saved.delete(key);
    this.#conflicts.delete(key);
    this.#dropHistoriesOn(key);
    this.#prune();
    this.#emit({ type: 'released', document: key });
  }

  /**
   * Produces a document's committed content: the live content with any open edit's patches taken back out.
   * @param {DocumentKey} key The document.
   * @returns {JsonValue} The content, in file shape.
   */
  #committedContent(key: DocumentKey): JsonValue
  {
    const document = this.document(key);
    const pending = (this.#transaction?.entries ?? [])
      .filter(entry => entry.document === key)
      .map(entry => entry.patch);

    return pending.length === 0
      ? document.toJson()
      : document.toJsonWithout(pending);
  }

  //endregion documents

  //region editing

  /**
   * Opens a transaction: patches added to it apply at once, and it becomes one step when committed. Only one
   * edit is open at a time; finish it before starting another.
   * @param {string} label What the history panel will call the step.
   * @param {readonly HistoryKey[]} histories Every history the step belongs to; each one's document must be held.
   * @returns {Transaction} The transaction.
   */
  begin(label: string, histories: readonly HistoryKey[]): Transaction
  {
    this.#requireIdle();
    if (histories.length === 0)
    {
      throw new Error(`"${label}" names no history, so it could never be undone`);
    }

    const missing = histories.map(homeDocumentOf).filter(key => this.has(key) === false);
    if (missing.length > 0)
    {
      throw new Error(`open ${[ ...new Set(missing) ].join(', ')} before recording history on it`);
    }

    this.#transaction = new Transaction(this.#host, label, histories);
    return this.#transaction;
  }

  /**
   * Runs a whole edit as one step: opens a transaction, lets the builder add patches, and commits. A builder
   * that throws leaves nothing behind.
   * @param {string} label What the history panel will call the step.
   * @param {readonly HistoryKey[]} histories Every history the step belongs to.
   * @param {(transaction: Transaction) => void} build Adds the patches.
   * @returns {HistoryStep | null} The step, or null when nothing changed.
   */
  edit(label: string, histories: readonly HistoryKey[], build: (transaction: Transaction) => void): HistoryStep | null
  {
    const transaction = this.begin(label, histories);
    try
    {
      build(transaction);
    }
    catch (error)
    {
      if (transaction.isOpen)
      {
        transaction.cancel();
      }

      throw error;
    }

    return transaction.isOpen
      ? transaction.commit()
      : null;
  }

  /**
   * Records a finished transaction as one step.
   * @param {Transaction} transaction The transaction.
   * @param {readonly StepEntry[]} entries Its patches, already applied.
   * @returns {HistoryStep | null} The step, or null when nothing changed.
   */
  #finish(transaction: Transaction, entries: readonly StepEntry[]): HistoryStep | null
  {
    this.#transaction = null;
    if (entries.length === 0)
    {
      this.#drainQueue();
      return null;
    }

    // whole files ride along only on the steps that have them, so every other step keeps its exact shape.
    const { files } = transaction;
    const step: HistoryStep = {
      id: this.#nextId(),
      label: transaction.label,
      histories: [ ...transaction.histories ],
      entries: [ ...entries ],
      ...(files.length > 0 ? { files: [ ...files ] } : {}),
      origin: this.clientId,
      at: this.#now(),
    };

    const bases = this.#headsOf(step);
    this.#record(step);
    this.#markApplied(step);
    this.#extendLineage(step, step.id);
    this.#emit({ type: 'committed', step, bases, opId: step.id, source: 'local' });
    this.#drainQueue();
    return step;
  }

  /**
   * Forgets a cancelled transaction.
   */
  #abandon(): void
  {
    this.#transaction = null;
    this.#drainQueue();
  }

  //endregion editing

  //region history

  /**
   * Builds what the history panel draws for one history.
   * @param {HistoryKey} key The history.
   * @returns {HistoryView} Its steps, oldest first; empty when nothing has been recorded.
   */
  history(key: HistoryKey): HistoryView
  {
    return (this.#histories.get(key) ?? new History(key)).view();
  }

  /**
   * Reports whether an undo in a history can be attempted: it has a step to undo, and this window holds every
   * document that step touches. Whether each patch still applies is only known by trying.
   * @param {HistoryKey} key The history.
   * @returns {HistoryCheck} The step it would undo, or why it cannot.
   */
  canUndo(key: HistoryKey): HistoryCheck
  {
    const step = this.#histories.get(key)?.lastDone() ?? null;
    return step === null
      ? { ok: false, reason: 'nothing', historyKey: key }
      : this.#checkHeld(step);
  }

  /**
   * Reports whether a redo in a history can be attempted.
   * @param {HistoryKey} key The history.
   * @returns {HistoryCheck} The step it would redo, or why it cannot.
   */
  canRedo(key: HistoryKey): HistoryCheck
  {
    const step = this.#histories.get(key)?.nextRedo() ?? null;
    return step === null
      ? { ok: false, reason: 'nothing', historyKey: key }
      : this.#checkHeld(step);
  }

  /**
   * Undoes the newest step of a history, across every document it touched, whenever each of its patches still
   * applies, however many unrelated steps came after it elsewhere.
   * @param {HistoryKey} key The history.
   * @returns {HistoryCheck} The step undone, or why nothing was.
   */
  undo(key: HistoryKey): HistoryCheck
  {
    return this.#move(key, 'backward');
  }

  /**
   * Redoes the most recently undone step of a history, whenever each of its patches applies again.
   * @param {HistoryKey} key The history.
   * @returns {HistoryCheck} The step redone, or why nothing was.
   */
  redo(key: HistoryKey): HistoryCheck
  {
    return this.#move(key, 'forward');
  }

  /**
   * Moves a history to the point just after one of its steps, undoing or redoing as many steps as that takes;
   * this is a click on a history panel row. It stops at the first step that cannot move.
   * @param {HistoryKey} key The history.
   * @param {string | null} stepId The step to end on, or null for before the first step.
   * @returns {JumpResult} Success, or why it stopped.
   */
  jumpTo(key: HistoryKey, stepId: string | null): JumpResult
  {
    const history = this.#histories.get(key);
    const state = stepId === null
      ? 'done'
      : history?.stateOf(stepId) ?? null;
    if (history === undefined || state === null)
    {
      return { ok: false, reason: 'nothing', historyKey: key };
    }

    // undo until the target is the newest done step, or until nothing is done.
    if (state === 'done')
    {
      while (history.lastDone() !== null && history.lastDone()?.id !== stepId)
      {
        const result = this.undo(key);
        if (result.ok === false)
        {
          return result;
        }
      }

      return { ok: true };
    }

    // redo until the target is done.
    while (history.stateOf(stepId as string) === 'undone')
    {
      const result = this.redo(key);
      if (result.ok === false)
      {
        return result;
      }
    }

    return { ok: true };
  }

  /**
   * Forgets a step: it leaves every history, so it can never be undone or redone, and whatever it did stays as it
   * is. This is the way past a step a later edit blocks, when the person wants to keep that later edit and keep
   * undoing older ones.
   * @param {string} stepId The step.
   * @returns {boolean} True when the step was known and is now forgotten.
   */
  forgetStep(stepId: string): boolean
  {
    this.#requireIdle();
    const step = this.#steps.get(stepId);
    if (step === undefined)
    {
      return false;
    }

    const bases = this.#headsOf(step);
    this.#discard(step);
    const opId = this.#nextId();
    this.#extendLineage(step, opId);
    this.#emit({ type: 'forgotten', step, bases, opId, source: 'local' });
    return true;
  }

  /**
   * Undoes or redoes a history's head step.
   * @param {HistoryKey} key The history.
   * @param {'forward' | 'backward'} direction Redo or undo.
   * @returns {HistoryCheck} The step moved, or why nothing was.
   */
  #move(key: HistoryKey, direction: 'forward' | 'backward'): HistoryCheck
  {
    this.#requireIdle();
    const check = direction === 'backward'
      ? this.canUndo(key)
      : this.canRedo(key);
    if (check.ok === false)
    {
      return check;
    }

    const { step } = check;
    const bases = this.#headsOf(step);
    const failed = this.#applyEntries(step, direction);
    if (failed !== null)
    {
      return {
        ok: false,
        reason: 'conflict',
        step,
        blockedBy: this.#laterStepTouching(step, failed.entry),
        message: failed.message,
      };
    }

    const opId = this.#nextId();
    this.#settleMove(step, direction, opId);
    this.#emit({ type: direction === 'backward' ? 'undone' : 'redone', step, bases, opId, source: 'local' });
    return check;
  }

  /**
   * Records a step's move in every held history and document once its patches have moved.
   * @param {HistoryStep} step The step.
   * @param {'forward' | 'backward'} direction Redo or undo.
   * @param {string} opId The operation's id, for the lineage.
   */
  #settleMove(step: HistoryStep, direction: 'forward' | 'backward', opId: string): void
  {
    if (direction === 'backward')
    {
      this.#heldHistoriesOf(step).forEach(history => history.markUndone(step));
      this.#markReverted(step);
    }
    else
    {
      this.#heldHistoriesOf(step).forEach(history => history.markRedone(step));
      this.#markApplied(step);
    }

    this.#extendLineage(step, opId);
  }

  /**
   * Checks that this window holds every document a step touches.
   * @param {HistoryStep} step The step.
   * @returns {HistoryCheck} The step, or which documents are missing.
   */
  #checkHeld(step: HistoryStep): HistoryCheck
  {
    const missing = documentsTouchedBy(step).filter(key => this.has(key) === false);
    return missing.length > 0
      ? { ok: false, reason: 'missing-documents', step, documents: missing }
      : { ok: true, step };
  }

  /**
   * Finds the edit that changed a step's target after it: the newest step applied to the same document, after
   * the given one when it is applied, whose patches overlap the one that could not move.
   * @param {HistoryStep} step The step that could not move.
   * @param {StepEntry} entry The patch of it that failed.
   * @returns {HistoryStep | null} The blocking step, or null when no recorded step explains it.
   */
  #laterStepTouching(step: HistoryStep, entry: StepEntry): HistoryStep | null
  {
    const applied = this.#applied.get(entry.document) ?? [];
    const position = applied.lastIndexOf(step.id);
    const later = applied.slice(position + 1).reverse();

    const blocking = later
      .map(id => this.#steps.get(id))
      .find(candidate => candidate !== undefined && candidate.entries
        .some(each => each.document === entry.document && patchesOverlap(each.patch, entry.patch)));

    return blocking ?? null;
  }

  //endregion history

  //region saving

  /**
   * Reports whether a document holds edits its file does not.
   * @param {DocumentKey} key The document.
   * @returns {boolean} True when unsaved; false when clean or not held.
   */
  isDirty(key: DocumentKey): boolean
  {
    const applied = this.#applied.get(key);
    const saved = this.#saved.get(key);
    return applied !== undefined && saved !== undefined && sameSequence(applied, saved) === false;
  }

  /**
   * Lists every held document with unsaved edits.
   * @returns {DocumentKey[]} The keys.
   */
  dirtyKeys(): DocumentKey[]
  {
    return this.documentKeys().filter(key => this.isDirty(key));
  }

  /**
   * Writes a document's committed content to its file; an edit still open is left out, since the file must match
   * the steps it is marked as reflecting. History is untouched: undo still works afterwards, and undoing back to
   * this point makes the document clean again. Edits made while the write is in flight stay unsaved.
   * @param {DocumentKey} key The document.
   * @returns {Promise<void>} Settles once the file is written.
   */
  async save(key: DocumentKey): Promise<void>
  {
    const store = this.#requireStore();
    const content = this.#committedContent(key);
    const marker = [ ...this.#applied.get(key) ?? [] ];

    await store.save(key, content);
    if (this.has(key))
    {
      this.#markSaved(key, marker, 'local');
    }
  }

  /**
   * Records which steps a document's file now reflects.
   * @param {DocumentKey} key The document.
   * @param {readonly string[]} marker The applied steps at the moment of the save.
   * @param {HubSource} source Whether the save happened here or in another window.
   */
  #markSaved(key: DocumentKey, marker: readonly string[], source: HubSource): void
  {
    this.#saved.set(key, [ ...marker ]);
    this.#emit({ type: 'saved', document: key, marker: [ ...marker ], source });
  }

  //endregion saving

  //region conflicts

  /**
   * Reads a document's conflict: two copies this window is keeping until the person chooses.
   * @param {DocumentKey} key The document.
   * @returns {DocumentConflict | null} The conflict, or null when there is none.
   */
  conflict(key: DocumentKey): DocumentConflict | null
  {
    return this.#conflicts.get(key) ?? null;
  }

  /**
   * Reports whether a document is in conflict.
   * @param {DocumentKey} key The document.
   * @returns {boolean} True when flagged.
   */
  isConflicted(key: DocumentKey): boolean
  {
    return this.#conflicts.has(key);
  }

  /**
   * Flags a held document as in conflict, keeping everything it holds and the other copy beside it.
   * @param {DocumentKey} key The document.
   * @param {DocumentConflict} conflict The other copy, and where it came from.
   */
  flagConflict(key: DocumentKey, conflict: DocumentConflict): void
  {
    if (this.has(key) === false)
    {
      return;
    }

    this.#conflicts.set(key, conflict);
    this.#emit({ type: 'conflicted', document: key, conflict });
  }

  /**
   * Clears a document's conflict flag, keeping the copy this window holds.
   * @param {DocumentKey} key The document.
   */
  clearConflict(key: DocumentKey): void
  {
    if (this.#conflicts.delete(key))
    {
      this.#emit({ type: 'conflict-cleared', document: key });
    }
  }

  //endregion conflicts

  //region external changes

  /**
   * Responds to a document's file changing outside the editor (in MZ, a script, another editor): a clean
   * document takes the new content, and one with unsaved edits keeps them and is flagged with the file's content
   * beside it, so nothing is ever thrown away without the person choosing to.
   * @param {DocumentKey} key The document.
   * @returns {Promise<ExternalChangeResult>} What was done.
   */
  async handleExternalChange(key: DocumentKey): Promise<ExternalChangeResult>
  {
    if (this.has(key) === false)
    {
      return 'ignored';
    }

    const content = await this.#requireStore().load(key);
    if (this.has(key) === false)
    {
      return 'ignored';
    }

    if (jsonEquals(this.#committedContent(key), content))
    {
      return 'unchanged';
    }

    // an edit in progress counts as unsaved work too.
    if (this.isDirty(key) || this.#transaction !== null)
    {
      this.flagConflict(key, { kind: 'disk', content });
      return 'conflicted';
    }

    this.reload(key, content);
    return 'reloaded';
  }

  /**
   * Replaces a document with its file's content, as when the person takes the disk's version over their edits.
   * Every step that touched the old content can no longer reverse against the new, so each one is dropped from
   * every history, and the document comes back clean, with a lineage that starts from this file.
   * @param {DocumentKey} key The document.
   * @param {JsonValue} content The file's content.
   */
  reload(key: DocumentKey, content: JsonValue): void
  {
    this.#requireIdle();
    this.document(key).replace(content);

    const stale = [ ...this.#steps.values() ].filter(step => documentsTouchedBy(step).includes(key));
    stale.forEach(step => this.#discard(step));
    this.#dropHistoriesOn(key);

    this.#applied.set(key, []);
    this.#saved.set(key, []);
    this.#lineage.set(key, [ diskOperationId(content) ]);
    this.clearConflict(key);

    if (stale.length > 0)
    {
      this.#emit({ type: 'discarded', stepIds: stale.map(step => step.id) });
    }

    this.#emit({ type: 'reloaded', document: key });
  }

  //endregion external changes

  //region sync

  /**
   * Repeats an operation made in another window. Anything touching only documents this window does not hold
   * is ignored. An operation made against a head this window's copy does not have, naming a step this window
   * has never seen, or finding its step already where it would put it, announces {@code out-of-sync} and
   * changes nothing, so the sync peer can work out whose copy is ahead. Operations wait while a local edit is open.
   * @param {RemoteOperation} operation The operation.
   */
  applyRemote(operation: RemoteOperation): void
  {
    if (this.#transaction !== null)
    {
      this.#queue.push(operation);
      return;
    }

    switch (operation.type)
    {
      case 'commit':
        this.#applyRemoteCommit(operation.step, operation.bases, operation.origin, operation.opId);
        break;
      case 'undo':
      case 'redo':
        this.#applyRemoteMove(operation);
        break;
      case 'forget':
        this.#applyRemoteForget(operation.stepId, operation.bases, operation.origin, operation.opId);
        break;
      case 'saved':
        if (this.has(operation.document))
        {
          this.#markSaved(operation.document, operation.marker, 'remote');
        }
        break;
    }
  }

  /**
   * Repeats another window's new step.
   * @param {HistoryStep} step The step.
   * @param {DocumentHeads} bases The heads it was made against.
   * @param {string} origin The window that made it.
   * @param {string} opId The operation's id.
   */
  #applyRemoteCommit(step: HistoryStep, bases: DocumentHeads, origin: string, opId: string): void
  {
    const held = documentsTouchedBy(step).filter(key => this.has(key));
    if (this.#steps.has(step.id) || held.length === 0)
    {
      return;
    }

    if (this.#staleAmong(held, bases).length > 0 || this.#applyEntries(step, 'forward') !== null)
    {
      this.#reportOutOfSync(held, origin);
      return;
    }

    this.#record(step);
    this.#markApplied(step);
    this.#extendLineage(step, opId);
    this.#emit({ type: 'committed', step, bases, opId, source: 'remote' });
  }

  /**
   * Repeats another window's undo or redo, but only when this window's copy is where that window's was: at the
   * same heads, with the step applied (for an undo) or not (for a redo).
   * @param {Extract<RemoteOperation, { type: 'undo' | 'redo' }>} operation The operation.
   */
  #applyRemoteMove(operation: Extract<RemoteOperation, { type: 'undo' | 'redo' }>): void
  {
    const direction = operation.type === 'undo'
      ? 'backward'
      : 'forward';
    const step = this.#knownStep(operation.stepId, operation.bases, operation.origin);
    if (step === null)
    {
      return;
    }

    const held = documentsTouchedBy(step).filter(key => this.has(key));
    const inPlace = this.#isApplied(step) === (direction === 'backward');
    if (inPlace === false || this.#staleAmong(held, operation.bases).length > 0 || this.#applyEntries(step, direction) !== null)
    {
      this.#reportOutOfSync(held, operation.origin);
      return;
    }

    this.#settleMove(step, direction, operation.opId);
    this.#emit({ type: operation.type === 'undo' ? 'undone' : 'redone', step, bases: operation.bases, opId: operation.opId, source: 'remote' });
  }

  /**
   * Repeats another window's forgetting of a step.
   * @param {string} stepId The step.
   * @param {DocumentHeads} bases The heads it was made against.
   * @param {string} origin The window that made it.
   * @param {string} opId The operation's id.
   */
  #applyRemoteForget(stepId: string, bases: DocumentHeads, origin: string, opId: string): void
  {
    const step = this.#knownStep(stepId, bases, origin);
    if (step === null)
    {
      return;
    }

    const held = documentsTouchedBy(step).filter(key => this.has(key));
    if (this.#staleAmong(held, bases).length > 0)
    {
      this.#reportOutOfSync(held, origin);
      return;
    }

    this.#discard(step);
    this.#extendLineage(step, opId);
    this.#emit({ type: 'forgotten', step, bases, opId, source: 'remote' });
  }

  /**
   * Finds the step a remote operation names. A step this window has never seen, on a document it holds, means
   * its copy missed something, which is announced rather than ignored.
   * @param {string} stepId The step.
   * @param {DocumentHeads} bases The heads the operation was made against, which name its documents.
   * @param {string} origin The window that made it.
   * @returns {HistoryStep | null} The step, or null when it is unknown here.
   */
  #knownStep(stepId: string, bases: DocumentHeads, origin: string): HistoryStep | null
  {
    const step = this.#steps.get(stepId);
    if (step !== undefined)
    {
      return step;
    }

    const held = (Object.keys(bases) as DocumentKey[]).filter(key => this.has(key));
    this.#reportOutOfSync(held, origin);
    return null;
  }

  /**
   * Lists the held documents whose head differs from the one an operation was made against.
   * @param {readonly DocumentKey[]} held The held documents the operation touches.
   * @param {DocumentHeads} bases The heads it was made against.
   * @returns {DocumentKey[]} The documents that went elsewhere.
   */
  #staleAmong(held: readonly DocumentKey[], bases: DocumentHeads): DocumentKey[]
  {
    return held.filter(key => this.head(key) !== bases[key]);
  }

  /**
   * Announces documents whose copy here differs from another window's.
   * @param {readonly DocumentKey[]} documents The documents.
   * @param {string} origin The window whose operation exposed it.
   */
  #reportOutOfSync(documents: readonly DocumentKey[], origin: string): void
  {
    if (documents.length > 0)
    {
      this.#emit({ type: 'out-of-sync', documents: [ ...documents ], origin });
    }
  }

  /**
   * Listens for hub events.
   * @param {HubListener} listener Called for every event.
   * @returns {() => void} Stops listening.
   */
  subscribe(listener: HubListener): () => void
  {
    this.#listeners.add(listener);
    return () =>
    {
      this.#listeners.delete(listener);
    };
  }

  //endregion sync

  //region internals

  /**
   * Applies a step's patches to every held document, forward in order or backward as inverses in reverse
   * order. On a conflict, everything already applied is put back, so a step moves whole or not at all.
   * @param {HistoryStep} step The step.
   * @param {'forward' | 'backward'} direction Which way.
   * @returns {{ entry: StepEntry, message: string } | null} The entry that did not fit and why, or null on success.
   */
  #applyEntries(step: HistoryStep, direction: 'forward' | 'backward'): { entry: StepEntry; message: string } | null
  {
    const entries = step.entries.filter(entry => this.has(entry.document));
    const ordered = direction === 'forward'
      ? entries
      : [ ...entries ].reverse();

    const done: Patch[] = [];
    const documents: DocumentKey[] = [];
    for (const entry of ordered)
    {
      const patch = direction === 'forward'
        ? entry.patch
        : invertPatch(entry.patch);
      try
      {
        this.document(entry.document).apply(patch);
        done.push(patch);
        documents.push(entry.document);
      }
      catch (error)
      {
        if ((error instanceof PatchConflictError) === false)
        {
          throw error;
        }

        // put back what already moved, newest first.
        for (let index = done.length - 1; index >= 0; index--)
        {
          this.document(documents[index]).apply(invertPatch(done[index]));
        }

        return { entry, message: error.message };
      }
    }

    return null;
  }

  /**
   * Reports whether a step's patches are applied here: by the documents it changes when any is held, otherwise
   * by the histories that list it.
   * @param {HistoryStep} step The step.
   * @returns {boolean} True when applied.
   */
  #isApplied(step: HistoryStep): boolean
  {
    const documents = documentsOfStep(step).filter(key => this.has(key));
    if (documents.length > 0)
    {
      return documents.some(key => (this.#applied.get(key) ?? []).includes(step.id));
    }

    return this.#heldHistoriesOf(step).some(history => history.stateOf(step.id) === 'done');
  }

  /**
   * Records a step in every held history it belongs to. Each of those histories stops being able to redo what it
   * could; a step dropped that way is only forgotten altogether once no history can redo it any more.
   * @param {HistoryStep} step The step.
   */
  #record(step: HistoryStep): void
  {
    this.#steps.set(step.id, step);
    const dropped = this.#heldHistoriesOf(step).flatMap(history => history.record(step));
    const orphaned = [ ...new Map(dropped.map(each => [ each.id, each ])).values() ]
      .filter(each => [ ...this.#histories.values() ].every(history => history.stateOf(each.id) === null));

    orphaned.forEach(each => this.#steps.delete(each.id));
    if (orphaned.length > 0)
    {
      this.#emit({ type: 'discarded', stepIds: orphaned.map(each => each.id) });
    }
  }

  /**
   * Drops a step from every history and from the registry.
   * @param {HistoryStep} step The step.
   */
  #discard(step: HistoryStep): void
  {
    this.#histories.forEach(history => history.drop(step.id));
    this.#steps.delete(step.id);
  }

  /**
   * Notes a step as applied to each document it changes.
   * @param {HistoryStep} step The step.
   */
  #markApplied(step: HistoryStep): void
  {
    documentsOfStep(step).filter(key => this.has(key)).forEach(key =>
    {
      this.#applied.get(key)?.push(step.id);
    });
  }

  /**
   * Notes a step as reverted on each document it changes, wherever it sat among the applied steps.
   * @param {HistoryStep} step The step.
   */
  #markReverted(step: HistoryStep): void
  {
    documentsOfStep(step).filter(key => this.has(key)).forEach(key =>
    {
      const applied = this.#applied.get(key) ?? [];
      const index = applied.lastIndexOf(step.id);
      if (index >= 0)
      {
        applied.splice(index, 1);
      }
    });
  }

  /**
   * Logs an operation in the lineage of every held document it touched.
   * @param {HistoryStep} step The step the operation acted on.
   * @param {string} opId The operation's id.
   */
  #extendLineage(step: HistoryStep, opId: string): void
  {
    documentsTouchedBy(step).filter(key => this.has(key)).forEach(key =>
    {
      this.#lineage.get(key)?.push(opId);
    });
  }

  /**
   * Reads the current head of every held document an operation on a step touches.
   * @param {HistoryStep} step The step.
   * @returns {DocumentHeads} The heads.
   */
  #headsOf(step: HistoryStep): DocumentHeads
  {
    return Object.fromEntries(documentsTouchedBy(step)
      .filter(key => this.has(key))
      .map(key => [ key, this.head(key) as string ]));
  }

  /**
   * Makes the next step or operation id, unique across windows.
   * @returns {string} The id.
   */
  #nextId(): string
  {
    this.#counter += 1;
    return `${this.clientId}#${this.#counter}`;
  }

  /**
   * Lists the histories a step belongs to whose documents this window holds.
   * @param {HistoryStep} step The step.
   * @returns {History[]} The histories.
   */
  #heldHistoriesOf(step: HistoryStep): History[]
  {
    return step.histories
      .filter(key => this.has(homeDocumentOf(key)))
      .map(key => this.#historyFor(key));
  }

  /**
   * Finds or creates a history.
   * @param {HistoryKey} key The history.
   * @returns {History} The history.
   */
  #historyFor(key: HistoryKey): History
  {
    let history = this.#histories.get(key);
    if (history === undefined)
    {
      history = new History(key);
      this.#histories.set(key, history);
    }

    return history;
  }

  /**
   * Forgets every history that lives on a document.
   * @param {DocumentKey} key The document.
   */
  #dropHistoriesOn(key: DocumentKey): void
  {
    [ ...this.#histories.keys() ]
      .filter(historyKey => homeDocumentOf(historyKey) === key)
      .forEach(historyKey => this.#histories.delete(historyKey));
  }

  /**
   * Forgets every step no remaining history mentions.
   */
  #prune(): void
  {
    const kept = new Set<string>();
    this.#histories.forEach(history => [ ...history.done, ...history.undone ].forEach(step => kept.add(step.id)));
    [ ...this.#steps.keys() ].filter(id => kept.has(id) === false).forEach(id => this.#steps.delete(id));
  }

  /**
   * Replays remote operations that waited for a local edit to finish.
   */
  #drainQueue(): void
  {
    const queued = this.#queue;
    this.#queue = [];
    queued.forEach(operation => this.applyRemote(operation));
  }

  /**
   * Refuses to act while a local edit is open.
   */
  #requireIdle(): void
  {
    if (this.#transaction !== null)
    {
      throw new Error(`finish "${this.#transaction.label}" first`);
    }
  }

  /**
   * Finds the store, which loading and saving need.
   * @returns {DocumentStore} The store.
   */
  #requireStore(): DocumentStore
  {
    if (this.#store === null)
    {
      throw new Error('this hub has no store to load from or save to');
    }

    return this.#store;
  }

  /**
   * Tells every listener about an event.
   * @param {HubEvent} event The event.
   */
  #emit(event: HubEvent): void
  {
    [ ...this.#listeners ].forEach(listener => listener(event));
  }

  //endregion internals
}

export { diskOperationId, DocumentHub };
export type {
  DocumentConflict,
  DocumentHubOptions,
  DocumentSnapshot,
  DocumentStore,
  ExternalChangeResult,
  HistoryCheck,
  HistoryFailure,
  HubEvent,
  HubListener,
  HubSource,
  JumpResult,
  RemoteOperation,
};
