import { createDocument } from '../model/createDocument.ts';
import type { DocumentKey, MapDocumentKey } from '../model/documentKeys.ts';
import type { EditorDocument } from '../model/EditorDocument.ts';
import { jsonEquals, type JsonValue } from '../model/json.ts';
import { MapDocument } from '../model/MapDocument.ts';
import { invertPatch, PatchConflictError, type Patch } from '../model/patches.ts';
import { History, type HistoryView } from './History.ts';
import { homeDocumentOf, outsideChangeHistories, type HistoryKey } from './historyKeys.ts';
import {
  documentsOfStep,
  documentsTouchedBy,
  type DocumentHeads,
  type HistoryStep,
  type StepEntry,
} from './HistoryStep.ts';
import { patchInterference, type Interference } from './patchInterference.ts';
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
 * - {@code disk}: the file changed outside the editor while this window held unsaved edits, or changed into
 *   something no patch can say. {@code content} is the file's new content, or null when the file was removed.
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
 * - {@code conflict}: another edit changed something the step changes, so moving the step would overwrite it. For
 *   an undo that edit came later; for a redo it was made, or undone, since the step's undo.
 * - {@code moved}: that edit moved where something the step changes sits, or moving the step would move where the
 *   edit's changes sit: a resize moves every tile, and adding or removing items in a list moves every item after
 *   them. Moving the step would change the wrong thing.
 * - {@code untracked}: one of the step's documents does not record it: for an undo, the copy does not list the step
 *   as applied (a map closed and opened again from disk); for a redo, its record of edits does not reach back to
 *   the step's undo (a copy from a window that no longer tracked the step). Nothing there can be checked.
 *
 * For the last three, {@code blockedBy} names the edit in the way when the window can tell which one it was, and
 * the step stays where it is, having changed nothing anywhere; the person can move the blocking edit first, or
 * forget this step ({@link DocumentHub.forgetStep}) and go on past it.
 */
