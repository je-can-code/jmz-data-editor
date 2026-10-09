import type { DocumentKey } from '../model/documentKeys.ts';
import type { EditorDocument } from '../model/EditorDocument.ts';
import { cloneJson, type JsonValue } from '../model/json.ts';
import { MapDocument } from '../model/MapDocument.ts';
import { invertPatch, isNoopPatch, type MapTiles, type Patch, type PatchPath } from '../model/patches.ts';
import type { DocumentSnapshot } from './DocumentHub.ts';
import { homeDocumentOf, type HistoryKey } from './historyKeys.ts';
import type { FileEffect, FileVersion, HistoryStep, StepEntry } from './HistoryStep.ts';

/**
 * What a transaction needs from the hub that opened it.
 */
type TransactionHost = {
  /**
   * Reports whether the window holds a document.
   * @param {DocumentKey} key The document.
   * @returns {boolean} True when it is held.
   */
  has(key: DocumentKey): boolean;

  /**
   * Finds a held document.
   * @param {DocumentKey} key The document.
   * @returns {EditorDocument} The document; throws when it is not held.
   */
  document(key: DocumentKey): EditorDocument;

  /**
   * Looks a finished edit over just before it becomes a step, while it is still open: says why it must not become one,
   * in words for the author, or null to let it through.
   * @param {Transaction} transaction The transaction, its patches applied.
   * @returns {string | null} Why it is refused, or null.
   */
  review(transaction: Transaction): string | null;

  /**
   * Records the finished transaction as one step.
   * @param {Transaction} transaction The transaction.
   * @param {readonly StepEntry[]} entries Its patches, already applied.
   * @returns {HistoryStep | null} The step, or null when nothing changed.
   */
  finish(transaction: Transaction, entries: readonly StepEntry[]): HistoryStep | null;

  /**
   * Forgets a cancelled transaction.
   * @param {Transaction} transaction The transaction.
   */
  abandon(transaction: Transaction): void;

  /**
   * Forgets a transaction its review refused, once every patch it applied has been put back, and says why.
   * @param {Transaction} transaction The transaction.
   * @param {string} message Why it was refused, in words for the author.
   */
  refuse(transaction: Transaction, message: string): void;
};

/**
 * An edit in progress: patches applied live as they are added, so a brush stroke or a dragged slider shows at
 * once, and recorded as one named step when committed. Cancelling puts everything back, and so does a commit the
 * window's checks refuse (see DocumentHub's addCommitCheck), which then records nothing.
 *
 * Patches may land on several documents; the step then belongs to every history the transaction names, and
 * undoes as one step from any of them. A check looking the edit over may name more histories ({@link join}), as a
 * blueprint's change does for every map its copies stand on, and may add patches to documents no window holds, which
 * reach their files alone ({@link writeThrough}).
 */
class Transaction
{
  readonly label: string;

  #histories: HistoryKey[];

  #host: TransactionHost;

  #entries: StepEntry[] = [];

  #files: FileEffect[] = [];

  /**
   * What each file differing from its document takes, by document (see {@link fileVersion}).
   */
  #fileVersions = new Map<DocumentKey, Patch[]>();

  /**
   * The documents written through so far: changed on disk alone, since the window does not hold them.
   */
  #through = new Set<DocumentKey>();

  /**
   * The documents marked as following the step's own change (see {@link markFollower}).
   */
  #followers = new Set<DocumentKey>();

  #open = true;

  /**
   * @param {TransactionHost} host The hub that opened it.
   * @param {string} label What the history panel will call the step.
   * @param {readonly HistoryKey[]} histories Every history the step belongs to.
   */
  constructor(host: TransactionHost, label: string, histories: readonly HistoryKey[])
  {
    this.#host = host;
    this.label = label;
    this.#histories = [ ...histories ];
  }

  /**
   * Every history the step will belong to: those the edit named when it began, then those joined since, each once.
   * @returns {readonly HistoryKey[]} The histories.
   */
  get histories(): readonly HistoryKey[]
  {
    return this.#histories;
  }

  /**
   * Whether patches can still be added.
   * @returns {boolean} False once committed or cancelled.
   */
  get isOpen(): boolean
  {
    return this.#open;
  }

  /**
   * The patches applied or written through so far, in order.
   * @returns {readonly StepEntry[]} The entries.
   */
  get entries(): readonly StepEntry[]
  {
    return this.#entries;
  }

  /**
   * The whole files recorded so far, in order.
   * @returns {readonly FileEffect[]} The file effects.
   */
  get files(): readonly FileEffect[]
  {
    return this.#files;
  }

