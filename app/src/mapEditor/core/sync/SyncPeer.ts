import type { ChannelMessageEvent, MessageChannelLike } from '../../../core/infrastructure/messaging/MessageChannelLike.ts';
import type { DocumentHub, DocumentSnapshot, HubEvent } from '../history/DocumentHub.ts';
import type { DocumentKey } from '../model/documentKeys.ts';
import { asSyncMessage, type SyncMessage } from './SyncProtocol.ts';

/**
 * What one window knows about another.
 */
type PeerRecord = {
  holding: ReadonlySet<DocumentKey>;
  lastSeen: number;
};

/**
 * A snapshot request waiting for its answer.
 */
type PendingRequest = {
  resolve: (snapshot: DocumentSnapshot | null) => void;
  timer: ReturnType<typeof setTimeout>;
};

/**
 * Options for a sync peer.
 */
type SyncPeerOptions = {
  /**
   * The window's documents and histories.
   */
  hub: DocumentHub;

  /**
   * The sync channel; the peer closes it on stop.
   */
  channel: MessageChannelLike;

  /**
   * The clock.
   */
  now?: () => number;

  /**
   * How often to repeat presence, in milliseconds; 0 turns the heartbeat off.
   */
  heartbeatMs?: number;

  /**
   * How long a window counts as present after it was last heard from.
   */
  livenessMs?: number;

  /**
   * How long to wait for a snapshot before giving up.
   */
  snapshotTimeoutMs?: number;
};

/**
 * Keeps one window's documents in step with every other map editor window holding them, so a map and its event
 * windows share one live document and every torn-out panel stays current.
 *
 * Everything that happens to the hub here (a step, an undo, a redo, a save) is posted on the channel, and every
 * such operation posted by another window is repeated here through {@link DocumentHub.applyRemote}. Operations
 * carry the versions they were made against, so a window can tell when its copy has drifted.
 *
 * Drift resolves to one copy, deterministically: the live window with the lowest client id holding the document
 * is its authority. A drifted window that is not the authority fetches the authority's copy, histories
 * included; a drifted authority pushes its copy to the window it drifted from. Two windows that edit in the same
 * instant each see the other's operation as stale, and both end on the authority's copy rather than swapping
 * states and staying apart. One of those two edits is lost, which a single author working one window at a time
 * never meets in practice.
 *
 * It also answers the two questions the rest of the editor asks of other windows: whether a client id belongs
 * to the session (so the echo of its saves on the file-change stream can be ignored), and whether a document is
 * still held somewhere else (so closing this window loses nothing).
 */
class SyncPeer
{
  #hub: DocumentHub;

  #channel: MessageChannelLike;

  #now: () => number;

  #heartbeatMs: number;

  #livenessMs: number;

  #snapshotTimeoutMs: number;

  #peers = new Map<string, PeerRecord>();

  #knownClients = new Set<string>();

  #pending = new Map<string, PendingRequest>();

  #requestCounter = 0;

  #heartbeat: ReturnType<typeof setInterval> | null = null;

  #unsubscribe: (() => void) | null = null;

  #running = false;

  #listener = (event: ChannelMessageEvent) => this.#receive(event.data);

  /**
   * @param {SyncPeerOptions} options The hub, the channel, and the timings.
   */
  constructor(options: SyncPeerOptions)
  {
    this.#hub = options.hub;
    this.#channel = options.channel;
    this.#now = options.now ?? Date.now;
    this.#heartbeatMs = options.heartbeatMs ?? 2000;
    this.#livenessMs = options.livenessMs ?? 6000;
    this.#snapshotTimeoutMs = options.snapshotTimeoutMs ?? 250;
    this.#knownClients.add(this.#hub.clientId);
  }

  /**
   * This window's client id.
   * @returns {string} The id.
   */
  get clientId(): string
  {
    return this.#hub.clientId;
  }

