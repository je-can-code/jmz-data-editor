import type { DocumentHub, ExternalChangeResult } from '../history/DocumentHub.ts';
import { createDocument } from '../model/createDocument.ts';
import { documentKeyForProjectPath, type DocumentKey } from '../model/documentKeys.ts';
import type { JsonValue } from '../model/json.ts';
import type { FileChange } from './FileChangeFeed.ts';

/**
 * What became of one file change in this window.
 *
 * - {@code follower}: another window reads the change stream for everyone, and hands this one what it reads.
 * - {@code echo}: a save by this window or another window of the session; sync already carried its content.
 * - {@code untracked}: the file backs no document any window holds.
 * - {@code unholdable}: the file holds nothing its document could be, such as a map with the wrong number of cells, so
 *   it was handed to nobody; its next change is read afresh.
 * - anything else: this window's own answer to the version it read, see {@link ExternalChangeResult}.
 */
type FileChangeOutcome = 'follower' | 'echo' | 'untracked' | 'unholdable' | ExternalChangeResult;

/**
 * What routing needs to know about the other windows, and how it reaches them.
 */
type RoutingPeers = {
  /**
   * Reports whether a client id belongs to this editor session.
   * @param {string} clientId The id from a change event.
   * @returns {boolean} True for a session window.
   */
  knowsClient(clientId: string): boolean;

  /**
   * Lists the live windows holding a document.
   * @param {DocumentKey} key The document.
   * @returns {string[]} Their client ids.
   */
  holders(key: DocumentKey): string[];

  /**
   * Lists every document some other live window holds.
   * @returns {DocumentKey[]} The documents.
   */
  documentsHeldElsewhere(): DocumentKey[];

  /**
   * Hands every other window the version of a file this window read.
   * @param {DocumentKey} key The document.
   * @param {JsonValue | null} content The file's content, or null when the file was removed.
   * @param {boolean} recheck True when the file was re-read because the stream came back, not because it changed.
   */
  postOutside(key: DocumentKey, content: JsonValue | null, recheck: boolean): void;
};

/**
 * Reports whether a file's content is something its document could be at all: a map a whole number of tiles in size
 * with a tile id in every cell, say. A document is built from it and thrown away, which is exactly the check every
 * window would otherwise make on taking it, each failing on its own.
 * @param {DocumentKey} key The document.
 * @param {JsonValue} content The file's content.
 * @returns {boolean} True when a document can be built from it.
 */
const isHoldable = (key: DocumentKey, content: JsonValue): boolean =>
{
  try
  {
    createDocument(key, content);
    return true;
  }
  catch
  {
    return false;
  }
};

/**
 * Decides what the server's change stream means for the documents every window holds, and reads each changed file
 * once for all of them.
 *
 * Every window hears every change, but only the window reading the stream acts on one; the others wait for what it
 * hands them. That window skips a save made by any window of the session (it comes back carrying that window's id,
 * and the windows share the document it wrote) and a file no window holds, and otherwise reads the file, once, and
 * hands that very version to every window holding the document, itself included. So every window takes the same
 * version as the same "Externally modified" step, however soon a second write follows the first, and never a version
 * of its own. Reads happen one after another, in the order the changes came, so a slow read can never land after a
 * newer one and take the document back to an older version. A removed file is handed over as removed, and flagged
 * wherever it is held, since the document's content is the only copy left; a file holding nothing its document could
 * be is handed to nobody.
 *
 * When the stream comes back after dropping, the same window re-reads every document held anywhere, since whatever
 * changed meanwhile was never announced; only a document without unsaved edits takes what it finds, the others
 * differing from their files by definition, and so does one whose file was removed, which may have come back meanwhile.
 */
class FileChangeRouter
{
  #hub: DocumentHub;

  #peers: RoutingPeers;

  #leads: () => boolean;

  #queue: Promise<unknown> = Promise.resolve();

  /**
   * @param {DocumentHub} hub This window's documents, which also reads files.
   * @param {RoutingPeers} peers The other windows.
   * @param {() => boolean} leads Reports whether this window reads the change stream for everyone.
   */
  constructor(hub: DocumentHub, peers: RoutingPeers, leads: () => boolean)
  {
    this.#hub = hub;
    this.#peers = peers;
    this.#leads = leads;
  }

  /**
   * Acts on one change on the stream.
   * @param {FileChange} change The change.
   * @returns {Promise<FileChangeOutcome>} What became of it here.
   */
  route(change: FileChange): Promise<FileChangeOutcome>
  {
    if (this.#leads() === false)
    {
      return Promise.resolve('follower');
    }

    if (change.client !== '' && this.#peers.knowsClient(change.client))
    {
      return Promise.resolve('echo');
    }

    const key = documentKeyForProjectPath(change.path);
    if (key === null || (this.#hub.has(key) === false && this.#peers.holders(key).length === 0))
    {
      return Promise.resolve('untracked');
    }

    // a removed file has nothing to read.
    return this.#inTurn(async (): Promise<FileChangeOutcome> =>
    {
      const content = change.kind === 'remove'
        ? null
        : await this.#hub.readFile(key);
      if (content !== null && isHoldable(key, content) === false)
      {
        return 'unholdable';
      }

      return this.#handOver(key, content, false);
    });
  }

  /**
   * Re-reads every document held anywhere after the stream came back, since changes made while it was down were
   * never announced. A document this window holds with unsaved edits is not read at all, since every window holding
   * it holds the same edits, unless its file was removed, which may have come back meanwhile; one it cannot read now,
   * or whose file holds nothing it could be, is left for its next change.
   * @returns {Promise<ExternalChangeResult[]>} What this window did with each document read, in order.
   */
  recheck(): Promise<ExternalChangeResult[]>
  {
    if (this.#leads() === false)
    {
      return Promise.resolve([]);
    }

    const held = this.#hub.documentKeys().filter(key => this.#hub.isDirty(key) === false || this.#hub.isFileRemoved(key));
    const elsewhere = this.#peers.documentsHeldElsewhere().filter(key => this.#hub.has(key) === false);
    return this.#inTurn(async () =>
    {
      const results: ExternalChangeResult[] = [];
      for (const key of [ ...held, ...elsewhere ])
      {
        const content = await this.#hub.readFile(key).catch(() => undefined);
        if (content !== undefined && isHoldable(key, content))
        {
          results.push(this.#handOver(key, content, true));
        }
      }

      return results;
    });
  }

  /**
   * Hands one version of a file to every other window, then takes it here.
   * @param {DocumentKey} key The document.
   * @param {JsonValue | null} content The file's content, or null when it was removed.
   * @param {boolean} recheck True when re-read after the stream came back.
   * @returns {ExternalChangeResult} What this window did with it.
   */
  #handOver(key: DocumentKey, content: JsonValue | null, recheck: boolean): ExternalChangeResult
  {
    this.#peers.postOutside(key, content, recheck);
    return this.#hub.applyOutsideContent(key, content, recheck);
  }

  /**
   * Runs a read after every read before it has been handed over, so versions are handed over in the order they were
   * read. A read that fails holds up nothing after it.
   * @param {() => Promise<T>} task The read and its handing over.
   * @returns {Promise<T>} What the task came to.
   */
  #inTurn<T>(task: () => Promise<T>): Promise<T>
  {
    const next = this.#queue.then(task);
    this.#queue = next.catch(() => undefined);
    return next;
  }
}

export { FileChangeRouter };
export type { FileChangeOutcome, RoutingPeers };