  /**
   * The documents written through so far, in the order each was first written (see {@link writeThrough}).
   * @returns {readonly DocumentKey[]} The documents.
   */
  get through(): readonly DocumentKey[]
  {
    return [ ...this.#through ];
  }

  /**
   * What the files that differ from their documents take for this step, by document, in the order each was first given
   * (see {@link fileVersion}).
   * @returns {readonly FileVersion[]} The versions.
   */
  get fileVersions(): readonly FileVersion[]
  {
    return [ ...this.#fileVersions ].map(([ document, patches ]) => ({ document, patches: [ ...patches ] }));
  }

  /**
   * The documents marked as following the step's own change, in the order each was first marked (see
   * {@link markFollower}).
   * @returns {readonly DocumentKey[]} The documents.
   */
  get followers(): readonly DocumentKey[]
  {
    return [ ...this.#followers ];
  }

  /**
   * Marks a document as following the step's own change rather than changed for its own sake, as a map does whose copies a
   * blueprint's change reached (see HistoryStep's followers): an undo or a redo of the step later moves each of its
   * patches there only where nothing changed the same data since, and leaves the rest as they stand. A document marked
   * already is not marked twice.
   * @param {DocumentKey} document The document, held here or written through.
   * @returns {Transaction} This transaction, for chaining.
   */
  markFollower(document: DocumentKey): this
  {
    this.#requireOpen();
    this.#followers.add(document);
    return this;
  }

  /**
   * Names more histories the step belongs to, as a check looking the edit over does when the edit reaches things beyond
   * those it began with. Each history lives on a document the window holds, or on one this edit writes through; a
   * history named already is not named twice.
   * @param {readonly HistoryKey[]} histories The histories.
   * @returns {Transaction} This transaction, for chaining.
   * @throws {Error} When a history lives on a document neither held nor written through.
   */
  join(histories: readonly HistoryKey[]): this
  {
    this.#requireOpen();
    histories.forEach(key =>
    {
      const home = homeDocumentOf(key);
      if (this.#host.has(home) === false && this.#through.has(home) === false)
      {
        throw new Error(`open ${home} before recording history on it`);
      }

      if (this.#histories.includes(key) === false)
      {
        this.#histories.push(key);
      }
    });

    return this;
  }

  /**
   * Keeps a ready-made patch for a document the window does not hold, changing nothing here: the step carries it to
   * the document's file, which whoever writes the step changes, and to any window holding the document, which applies
   * it there. What a blueprint's change does to a copy on a map nobody has open. A patch that changes nothing is skipped.
   * @param {DocumentKey} document The document, which the window must not hold.
   * @param {Patch} patch The patch, made against the document's file as it stands.
   * @returns {Transaction} This transaction, for chaining.
   * @throws {Error} When the window holds the document, whose patches are applied here instead.
   */
  writeThrough(document: DocumentKey, patch: Patch): this
  {
    this.#requireOpen();
    if (this.#host.has(document))
    {
      throw new Error(`${document} is held here, so it changes in place`);
    }

    if (isNoopPatch(patch) === false)
    {
      this.#entries.push({ document, patch });
      this.#through.add(document);
    }

    return this;
  }

  /**
   * Records what a document's file takes for this step where the file differs from the document, as a map's does while
   * it holds unsaved edits: the document takes the step's own patches, on top of those edits, and its file takes these
   * instead, made against what the file holds, so writing the step never saves the edits; none at all, when nothing the
   * step changes is in the file yet. Patches given for the same document again follow those given before. Nothing
   * changes here, and a patch that changes nothing is left out.
   * @param {DocumentKey} document The document, which the window holds.
   * @param {readonly Patch[]} patches The patches, made against the document's file, in order; none when it takes none.
   * @returns {Transaction} This transaction, for chaining.
   * @throws {Error} When the window does not hold the document, whose file takes what is written through instead.
   */
  fileVersion(document: DocumentKey, patches: readonly Patch[]): this
  {
    this.#requireOpen();
    if (this.#host.has(document) === false)
    {
      throw new Error(`${document} is not held here, so its file takes what is written through`);
    }

    const kept = this.#fileVersions.get(document) ?? [];
    this.#fileVersions.set(document, [ ...kept, ...patches.filter(patch => isNoopPatch(patch) === false) ]);
    return this;
  }

  /**
   * Applies a ready-made patch now and keeps it for the step. A patch that changes nothing is skipped.
   * @param {DocumentKey} document The document it changes.
   * @param {Patch} patch The patch; the document checks it still holds what the patch replaces.
   * @returns {Transaction} This transaction, for chaining.
   */
  apply(document: DocumentKey, patch: Patch): this
  {
    this.#requireOpen();
    if (isNoopPatch(patch))
    {
      return this;
    }

    this.#host.document(document).apply(patch);
    this.#entries.push({ document, patch });
    return this;
  }

  /**
   * Sets a value at a path, capturing what it replaces.
   * @param {DocumentKey} document The document.
   * @param {PatchPath} path Where to write.
   * @param {JsonValue | undefined} value The new value, or undefined to remove the key.
   * @returns {Transaction} This transaction, for chaining.
   */
  set(document: DocumentKey, path: PatchPath, value: JsonValue | undefined): this
  {
    const before = this.#host.document(document).valueAt(path);
    return this.apply(document, { kind: 'set', path: [ ...path ], before: cloneJson(before), after: cloneJson(value) });
  }

  /**
   * Splices an array at a path, capturing what it removes.
   * @param {DocumentKey} document The document.
   * @param {PatchPath} path The array.
   * @param {number} index Where to start.
   * @param {number} deleteCount How many items to remove.
   * @param {readonly JsonValue[]} inserted What to insert in their place.
   * @returns {Transaction} This transaction, for chaining.
   */
  splice(document: DocumentKey, path: PatchPath, index: number, deleteCount: number, inserted: readonly JsonValue[]): this
  {
    const array = this.#host.document(document).valueAt(path);
    const removed = Array.isArray(array)
      ? array.slice(index, index + deleteCount)
      : [];

    return this.apply(document, {
      kind: 'splice',
      path: [ ...path ],
      index,
      removed: cloneJson(removed),
      inserted: cloneJson([ ...inserted ]),
    });
  }

  /**
   * Changes map cells, capturing what each held. Cells that would not change are left out.
   * @param {DocumentKey} document A map document.
   * @param {Iterable<readonly [ number, number ]>} cells Pairs of flat cell index and new value.
   * @returns {Transaction} This transaction, for chaining.
   */
  tiles(document: DocumentKey, cells: Iterable<readonly [ number, number ]>): this
  {
    return this.apply(document, this.#mapDocument(document).tilesPatch(cells));
  }

  /**
   * Gives a map a new size and tile array.
   * @param {DocumentKey} document A map document.
   * @param {MapTiles} next The new size and its full tile data.
   * @returns {Transaction} This transaction, for chaining.
   */
  resize(document: DocumentKey, next: MapTiles): this
  {
    return this.apply(document, this.#mapDocument(document).resizePatch(next));
  }

  /**
   * Records a whole file the step creates or removes. Nothing is written here: the file travels with the step,
   * and whoever moves the step performs it (see {@link FileEffect}). A step still needs at least one patch.
   * @param {DocumentKey} document The document the file backs, such as a map's.
   * @param {JsonValue | null} before The file's content before the step, or null when there was no file.
   * @param {JsonValue | null} after The file's content after the step, or null when the step removes it.
   * @param {object} sides The file's exact text on either side, where it was read; the copy the window held before the
   * step, where it held one; and a map's placements of blueprints on either side, as the record on disk holds them, where
   * they are known.
   * @returns {Transaction} This transaction, for chaining.
   */
  file(
    document: DocumentKey,
    before: JsonValue | null,
    after: JsonValue | null,
    sides: {
      before?: string;
      after?: string;
      beforeHeld?: DocumentSnapshot;
      beforePlacements?: JsonValue;
      afterPlacements?: JsonValue;
    } = {},
  ): this
  {
    this.#requireOpen();
    this.#files.push({
      document,
      before: cloneJson(before),
      after: cloneJson(after),
      ...(sides.before === undefined ? {} : { beforeText: sides.before }),
      ...(sides.after === undefined ? {} : { afterText: sides.after }),
      ...(sides.beforeHeld === undefined ? {} : { beforeHeld: cloneJson(sides.beforeHeld) }),
      ...(sides.beforePlacements === undefined ? {} : { beforePlacements: cloneJson(sides.beforePlacements) }),
      ...(sides.afterPlacements === undefined ? {} : { afterPlacements: cloneJson(sides.afterPlacements) }),
    });
    return this;
  }

  /**
   * Finishes the edit as one step in every history it names, once the window's checks have looked it over while it
   * is still open. An edit they refuse is put back whole and recorded nowhere, and the hub says why; one whose check
   * fails outright is put back too, and the failure goes on up.
   * @returns {HistoryStep | null} The step, or null when nothing changed or the edit was refused.
   */
  commit(): HistoryStep | null
  {
    this.#requireOpen();
    let refusal: string | null = null;
    try
    {
      refusal = this.#host.review(this);
    }
    catch (error)
    {
      this.cancel();
      throw error;
    }

    this.#open = false;
    if (refusal !== null)
    {
      this.#reverse();
      this.#host.refuse(this, refusal);
      return null;
    }

    return this.#host.finish(this, this.#entries);
  }

  /**
   * Abandons the edit, reversing every patch applied so far.
   */
  cancel(): void
  {
    this.#requireOpen();
    this.#open = false;
    this.#reverse();
    this.#host.abandon(this);
  }

  /**
   * Puts back every patch applied so far; a patch written through was never applied here, and has nothing to put back.
   */
  #reverse(): void
  {
    // reverse newest first, so each inverse finds exactly what its patch left.
    [ ...this.#entries ].reverse().forEach(entry =>
    {
      if (this.#through.has(entry.document) === false)
      {
        this.#host.document(entry.document).apply(invertPatch(entry.patch));
      }
    });
  }

  /**
   * Finds a held map document for a tile edit.
   * @param {DocumentKey} key The document.
   * @returns {MapDocument} The map.
   */
  #mapDocument(key: DocumentKey): MapDocument
  {
    const document = this.#host.document(key);
    if ((document instanceof MapDocument) === false)
    {
      throw new Error(`${key} has no tiles`);
    }

    return document;
  }

  /**
   * Refuses any change once the transaction is finished.
   */
  #requireOpen(): void
  {
    if (this.#open === false)
    {
      throw new Error(`"${this.label}" is already finished`);
    }
  }
}

export { Transaction };
export type { TransactionHost };
