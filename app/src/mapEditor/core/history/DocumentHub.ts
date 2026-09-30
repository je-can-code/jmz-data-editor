import { createDocument } from '../model/createDocument.ts';
import type { DocumentKey, MapDocumentKey } from '../model/documentKeys.ts';
import type { EditorDocument } from '../model/EditorDocument.ts';
import { jsonEquals, type JsonValue } from '../model/json.ts';
import { MapDocument } from '../model/MapDocument.ts';
import { invertPatch, PatchConflictError } from '../model/patches.ts';
import { History, type HistoryView } from './History.ts';
import { homeDocumentOf, type HistoryKey } from './historyKeys.ts';
import { documentsOfStep, type DocumentVersions, type HistoryStep, type StepEntry } from './HistoryStep.ts';
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
 * Why an undo, redo or jump could not happen.
 *
 * - {@code nothing}: the history has no step in that direction.
 * - {@code missing-documents}: the step touches documents this window does not hold; open them and retry.
 * - {@code blocked}: the step is a transaction, and another history it belongs to has newer steps on top.
 * - {@code conflict}: a patch found its document changed underneath it, so the step was left in place.
 */
type HistoryFailure =
  | { readonly ok: false; readonly reason: 'nothing'; readonly historyKey: HistoryKey }
  | { readonly ok: false; readonly reason: 'missing-documents'; readonly step: HistoryStep; readonly documents: readonly DocumentKey[] }
  | { readonly ok: false; readonly reason: 'blocked'; readonly step: HistoryStep; readonly by: HistoryKey }
  | { readonly ok: false; readonly reason: 'conflict'; readonly step: HistoryStep; readonly message: string };

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
 * Everything the hub announces. The history panel, dirty markers and cross-window sync all listen here.
 */
type HubEvent =
  | { readonly type: 'committed'; readonly step: HistoryStep; readonly bases: DocumentVersions; readonly source: HubSource }
  | { readonly type: 'undone'; readonly step: HistoryStep; readonly bases: DocumentVersions; readonly source: HubSource }
  | { readonly type: 'redone'; readonly step: HistoryStep; readonly bases: DocumentVersions; readonly source: HubSource }
  | { readonly type: 'discarded'; readonly stepIds: readonly string[] }
  | { readonly type: 'saved'; readonly document: DocumentKey; readonly marker: readonly string[]; readonly source: HubSource }
  | { readonly type: 'adopted'; readonly document: DocumentKey; readonly source: HubSource }
  | { readonly type: 'released'; readonly document: DocumentKey }
  | { readonly type: 'reloaded'; readonly document: DocumentKey }
  | { readonly type: 'conflicted'; readonly document: DocumentKey }
  | { readonly type: 'out-of-sync'; readonly documents: readonly DocumentKey[]; readonly origin: string; readonly originVersions: DocumentVersions };

/**
 * Hears every hub event.
 */
type HubListener = (event: HubEvent) => void;

/**
 * An operation made in another window, to be repeated here. {@code bases} holds the version of each touched
 * document just before the operation, so a window that drifted can tell and ask for a fresh copy.
 */
type RemoteOperation =
  | { readonly type: 'commit'; readonly origin: string; readonly step: HistoryStep; readonly bases: DocumentVersions }
  | { readonly type: 'undo'; readonly origin: string; readonly stepId: string; readonly bases: DocumentVersions }
  | { readonly type: 'redo'; readonly origin: string; readonly stepId: string; readonly bases: DocumentVersions }
  | { readonly type: 'saved'; readonly origin: string; readonly document: DocumentKey; readonly marker: readonly string[] };

/**
 * Everything one window knows about a document, for another window to adopt: its content, its place in time,
 * whether it is saved, and every history that lives on it. Plain data, so it crosses a BroadcastChannel.
 */
