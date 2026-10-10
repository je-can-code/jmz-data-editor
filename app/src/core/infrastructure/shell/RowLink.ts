import { CHANNEL_NAMES, openBroadcastChannel, type ChannelMessageEvent, type MessageChannelLike } from '../messaging/MessageChannelLike.ts';
import { DATA_EDITOR_PATH, pageWindowShell, type WindowOpenResult, type WindowShell } from './WindowShell.ts';

/**
 * One row of a data editor board, as the data editor's own links name it: the board's route, the query key its board
 * selects a row by, and the row's id, as {@code /enemies?enemyId=12} names enemy 12.
 */
type DataEditorRow = {
  readonly path: string;
  readonly key: string;
  readonly id: number;
};

/**
 * What the map editor says to an open data editor on the shell channel, beside the NW.js shell's own messages and the
 * map link's, which each side ignores: show this row.
 */
type RowLinkMessage = { readonly type: 'open-row' } & DataEditorRow;

/**
 * Reads a message off the shell channel, refusing anything that is not a row link's, or names a row no board link
 * could: a route of lowercase words and dashes, a key of letters, and an id from 1.
 * @param {unknown} data The message.
 * @returns {RowLinkMessage | null} The message, or null for anything else.
 */
const asRowLinkMessage = (data: unknown): RowLinkMessage | null =>
{
  if (typeof data !== 'object' || data === null)
  {
    return null;
  }

  const { type, path, key, id } = data as Record<string, unknown>;
  const valid = type === 'open-row'
    && typeof path === 'string' && /^\/[a-z][a-z-]*$/u.test(path)
    && typeof key === 'string' && /^[a-zA-Z]+$/u.test(key)
    && typeof id === 'number' && Number.isInteger(id) && id > 0;
  return valid
    ? { type: 'open-row', path: path as string, key: key as string, id: id as number }
    : null;
};

/**
 * Builds where a row's link goes in the data editor, as its own search links go there: the board's route and the key
 * selecting the row, inside the data editor's hash.
 * @param {DataEditorRow} row The row.
 * @returns {string} The data editor's page, such as {@code /#/enemies?enemyId=12}.
 */
const rowLocation = (row: DataEditorRow): string =>
{
  return `${row.path}?${row.key}=${row.id}`;
};

/**
 * Opens a row in the data editor: asks a data editor already open to show it, on the shell channel, and opens the data
 * editor at the row or brings it forward. A data editor opening afresh starts at the row from its own address; one
 * already open hears the request and goes there, since bringing a window forward never changes what it shows.
 * @param {WindowShell} shell The page's window shell.
 * @param {MessageChannelLike | null} channel The shell channel, or null where there is none.
 * @param {DataEditorRow} row The row.
 * @returns {WindowOpenResult} What became of the data editor's window.
 */
const openDataEditorRow = (shell: WindowShell, channel: MessageChannelLike | null, row: DataEditorRow): WindowOpenResult =>
{
  channel?.postMessage({ type: 'open-row', ...row } satisfies RowLinkMessage);
  return shell.open({ path: `${DATA_EDITOR_PATH}#${rowLocation(row)}`, name: 'jmz-data-editor', width: 1600, height: 1000 });
};

/**
 * The data editor's end of the row link: shows each row it is asked for.
 */
class RowLinkHost
{
  #channel: MessageChannelLike;

  #onOpenRow: (location: string) => void;

  #listener = (event: ChannelMessageEvent) =>
  {
    const message = asRowLinkMessage(event.data);
    if (message !== null)
    {
      this.#onOpenRow(rowLocation(message));
    }
  };

  /**
   * @param {MessageChannelLike} channel The shell channel.
   * @param {(location: string) => void} onOpenRow Shows a row, given its board's route and query.
   */
  constructor(channel: MessageChannelLike, onOpenRow: (location: string) => void)
  {
    this.#channel = channel;
    this.#onOpenRow = onOpenRow;
  }

  /**
   * Starts listening.
   */
  start(): void
  {
    this.#channel.addEventListener('message', this.#listener);
  }

  /**
   * Stops listening.
   */
  stop(): void
  {
    this.#channel.removeEventListener('message', this.#listener);
  }
}

/**
 * The page's own channel for the row link, opened on first use and kept for the page's life.
 */
let sharedChannel: MessageChannelLike | null | undefined;

/**
 * Opens an enemy in the data editor, from this page, at the row the Enemies board selects by its id, as the data
 * editor's own search opens one.
 * @param {number} enemyId The enemy.
 * @param {WindowShell} shell How the page opens windows; the page's own by default.
 * @returns {WindowOpenResult} What became of the data editor's window.
 */
const openEnemyInDataEditor = (enemyId: number, shell: WindowShell = pageWindowShell()): WindowOpenResult =>
{
  sharedChannel ??= openBroadcastChannel(CHANNEL_NAMES.shell);
  return openDataEditorRow(shell, sharedChannel, { path: '/enemies', key: 'enemyId', id: enemyId });
};

export { asRowLinkMessage, openDataEditorRow, openEnemyInDataEditor, RowLinkHost, rowLocation };
export type { DataEditorRow, RowLinkMessage };
