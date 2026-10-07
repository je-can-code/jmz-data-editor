import type { ChannelMessageEvent, MessageChannelLike } from '../../../core/infrastructure/messaging/MessageChannelLike.ts';
import type { DocumentHub, DocumentSnapshot, HubEvent, RemoteOperation } from '../history/DocumentHub.ts';
import type { DocumentKey } from '../model/documentKeys.ts';
import type { JsonValue } from '../model/json.ts';
import { asSyncMessage, compareLineages, type HeldDocument, type SyncMessage } from './SyncProtocol.ts';

/**
 * What one window knows about another: the documents it holds, each at its head, and when it was last heard.
 */
type PeerRecord = {
  holding: ReadonlyMap<DocumentKey, string>;
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
 * A wait for some window holding a document to be heard from.
 */
type HolderWait = {
  readonly key: DocumentKey;
  readonly resolve: () => void;
};

/**
 * Where a copy being reconciled came from: fetched after this window's copy was found to differ, or offered by
 * the other window.
 */
type ReconcileSource = 'drift' | 'offer';

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

  /**
   * How long after starting the other windows' answers to hello are taken to be in.
   */
  discoveryMs?: number;
};

/**
 * Turns one of this window's hub events into the operation other windows repeat.
 * @param {HubEvent} event The event.
 * @param {string} origin This window's client id.
 * @returns {RemoteOperation | null} The operation, or null for events that are not operations.
 */
const operationFor = (event: HubEvent, origin: string): RemoteOperation | null =>
{
  switch (event.type)
  {
    case 'committed':
      return { type: 'commit', origin, opId: event.opId, step: event.step, bases: event.bases };
    case 'undone':
      return { type: 'undo', origin, opId: event.opId, stepId: event.step.id, bases: event.bases };
    case 'redone':
      return { type: 'redo', origin, opId: event.opId, stepId: event.step.id, bases: event.bases };
    case 'forgotten':
      return { type: 'forget', origin, opId: event.opId, stepId: event.step.id, bases: event.bases };
    case 'saved':
      return { type: 'saved', origin, document: event.document, marker: event.marker };
    default:
      return null;
  }
};

/**
 * The events after which some document's head has moved, so the other windows must hear this window's presence.
 */
const HEAD_EVENTS: ReadonlySet<HubEvent['type']> = new Set([
  'committed', 'undone', 'redone', 'forgotten', 'adopted', 'released', 'reloaded',
]);

/**
 * Keeps one window's documents in step with every other map editor window holding them, so a map and its event
 * windows share one live document and every torn-out panel stays current.
 *
 * Everything that happens to the hub here (a step, an undo, a redo, a forget, a save) is posted on the channel,
 * and every such operation posted by another window is repeated here through {@link DocumentHub.applyRemote},
 * which checks it against the head of this window's lineage for each document. A file changed outside the editor is
 * read once, by the window reading the change stream, which hands that very version to every window here
 * ({@link postOutside}); each takes it as the same step, so no two windows ever record different versions of one
 * change.
 *
 * When the two copies are found to differ, their lineages decide, and nothing is ever settled by throwing work
 * away. A copy that is only behind (its lineage a prefix of the other's) takes the other copy, which holds
 * everything it did. A copy that is ahead hands itself to the other window. Two copies that went different ways
 * are both kept: each window flags the document with the other's copy beside it, and the person chooses which
 * to keep ({@link resolveConflict}).
 *
 * It also answers the questions the rest of the editor asks of other windows: whether a client id belongs to
 * the session (so the echo of its saves on the file-change stream can be ignored), which windows hold a
 * document, and whether one of them holds exactly this window's latest state of it (so closing this window
 * loses nothing).
 */
class SyncPeer
{
  #hub: DocumentHub;

  #channel: MessageChannelLike;

  #now: () => number;

  #heartbeatMs: number;

  #livenessMs: number;

  #snapshotTimeoutMs: number;

  #discoveryMs: number;

  #peers = new Map<string, PeerRecord>();

  #knownClients = new Set<string>();

  #pending = new Map<string, PendingRequest>();

  #holderWaits = new Set<HolderWait>();

  #holdingListeners = new Set<(key: DocumentKey) => void>();

  #requestCounter = 0;

  #heartbeat: ReturnType<typeof setInterval> | null = null;

  #discovered: Promise<void> = Promise.resolve();

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
    this.#discoveryMs = options.discoveryMs ?? 150;
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
    this.#post({ type: 'hello', from: this.clientId, holding: this.#holding() });

