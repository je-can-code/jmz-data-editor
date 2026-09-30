import type {
  ChannelMessageListener,
  MessageChannelLike,
} from '../../../src/core/infrastructure/messaging/MessageChannelLike.ts';
import type { EventSourceLike, StreamEvent } from '../../../src/mapEditor/core/sync/FileChangeFeed.ts';
import type { LockManagerLike } from '../../../src/mapEditor/core/sync/SharedFileChangeFeed.ts';

/**
 * A stand-in for BroadcastChannel across windows: channels opened with the same name hear each other's messages,
 * never their own, structured-cloned, in the order each was posted. Delivery waits for {@link flush}, so a test
 * decides exactly when windows hear each other.
 */
class MemoryChannelNetwork
{
  #channels = new Map<string, Set<MemoryChannel>>();

  #queue: (() => void)[] = [];

  /**
   * Opens a channel, as one window would.
   * @param {string} name The channel name.
   * @returns {MemoryChannel} The channel.
   */
  open(name: string): MemoryChannel
  {
    const channel = new MemoryChannel(this, name);
    const members = this.#channels.get(name) ?? new Set<MemoryChannel>();
    members.add(channel);
    this.#channels.set(name, members);
    return channel;
  }

  /**
   * Queues a message for every other open channel of the same name.
   * @param {MemoryChannel} sender The posting channel.
   * @param {unknown} message The message.
   */
  post(sender: MemoryChannel, message: unknown): void
  {
    const copy = structuredClone(message);
    const members = [ ...this.#channels.get(sender.name) ?? [] ].filter(member => member !== sender);
    members.forEach(member => this.#queue.push(() => member.deliver(copy)));
  }

  /**
   * Removes a closed channel.
   * @param {MemoryChannel} channel The channel.
   */
  remove(channel: MemoryChannel): void
  {
    this.#channels.get(channel.name)?.delete(channel);
  }

  /**
   * Delivers every queued message, including the ones handlers post while it runs.
   * @returns {number} How many messages were delivered.
   */
  flush(): number
  {
    let delivered = 0;
    while (this.#queue.length > 0)
    {
      const next = this.#queue.shift() as () => void;
      next();
      delivered += 1;
    }

    return delivered;
  }
}

/**
 * One window's end of a {@link MemoryChannelNetwork} channel.
 */
class MemoryChannel implements MessageChannelLike
{
  readonly name: string;

  readonly sent: unknown[] = [];

  #network: MemoryChannelNetwork;

  #listeners = new Set<ChannelMessageListener>();

  #closed = false;

  /**
   * @param {MemoryChannelNetwork} network The network.
   * @param {string} name The channel name.
   */
  constructor(network: MemoryChannelNetwork, name: string)
  {
    this.#network = network;
    this.name = name;
  }

  /**
   * Whether the channel was closed.
   * @returns {boolean} True once closed.
   */
  get closed(): boolean
  {
    return this.#closed;
  }

  postMessage(message: unknown): void
  {
    if (this.#closed)
    {
      throw new Error(`${this.name} is closed`);
    }

    this.sent.push(message);
    this.#network.post(this, message);
  }

  addEventListener(_type: 'message', listener: ChannelMessageListener): void
  {
    this.#listeners.add(listener);
  }

  removeEventListener(_type: 'message', listener: ChannelMessageListener): void
  {
    this.#listeners.delete(listener);
  }

  close(): void
  {
    this.#closed = true;
    this.#network.remove(this);
  }

  /**
   * Hands a message to this end's listeners.
   * @param {unknown} data The message.
   */
  deliver(data: unknown): void
  {
    if (this.#closed === false)
    {
      [ ...this.#listeners ].forEach(listener => listener({ data }));
    }
  }
}

/**
 * A stand-in for EventSource that a test drives by hand.
 */
class FakeEventSource implements EventSourceLike
{
  readonly url: string;

  closed = false;

  #listeners = new Map<string, ((event: StreamEvent) => void)[]>();

  /**
   * @param {string} url The stream's address.
   */
  constructor(url: string)
  {
    this.url = url;
  }

  addEventListener(type: string, listener: (event: StreamEvent) => void): void
  {
    this.#listeners.set(type, [ ...this.#listeners.get(type) ?? [], listener ]);
  }

  close(): void
  {
    this.closed = true;
  }

  /**
   * Fires an event, as the server or the browser would.
   * @param {string} type The event name.
   * @param {unknown} data The event's data, if any.
   */
  emit(type: string, data?: unknown): void
  {
    (this.#listeners.get(type) ?? []).forEach(listener => listener({ data }));
  }

  /**
   * Sends one change event with the contract's JSON.
   * @param {object} change The change.
   */
  emitChange(change: { path: string; kind: string; client: string }): void
  {
    this.emit('change', JSON.stringify(change));
  }
}

/**
 * A stand-in for the Web Locks API: one exclusive holder per lock name, the next waiter granted when it lets go.
 */
class FakeLockManager implements LockManagerLike
{
  #held = new Set<string>();

  #waiting = new Map<string, (() => void)[]>();

  request(name: string, callback: () => Promise<unknown>): Promise<unknown>
  {
    return new Promise(resolve =>
    {
      const grant = () =>
      {
        this.#held.add(name);
        callback().finally(() =>
        {
          this.#held.delete(name);
          resolve(undefined);
          const next = this.#waiting.get(name)?.shift();
          next?.();
        });
      };

      if (this.#held.has(name))
      {
        this.#waiting.set(name, [ ...this.#waiting.get(name) ?? [], grant ]);
        return;
      }

      grant();
    });
  }
}

/**
 * One request a stubbed fetch received.
 */
type RecordedRequest = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
};

/**
 * Builds a fetch that answers from a function and records every request.
 * @param {(request: RecordedRequest) => Response} answer Builds each response.
 * @returns {{ fetch: typeof fetch, requests: RecordedRequest[] }} The fetch and its record.
 */
const stubFetch = (answer: (request: RecordedRequest) => Response) =>
{
  const requests: RecordedRequest[] = [];
  const fetchStub = (async (input: RequestInfo | URL, init?: RequestInit) =>
  {
    const request: RecordedRequest = {
      url: String(input),
      method: init?.method ?? 'GET',
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: typeof init?.body === 'string'
        ? init.body
        : null,
    };
    requests.push(request);
    return answer(request);
  }) as typeof fetch;

  return { fetch: fetchStub, requests };
};

/**
 * Builds a JSON response in the server's envelope.
 * @param {unknown} data The document.
 * @param {number} status The status.
 * @returns {Response} The response.
 */
const envelope = (data: unknown, status = 200): Response =>
{
  return new Response(JSON.stringify({ path: '/project', data }), { status, headers: { 'Content-Type': 'application/json' } });
};

export { envelope, FakeEventSource, FakeLockManager, MemoryChannel, MemoryChannelNetwork, stubFetch };
export type { RecordedRequest };
