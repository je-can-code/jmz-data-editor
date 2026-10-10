import type { DocumentSnapshot, RemoteOperation } from '../history/DocumentHub.ts';
import type { DocumentKey } from '../model/documentKeys.ts';
import { isJsonObject, type JsonValue } from '../model/json.ts';

/**
 * One document a window holds, and the id of the latest operation applied to it there. Two windows at the same
 * head hold the same state; any other window holds something else, however recently it was heard from.
 */
type HeldDocument = {
  readonly document: DocumentKey;
  readonly head: string;
};

/**
 * Every message map editor windows exchange on the sync channel. Each names its sender ({@code from}), which is
 * also how a window learns which client ids belong to the editor session, so it can ignore the echo of any
 * session window's save on the file-change stream.
 *
 * - {@code hello}: a window arrived, and what it holds; everyone answers with presence.
 * - {@code presence}: what a window holds and at which head, sent whenever a head moves and as a heartbeat.
 * - {@code goodbye}: a window is closing.
 * - {@code snapshot-request} / {@code snapshot}: a window asks for a document's live copy with its histories,
 *   from anyone (opening it) or from one window (after finding its copy differs).
 * - {@code offer}: a window hands its copy to another: to catch up a window that is behind, to tell a window
 *   the two copies went different ways, or, with {@code resolution}, because the person chose this copy.
 * - {@code operation}: a step committed, undone, redone or forgotten, a document saved, or its file written otherwise, as
 *   a blueprint's change is written at once, each with what the file holds now.
 * - {@code outside}: the one window reading the file-change stream read a document's file after it changed outside the
 *   editor, or, with {@code recheck}, after the stream came back, and hands every window that very version, so they
 *   all take the same one rather than each whatever it would read a moment later. {@code content} is null when the
 *   file was removed.
 */
type SyncMessage =
  | { readonly type: 'hello'; readonly from: string; readonly holding: readonly HeldDocument[] }
  | { readonly type: 'presence'; readonly from: string; readonly holding: readonly HeldDocument[] }
  | { readonly type: 'goodbye'; readonly from: string }
  | { readonly type: 'snapshot-request'; readonly from: string; readonly requestId: string; readonly document: DocumentKey; readonly to: string | null }
  | { readonly type: 'snapshot'; readonly from: string; readonly to: string; readonly requestId: string; readonly snapshot: DocumentSnapshot }
  | { readonly type: 'offer'; readonly from: string; readonly to: string; readonly snapshot: DocumentSnapshot; readonly resolution: boolean }
  | { readonly type: 'operation'; readonly from: string; readonly operation: RemoteOperation }
  | { readonly type: 'outside'; readonly from: string; readonly document: DocumentKey; readonly content: JsonValue | null; readonly recheck: boolean };

/**
 * The message types a window acts on.
 */
const SYNC_MESSAGE_TYPES: ReadonlySet<string> = new Set([ 'hello', 'presence', 'goodbye', 'snapshot-request', 'snapshot', 'offer', 'operation', 'outside' ]);

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

/**
 * How one document's lineage relates to another's.
 *
 * - {@code same}: identical.
 * - {@code behind}: the first is a strict prefix of the second, so the second holds everything the first does
 *   and more; taking the second loses nothing.
 * - {@code ahead}: the second is a strict prefix of the first.
 * - {@code diverged}: each holds operations the other lacks; either copy alone would lose work.
 */
type LineageRelation = 'same' | 'behind' | 'ahead' | 'diverged';

/**
 * Reports whether one list starts with another.
 * @param {readonly string[]} prefix The shorter list.
 * @param {readonly string[]} list The longer list.
 * @returns {boolean} True when {@code list} starts with every entry of {@code prefix}, in order.
 */
const startsWith = (prefix: readonly string[], list: readonly string[]): boolean =>
{
  return prefix.length <= list.length && prefix.every((entry, index) => entry === list[index]);
};

/**
 * Relates this window's lineage for a document to another window's.
 * @param {readonly string[]} mine This window's lineage.
 * @param {readonly string[]} theirs The other window's lineage.
 * @returns {LineageRelation} How they relate.
 */
const compareLineages = (mine: readonly string[], theirs: readonly string[]): LineageRelation =>
{
  if (mine.length === theirs.length && startsWith(mine, theirs))
  {
    return 'same';
  }

  if (startsWith(mine, theirs))
  {
    return 'behind';
  }

  return startsWith(theirs, mine)
    ? 'ahead'
    : 'diverged';
};

export { asSyncMessage, compareLineages };
export type { HeldDocument, LineageRelation, SyncMessage };
