import type { DocumentHub } from '../history/DocumentHub.ts';
import { createDocument } from '../model/createDocument.ts';
import type { DocumentKey } from '../model/documentKeys.ts';
import type { EditorDocument } from '../model/EditorDocument.ts';
import type { SyncPeer } from './SyncPeer.ts';

/**
 * What a look at a document reads from: this window's documents and the files behind them, and the other windows.
 */
type LookSources = {
  readonly hub: Pick<DocumentHub, 'has' | 'document' | 'readFile'>;
  readonly sync: Pick<SyncPeer, 'whenHeldOrDiscovered' | 'holders' | 'requestSnapshot'>;
};

/**
 * Reads a document to look at, never to hold: the live copy when this window holds it, or else the live copy another
 * window holds, unsaved edits included, or else the file. A copy from elsewhere comes back on its own, outside the hub.
 *
 * Holding is not free. Every window holding a document counts as keeping a copy of it, so a window holding a map it
 * can neither show nor save would let the window editing that map close without asking about its unsaved edits. A
 * look leaves the hub as it was, so nothing about who holds what changes. The price is that a copy from elsewhere
 * never follows later edits: it is the document as it stood when looked at, which is all a glance needs.
 * @param {LookSources} sources This window's hub and its link to the others.
 * @param {DocumentKey} key The document.
 * @returns {Promise<EditorDocument>} The hub's own document when this window holds it, a copy otherwise.
 */
const lookAtDocument = async (sources: LookSources, key: DocumentKey): Promise<EditorDocument> =>
{
  const { hub, sync } = sources;
  if (hub.has(key))
  {
    return hub.document(key);
  }

  // another window's copy may hold edits the file lacks, so its answer is waited for first, as opening one does.
  await sync.whenHeldOrDiscovered(key);
  const snapshot = sync.holders(key).length > 0
    ? await sync.requestSnapshot(key)
    : null;

  // nobody holding it, or a holder that never answered, leaves the file as it stands on disk.
  const content = snapshot === null
    ? await hub.readFile(key)
    : snapshot.content;
  return createDocument(key, content);
};

export { lookAtDocument };
export type { LookSources };