type HistoryFailure =
  | { readonly ok: false; readonly reason: 'nothing'; readonly historyKey: HistoryKey }
  | { readonly ok: false; readonly reason: 'missing-documents'; readonly step: HistoryStep; readonly documents: readonly DocumentKey[] }
  | {
    readonly ok: false;
    readonly reason: 'conflict' | 'moved' | 'untracked';
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
 *
 * {@code applied} names every step whose patches the content holds, in the order they went in, which is what an
 * undo is checked against. {@code moves} names every step whose patches went in or came out since the oldest undo
 * a history can still redo, oldest first, which is what a redo is checked against. Most of those steps sit in the
 * histories; {@code unlisted} carries the rest (steps forgotten, steps dropped from every history, and steps kept
 * only by histories that live on other documents), since no history can move them but a check still needs them.
 */
type DocumentSnapshot = {
  readonly document: DocumentKey;
  readonly content: JsonValue;
  readonly lineage: readonly string[];
  readonly applied: readonly string[];
  readonly moves: readonly string[];
  readonly saved: readonly string[];
  readonly histories: readonly { key: HistoryKey; done: readonly HistoryStep[]; undone: readonly HistoryStep[] }[];
  readonly unlisted: readonly HistoryStep[];
};

/**
 * What happened when a document's file changed outside the editor.
 *
 * - {@code ignored}: this window does not hold the document, or it was only being re-read after the change stream
 *   came back and the document holds unsaved edits, which differ from the file by definition.
 * - {@code unchanged}: the file holds nothing the window lacks: what it holds now, what it last saved or loaded, or a
 *   state its latest edits passed through, as the echo of a save does. The document is saved as far as that state
 *   and no further.
 * - {@code recorded}: the window held no unsaved edits, so it took the file's content as one undoable step, named
 *   {@link OUTSIDE_CHANGE_LABEL}, and the document stays saved.
 * - {@code conflicted}: the window holds unsaved edits, so it kept them and flagged the document; or the file was
 *   removed, or changed into something no patch can reach, which is left for the person to choose too.
 */
type ExternalChangeResult = 'ignored' | 'unchanged' | 'recorded' | 'conflicted';

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
 * What the history panel calls the step a document's file changing outside the editor is recorded as.
 */
const OUTSIDE_CHANGE_LABEL = 'Externally modified';

/**
 * How many of a document's newest unsaved states a file arriving from outside is compared against, besides the state
 * it was last saved as. A save's echo can overtake the message saying which steps the save held by a moment, and only
 * the edits of that moment lie between; comparing every state would cost a copy of the document per unsaved step.
 */
const RECENT_STATES_COMPARED = 32;

/**
 * Names the step an outside change to a file is recorded as, the same way in every window: the document, the latest
 * operation its copy had seen, and the version of the file it took. Every window hears each change on its own, and
 * every window holding the document at that head records the very same step from the very same file, so their
 * lineages stay one however the change reaches them. An operation's id is never used twice, so the same file arriving
 * again after anything else happened to the document is a step of its own.
 * @param {DocumentKey} key The document.
 * @param {string} head The id of the latest operation on its copy, just before the change.
 * @param {JsonValue} content The file's new content.
 * @returns {string} The step's id.
 */
const outsideStepId = (key: DocumentKey, head: string, content: JsonValue): string =>
{
  return `outside:${key}:${head}>${diskOperationId(content)}`;
};

/**
 * Lists a step's patches on one document, in the order they were applied.
 * @param {HistoryStep} step The step.
 * @param {DocumentKey} key The document.
 * @returns {Patch[]} The patches.
 */
const patchesOn = (step: HistoryStep, key: DocumentKey): Patch[] =>
{
  return step.entries
    .filter(entry => entry.document === key)
    .map(entry => entry.patch);
};

/**
 * How one kind of blocked undo is reported: the reason it gives, and the sentence naming the step and the edit
 * in its way.
 */
type BlockedUndoReport = {
  readonly reason: 'conflict' | 'moved';
  readonly describe: (step: HistoryStep, later: HistoryStep) => string;
};

/**
 * How an undo refused by a later edit is reported, by the way that edit bears on the step.
 */
const BLOCKED_UNDO: Readonly<Record<Interference, BlockedUndoReport>> = {
  overlap: {
    reason: 'conflict',
    describe: (step, later) => `"${later.label}" later changed what "${step.label}" changed`,
  },
  moved: {
    reason: 'moved',
    describe: (step, later) => `"${later.label}" moved what "${step.label}" changed`,
  },
  'would-move': {
    reason: 'moved',
    describe: (step, later) => `undoing "${step.label}" would move what "${later.label}" changed`,
  },
};

/**
 * How one kind of blocked redo is reported: the reason it gives, and the sentence naming the step and the edit in
 * its way. The edit comes already phrased: its name when it was made since the undo, or undoing it when it was
 * undone since.
 */
type BlockedRedoReport = {
  readonly reason: 'conflict' | 'moved';
  readonly describe: (step: HistoryStep, edit: string) => string;
};

/**
 * How a redo refused by an edit made or undone since its undo is reported, by the way that edit bears on the step.
 * The edit is the earlier one here, its patches having been in place (or taken out) first, and the step is what
 * would go back on top.
 */
const BLOCKED_REDO: Readonly<Record<Interference, BlockedRedoReport>> = {
  overlap: {
    reason: 'conflict',
    describe: (step, edit) => `${edit} changed what "${step.label}" changes`,
  },
  moved: {
    reason: 'moved',
    describe: (step, edit) => `redoing "${step.label}" would move what ${edit} changed`,
  },
  'would-move': {
    reason: 'moved',
    describe: (step, edit) => `${edit} moved what "${step.label}" changes`,
  },
};

/**
 * Lists the steps whose patches went in or came out an odd number of times across a run of moves, newest move
 * first. Every move turns a step's patches over, so these are exactly the steps whose state differs from before the
 * run; a step undone and redone within it is back as it was, and leaves nothing to check.
 * @param {readonly HistoryStep[]} moves The moves, oldest first.
 * @returns {HistoryStep[]} The steps, by their newest move first.
 */
const stepsTurnedOverBy = (moves: readonly HistoryStep[]): HistoryStep[] =>
{
  const newestFirst = [ ...new Map([ ...moves ].reverse().map(step => [ step.id, step ])).values() ];
  return newestFirst.filter(step => moves.filter(each => each.id === step.id).length % 2 === 1);
};

/**
 * Relates a later step to an earlier one on one document: how the first pair of their patches there that bear on
 * each other do.
 * @param {DocumentKey} key The document.
 * @param {HistoryStep} earlier The step applied first.
 * @param {HistoryStep} later The step applied after it.
 * @returns {Interference | null} How the later step bears on the earlier one there, or null when it does not.
 */
const interferenceOn = (key: DocumentKey, earlier: HistoryStep, later: HistoryStep): Interference | null =>
{
  const laterPatches = patchesOn(later, key);
  const found = patchesOn(earlier, key)
    .flatMap(earlierPatch => laterPatches.map(laterPatch => patchInterference(earlierPatch, laterPatch)))
    .find(interference => interference !== null);

  return found ?? null;
};

/**
 * Builds the lookup from the step ids a snapshot names (in its applied list and its moves) to the steps it carries,
 * in its histories and beside them.
 * @param {DocumentSnapshot} snapshot The snapshot.
 * @returns {(id: string) => HistoryStep} Finds one step; throws when the snapshot names a step it does not carry,
 * since the content could then not be checked against it.
 */
const carriedStepFinder = (snapshot: DocumentSnapshot): (id: string) => HistoryStep =>
{
  const carried = new Map<string, HistoryStep>();
  snapshot.histories.forEach(({ done, undone }) => [ ...done, ...undone ].forEach(step => carried.set(step.id, step)));
  snapshot.unlisted.forEach(step => carried.set(step.id, step));

  return (id: string): HistoryStep =>
  {
    const step = carried.get(id);
    if (step === undefined)
    {
      throw new Error(`the copy of ${snapshot.document} names ${id} without carrying it`);
    }

    return step;
  };
};

/**
 * One window's documents and their histories.
 *
 * Every edit is a named step of reversible patches, recorded in the history of each thing it touches. A step in
 * several histories is a transaction (a door pair, a blueprint propagating to every copy), and undoes as one step
 * from any of them.
 *
 * The undo rule: a history's newest step can be undone however many unrelated steps came after it in this or any
 * other history, unless an edit applied after it, on any document it changed, changed the same data, moved where
 * that data sits, or would itself be moved by taking the step out. A resize moves every tile; adding or removing
 * items in a list moves every item after them. Patch addresses are never rebased through later edits, so a step
 * that passes still finds each target at the address it wrote, and one that fails is refused before anything is
 * applied to any document, naming the edit in the way; the person can undo that edit first, or forget the step
 * and go on past it. In the other histories a transaction belongs to, it may be undone out of order; each of those
 * histories then lists it as its next redo, keeps its own newer steps undoable in their order, and drops it from
 * its redo list the moment it records something new, while the step stays redoable from any history that has
 * not.
 *
 * The redo rule is the same rule forwards: a history's next redo goes back on top of whatever its documents hold
 * now, unless an edit made since its undo, or undone since, on any document it changes, changed the same data,
 * moved where it sits, or would be moved by its return. An undo and redo of the same edit in between cancel out.
 * A step that fails is refused before anything is applied, naming the edit in the way, and a redone step becomes
 * the newest done step in every history it belongs to.
 *
 * Saving writes a document's committed content and records which steps the file now reflects; it never touches
 * history, so undo after a save works, and undoing back to the saved state makes the document clean again.
 *
 * A file changed outside the editor never clears history either. On a document with no unsaved edits, the file's
 * version arrives as one more step, named {@link OUTSIDE_CHANGE_LABEL}, which the file already reflects: undoing it
 * brings back the version the editor had, as an unsaved edit, and redoing it takes the file's version again. A
 * document with unsaved edits is only flagged, never merged into.
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

  /**
   * Every step whose patches each held document holds, in the order they went in. The steps themselves are kept,
   * not just their ids, because a step no history can move any more (forgotten, or kept only by a history that
   * was let go) still has its patches in the document, and an undo of an older step must be checked against them.
   */
  #applied = new Map<DocumentKey, HistoryStep[]>();

  /**
   * For each held document, every step whose patches went in or came out of it, oldest first, reaching back only as
   * far as the oldest undo some held history can still redo. A redo is checked against what moved after its own
   * undo; steps are kept whole for the same reason as in {@link #applied}, since one may have left every history
   * by now.
   */
  #moves = new Map<DocumentKey, HistoryStep[]>();

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
    this.#moves.set(key, []);
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
    // reading the content first refuses a document this window does not hold, naming it, and every held document
    // keeps both lists.
    const content = this.#committedContent(key);
    const applied = this.#applied.get(key) as HistoryStep[];
    const moves = this.#moves.get(key) as HistoryStep[];

    const histories = [ ...this.#histories.values() ]
      .filter(history => homeDocumentOf(history.key) === key)
      .map(history => ({ key: history.key, done: [ ...history.done ], undone: [ ...history.undone ] }));
    const listed = new Set(histories.flatMap(({ done, undone }) => [ ...done, ...undone ]).map(step => step.id));
    const unlisted = [ ...applied, ...moves ].filter(step => listed.has(step.id) === false);

    return {
      document: key,
      content,
      lineage: [ ...this.lineage(key) ],
      applied: applied.map(step => step.id),
      moves: moves.map(step => step.id),
      saved: [ ...this.#saved.get(key) ?? [] ],
      histories,
      unlisted: [ ...new Map(unlisted.map(step => [ step.id, step ])).values() ],
    };
  }

  /**
   * Takes on another window's copy of a document, with its lineage and histories, replacing any copy held here.
   * A copy that names a step, as applied or among its moves, without carrying it is refused whole, before anything
   * changes, since undo or redo could not be checked against that step. Conflicts are left for their owner to clear.
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
    }

    const findCarried = carriedStepFinder(snapshot);
    const inPlace = snapshot.applied.map(findCarried);
    const moves = snapshot.moves.map(findCarried);
    if (held !== undefined)
    {
      held.replace(snapshot.content);
    }
    else
    {
      this.#documents.set(key, createDocument(key, snapshot.content));
    }

    this.#lineage.set(key, [ ...snapshot.lineage ]);
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

    // steps no history here lists stay out of the registry, so nothing here can move them.
    const known = (step: HistoryStep): HistoryStep => this.#steps.get(step.id) ?? step;
    this.#applied.set(key, inPlace.map(known));
    this.#moves.set(key, moves.map(known));
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
    this.#moves.delete(key);
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
   * Reports whether an undo in a history can happen: it has a step to undo, this window holds every document that
   * step touches and each records the step as applied, and no edit applied after it changed the same data, moved
   * where it sits, or would be moved by taking it out. A refusal here names the edit in the way before anything is
   * tried; only a change that nothing recorded explains is found by trying.
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

    const held = this.#checkHeld(step);
    return held.ok
      ? this.#checkLaterEdits(step)
      : held;
  }

  /**
   * Reports whether a redo in a history can happen: it has a step to redo, this window holds every document that
   * step touches, and no edit made or undone since its undo changed the same data, moved where it sits, or would be
   * moved by its return. A refusal here names the edit in the way before anything is tried.
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

    const held = this.#checkHeld(step);
    return held.ok
      ? this.#checkMovesSinceUndo(step)
      : held;
  }

  /**
   * Undoes the newest step of a history, across every document it touched, however many unrelated steps came
   * after it elsewhere; a later edit in its way refuses it, as {@link canUndo} describes.
   * @param {HistoryKey} key The history.
   * @returns {HistoryCheck} The step undone, or why nothing was.
   */
  undo(key: HistoryKey): HistoryCheck
  {
    return this.#move(key, 'backward');
  }

  /**
   * Redoes the most recently undone step of a history, on top of whatever its documents hold now; an edit made or
   * undone since in its way refuses it, as {@link canRedo} describes.
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
      // every recorded edit was checked before trying, so whatever changed the target was never recorded.
      return { ok: false, reason: 'conflict', step, blockedBy: null, message: failed.message };
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
   * Checks an applied step against every edit applied after it, on each document it changed, forgotten edits
   * included, since their patches are still there. The step can be taken out only if none of them changed its data,
   * moved it, or would be moved by its going; otherwise the newest such edit on the first document that has one is
   * named. Order among these edits is the order their patches went into the document, whatever history holds them.
   * A document that does not record the step as applied is refused as untracked: its copy came from somewhere that
   * never had the step (a map closed and opened again from disk), so nothing there can be checked.
   * @param {HistoryStep} step The step, applied.
   * @returns {HistoryCheck} The step, or the edit in its way.
   */
  #checkLaterEdits(step: HistoryStep): HistoryCheck
  {
    for (const key of documentsOfStep(step))
    {
      // every document the step changed is held, as checked first, and every held document keeps this list.
      const applied = this.#applied.get(key) as HistoryStep[];
      const appliedAt = applied.findLastIndex(each => each.id === step.id);
      if (appliedAt < 0)
      {
        const message = `this window cannot tell what changed in ${key} after "${step.label}"`;
        return { ok: false, reason: 'untracked', step, blockedBy: null, message };
      }

      for (const edit of applied.slice(appliedAt + 1).reverse())
      {
        const interference = interferenceOn(key, step, edit);
        if (interference !== null)
        {
          const { reason, describe } = BLOCKED_UNDO[interference];
          return { ok: false, reason, step, blockedBy: edit, message: describe(step, edit) };
        }
      }
    }

    return { ok: true, step };
  }

  /**
   * Checks an undone step against every edit whose patches went in or came out of a document it changes since its
   * undo: edits made since, and edits undone since, forgotten ones included. A step whose patches went in and out
   * again in that time is back as it was and counts for nothing. The step can go back on top only if none of the
   * rest changed its data, moved it, or would be moved by its return; otherwise the newest such edit on the first
   * document that has one is named. A document whose record does not reach back to the undo is refused as untracked,
   * since nothing there can be checked.
   * @param {HistoryStep} step The step, undone.
   * @returns {HistoryCheck} The step, or the edit in its way.
   */
  #checkMovesSinceUndo(step: HistoryStep): HistoryCheck
  {
    for (const key of documentsOfStep(step))
    {
      // every document the step changes is held, as checked first, and every held document keeps both lists.
      const moves = this.#moves.get(key) as HistoryStep[];
      const applied = this.#applied.get(key) as HistoryStep[];
      const undoneAt = moves.findLastIndex(each => each.id === step.id);
      if (undoneAt < 0)
      {
        const message = `this window cannot tell what changed in ${key} since "${step.label}" was undone`;
        return { ok: false, reason: 'untracked', step, blockedBy: null, message };
      }

      for (const edit of stepsTurnedOverBy(moves.slice(undoneAt + 1)))
      {
        const interference = interferenceOn(key, edit, step);
        if (interference !== null)
        {
          const inPlace = applied.some(each => each.id === edit.id);
          const phrase = inPlace ? `"${edit.label}"` : `undoing "${edit.label}"`;
          const { reason, describe } = BLOCKED_REDO[interference];
          return { ok: false, reason, step, blockedBy: edit, message: describe(step, phrase) };
        }
      }
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
    return applied !== undefined && saved !== undefined && sameSequence(applied.map(step => step.id), saved) === false;
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
    const marker = (this.#applied.get(key) ?? []).map(step => step.id);

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
   * Reads a document's file as it stands on disk, whether or not this window holds the document.
   * @param {DocumentKey} key The document.
   * @returns {Promise<JsonValue>} The file's content.
   */
  async readFile(key: DocumentKey): Promise<JsonValue>
  {
    return this.#requireStore().load(key);
  }

  /**
   * Reads a document's file and takes it as a change made outside the editor, in this window alone (see
   * {@link applyOutsideContent}). Where several windows hold the document, one reads each change for all of them
   * instead, so they all take the very same version of the file.
   * @param {DocumentKey} key The document.
   * @returns {Promise<ExternalChangeResult>} What was done.
   */
  async handleExternalChange(key: DocumentKey): Promise<ExternalChangeResult>
  {
    if (this.has(key) === false)
    {
      return 'ignored';
    }

    const content = await this.readFile(key);
    return this.applyOutsideContent(key, content);
  }

  /**
   * Takes one version of a document's file that changed outside the editor (in MZ, a script, another editor), as it
   * was read, once, for every window holding the document.
   *
   * A file that holds nothing this window lacks needs nothing: what the window holds now, what it last saved or
   * loaded, or a state its latest edits passed through, which is what the echo of a save looks like when it comes back
   * without its window's name, perhaps ahead of the message saying which steps that save held. The document is then
   * saved exactly as far as that state, since the file holds that state's steps and no others: undoing back past it
   * reads as unsaved, and redoing up to it reads as saved. Any flag an earlier change to the file raised is cleared,
   * since the file no longer holds anything to choose between.
   *
   * A clean document takes the file's version as one step named {@link OUTSIDE_CHANGE_LABEL}, recorded in the
   * history of whatever the change touched and marked saved, since the file holds it: undoing the step brings back
   * the version the editor had, as an unsaved edit, and redoing it takes the file's version again. Every window
   * holding the document at the same state records the same step from the same version ({@link outsideStepId}), so
   * they all end on it; a later version is a later step on top.
   *
   * A document with unsaved edits keeps them and is flagged with the file's content beside it, so nothing is merged
   * into work the person has not saved, and nothing is thrown away without them choosing to. So is a removed file,
   * and a file whose whole value changed kind, which no patch can say.
   * @param {DocumentKey} key The document.
   * @param {JsonValue | null} content The file's content, or null when the file was removed.
   * @param {boolean} recheck True when the file was re-read because the change stream came back, not because it
   * changed: a document with unsaved edits differs from its file by definition then, and is left alone.
   * @returns {ExternalChangeResult} What was done.
   */
  applyOutsideContent(key: DocumentKey, content: JsonValue | null, recheck = false): ExternalChangeResult
  {
    if (this.has(key) === false || (recheck && this.isDirty(key)))
    {
      return 'ignored';
    }

    // the document's content is the only copy left of a removed file, so nothing is taken over it.
    if (content === null)
    {
      this.flagConflict(key, { kind: 'disk', content: null });
      return 'conflicted';
    }

    // a file holding nothing new needs nothing done but noting how far the document is saved, and a flag an earlier
    // change raised (the file removed, or a version since written over) no longer stands.
    const held = this.#stepsHeldByFile(key, content);
    if (held !== null)
    {
      this.#noteFileHolds(key, held);
      this.#clearDiskConflict(key);
      return 'unchanged';
    }

    // an edit in progress counts as unsaved work too.
    if (this.isDirty(key) || this.#transaction !== null)
    {
      this.flagConflict(key, { kind: 'disk', content });
      return 'conflicted';
    }

    // a file whose whole value changed kind cannot be said by any patch, so it is the person's to settle.
    if (this.#recordOutsideChange(key, content) === null)
    {
      this.flagConflict(key, { kind: 'disk', content });
      return 'conflicted';
    }

    return 'recorded';
  }

  /**
   * Works out which steps a document's file holds, when it holds nothing this window lacks: exactly its committed
   * content, or, while it has unsaved edits, a state it passed through since it was last saved or loaded (see
   * {@link #passedThrough}).
   * @param {DocumentKey} key The document.
   * @param {JsonValue} content The file's content.
   * @returns {string[] | null} The steps the file's state holds, oldest first, or null when the file holds something
   * this window lacks.
   */
  #stepsHeldByFile(key: DocumentKey, content: JsonValue): string[] | null
  {
    // every held document keeps its applied list.
    if (jsonEquals(this.#committedContent(key), content))
    {
      return (this.#applied.get(key) as HistoryStep[]).map(step => step.id);
    }

    // a clean document's committed content is the saved content, already compared.
    return this.isDirty(key)
      ? this.#passedThrough(key, content)
      : null;
  }

  /**
   * Finds which state a document with unsaved edits already passed through a file holds: the state after one of its
   * newest unsaved steps, or what it was last saved or loaded as. The steps applied since that save are taken back
   * out of a copy newest first, comparing as each goes, then every step the save held that was undone since is put
   * back in, in the order the save had them. The echo of a save made in another window can arrive before the message
   * saying which steps that save held, and then only the edits of that moment lie between, so only the newest
   * {@link RECENT_STATES_COMPARED} states are compared besides the saved one. Nothing live is touched.
   * @param {DocumentKey} key The document, which has unsaved edits.
   * @param {JsonValue} content The file's content.
   * @returns {string[] | null} The steps that state holds, oldest first; null when the file holds none of those
   * states, and when a step the save held is no longer known here, or a patch no longer fits the copy, since the saved
   * state cannot then be worked out.
   */
  #passedThrough(key: DocumentKey, content: JsonValue): string[] | null
  {
    // every held document keeps both lists.
    const applied = this.#applied.get(key) as HistoryStep[];
    const saved = this.#saved.get(key) as string[];
    let shared = 0;
    while (shared < applied.length && shared < saved.length && applied[shared].id === saved[shared])
    {
      shared += 1;
    }

    try
    {
      // take the unsaved steps back out, newest first, each one's patches in reverse, comparing the newest states and
      // the one the save and these steps share.
      const copy = createDocument(key, this.#committedContent(key));
      const unsaved = applied.slice(shared).reverse();
      for (const [ index, step ] of unsaved.entries())
      {
        patchesOn(step, key).reverse().forEach(patch => copy.apply(invertPatch(patch)));
        const compared = index < RECENT_STATES_COMPARED || index === unsaved.length - 1;
        if (compared && jsonEquals(copy.toJson(), content))
        {
          // the copy now holds every applied step older than the one just taken out, and nothing newer.
          return applied.slice(0, applied.length - 1 - index).map(each => each.id);
        }
      }

      // then put back the steps the save held that were undone since, when there are any and all are still known.
      const putBack = saved.slice(shared).map(id => this.#steps.get(id));
      if (putBack.length === 0 || putBack.some(step => step === undefined))
      {
        return null;
      }

      (putBack as HistoryStep[]).forEach(step =>
      {
        patchesOn(step, key).forEach(patch => copy.apply(patch));
      });

      // the copy now holds exactly the steps the save held.
      return jsonEquals(copy.toJson(), content)
        ? [ ...saved ]
        : null;
    }
    catch (error)
    {
      if ((error instanceof PatchConflictError) === false)
      {
        throw error;
      }

      return null;
    }
  }

  /**
   * Notes that a document's file holds exactly the given steps, when that differs from what it was known to hold. A
   * file found holding a state the document passed through is saved as far as that state and no further, so the
   * document reads as unsaved on either side of it and saved at it, however it moves through its history after.
   * @param {DocumentKey} key The document.
   * @param {readonly string[]} marker The steps the file holds, oldest first.
   */
  #noteFileHolds(key: DocumentKey, marker: readonly string[]): void
  {
    // every held document keeps its saved list; one already holding these steps needs no word to anyone.
    if (sameSequence(this.#saved.get(key) as string[], marker) === false)
    {
      this.#markSaved(key, marker, 'local');
    }
  }

  /**
   * Records a file's new content on a clean document as one step: the patches that turn what the document holds into
   * what the file holds, applied at once, in the history of whatever they touch, with the document left saved, since
   * the file holds exactly that now. A flag an earlier change raised, such as the file's removal, is settled by the
   * file arriving.
   * @param {DocumentKey} key The document, clean, with no edit open.
   * @param {JsonValue} content The file's new content, which differs from what the document holds.
   * @returns {HistoryStep | null} The step, or null when no patch can say the change, in which case nothing changed.
   */
  #recordOutsideChange(key: DocumentKey, content: JsonValue): HistoryStep | null
  {
    const patches = this.document(key).patchesTo(content);
    if (patches === null)
    {
      return null;
    }

    const step: HistoryStep = {
      id: outsideStepId(key, this.head(key) as string, content),
      label: OUTSIDE_CHANGE_LABEL,
      histories: outsideChangeHistories(key, patches),
      entries: patches.map(patch => ({ document: key, patch })),
      origin: this.clientId,
      at: this.#now(),
    };

    // the patches were worked out from this very content a moment ago, so one that does not fit is a fault here.
    const bases = this.#headsOf(step);
    const failed = this.#applyEntries(step, 'forward');
    if (failed !== null)
    {
      throw new Error(`the outside version of ${key} does not fit the copy it was worked out from: ${failed.message}`);
    }

    this.#record(step);
    this.#markApplied(step);
    this.#extendLineage(step, step.id);
    this.#emit({ type: 'committed', step, bases, opId: step.id, source: 'local' });
    this.#markSaved(key, (this.#applied.get(key) as HistoryStep[]).map(each => each.id), 'local');
    this.#clearDiskConflict(key);
    return step;
  }

  /**
   * Clears a document's conflict with its file, leaving a conflict with another window's copy for its owner.
   * @param {DocumentKey} key The document.
   */
  #clearDiskConflict(key: DocumentKey): void
  {
    if (this.#conflicts.get(key)?.kind === 'disk')
    {
      this.clearConflict(key);
    }
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
    this.#moves.set(key, []);
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
        this.#applyRemoteSave(operation.document, operation.marker, operation.origin);
        break;
    }
  }

  /**
   * Takes another window's save of a document held here: the steps its file now holds. A save naming a step this
   * window has never seen means the two copies went different ways, which is announced as {@code out-of-sync} and
   * changes nothing; taking it would mark this copy saved against a file that holds something it does not.
   * @param {DocumentKey} key The document.
   * @param {readonly string[]} marker The steps the file holds, as the saving window had them.
   * @param {string} origin The window that saved.
   */
  #applyRemoteSave(key: DocumentKey, marker: readonly string[], origin: string): void
  {
    if (this.has(key) === false)
    {
      return;
    }

    // a step can be known while undone (in the registry) or while no history lists it any more (still applied).
    const applied = this.#applied.get(key) as HistoryStep[];
    const known = marker.every(id => this.#steps.has(id) || applied.some(step => step.id === id));
    if (known === false)
    {
      this.#reportOutOfSync([ key ], origin);
      return;
    }

    this.#markSaved(key, marker, 'remote');
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
      return documents.some(key => (this.#applied.get(key) ?? []).some(each => each.id === step.id));
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
      this.#applied.get(key)?.push(step);
      this.#logMove(key, step);
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
      const index = applied.findLastIndex(each => each.id === step.id);
      if (index >= 0)
      {
        applied.splice(index, 1);
      }

      this.#logMove(key, step);
    });
  }

  /**
   * Logs that a step's patches went into or came out of a held document, once its histories already say which, and
   * lets go of every earlier move no redo can need: whatever came before the oldest undo that some held history can
   * still redo. With nothing left to redo, the record is empty.
   * @param {DocumentKey} key The document.
   * @param {HistoryStep} step The step that moved.
   */
  #logMove(key: DocumentKey, step: HistoryStep): void
  {
    const moves = [ ...(this.#moves.get(key) as HistoryStep[]), step ];
    const undoneAt = [ ...this.#histories.values() ]
      .flatMap(history => history.undone)
      .filter(each => each.entries.some(entry => entry.document === key))
      .map(each => moves.findLastIndex(move => move.id === each.id));

    // with nothing left to redo, the oldest place needed is Infinity and the record empties. A redoable step whose
    // undo is not recorded here will be refused as untracked; trimming by its missing place could drop moves another
    // step needs, so it keeps the whole record instead.
    this.#moves.set(key, moves.slice(Math.max(0, Math.min(...undoneAt))));
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
