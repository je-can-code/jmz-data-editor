import type { DocumentKey } from './documentKeys.ts';
import type { JsonValue } from './json.ts';
import type { Patch, PatchPath } from './patches.ts';

/**
 * What changed in a document: one patch applied, or the whole content swapped (a reload from disk, or a copy
 * adopted from another window).
 */
type DocumentChange =
  | { readonly kind: 'patched'; readonly key: DocumentKey; readonly patch: Patch; readonly revision: number }
  | { readonly kind: 'replaced'; readonly key: DocumentKey; readonly revision: number };

/**
 * Hears every change to one document. Renderers redraw from it; React reads {@link EditorDocument.revision}.
 */
type DocumentListener = (change: DocumentChange) => void;

/**
 * A live, editable unit of project data: a map, the map tree, the tilesets, or an editor-only document.
 *
 * A document changes only through {@link apply} and {@link replace}, and both notify its listeners, so
 * anything drawing it never misses an edit. Neither records history: the document hub does that, and a
 * patch applied here directly is invisible to undo.
 */
interface EditorDocument
{
  /**
   * Which document this is.
   */
  readonly key: DocumentKey;

  /**
   * Counts every change since the document was built; it only ever grows.
   */
  readonly revision: number;

  /**
   * Applies one patch after checking the document still holds what the patch replaces.
   * @param {Patch} patch The change.
   * @throws {PatchConflictError} When the document holds something else, or the patch does not fit this kind.
   */
  apply(patch: Patch): void;

  /**
   * Swaps in whole new content, as the file holds it.
   * @param {JsonValue} content The new content, in its file shape.
   */
  replace(content: JsonValue): void;

  /**
   * Reads the value at a path, as a patch would address it.
   * @param {PatchPath} path Where to read.
   * @returns {JsonValue | undefined} The value, or undefined when absent.
   */
  valueAt(path: PatchPath): JsonValue | undefined;

  /**
   * Produces the content in its exact file shape, ready to save.
   * @returns {JsonValue} An independent copy.
   */
  toJson(): JsonValue;

  /**
   * Produces the content as it would be with some recently applied patches taken back out, without touching the
   * live document: what a save or another window must see while an edit is still open, since an open edit may
   * yet be cancelled.
   * @param {readonly Patch[]} patches Patches applied to this document, oldest first.
   * @returns {JsonValue} An independent copy, in file shape.
   */
  toJsonWithout(patches: readonly Patch[]): JsonValue;

  /**
   * Reports whether the document holds exactly some content, as its file would hold it, without copying anything: what
   * deciding whether a document is saved compares, after every step, against what its file holds.
   * @param {JsonValue} content The content, in its file shape.
   * @returns {boolean} True when the two hold the same data.
   */
  matches(content: JsonValue): boolean;

  /**
   * Works out the patches that turn this document's content into other content for the same file, as one edit
   * would have made them: applied in order they reach exactly that content, and reversed newest first they come back
   * to this one. Only what differs is addressed, so an edit elsewhere in the document can still be undone around
   * them. Nothing is applied here.
   * @param {JsonValue} content The other content, in its file shape.
   * @returns {Patch[] | null} The patches, empty when the two are the same, or null when no patch can say the
   * difference, as when the file's whole value changed kind.
   * @throws {Error} When the content is not a file this kind of document can hold.
   */
  patchesTo(content: JsonValue): Patch[] | null;

  /**
   * Listens for changes.
   * @param {DocumentListener} listener Called after every change.
   * @returns {() => void} Stops listening.
   */
  subscribe(listener: DocumentListener): () => void;
}

/**
 * The listener bookkeeping every document shares.
 */
class DocumentListeners
{
  #listeners = new Set<DocumentListener>();

  /**
   * Adds a listener.
   * @param {DocumentListener} listener The listener.
   * @returns {() => void} Removes it again.
   */
  add(listener: DocumentListener): () => void
  {
    this.#listeners.add(listener);
    return () =>
    {
      this.#listeners.delete(listener);
    };
  }

  /**
   * Tells every listener about a change.
   * @param {DocumentChange} change What changed.
   */
  notify(change: DocumentChange): void
  {
    // copy first, so a listener that unsubscribes mid-notify cannot skip its neighbour.
    [ ...this.#listeners ].forEach(listener => listener(change));
  }
}

export { DocumentListeners };
export type { DocumentChange, DocumentListener, EditorDocument };