type DocumentSnapshot = {
  readonly document: DocumentKey;
  readonly content: JsonValue;
  readonly version: number;
  readonly applied: readonly string[];
  readonly saved: readonly string[];
  readonly conflicted: boolean;
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
   * This window's id: it prefixes every step id, and saves carry it so the window can ignore their echo.
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
 * One window's documents and their histories.
 *
 * Every edit is a named step of reversible patches, recorded in the history of each thing it touches. A step
 * in several histories is a transaction, and undoes as one step from any of them; it is only undone while it is
 * the newest step in all of them, so every history stays strictly last-in, first-out. Every patch is checked
 * against what it replaces, on the way in and on the way back, so two histories editing one map (the map's own
 * and an event window's) can never quietly reverse each other's work.
 *
 * Saving writes a document and records which steps the file now reflects; it never touches history, so undo
 * after a save works, and undoing back to the saved state makes the document clean again.
 *
 * Other windows holding the same documents stay in step through {@link applyRemote}, fed by the sync peer.
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

  #versions = new Map<DocumentKey, number>();

  #conflicted = new Set<DocumentKey>();

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
   * Reads a held document's version, which counts the operations applied to it.
   * @param {DocumentKey} key The document.
   * @returns {number} The version, or -1 when not held.
   */
  version(key: DocumentKey): number
  {
    return this.#versions.get(key) ?? -1;
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
   * Holds a document built from its file content, clean and with empty histories. A document already held is
   * returned as it is.
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
    this.#versions.set(key, 0);
    this.#applied.set(key, []);
    this.#saved.set(key, []);
    this.#emit({ type: 'adopted', document: key, source: 'local' });
    return document;
  }

  /**
   * Captures everything this window knows about a document, for another window to adopt.
   * @param {DocumentKey} key The document.
   * @returns {DocumentSnapshot} The snapshot.
   */
  snapshot(key: DocumentKey): DocumentSnapshot
  {
    const document = this.document(key);
    const histories = [ ...this.#histories.values() ]
      .filter(history => homeDocumentOf(history.key) === key)
      .map(history => ({ key: history.key, done: [ ...history.done ], undone: [ ...history.undone ] }));

    return {
      document: key,
      content: document.toJson(),
      version: this.version(key),
      applied: [ ...this.#applied.get(key) ?? [] ],
      saved: [ ...this.#saved.get(key) ?? [] ],
      conflicted: this.#conflicted.has(key),
      histories,
    };
  }

  /**
   * Takes on another window's copy of a document, with its histories, replacing any copy held here.
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

    this.#versions.set(key, snapshot.version);
    this.#applied.set(key, [ ...snapshot.applied ]);
    this.#saved.set(key, [ ...snapshot.saved ]);
    this.#setConflicted(key, snapshot.conflicted);

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

    this.#versions.delete(key);
    this.#applied.delete(key);
    this.#saved.delete(key);
    this.#conflicted.delete(key);
    this.#dropHistoriesOn(key);
    this.#prune();
    this.#emit({ type: 'released', document: key });
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

    this.#counter += 1;
    const step: HistoryStep = {
      id: `${this.clientId}#${this.#counter}`,
      label: transaction.label,
      histories: [ ...transaction.histories ],
      entries: [ ...entries ],
      origin: this.clientId,
      at: this.#now(),
    };

    const bases = this.#versionsOf(step);
    this.#record(step);
    this.#markApplied(step);
    this.#emit({ type: 'committed', step, bases, source: 'local' });
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
   * Reports whether an undo in a history would go ahead, without doing it.
   * @param {HistoryKey} key The history.
   * @returns {HistoryCheck} The step it would undo, or why it cannot.
   */
  canUndo(key: HistoryKey): HistoryCheck
  {
    const step = this.#histories.get(key)?.lastDone() ?? null;
    if (step === null)
    {
      return { ok: false, reason: 'nothing', historyKey: key };
    }

    return this.#checkStep(step, history => history.lastDone());
  }

  /**
   * Reports whether a redo in a history would go ahead, without doing it.
   * @param {HistoryKey} key The history.
   * @returns {HistoryCheck} The step it would redo, or why it cannot.
   */
  canRedo(key: HistoryKey): HistoryCheck
  {
    const step = this.#histories.get(key)?.nextRedo() ?? null;
    if (step === null)
    {
      return { ok: false, reason: 'nothing', historyKey: key };
    }

    return this.#checkStep(step, history => history.nextRedo());
  }

  /**
   * Undoes the newest step of a history, across every document it touched.
   * @param {HistoryKey} key The history.
   * @returns {HistoryCheck} The step undone, or why nothing was.
   */
  undo(key: HistoryKey): HistoryCheck
  {
    this.#requireIdle();
    const check = this.canUndo(key);
    if (check.ok === false)
    {
      return check;
    }

    const { step } = check;
    const bases = this.#versionsOf(step);
    const conflict = this.#applyEntries(step, 'backward');
    if (conflict !== null)
    {
      return { ok: false, reason: 'conflict', step, message: conflict };
    }

    this.#heldHistoriesOf(step).forEach(history => history.markUndone(step));
    this.#markReverted(step);
    this.#emit({ type: 'undone', step, bases, source: 'local' });
    return check;
  }

  /**
   * Redoes the most recently undone step of a history.
   * @param {HistoryKey} key The history.
   * @returns {HistoryCheck} The step redone, or why nothing was.
   */
  redo(key: HistoryKey): HistoryCheck
  {
    this.#requireIdle();
    const check = this.canRedo(key);
    if (check.ok === false)
    {
      return check;
    }

    const { step } = check;
    const bases = this.#versionsOf(step);
    const conflict = this.#applyEntries(step, 'forward');
    if (conflict !== null)
    {
      return { ok: false, reason: 'conflict', step, message: conflict };
    }

    this.#heldHistoriesOf(step).forEach(history => history.markRedone(step));
    this.#markApplied(step);
    this.#emit({ type: 'redone', step, bases, source: 'local' });
    return check;
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
   * Checks that a step can move: every document it touches is held, and it is at the head of every history.
   * @param {HistoryStep} step The step.
   * @param {(history: History) => HistoryStep | null} headOf Reads the step a history would move next.
   * @returns {HistoryCheck} The step, or why it cannot move.
   */
  #checkStep(step: HistoryStep, headOf: (history: History) => HistoryStep | null): HistoryCheck
  {
    const needed = [ ...documentsOfStep(step), ...step.histories.map(homeDocumentOf) ];
    const missing = [ ...new Set(needed) ].filter(key => this.has(key) === false);
    if (missing.length > 0)
    {
      return { ok: false, reason: 'missing-documents', step, documents: missing };
    }

    const blocker = step.histories.find(key => headOf(this.#historyFor(key)) !== step);
    if (blocker !== undefined)
    {
      return { ok: false, reason: 'blocked', step, by: blocker };
    }

    return { ok: true, step };
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
   * Writes a document to its file. History is untouched: undo still works afterwards, and undoing back to
   * this point makes the document clean again. Edits made while the write is in flight stay unsaved.
   * @param {DocumentKey} key The document.
   * @returns {Promise<void>} Settles once the file is written.
   */
  async save(key: DocumentKey): Promise<void>
  {
    const store = this.#requireStore();
    const content = this.document(key).toJson();
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

  //region external changes

  /**
   * Reports whether a document's file changed on disk while it held unsaved edits.
   * @param {DocumentKey} key The document.
   * @returns {boolean} True when flagged.
   */
  isConflicted(key: DocumentKey): boolean
  {
    return this.#conflicted.has(key);
  }

  /**
   * Responds to a document's file changing outside the editor (in MZ, a script, another editor): a clean
   * document takes the new content, and one with unsaved edits keeps them and is flagged, so nothing is ever
   * thrown away without the author choosing to.
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

    if (jsonEquals(this.document(key).toJson(), content))
    {
      return 'unchanged';
    }

    // an edit in progress counts as unsaved work too.
    if (this.isDirty(key) || this.#transaction !== null)
    {
      this.#setConflicted(key, true);
      return 'conflicted';
    }

    this.reload(key, content);
    return 'reloaded';
  }

  /**
   * Replaces a document with its file's content, as when taking the disk's version over unsaved edits. Every
   * step that touched the old content can no longer reverse against the new, so each one is dropped from every
   * history, and the document comes back clean.
   * @param {DocumentKey} key The document.
   * @param {JsonValue} content The file's content.
   */
  reload(key: DocumentKey, content: JsonValue): void
  {
    this.#requireIdle();
    this.document(key).replace(content);

    const stale = [ ...this.#steps.values() ]
      .filter(step => documentsOfStep(step).includes(key) || step.histories.some(history => homeDocumentOf(history) === key));
    stale.forEach(step => this.#discard(step));
    this.#dropHistoriesOn(key);

    this.#applied.set(key, []);
    this.#saved.set(key, []);
    this.#versions.set(key, this.version(key) + 1);
    this.#conflicted.delete(key);

    if (stale.length > 0)
    {
      this.#emit({ type: 'discarded', stepIds: stale.map(step => step.id) });
    }

    this.#emit({ type: 'reloaded', document: key });
  }

  /**
   * Flags a held document as changed on disk behind the editor's back, as when its file was removed, keeping
   * everything it holds.
   * @param {DocumentKey} key The document.
   */
  flagConflict(key: DocumentKey): void
  {
    if (this.has(key))
    {
      this.#setConflicted(key, true);
    }
  }

  /**
   * Clears a document's conflict flag, keeping the edits it holds.
   * @param {DocumentKey} key The document.
   */
  dismissConflict(key: DocumentKey): void
  {
    this.#setConflicted(key, false);
  }

  /**
   * Sets or clears a conflict flag, announcing a new one.
   * @param {DocumentKey} key The document.
   * @param {boolean} conflicted Whether it is flagged.
   */
  #setConflicted(key: DocumentKey, conflicted: boolean): void
  {
    if (conflicted === false)
    {
      this.#conflicted.delete(key);
      return;
    }

    const isNew = this.#conflicted.has(key) === false;
    this.#conflicted.add(key);
    if (isNew)
    {
      this.#emit({ type: 'conflicted', document: key });
    }
  }

  //endregion external changes

  //region sync

  /**
   * Repeats an operation made in another window. Anything touching only documents this window does not hold
   * is ignored; a document found at a different version, or a patch that no longer fits, announces
   * {@code out-of-sync} so the sync peer can fetch a fresh copy. Operations wait while a local edit is open.
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
        this.#applyRemoteCommit(operation.step, operation.bases, operation.origin);
        break;
      case 'undo':
        this.#applyRemoteMove(operation.stepId, operation.bases, operation.origin, 'backward');
        break;
      case 'redo':
        this.#applyRemoteMove(operation.stepId, operation.bases, operation.origin, 'forward');
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
   * @param {DocumentVersions} bases The versions it was made against.
   * @param {string} origin The window that made it.
   */
  #applyRemoteCommit(step: HistoryStep, bases: DocumentVersions, origin: string): void
  {
    const held = documentsOfStep(step).filter(key => this.has(key));
    if (this.#steps.has(step.id) || (held.length === 0 && this.#heldHistoriesOf(step).length === 0))
    {
      return;
    }

    if (this.#isStale(held, bases, origin) || this.#applyEntries(step, 'forward') !== null)
    {
      this.#reportOutOfSync(held, origin, bases);
      return;
    }

    this.#record(step);
    this.#markApplied(step);
    this.#emit({ type: 'committed', step, bases, source: 'remote' });
  }

  /**
   * Repeats another window's undo or redo.
   * @param {string} stepId The step.
   * @param {DocumentVersions} bases The versions it was made against.
   * @param {string} origin The window that made it.
   * @param {'forward' | 'backward'} direction Redo or undo.
   */
  #applyRemoteMove(stepId: string, bases: DocumentVersions, origin: string, direction: 'forward' | 'backward'): void
  {
    const step = this.#steps.get(stepId);
    if (step === undefined)
    {
      return;
    }

    const held = documentsOfStep(step).filter(key => this.has(key));
    const histories = this.#heldHistoriesOf(step);
    const inPlace = histories.every(history => (direction === 'backward'
      ? history.lastDone()
      : history.nextRedo()) === step);
    if (inPlace === false || this.#isStale(held, bases, origin) || this.#applyEntries(step, direction) !== null)
    {
      this.#reportOutOfSync(held, origin, bases);
      return;
    }

    if (direction === 'backward')
    {
      histories.forEach(history => history.markUndone(step));
      this.#markReverted(step);
      this.#emit({ type: 'undone', step, bases, source: 'remote' });
      return;
    }

    histories.forEach(history => history.markRedone(step));
    this.#markApplied(step);
    this.#emit({ type: 'redone', step, bases, source: 'remote' });
  }

  /**
   * Reports whether any held document stands at a different version than an operation was made against.
   * @param {readonly DocumentKey[]} held The held documents the operation touches.
   * @param {DocumentVersions} bases The versions it was made against.
   * @param {string} origin The window that made it.
   * @returns {boolean} True when this window has drifted.
   */
  #isStale(held: readonly DocumentKey[], bases: DocumentVersions, origin: string): boolean
  {
    return origin !== this.clientId && held.some(key => this.version(key) !== bases[key]);
  }

  /**
   * Announces documents that have drifted from another window's copy, with the versions that window's copies
   * stand at now, so the sync peer can tell which copy has seen more.
   * @param {readonly DocumentKey[]} documents The documents.
   * @param {string} origin The window whose operation exposed it.
   * @param {DocumentVersions} bases The versions its operation was made against; each operation moves them on by one.
   */
  #reportOutOfSync(documents: readonly DocumentKey[], origin: string, bases: DocumentVersions): void
  {
    if (documents.length === 0)
    {
      return;
    }

    const originVersions = Object.fromEntries(documents.map(key => [ key, (bases[key] ?? -1) + 1 ]));
    this.#emit({ type: 'out-of-sync', documents: [ ...documents ], origin, originVersions });
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
   * @returns {string | null} The conflict's message, or null on success.
   */
  #applyEntries(step: HistoryStep, direction: 'forward' | 'backward'): string | null
  {
    const entries = step.entries
      .filter(entry => this.has(entry.document))
      .map(entry => ({
        document: entry.document,
        patch: direction === 'forward'
          ? entry.patch
          : invertPatch(entry.patch),
      }));
    if (direction === 'backward')
    {
      entries.reverse();
    }

    const done: StepEntry[] = [];
    for (const entry of entries)
    {
      try
      {
        this.document(entry.document).apply(entry.patch);
        done.push(entry);
      }
      catch (error)
      {
        if ((error instanceof PatchConflictError) === false)
        {
          throw error;
        }

        // put back what already moved, newest first.
        done.reverse().forEach(applied => this.document(applied.document).apply(invertPatch(applied.patch)));
        return error.message;
      }
    }

    return null;
  }

  /**
   * Records a step in every held history it belongs to, dropping whatever those histories could have redone
   * from every history.
   * @param {HistoryStep} step The step.
   */
  #record(step: HistoryStep): void
  {
    this.#steps.set(step.id, step);
    const dropped = this.#heldHistoriesOf(step).flatMap(history => history.record(step));
    const unique = [ ...new Map(dropped.map(each => [ each.id, each ])).values() ];
    unique.forEach(each => this.#discard(each));
    if (unique.length > 0)
    {
      this.#emit({ type: 'discarded', stepIds: unique.map(each => each.id) });
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
   * Notes a step as applied to each document it touches, and moves their versions on.
   * @param {HistoryStep} step The step.
   */
  #markApplied(step: HistoryStep): void
  {
    documentsOfStep(step).filter(key => this.has(key)).forEach(key =>
    {
      this.#applied.get(key)?.push(step.id);
      this.#versions.set(key, this.version(key) + 1);
    });
  }

  /**
   * Notes a step as reverted on each document it touches, and moves their versions on.
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

      this.#versions.set(key, this.version(key) + 1);
    });
  }

  /**
   * Reads the current version of every document a step touches.
   * @param {HistoryStep} step The step.
   * @returns {DocumentVersions} The versions.
   */
  #versionsOf(step: HistoryStep): DocumentVersions
  {
    return Object.fromEntries(documentsOfStep(step).map(key => [ key, this.version(key) ]));
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

export { DocumentHub };
export type {
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
