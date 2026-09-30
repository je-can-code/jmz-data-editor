import type { ChannelMessageEvent, MessageChannelLike } from '../../../core/infrastructure/messaging/MessageChannelLike.ts';
import { isJsonObject } from '../model/json.ts';
import { parseFileChange, type FileChange, type FileChangeFeed, type FileChangeListener, type ReconnectListener } from './FileChangeFeed.ts';

/**
 * The part of the Web Locks API the shared feed uses: an exclusive lock, granted to one window at a time, and
 * passed to the next waiting window when its holder closes. It works across renderer processes.
 */
interface LockManagerLike
{
  /**
   * Waits for a lock, then holds it until the callback's promise settles.
   * @param {string} name The lock.
   * @param {() => Promise<unknown>} callback Runs while the lock is held.
   * @returns {Promise<unknown>} Settles when the lock is released.
   */
  request(name: string, callback: () => Promise<unknown>): Promise<unknown>;
}

/**
 * The lock whose holder watches the stream.
 */
const LEADER_LOCK = 'jmz-file-changes-leader';

/**
 * What the leader relays to the other windows.
 */
type RelayMessage = { type: 'change'; change: FileChange } | { type: 'reconnect' };

/**
 * One file-change stream for every window. Browsers hold only six connections per server, and each open stream
 * keeps one busy for good, so with a stream per window the seventh window would stall every request to the
 * server. Instead the windows elect a leader with a lock: it alone opens the stream and relays each change over
 * a channel, and when it closes, the lock passes to another window, which opens its own. Without locks, every
 * window watches for itself.
 *
 * A new leader reports a reconnection once its stream opens, since changes made during the handover were never
 * announced to anyone.
 */
class SharedFileChangeFeed
{
  #feed: FileChangeFeed;

  #channel: MessageChannelLike;

  #locks: LockManagerLike | null;

  #leader = false;

  #running = false;

  #releaseLock: (() => void) | null = null;

  #unsubscribers: (() => void)[] = [];

  #changeListeners = new Set<FileChangeListener>();

  #reconnectListeners = new Set<ReconnectListener>();

  #relayListener = (event: ChannelMessageEvent) => this.#receiveRelay(event.data);

  /**
   * @param {FileChangeFeed} feed The stream this window opens if it becomes the leader; not yet started.
   * @param {MessageChannelLike} channel The channel the leader relays on.
   * @param {LockManagerLike | null} locks The lock manager, or null where there is none.
   */
  constructor(feed: FileChangeFeed, channel: MessageChannelLike, locks: LockManagerLike | null)
  {
    this.#feed = feed;
    this.#channel = channel;
    this.#locks = locks;
  }

  /**
   * Whether this window is the one watching the stream.
   * @returns {boolean} True while leading.
   */
  get isLeader(): boolean
  {
    return this.#leader;
  }

  /**
   * Starts hearing changes: relayed ones at once, and the stream itself once this window leads.
   */
  start(): void
  {
    if (this.#running)
    {
      return;
    }

    this.#running = true;
    this.#channel.addEventListener('message', this.#relayListener);

    if (this.#locks === null)
    {
      this.#lead();
      return;
    }

    // hold the lock until stop, then let the next window take over.
    this.#locks.request(LEADER_LOCK, () => new Promise<void>(resolve =>
    {
      if (this.#running === false)
      {
        resolve();
        return;
      }

      this.#releaseLock = resolve;
      this.#lead();
    }));
  }

  /**
   * Stops hearing changes, closing the stream and passing the lead on.
   */
  stop(): void
  {
    this.#running = false;
    this.#channel.removeEventListener('message', this.#relayListener);
    this.#unsubscribers.forEach(unsubscribe => unsubscribe());
    this.#unsubscribers = [];
    this.#feed.stop();
    this.#leader = false;
    this.#releaseLock?.();
    this.#releaseLock = null;
  }

  /**
   * Listens for changes, wherever this window hears them.
   * @param {FileChangeListener} listener Called per change.
   * @returns {() => void} Stops listening.
   */
  onChange(listener: FileChangeListener): () => void
  {
    this.#changeListeners.add(listener);
    return () =>
    {
      this.#changeListeners.delete(listener);
    };
  }

  /**
   * Listens for reconnections, wherever this window hears them.
   * @param {ReconnectListener} listener Called when changes may have been missed.
   * @returns {() => void} Stops listening.
   */
  onReconnect(listener: ReconnectListener): () => void
  {
    this.#reconnectListeners.add(listener);
    return () =>
    {
      this.#reconnectListeners.delete(listener);
    };
  }

  /**
   * Becomes the leader: opens the stream, delivers each change here, and relays it to the other windows.
   */
  #lead(): void
  {
    this.#leader = true;
    this.#unsubscribers.push(
      this.#feed.onChange(change =>
      {
        this.#deliverChange(change);
        this.#channel.postMessage({ type: 'change', change } satisfies RelayMessage);
      }),
      this.#feed.onReconnect(() => this.#announceReconnect()),
    );
    this.#feed.start();

    // whatever changed while nobody was leading went unannounced.
    this.#announceReconnect();
  }

  /**
   * Reports a reconnection here and to the other windows.
   */
  #announceReconnect(): void
  {
    this.#deliverReconnect();
    this.#channel.postMessage({ type: 'reconnect' } satisfies RelayMessage);
  }

  /**
   * Handles a message the leader relayed.
   * @param {unknown} data The message.
   */
  #receiveRelay(data: unknown): void
  {
    if (isJsonObject(data) === false)
    {
      return;
    }

    if (data['type'] === 'reconnect')
    {
      this.#deliverReconnect();
      return;
    }

    // relayed changes are checked like streamed ones, since any page of the origin can post on the channel.
    const change = data['type'] === 'change'
      ? parseFileChange(JSON.stringify(data['change']))
      : null;
    if (change !== null)
    {
      this.#deliverChange(change);
    }
  }

  /**
   * Hands a change to every listener here.
   * @param {FileChange} change The change.
   */
  #deliverChange(change: FileChange): void
  {
    [ ...this.#changeListeners ].forEach(listener => listener(change));
  }

  /**
   * Tells every listener here that changes may have been missed.
   */
  #deliverReconnect(): void
  {
    [ ...this.#reconnectListeners ].forEach(listener => listener());
  }
}

export { LEADER_LOCK, SharedFileChangeFeed };
export type { LockManagerLike, RelayMessage };
