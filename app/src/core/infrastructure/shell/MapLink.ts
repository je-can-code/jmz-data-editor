import { CHANNEL_NAMES, openBroadcastChannel, type ChannelMessageEvent, type MessageChannelLike } from '../messaging/MessageChannelLike.ts';
import { openMapEditor, pageWindowShell } from './WindowShell.ts';

/**
 * What the data editor and the map editor's workspace say to each other on the shell channel, beside the NW.js
 * shell's own messages. The shell ignores these, as each side ignores the shell's.
 *
 * - {@code open-map}: the data editor asks the workspace to show a map, and to select one of its events.
 * - {@code open-map-done}: the workspace has done it; the request is settled.
 * - {@code workspace-ready}: a workspace has started listening, so any request still waiting can be asked again.
 */
type MapLinkMessage =
  | { readonly type: 'open-map'; readonly requestId: string; readonly mapId: number; readonly eventId: number | null }
  | { readonly type: 'open-map-done'; readonly requestId: string }
  | { readonly type: 'workspace-ready' };

/**
 * Schedules a callback; {@code setTimeout} in the page, a stand-in in tests.
 */
type SetTimer = (callback: () => void, milliseconds: number) => unknown;

/**
 * Cancels a scheduled callback.
 */
type ClearTimer = (handle: unknown) => void;

/**
 * How long a request waits for a workspace to show it before it is dropped: time enough for a workspace window to
 * open and start, and short enough that a workspace opened much later never jumps to a map nobody asked for then.
 */
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Reads a positive whole number, or null.
 * @param {unknown} value The value.
 * @returns {boolean} True for a positive integer.
 */
const isId = (value: unknown): value is number =>
{
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
};

/**
 * Reads a message off the shell channel, refusing anything that is not one of the link's.
 * @param {unknown} data The message.
 * @returns {MapLinkMessage | null} The message, or null for anything else.
 */
const asMapLinkMessage = (data: unknown): MapLinkMessage | null =>
{
  if (typeof data !== 'object' || data === null)
  {
    return null;
  }

  const message = data as Record<string, unknown>;
  switch (message['type'])
  {
    case 'open-map':
    {
      const { requestId, mapId, eventId } = message;
      const validEvent = eventId === null || isId(eventId);
      return typeof requestId === 'string' && isId(mapId) && validEvent
        ? { type: 'open-map', requestId, mapId, eventId: eventId as number | null }
        : null;
    }
    case 'open-map-done':
      return typeof message['requestId'] === 'string'
        ? { type: 'open-map-done', requestId: message['requestId'] }
        : null;
    case 'workspace-ready':
      return { type: 'workspace-ready' };
    default:
      return null;
  }
};

/**
 * Options for the data editor's end of the link.
 */
type MapLinkClientOptions = {
  /**
   * The shell channel, or null where there is none; the workspace is then only brought forward.
   */
  readonly channel: MessageChannelLike | null;

  /**
   * Opens the map editor's workspace, or brings it forward. Called inside the click, since a browser only lets a
   * page open a window from there.
   */
  readonly openWorkspace: () => void;

  /**
   * Makes a request's id.
   */
  readonly createId: () => string;

  /**
   * The timer functions.
   */
  readonly setTimer?: SetTimer;
  readonly clearTimer?: ClearTimer;
};

/**
 * The data editor's end of the link: asks the map editor to show a map, with one of its events selected, as the
 * Enemies board's "Where it appears" rows do. The workspace window is opened or brought forward at once; the
 * request goes out on the shell channel straight away, for a workspace already open, and again whenever a
 * workspace announces it has started, for one still opening. It stands until a workspace says it is done, a newer
 * request replaces it, or it times out.
 */
class MapLinkClient
{
  #channel: MessageChannelLike | null;

  #openWorkspace: () => void;

  #createId: () => string;

  #setTimer: SetTimer;

  #clearTimer: ClearTimer;

  #pending: { message: Extract<MapLinkMessage, { type: 'open-map' }>; timer: unknown } | null = null;

  #listener = (event: ChannelMessageEvent) => this.#receive(event.data);

  /**
   * @param {MapLinkClientOptions} options The channel, the way to open the workspace, and the timing.
   */
  constructor(options: MapLinkClientOptions)
  {
    this.#channel = options.channel;
    this.#openWorkspace = options.openWorkspace;
    this.#createId = options.createId;
    this.#setTimer = options.setTimer ?? ((callback, milliseconds) => setTimeout(callback, milliseconds));
    this.#clearTimer = options.clearTimer ?? (handle => clearTimeout(handle as ReturnType<typeof setTimeout>));
    this.#channel?.addEventListener('message', this.#listener);
  }

