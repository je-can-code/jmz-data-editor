import type { DocumentKey } from '../model/documentKeys.ts';
import type { EditorDocument } from '../model/EditorDocument.ts';
import { cloneJson, type JsonValue } from '../model/json.ts';
import { MapDocument } from '../model/MapDocument.ts';
import { invertPatch, isNoopPatch, type MapTiles, type Patch, type PatchPath } from '../model/patches.ts';
import type { DocumentSnapshot } from './DocumentHub.ts';
import type { HistoryKey } from './historyKeys.ts';
import type { FileEffect, HistoryStep, StepEntry } from './HistoryStep.ts';

/**
 * What a transaction needs from the hub that opened it.
 */
type TransactionHost = {
  /**
   * Finds a held document.
   * @param {DocumentKey} key The document.
   * @returns {EditorDocument} The document; throws when it is not held.
   */
  document(key: DocumentKey): EditorDocument;

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
};

/**
 * An edit in progress: patches applied live as they are added, so a brush stroke or a dragged slider shows at
 * once, and recorded as one named step when committed. Cancelling puts everything back.
 *
 * Patches may land on several documents; the step then belongs to every history the transaction names, and
 * undoes as one step from any of them.
 */
class Transaction
{
  readonly label: string;

  readonly histories: readonly HistoryKey[];

  #host: TransactionHost;

  #entries: StepEntry[] = [];

  #files: FileEffect[] = [];

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
    this.histories = [ ...histories ];
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
   * The patches applied so far, in order.
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
   * @param {{ before?: string, after?: string, beforeHeld?: DocumentSnapshot }} sides The file's exact text on either
   * side, where it was read, and the copy the window held before the step, where it held one.
   * @returns {Transaction} This transaction, for chaining.
   */
  file(
    document: DocumentKey,
    before: JsonValue | null,
    after: JsonValue | null,
    sides: { before?: string; after?: string; beforeHeld?: DocumentSnapshot } = {},
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
    });
    return this;
  }

  /**
   * Finishes the edit as one step in every history it names.
   * @returns {HistoryStep | null} The step, or null when nothing changed.
   */
  commit(): HistoryStep | null
  {
    this.#requireOpen();
    this.#open = false;
    return this.#host.finish(this, this.#entries);
  }

  /**
   * Abandons the edit, reversing every patch applied so far.
   */
  cancel(): void
  {
    this.#requireOpen();
    this.#open = false;

    // reverse newest first, so each inverse finds exactly what its patch left.
    [ ...this.#entries ].reverse().forEach(entry =>
    {
      this.#host.document(entry.document).apply(invertPatch(entry.patch));
    });

    this.#host.abandon(this);
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
