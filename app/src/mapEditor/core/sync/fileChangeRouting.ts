import type { DocumentHub, ExternalChangeResult } from '../history/DocumentHub.ts';
import { documentKeyForProjectPath } from '../model/documentKeys.ts';
import type { FileChange } from './FileChangeFeed.ts';

/**
 * What became of one file change in this window.
 *
 * - {@code echo}: a save by this window or another window of the session; sync already carried its content.
 * - {@code untracked}: the file backs no document this window holds.
 * - anything else: the hub's own answer, see {@link ExternalChangeResult}.
 */
type FileChangeOutcome = 'echo' | 'untracked' | ExternalChangeResult;

/**
 * What routing needs to know about the other windows.
 */
type SessionClients = {
  /**
   * Reports whether a client id belongs to this editor session.
   * @param {string} clientId The id from a change event.
   * @returns {boolean} True for a session window.
   */
  knowsClient(clientId: string): boolean;
};

/**
 * Decides what one change on the server's stream means for this window. A save made by any window of this
 * session comes back carrying that window's id and is ignored, since the windows share the document it wrote.
 * A change from anywhere else (MZ, a script, another copy of the editor) goes to the hub, which reloads a clean
 * document and flags one holding unsaved edits. A removed file is always flagged: the document's content is the
 * only copy left, so nothing reloads over it.
 * @param {FileChange} change The change.
 * @param {DocumentHub} hub This window's documents.
 * @param {SessionClients} session Which client ids belong to the session.
 * @returns {Promise<FileChangeOutcome>} What was done.
 */
const routeFileChange = async (change: FileChange, hub: DocumentHub, session: SessionClients): Promise<FileChangeOutcome> =>
{
  if (change.client !== '' && session.knowsClient(change.client))
  {
    return 'echo';
  }

  const key = documentKeyForProjectPath(change.path);
  if (key === null || hub.has(key) === false)
  {
    return 'untracked';
  }

  if (change.kind === 'remove')
  {
    hub.flagConflict(key, { kind: 'disk', content: null });
    return 'conflicted';
  }

  return hub.handleExternalChange(key);
};

/**
 * Re-reads every clean document after the stream reconnected, since changes made while it was down were never
 * announced. Documents with unsaved edits are left alone: they differ from disk by definition, so comparing them
 * would flag every one of them for nothing.
 * @param {DocumentHub} hub This window's documents.
 * @returns {Promise<ExternalChangeResult[]>} What was done to each clean document, in held order.
 */
const recheckCleanDocuments = (hub: DocumentHub): Promise<ExternalChangeResult[]> =>
{
  const clean = hub.documentKeys().filter(key => hub.isDirty(key) === false);
  return Promise.all(clean.map(key => hub.handleExternalChange(key)));
};

export { recheckCleanDocuments, routeFileChange };
export type { FileChangeOutcome, SessionClients };
