import { isJsonObject } from '../model/json.ts';

/**
 * What happened to a file: written over, newly created, or removed.
 */
type FileChangeKind = 'write' | 'create' | 'remove';

/**
 * One change the server announces. {@code path} is relative to the project root with forward slashes;
 * {@code client} is the id of the window whose save caused it, or empty when the change came from outside the
 * editor (MZ, a script, a text editor).
 */
type FileChange = {
  readonly path: string;
  readonly kind: FileChangeKind;
  readonly client: string;
};

/**
 * Hears file changes.
 */
type FileChangeListener = (change: FileChange) => void;

/**
 * Hears that the stream dropped and came back, so changes may have been missed in between.
 */
type ReconnectListener = () => void;

/**
 * An event as an EventSource delivers it.
 */
type StreamEvent = { readonly data?: unknown };

/**
 * The part of {@link EventSource} the feed uses, so tests can stand in for it.
 */
interface EventSourceLike
{
  /**
   * Listens for a named event: {@code change}, {@code open} or {@code error}.
   * @param {string} type The event name.
   * @param {(event: StreamEvent) => void} listener Called per event.
   */
  addEventListener(type: string, listener: (event: StreamEvent) => void): void;

  /**
   * Closes the stream for good.
   */
  close(): void;
}

/**
 * Opens a server-sent event stream.
 */
type EventSourceFactory = (url: string) => EventSourceLike;

/**
 * The change kinds the server sends.
 */
const FILE_CHANGE_KINDS: ReadonlySet<string> = new Set([ 'write', 'create', 'remove' ]);

/**
 * Reads one change event's data, refusing anything that is not the contract's shape.
 * @param {unknown} data The event's data: JSON text.
 * @returns {FileChange | null} The change, or null when the data is malformed.
 */
const parseFileChange = (data: unknown): FileChange | null =>
{
  if (typeof data !== 'string')
  {
    return null;
  }

  let parsed: unknown;
  try
  {
    parsed = JSON.parse(data);
  }
  catch
  {
    return null;
  }

  if (isJsonObject(parsed) === false)
  {
    return null;
  }

  const { path, kind, client } = parsed;
  if (typeof path !== 'string' || typeof kind !== 'string' || FILE_CHANGE_KINDS.has(kind) === false || typeof client !== 'string')
  {
    return null;
  }

  return { path, kind: kind as FileChangeKind, client };
};

/**
 * Opens a real EventSource.
 * @param {string} url The stream's address.
 * @returns {EventSourceLike} The stream.
 */
const openEventSource: EventSourceFactory = (url: string) =>
{
  return new EventSource(url);
};

/**
 * A client for the server's file-change stream, one connection. The browser reconnects a dropped stream on its
 * own; this reports each reconnection, because whatever changed while it was down was never announced.
 */
class FileChangeFeed
{
  #url: string;

  #createEventSource: EventSourceFactory;

  #source: EventSourceLike | null = null;

  #dropped = false;

  #changeListeners = new Set<FileChangeListener>();

  #reconnectListeners = new Set<ReconnectListener>();

  /**
   * @param {string} url The stream's address.
   * @param {EventSourceFactory} createEventSource Opens the stream; a real EventSource by default.
   */
  constructor(url: string, createEventSource: EventSourceFactory = openEventSource)
  {
    this.#url = url;
    this.#createEventSource = createEventSource;
  }

  /**
   * Whether the stream is open.
   * @returns {boolean} True between start and stop.
   */
  get isRunning(): boolean
  {
    return this.#source !== null;
  }

  /**
   * Opens the stream. Starting a running feed does nothing.
   */
  start(): void
  {
    if (this.#source !== null)
    {
      return;
    }

    const source = this.#createEventSource(this.#url);
    source.addEventListener('change', event => this.#receive(event));
    source.addEventListener('error', () =>
    {
      this.#dropped = true;
    });
    source.addEventListener('open', () =>
    {
      // only a return after a drop can have missed anything.
      if (this.#dropped)
      {
        this.#dropped = false;
        [ ...this.#reconnectListeners ].forEach(listener => listener());
      }
    });
    this.#source = source;
  }

  /**
   * Closes the stream.
   */
  stop(): void
  {
    this.#source?.close();
    this.#source = null;
    this.#dropped = false;
  }

  /**
   * Listens for changes.
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
   * Listens for reconnections.
   * @param {ReconnectListener} listener Called each time the stream returns after dropping.
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
   * Hands one change event to every listener, skipping malformed ones.
   * @param {StreamEvent} event The event.
   */
  #receive(event: StreamEvent): void
  {
    const change = parseFileChange(event.data);
    if (change === null)
    {
      return;
    }

    [ ...this.#changeListeners ].forEach(listener => listener(change));
  }
}

export { FileChangeFeed, openEventSource, parseFileChange };
export type {
  EventSourceFactory,
  EventSourceLike,
  FileChange,
  FileChangeKind,
  FileChangeListener,
  ReconnectListener,
  StreamEvent,
};