  /**
   * Whether a request is still waiting for a workspace to show it.
   * @returns {boolean} True while one waits.
   */
  get isWaiting(): boolean
  {
    return this.#pending !== null;
  }

  /**
   * Asks the map editor to show a map, and to select one of its events.
   * @param {number} mapId The map.
   * @param {number | null} eventId The event to select, or null for none.
   */
  openMap(mapId: number, eventId: number | null): void
  {
    this.#settle();
    if (this.#channel !== null)
    {
      const message = { type: 'open-map' as const, requestId: this.#createId(), mapId, eventId };
      const timer = this.#setTimer(() => this.#settle(), REQUEST_TIMEOUT_MS);
      this.#pending = { message, timer };
      this.#channel.postMessage(message);
    }

    this.#openWorkspace();
  }

  /**
   * Stops listening and drops any waiting request.
   */
  close(): void
  {
    this.#settle();
    this.#channel?.removeEventListener('message', this.#listener);
    this.#channel?.close();
    this.#channel = null;
  }

  /**
   * Hears the workspace: a request done, or a workspace ready to be asked again.
   * @param {unknown} data The message.
   */
  #receive(data: unknown): void
  {
    const message = asMapLinkMessage(data);
    if (message === null || this.#pending === null)
    {
      return;
    }

    if (message.type === 'open-map-done' && message.requestId === this.#pending.message.requestId)
    {
      this.#settle();
      return;
    }

    if (message.type === 'workspace-ready')
    {
      this.#channel?.postMessage(this.#pending.message);
    }
  }

  /**
   * Drops the waiting request.
   */
  #settle(): void
  {
    if (this.#pending !== null)
    {
      this.#clearTimer(this.#pending.timer);
      this.#pending = null;
    }
  }
}

/**
 * The workspace's end of the link: announces itself when it starts, and shows each map it is asked for once, telling
 * the data editor it is done.
 */
class MapLinkHost
{
  #channel: MessageChannelLike;

  #onOpenMap: (mapId: number, eventId: number | null) => void;

  #handled = new Set<string>();

  #listener = (event: ChannelMessageEvent) => this.#receive(event.data);

  /**
   * @param {MessageChannelLike} channel The shell channel.
   * @param {(mapId: number, eventId: number | null) => void} onOpenMap Shows a map, selecting an event when one is named.
   */
  constructor(channel: MessageChannelLike, onOpenMap: (mapId: number, eventId: number | null) => void)
  {
    this.#channel = channel;
    this.#onOpenMap = onOpenMap;
  }

  /**
   * Starts listening, and says so, so a request made while this workspace was opening is asked again.
   */
  start(): void
  {
    this.#channel.addEventListener('message', this.#listener);
    this.#channel.postMessage({ type: 'workspace-ready' } satisfies MapLinkMessage);
  }

  /**
   * Stops listening.
   */
  stop(): void
  {
    this.#channel.removeEventListener('message', this.#listener);
  }

  /**
   * Shows a requested map, once per request however often it is asked.
   * @param {unknown} data The message.
   */
  #receive(data: unknown): void
  {
    const message = asMapLinkMessage(data);
    if (message === null || message.type !== 'open-map')
    {
      return;
    }

    if (this.#handled.has(message.requestId) === false)
    {
      this.#handled.add(message.requestId);
      this.#onOpenMap(message.mapId, message.eventId);
    }

    this.#channel.postMessage({ type: 'open-map-done', requestId: message.requestId } satisfies MapLinkMessage);
  }
}

/**
 * The page's own link client, made on first use.
 */
let sharedClient: MapLinkClient | null = null;

/**
 * Finds or makes the page's link client, over the real shell channel.
 * @returns {MapLinkClient} The client.
 */
const pageMapLink = (): MapLinkClient =>
{
  sharedClient ??= new MapLinkClient({
    channel: openBroadcastChannel(CHANNEL_NAMES.shell),
    openWorkspace: () =>
    {
      openMapEditor(pageWindowShell());
    },
    createId: () => crypto.randomUUID(),
  });

  return sharedClient;
};

export { asMapLinkMessage, MapLinkClient, MapLinkHost, pageMapLink, REQUEST_TIMEOUT_MS };
export type { MapLinkClientOptions, MapLinkMessage };