  /**
   * Joins the channel: announces this window, starts forwarding the hub's operations, and starts the heartbeat.
   */
  start(): void
  {
    if (this.#running)
    {
      return;
    }

    this.#running = true;
    this.#channel.addEventListener('message', this.#listener);
    this.#unsubscribe = this.#hub.subscribe(event => this.#forward(event));
    this.#post({ type: 'hello', from: this.clientId, holding: this.#hub.documentKeys() });

    if (this.#heartbeatMs > 0)
    {
      this.#heartbeat = setInterval(() => this.#announcePresence(), this.#heartbeatMs);
    }
  }

  /**
   * Leaves the channel, saying goodbye, and closes it.
   */
  stop(): void
  {
    if (this.#running === false)
    {
      return;
    }

    this.#post({ type: 'goodbye', from: this.clientId });
    this.#running = false;
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    if (this.#heartbeat !== null)
    {
      clearInterval(this.#heartbeat);
      this.#heartbeat = null;
    }

    this.#pending.forEach(({ resolve, timer }) =>
    {
      clearTimeout(timer);
      resolve(null);
    });
    this.#pending.clear();
    this.#channel.removeEventListener('message', this.#listener);
    this.#channel.close();
  }

  /**
   * Reports whether a client id belongs to this editor session: this window or any window heard on the channel.
   * The file-change stream's echo of such a window's save carries nothing this window lacks.
   * @param {string} clientId The id from a change event.
   * @returns {boolean} True for a session window.
   */
  knowsClient(clientId: string): boolean
  {
    return this.#knownClients.has(clientId);
  }

  /**
   * Reports whether another window still holds a document, as of its latest presence. A window not heard from
   * within the liveness window no longer counts, so a crashed window can never vouch for unsaved work.
   * @param {DocumentKey} key The document.
   * @returns {boolean} True when some live window holds it.
   */
  isHeldElsewhere(key: DocumentKey): boolean
  {
    const cutoff = this.#now() - this.#livenessMs;
    return [ ...this.#peers.values() ].some(peer => peer.lastSeen >= cutoff && peer.holding.has(key));
  }

  /**
   * Asks the other windows for a document's live copy, histories included.
   * @param {DocumentKey} key The document.
   * @param {string | null} from One window to ask, or null to ask anyone who holds it.
   * @returns {Promise<DocumentSnapshot | null>} The first answer, or null when nobody answers in time.
   */
  requestSnapshot(key: DocumentKey, from: string | null = null): Promise<DocumentSnapshot | null>
  {
    this.#requestCounter += 1;
    const requestId = `${this.clientId}~${this.#requestCounter}`;

    return new Promise(resolve =>
    {
      const timer = setTimeout(() =>
      {
        this.#pending.delete(requestId);
        resolve(null);
      }, this.#snapshotTimeoutMs);

      this.#pending.set(requestId, { resolve, timer });
      this.#post({ type: 'snapshot-request', from: this.clientId, requestId, document: key, to: from });
    });
  }

  /**
   * Posts this window's operations, and fetches fresh copies of documents that drifted.
   * @param {HubEvent} event The hub's event.
   */
  #forward(event: HubEvent): void
  {
    switch (event.type)
    {
      case 'committed':
        this.#forwardLocal(event.source, { type: 'commit', origin: this.clientId, step: event.step, bases: event.bases });
        break;
      case 'undone':
        this.#forwardLocal(event.source, { type: 'undo', origin: this.clientId, stepId: event.step.id, bases: event.bases });
        break;
      case 'redone':
        this.#forwardLocal(event.source, { type: 'redo', origin: this.clientId, stepId: event.step.id, bases: event.bases });
        break;
      case 'saved':
        this.#forwardLocal(event.source, { type: 'saved', origin: this.clientId, document: event.document, marker: event.marker });
        break;
      case 'adopted':
      case 'released':
        this.#announcePresence();
        break;
      case 'out-of-sync':
        // the refetch settles on its own; nothing here waits for it.
        event.documents.forEach(key => this.#resync(key, event.origin));
        break;
      default:
        break;
    }
  }

  /**
   * Posts an operation, but only one that started in this window; repeating a remote one would echo forever.
   * @param {'local' | 'remote'} source Where the operation started.
   * @param {RemoteOperation} operation The operation.
   */
  #forwardLocal(source: 'local' | 'remote', operation: Extract<SyncMessage, { type: 'operation' }>['operation']): void
  {
    if (source === 'local')
    {
      this.#post({ type: 'operation', from: this.clientId, operation });
    }
  }

  /**
   * Names the authority for a document: the lowest client id among this window and the live windows holding it.
   * @param {DocumentKey} key The document.
   * @returns {string} The authority's client id.
   */
  authorityFor(key: DocumentKey): string
  {
    const cutoff = this.#now() - this.#livenessMs;
    const holders = [ ...this.#peers.entries() ]
      .filter(([ , peer ]) => peer.lastSeen >= cutoff && peer.holding.has(key))
      .map(([ clientId ]) => clientId);

    return [ this.clientId, ...holders ].sort()[0];
  }

  /**
   * Brings a drifted document back to the authority's copy: pushed to the window it drifted from when this
   * window is the authority, fetched from the authority otherwise.
   * @param {DocumentKey} key The document.
   * @param {string} origin The window whose operation exposed the drift.
   */
  async #resync(key: DocumentKey, origin: string): Promise<void>
  {
    const authority = this.authorityFor(key);
    if (authority === this.clientId)
    {
      this.#post({ type: 'snapshot', from: this.clientId, to: origin, requestId: null, snapshot: this.#hub.snapshot(key) });
      return;
    }

    const snapshot = await this.requestSnapshot(key, authority);
    if (snapshot !== null && this.#running)
    {
      this.#adopt(snapshot);
    }
  }

  /**
   * Takes on another window's copy of a document.
   * @param {DocumentSnapshot} snapshot The copy.
   */
  #adopt(snapshot: DocumentSnapshot): void
  {
    try
    {
      this.#hub.adoptSnapshot(snapshot);
    }
    catch
    {
      // an edit opened meanwhile; the next operation on this document will find the drift again.
    }
  }

  /**
   * Handles one message from another window.
   * @param {unknown} data The message.
   */
  #receive(data: unknown): void
  {
    const message = asSyncMessage(data);
    if (message === null || message.from === this.clientId)
    {
      return;
    }

    this.#knownClients.add(message.from);
    switch (message.type)
    {
      case 'hello':
        this.#notePeer(message.from, message.holding);
        this.#announcePresence();
        break;
      case 'presence':
        this.#notePeer(message.from, message.holding);
        break;
      case 'goodbye':
        this.#peers.delete(message.from);
        break;
      case 'snapshot-request':
        this.#answerSnapshotRequest(message);
        break;
      case 'snapshot':
        this.#receiveSnapshot(message);
        break;
      case 'operation':
        this.#hub.applyRemote(message.operation);
        break;
    }
  }

  /**
   * Records what another window holds, and that it is alive.
   * @param {string} from The window.
   * @param {readonly DocumentKey[]} holding Its documents.
   */
  #notePeer(from: string, holding: readonly DocumentKey[]): void
  {
    this.#peers.set(from, { holding: new Set(holding), lastSeen: this.#now() });
  }

  /**
   * Sends a document's live copy to a window that asked, when this window holds it and the request allows it.
   * @param {Extract<SyncMessage, { type: 'snapshot-request' }>} message The request.
   */
  #answerSnapshotRequest(message: Extract<SyncMessage, { type: 'snapshot-request' }>): void
  {
    if ((message.to !== null && message.to !== this.clientId) || this.#hub.has(message.document) === false)
    {
      return;
    }

    this.#post({
      type: 'snapshot',
      from: this.clientId,
      to: message.from,
      requestId: message.requestId,
      snapshot: this.#hub.snapshot(message.document),
    });
  }

  /**
   * Settles the request a snapshot answers, ignoring later answers to the same request. A pushed snapshot is
   * adopted only from a window that outranks this one as authority, for a document this window holds.
   * @param {Extract<SyncMessage, { type: 'snapshot' }>} message The answer.
   */
  #receiveSnapshot(message: Extract<SyncMessage, { type: 'snapshot' }>): void
  {
    if (message.to !== this.clientId)
    {
      return;
    }

    if (message.requestId === null)
    {
      if (message.from < this.clientId && this.#hub.has(message.snapshot.document))
      {
        this.#adopt(message.snapshot);
      }

      return;
    }

    const pending = this.#pending.get(message.requestId);
    if (pending === undefined)
    {
      return;
    }

    clearTimeout(pending.timer);
    this.#pending.delete(message.requestId);
    pending.resolve(message.snapshot);
  }

  /**
   * Tells every window what this one holds.
   */
  #announcePresence(): void
  {
    this.#post({ type: 'presence', from: this.clientId, holding: this.#hub.documentKeys() });
  }

  /**
   * Posts a message while running.
   * @param {SyncMessage} message The message.
   */
  #post(message: SyncMessage): void
  {
    if (this.#running)
    {
      this.#channel.postMessage(message);
    }
  }
}

export { SyncPeer };
export type { SyncPeerOptions };