    // the other windows answer hello with presence; this is how long their answers are given to arrive.
    this.#discovered = new Promise(resolve =>
    {
      setTimeout(resolve, this.#discoveryMs);
    });

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

    // nobody else will be heard from now, so nothing waits on it.
    [ ...this.#holderWaits ].forEach(wait => this.#settleWait(wait));
    this.#channel.removeEventListener('message', this.#listener);
    this.#channel.close();
  }

  /**
   * Settles once the other windows have had time to answer this window's hello, after which the presence heard
   * is a fair picture of who holds what.
   * @returns {Promise<void>} Settles after the discovery window.
   */
  whenDiscovered(): Promise<void>
  {
    return this.#discovered;
  }

  /**
   * Settles as soon as some window holding a document has been heard from, or once the discovery window has passed
   * with none: the moment a window opening the document knows whether to ask another window for its live copy or read
   * the file. Discovery is waited out only for the answer "nobody holds it", which a window that has just opened cannot
   * give before the others have had time to speak; a window holding the document that has spoken already settles it,
   * so an event window asks the map's window for its copy the moment that window answers hello, not a beat later.
   * @param {DocumentKey} key The document.
   * @returns {Promise<void>} Settles once a holder is known, or discovery is over.
   */
  whenHeldOrDiscovered(key: DocumentKey): Promise<void>
  {
    if (this.holders(key).length > 0)
    {
      return Promise.resolve();
    }

    return new Promise(resolve =>
    {
      const wait: HolderWait = { key, resolve };
      this.#holderWaits.add(wait);
      this.#discovered.then(() => this.#settleWait(wait)).catch(() => undefined);
    });
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
   * Lists the live windows holding a document, whatever state they hold it in.
   * @param {DocumentKey} key The document.
   * @returns {string[]} Their client ids.
   */
  holders(key: DocumentKey): string[]
  {
    return this.#livePeers()
      .filter(([ , peer ]) => peer.holding.has(key))
      .map(([ clientId ]) => clientId);
  }

  /**
   * Listens for what the other windows hold changing, as each window's presence says it: a window taking a document up,
   * letting it go, or moving it on to another head, as an edit, an undo or a redo there does, and a window going, which
   * lets go of everything it held. A window that only does not hold a document can follow it this way, looking at it
   * afresh whenever its holder moves it on, without ever holding it.
   * @param {(key: DocumentKey) => void} listener Called once for each document whose holding changed.
   * @returns {() => void} Stops listening.
   */
  onHoldingChange(listener: (key: DocumentKey) => void): () => void
  {
    this.#holdingListeners.add(listener);
    return () =>
    {
      this.#holdingListeners.delete(listener);
    };
  }

  /**
   * Lists every document some other live window holds, whatever state it holds it in.
   * @returns {DocumentKey[]} The documents, each once.
   */
  documentsHeldElsewhere(): DocumentKey[]
  {
    return [ ...new Set(this.#livePeers().flatMap(([ , peer ]) => [ ...peer.holding.keys() ])) ];
  }

  /**
   * Hands every other window one version of a document's file that changed outside the editor, read once here for
   * all of them, so each takes exactly that version ({@link DocumentHub.applyOutsideContent}) rather than whatever it
   * would read itself a moment later, which a second write may already have changed.
   * @param {DocumentKey} key The document.
   * @param {JsonValue | null} content The file's content, or null when the file was removed.
   * @param {boolean} recheck True when the file was re-read because the change stream came back, not because it changed.
   */
  postOutside(key: DocumentKey, content: JsonValue | null, recheck: boolean): void
  {
    this.#post({ type: 'outside', from: this.clientId, document: key, content, recheck });
  }

  /**
   * Reports whether another live window holds a document at exactly this window's head, so closing this window
   * would lose none of its edits. A window holding an older or different copy does not count, and neither does
   * one that said goodbye or has not been heard from within the liveness window.
   * @param {DocumentKey} key The document.
   * @returns {boolean} True when some live window holds this window's latest state of it.
   */
  sharesLatest(key: DocumentKey): boolean
  {
    const head = this.#hub.head(key);
    return head !== null && this.#livePeers().some(([ , peer ]) => peer.holding.get(key) === head);
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
   * Settles a conflict with another window's copy the way the person chose. Keeping this window's copy hands it
   * to the other window, which takes it; using the other copy takes it here and tells the other window, which
   * then hands over anything newer it has since.
   * @param {DocumentKey} key The document.
   * @param {'mine' | 'theirs'} choice Which copy the person kept.
   * @returns {boolean} True when there was a conflict with another window to settle.
   */
  resolveConflict(key: DocumentKey, choice: 'mine' | 'theirs'): boolean
  {
    const conflict = this.#hub.conflict(key);
    if (conflict === null || conflict.kind !== 'window')
    {
      return false;
    }

    if (choice === 'theirs' && this.#adopt(conflict.theirs) === false)
    {
      return false;
    }

    this.#hub.clearConflict(key);
    this.#offer(key, conflict.peer, choice === 'mine');
    return true;
  }

  /**
   * Posts this window's operations, keeps the other windows' picture of its heads current, and works out whose
   * copy is ahead when an operation from another window did not fit.
   * @param {HubEvent} event The hub's event.
   */
  #forward(event: HubEvent): void
  {
    const operation = 'source' in event && event.source === 'local'
      ? operationFor(event, this.clientId)
      : null;
    if (operation !== null)
    {
      this.#post({ type: 'operation', from: this.clientId, operation });
    }

    if (HEAD_EVENTS.has(event.type))
    {
      this.#announcePresence();
    }

    if (event.type === 'out-of-sync')
    {
      // the refetch settles on its own; nothing here waits for it.
      event.documents.forEach(key => this.#resync(key, event.origin));
    }
  }

  /**
   * Fetches the copy of the window whose operation did not fit, and reconciles with it.
   * @param {DocumentKey} key The document.
   * @param {string} origin The window whose operation exposed the difference.
   */
  async #resync(key: DocumentKey, origin: string): Promise<void>
  {
    const theirs = await this.requestSnapshot(key, origin);
    if (theirs !== null && this.#running)
    {
      this.#reconcile(key, origin, theirs, 'drift');
    }
  }

  /**
   * Settles two copies of a document by their lineages: take theirs when this one is only behind, hand this one
   * over when it is ahead, and keep both, flagged, when they went different ways. A diverged copy that arrived
   * as an offer is flagged without offering back, so two windows never trade offers forever.
   * @param {DocumentKey} key The document.
   * @param {string} peer The other window.
   * @param {DocumentSnapshot} theirs Its copy.
   * @param {ReconcileSource} source Whether the copy was fetched after a mismatch or offered.
   */
  #reconcile(key: DocumentKey, peer: string, theirs: DocumentSnapshot, source: ReconcileSource): void
  {
    if (this.#hub.has(key) === false)
    {
      return;
    }

    switch (compareLineages(this.#hub.lineage(key), theirs.lineage))
    {
      case 'same':
        this.#clearWindowConflict(key, peer);
        break;
      case 'behind':
        if (this.#adopt(theirs))
        {
          this.#clearWindowConflict(key, peer);
        }
        break;
      case 'ahead':
        this.#clearWindowConflict(key, peer);
        this.#offer(key, peer, false);
        break;
      case 'diverged':
        this.#hub.flagConflict(key, { kind: 'window', peer, theirs });
        if (source === 'drift')
        {
          this.#offer(key, peer, false);
        }
        break;
    }
  }

  /**
   * Clears a document's conflict with one window, when that is the conflict it has.
   * @param {DocumentKey} key The document.
   * @param {string} peer The window.
   */
  #clearWindowConflict(key: DocumentKey, peer: string): void
  {
    const conflict = this.#hub.conflict(key);
    if (conflict?.kind === 'window' && conflict.peer === peer)
    {
      this.#hub.clearConflict(key);
    }
  }

  /**
   * Hands this window's copy of a document to another window.
   * @param {DocumentKey} key The document.
   * @param {string} peer The window.
   * @param {boolean} resolution True when the person chose this copy, so the other window takes it outright.
   */
  #offer(key: DocumentKey, peer: string, resolution: boolean): void
  {
    this.#post({ type: 'offer', from: this.clientId, to: peer, snapshot: this.#hub.snapshot(key), resolution });
  }

  /**
   * Takes on another window's copy of a document.
   * @param {DocumentSnapshot} snapshot The copy.
   * @returns {boolean} True when taken; false when an edit is open here, in which case the next operation on the
   * document finds the difference again.
   */
  #adopt(snapshot: DocumentSnapshot): boolean
  {
    try
    {
      this.#hub.adoptSnapshot(snapshot);
      return true;
    }
    catch
    {
      return false;
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
        this.#forgetPeer(message.from);
        break;
      case 'snapshot-request':
        this.#answerSnapshotRequest(message);
        break;
      case 'snapshot':
        this.#receiveSnapshot(message);
        break;
      case 'offer':
        this.#receiveOffer(message);
        break;
      case 'operation':
        this.#hub.applyRemote(message.operation);
        break;
      case 'outside':
        this.#hub.applyOutsideContent(message.document, message.content, message.recheck);
        break;
    }
  }

  /**
   * Records what another window holds, and that it is alive.
   * @param {string} from The window.
   * @param {readonly HeldDocument[]} holding Its documents and their heads.
   */
  #notePeer(from: string, holding: readonly HeldDocument[]): void
  {
    const before = this.#peers.get(from)?.holding ?? new Map<DocumentKey, string>();
    const after = new Map(holding.map(({ document, head }) => [ document, head ]));
    this.#peers.set(from, { holding: after, lastSeen: this.#now() });

    // whoever was waiting to hear from a window holding one of these documents has now.
    [ ...this.#holderWaits ]
      .filter(wait => holding.some(({ document }) => document === wait.key))
      .forEach(wait => this.#settleWait(wait));
    this.#announceHoldingChanges(before, after);
  }

  /**
   * Forgets a window that said goodbye, and everything it held with it.
   * @param {string} from The window.
   */
  #forgetPeer(from: string): void
  {
    const before = this.#peers.get(from)?.holding ?? new Map<DocumentKey, string>();
    this.#peers.delete(from);
    this.#announceHoldingChanges(before, new Map());
  }

  /**
   * Tells whoever listens which documents one window holds otherwise than before: taken up, let go of, or at another
   * head. A heartbeat repeating what it held says nothing.
   * @param {ReadonlyMap<DocumentKey, string>} before What it held, at which heads.
   * @param {ReadonlyMap<DocumentKey, string>} after What it holds now.
   */
  #announceHoldingChanges(before: ReadonlyMap<DocumentKey, string>, after: ReadonlyMap<DocumentKey, string>): void
  {
    const keys = new Set([ ...before.keys(), ...after.keys() ]);
    keys.forEach(key =>
    {
      if (before.get(key) !== after.get(key))
      {
        [ ...this.#holdingListeners ].forEach(listener => listener(key));
      }
    });
  }

  /**
   * Ends a wait for a holder, once.
   * @param {HolderWait} wait The wait.
   */
  #settleWait(wait: HolderWait): void
  {
    if (this.#holderWaits.delete(wait))
    {
      wait.resolve();
    }
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
   * Settles the request a snapshot answers, ignoring later answers to the same request.
   * @param {Extract<SyncMessage, { type: 'snapshot' }>} message The answer.
   */
  #receiveSnapshot(message: Extract<SyncMessage, { type: 'snapshot' }>): void
  {
    const pending = message.to === this.clientId
      ? this.#pending.get(message.requestId)
      : undefined;
    if (pending === undefined)
    {
      return;
    }

    clearTimeout(pending.timer);
    this.#pending.delete(message.requestId);
    pending.resolve(message.snapshot);
  }

  /**
   * Handles another window's copy handed to this one. The person's choice, sent to a window holding the
   * conflict it settles, is taken outright; anything else is reconciled by lineage.
   * @param {Extract<SyncMessage, { type: 'offer' }>} message The offer.
   */
  #receiveOffer(message: Extract<SyncMessage, { type: 'offer' }>): void
  {
    const key = message.snapshot.document;
    if (message.to !== this.clientId || this.#hub.has(key) === false)
    {
      return;
    }

    if (message.resolution && this.#hub.conflict(key)?.kind === 'window')
    {
      if (this.#adopt(message.snapshot))
      {
        this.#hub.clearConflict(key);
      }

      return;
    }

    this.#reconcile(key, message.from, message.snapshot, 'offer');
  }

  /**
   * Lists the windows heard from within the liveness window.
   * @returns {[ string, PeerRecord ][]} Their ids and records.
   */
  #livePeers(): [ string, PeerRecord ][]
  {
    const cutoff = this.#now() - this.#livenessMs;
    return [ ...this.#peers.entries() ].filter(([ , peer ]) => peer.lastSeen >= cutoff);
  }

  /**
   * Lists the documents this window holds, each at its head.
   * @returns {HeldDocument[]} The documents.
   */
  #holding(): HeldDocument[]
  {
    return this.#hub.documentKeys().map(document => ({ document, head: this.#hub.head(document) as string }));
  }

  /**
   * Tells every window what this one holds, and at which heads.
   */
  #announcePresence(): void
  {
    this.#post({ type: 'presence', from: this.clientId, holding: this.#holding() });
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

export { operationFor, SyncPeer };
export type { SyncPeerOptions };
