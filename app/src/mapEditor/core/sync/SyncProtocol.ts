import type { DocumentSnapshot, RemoteOperation } from '../history/DocumentHub.ts';
import type { DocumentKey } from '../model/documentKeys.ts';
import { isJsonObject } from '../model/json.ts';

/**
 * Every message map editor windows exchange on the sync channel. Each names its sender ({@code from}), which is
 * also how a window learns which client ids belong to the editor session, so it can ignore the echo of any
 * session window's save on the file-change stream.
 *
 * - {@code hello}: a window arrived, and what it holds; everyone answers with presence.
 * - {@code presence}: who holds what, sent on every change and as a heartbeat.
 * - {@code goodbye}: a window is closing.
 * - {@code snapshot-request} / {@code snapshot}: a window asks for a document's live copy with its histories,
 *   from anyone (opening it) or from one window (after drifting). A snapshot with no request id is pushed by the
 *   document's authority to a window that drifted from it.
 * - {@code operation}: a step committed, undone or redone, or a document saved.
 */
type SyncMessage =
  | { readonly type: 'hello'; readonly from: string; readonly holding: readonly DocumentKey[] }
  | { readonly type: 'presence'; readonly from: string; readonly holding: readonly DocumentKey[] }
  | { readonly type: 'goodbye'; readonly from: string }
  | { readonly type: 'snapshot-request'; readonly from: string; readonly requestId: string; readonly document: DocumentKey; readonly to: string | null }
  | { readonly type: 'snapshot'; readonly from: string; readonly to: string; readonly requestId: string | null; readonly snapshot: DocumentSnapshot }
  | { readonly type: 'operation'; readonly from: string; readonly operation: RemoteOperation };

/**
 * The message types a window acts on.
 */
const SYNC_MESSAGE_TYPES: ReadonlySet<string> = new Set([ 'hello', 'presence', 'goodbye', 'snapshot-request', 'snapshot', 'operation' ]);

/**
 * Reads a channel message as a sync message, ignoring anything else posted on the channel.
 * @param {unknown} data The message.
 * @returns {SyncMessage | null} The message, or null when it is not one.
 */
const asSyncMessage = (data: unknown): SyncMessage | null =>
{
  if (isJsonObject(data) === false || typeof data['from'] !== 'string' || typeof data['type'] !== 'string')
  {
    return null;
  }

  return SYNC_MESSAGE_TYPES.has(data['type'])
    ? data as unknown as SyncMessage
    : null;
};

export { asSyncMessage };
export type { SyncMessage };
