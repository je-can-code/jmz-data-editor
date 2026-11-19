import { CHANNEL_NAMES, openBroadcastChannel, type ChannelMessageEvent, type MessageChannelLike } from '../messaging/MessageChannelLike.ts';

/**
 * What a page asks the NW.js shell on the shell channel. The shell ({@code nw-app/main.js}) listens through a
 * hidden window on the UI's origin: {@code hello} asks whether it is there, {@code open} asks it to open a URL
 * of that origin as a real window in its own renderer process, or to focus the window already showing it,
 * {@code clipboard-read} asks it for the system clipboard's text, which a page under NW.js cannot read itself: only
 * when the clipboard is the kind the marker names, and answered on the reply channel {@code replyTo} names; and
 * {@code play} asks it to start the open project's game in test mode, answered the same way.
 */
type ShellRequest =
  | { readonly type: 'hello' }
  | { readonly type: 'open'; readonly url: string; readonly width?: number; readonly height?: number }
  | { readonly type: 'clipboard-read'; readonly marker: string; readonly replyTo: string }
  | { readonly type: 'play'; readonly replyTo: string };

/**
 * What the shell announces on the shell channel: that it is listening, which it says when it starts and in answer to
 * every hello. Every window hears the shell channel, so nothing read off the clipboard is ever said there.
 */
type ShellAnnouncement = { readonly type: 'shell-ready' };

/**
 * The shell's answer to a clipboard read, on the read's own reply channel: the clipboard's text when it carries the
 * marker asked for, and an empty string when the clipboard holds anything else.
 */
type ClipboardAnswer = { readonly type: 'clipboard-text'; readonly text: string };

/**
 * What became of a Play: the game started; the project's game was already running, so nothing new started; the
 * project's folder holds no game; the game did not start; or there was no NW.js shell to start it, or none that
 * answered in time.
 */
type PlayResult = 'started' | 'already-running' | 'not-a-game' | 'failed' | 'unavailable';

/**
 * The shell's answer to a play request, on the request's own reply channel: what became of the game. The shell never
 * answers unavailable; only a page with no shell to answer it says that.
 */
type PlayAnswer = { readonly type: 'play-result'; readonly result: PlayResult };

/**
 * One window a page asks for.
 */
type WindowRequest = {
  /**
   * The page, from the origin's root: {@code /map.html}, {@code /map.html?view=event&map=12&event=5}.
   */
  readonly path: string;

  /**
   * A stable name for the window, which a plain browser uses to find it again instead of opening another.
   */
  readonly name: string;

  /**
   * A size for a new window, in pixels.
   */
  readonly width?: number;
  readonly height?: number;
};

/**
 * What became of a request: handed to the NW.js shell, opened or focused by the browser, or refused by its
 * popup blocker.
 */
type WindowOpenResult = 'relayed' | 'opened' | 'focused' | 'blocked';

/**
 * Opens a browser window: {@code window.open}, or a stand-in.
 */
type OpenBrowserWindow = (url: string, name: string, features: string) => Window | null;

/**
 * Options for a window shell.
 */
type WindowShellOptions = {
  /**
   * The shell channel, or null where there is none.
   */
  readonly channel: MessageChannelLike | null;

  /**
   * The page's origin; every window opens on it, since windows on another origin share no channels.
   */
  readonly origin: string;

  /**
   * Opens a window when no shell is listening.
   */
  readonly openWindow: OpenBrowserWindow;

  /**
   * Reads the clipboard's text when no shell is listening: the browser's own read, which may ask the person first.
   * Left out, a page with no shell has no way to read it.
   */
  readonly readClipboardText?: () => Promise<string>;

  /**
   * Opens a channel by name, for a clipboard read's own reply channel. Left out, no read goes through the shell.
   */
  readonly openChannel?: (name: string) => MessageChannelLike | null;
};

/**
 * What every clipboard reply channel's name starts with; a random UUID follows, so no other window knows it, and the
 * shell answers on no channel named any other way.
 */
const CLIPBOARD_REPLY_PREFIX = 'jmz-clipboard-';

/**
 * How long a read waits for the NW.js shell, which answers at once: long enough for a busy moment, short enough that a
 * shell gone away is never waited on for long.
 */
const SHELL_READ_TIMEOUT_MS = 2_000;

/**
 * How long a read waits for the browser's own read, which may first ask the person for leave to read the clipboard.
 */
const BROWSER_READ_TIMEOUT_MS = 30_000;

/**
 * What every play reply channel's name starts with; a random UUID follows, as on a clipboard read's, and the shell
 * answers a play request on no channel named any other way.
 */
const PLAY_REPLY_PREFIX = 'jmz-play-';

/**
 * How long a Play waits for the NW.js shell, which first asks the API which project is open, then watches the new game
 * for a second to see that it stays: far longer than a clipboard read's wait, which would give up on every launch.
 */
const PLAY_TIMEOUT_MS = 5_000;

/**
 * What the shell answers a play request with. Unavailable is not among them: only the page says that.
 */
const SHELL_PLAY_RESULTS: ReadonlySet<unknown> = new Set<PlayResult>([ 'started', 'already-running', 'not-a-game', 'failed' ]);

/**
 * Waits for something that may never settle, for so long and no longer.
 * @param {Promise<T>} awaited What is waited for.
 * @param {number} milliseconds How long to wait.
 * @param {T} fallback What to settle on when the time runs out first.
 * @returns {Promise<T>} What it gave, or the fallback when the time ran out first.
 */
const waitWithin = <T>(awaited: Promise<T>, milliseconds: number, fallback: T): Promise<T> =>
{
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>(resolve =>
  {
    timer = setTimeout(() => resolve(fallback), milliseconds);
  });

  return Promise.race([ awaited, timeout ]).finally(() => clearTimeout(timer));
};

/**
 * Reads the clipboard's text out of a message heard on a clipboard read's reply channel.
 * @param {unknown} data The message.
 * @returns {string | undefined} The text, or undefined for a message that is not the shell's answer.
 */
const clipboardTextOf = (data: unknown): string | undefined =>
{
  const answer = data as Partial<ClipboardAnswer> | null;
  return answer !== null && typeof answer === 'object' && answer.type === 'clipboard-text' && typeof answer.text === 'string'
    ? answer.text
    : undefined;
};

/**
 * Reads what became of a Play out of a message heard on its reply channel.
 * @param {unknown} data The message.
 * @returns {PlayResult | undefined} The result, or undefined for a message that is not the shell's answer.
 */
const playResultOf = (data: unknown): PlayResult | undefined =>
{
  const answer = data as Partial<PlayAnswer> | null;
  return answer !== null && typeof answer === 'object' && answer.type === 'play-result' && SHELL_PLAY_RESULTS.has(answer.result)
    ? answer.result
    : undefined;
};

/**
 * The data editor's page.
 */
const DATA_EDITOR_PATH = '/';

/**
 * The map editor's page.
 */
const MAP_EDITOR_PATH = '/map.html';

/**
 * How a page opens other windows. Under NW.js a page cannot reach {@code nw}, so it asks the shell over the shell
 * channel, and the shell opens each window in its own renderer process, so a busy window never stalls another. In
 * a plain browser nothing hears the channel, and the page opens the window itself.
 *
 * Which of the two happens must be known the instant a button is clicked, because a browser only lets a page open
 * a window from inside the click; so the page asks {@code hello} as soon as it starts, and the shell's answer
 * arrives long before any click.
 */
class WindowShell
{
  #channel: MessageChannelLike | null;

  #origin: string;

  #openWindow: OpenBrowserWindow;

  #readClipboardText: (() => Promise<string>) | null;

  #openChannel: ((name: string) => MessageChannelLike | null) | null;

  #relayed = false;

  /**
   * Whoever follows whether the shell has answered, told once, when it does.
   */
  #relayListeners = new Set<() => void>();

  #listener = (event: ChannelMessageEvent) =>
  {
    const data = event.data as Partial<ShellAnnouncement> | null;
    if (data !== null && typeof data === 'object' && data.type === 'shell-ready' && this.#relayed === false)
    {
      this.#relayed = true;
      [ ...this.#relayListeners ].forEach(listener => listener());
    }
  };

  /**
   * @param {WindowShellOptions} options The channel, the origin, the browser's window opener, its clipboard read, and
   * how to open a read's reply channel.
   */
  constructor(options: WindowShellOptions)
  {
    this.#channel = options.channel;
    this.#origin = options.origin;
    this.#openWindow = options.openWindow;
    this.#readClipboardText = options.readClipboardText ?? null;
    this.#openChannel = options.openChannel ?? null;

    this.#channel?.addEventListener('message', this.#listener);
    this.#post({ type: 'hello' });
  }

  /**
   * Whether the NW.js shell answered, so windows open through it.
   * @returns {boolean} True under the NW.js shell.
   */
  get isRelayed(): boolean
  {
    return this.#relayed;
  }

  /**
   * Listens for the NW.js shell's answer, for a view that shows only under the shell: the page may well draw before the
   * answer is in, and the view must appear once it is.
   * @param {() => void} listener Called once, when the shell answers.
   * @returns {() => void} Stops listening.
   */
  subscribe = (listener: () => void): (() => void) =>
  {
    this.#relayListeners.add(listener);
    return () =>
    {
      this.#relayListeners.delete(listener);
    };
  };

  /**
   * Opens a window, or focuses the one already showing the page.
   * @param {WindowRequest} request The window.
   * @returns {WindowOpenResult} What became of it.
   */
  open(request: WindowRequest): WindowOpenResult
  {
    const url = new URL(request.path, this.#origin).href;
    if (this.#relayed)
    {
      this.#post({ type: 'open', url, width: request.width, height: request.height });
      return 'relayed';
    }

    return this.#openInBrowser(url, request);
  }

  /**
   * Reads one of the app's own clipboards off the system clipboard, for a paste that has no clipboard event to carry
   * it, such as one chosen from a menu. Under the NW.js shell the shell reads it: Chromium asks the person before a
   * page reads the clipboard, and NW.js has nowhere to ask, so a page's own read would wait forever. The shell hands
   * the text over only when it carries the marker asked for, and only on a reply channel this read opens under a
   * random name, so nothing else on the clipboard reaches any page and no other window hears it. Without the shell the
   * page reads the clipboard itself, whatever it holds, and the browser may ask the person first.
   * @param {string} marker The marker the wanted clipboard carries, such as {@code jmz-map-editor/events}.
   * @returns {Promise<string | null>} The text (empty when the shell found another kind of clipboard), or null when it
   * could not be read in time or at all.
   */
  readClipboard(marker: string): Promise<string | null>
  {
    if (this.#relayed && this.#channel !== null)
    {
      return this.#readThroughShell(marker);
    }

    const read = this.#readClipboardText;
    return read === null
      ? Promise.resolve(null)
      : waitWithin(read().catch(() => null), BROWSER_READ_TIMEOUT_MS, null);
  }

  /**
   * Plays the open project: the NW.js shell starts its game in test mode, on the NW.js the shell runs on itself, and
   * says what became of it on a reply channel this Play opens under a random name, as a clipboard read's answer comes.
   * The shell answers within a few seconds, having asked the API which project is open and watched the new game for a
   * moment to see that it stays. Nothing in a page can start a game by itself, so without the shell there is no Play.
   * @returns {Promise<PlayResult>} What became of it; unavailable at once without the shell, and when the shell does not
   * answer in time.
   */
  play(): Promise<PlayResult>
  {
    if (this.#relayed === false || this.#channel === null)
    {
      return Promise.resolve('unavailable');
    }

    return this.#askShell<PlayResult>(PLAY_REPLY_PREFIX, replyTo => ({ type: 'play', replyTo }), playResultOf, PLAY_TIMEOUT_MS, 'unavailable');
  }

  /**
   * Stops listening for the shell.
   */
  close(): void
  {
    this.#channel?.removeEventListener('message', this.#listener);
    this.#channel?.close();
    this.#channel = null;
  }

  /**
   * Asks the NW.js shell for a clipboard, on a reply channel of this read's own.
   * @param {string} marker The marker the wanted clipboard carries.
   * @returns {Promise<string | null>} The shell's answer, or null when it did not come in time.
   */
  #readThroughShell(marker: string): Promise<string | null>
  {
    return this.#askShell<string | null>(
      CLIPBOARD_REPLY_PREFIX,
      replyTo => ({ type: 'clipboard-read', marker, replyTo }),
      clipboardTextOf,
      SHELL_READ_TIMEOUT_MS,
      null,
    );
  }

  /**
   * Asks the NW.js shell something whose answer only this window may hear, on a reply channel of the ask's own: named by
   * a fixed prefix and a random UUID, which no other window knows, opened before the request goes out, so the answer
   * cannot arrive before anyone listens, and closed once the ask is over, answered or not. Only an answer heard on that
   * channel counts; anything else heard there is passed over, and the ask waits on.
   * @param {string} prefix What the reply channel's name starts with, which the shell checks.
   * @param {(replyTo: string) => ShellRequest} request Builds the request, naming the reply channel.
   * @param {(data: unknown) => T | undefined} answerOf Reads the answer out of a message, or undefined for one that is not.
   * @param {number} milliseconds How long to wait for the answer.
   * @param {T} unanswered What the ask comes to with no answer in time, or no reply channel to hear one on.
   * @returns {Promise<T>} The answer, or the unanswered value.
   */
  #askShell<T>(
    prefix: string,
    request: (replyTo: string) => ShellRequest,
    answerOf: (data: unknown) => T | undefined,
    milliseconds: number,
    unanswered: T,
  ): Promise<T>
  {
    const replyTo = `${prefix}${crypto.randomUUID()}`;
    const reply = this.#openChannel?.(replyTo) ?? null;
    if (reply === null)
    {
      return Promise.resolve(unanswered);
    }

    const answered = new Promise<T>(resolve =>
    {
      reply.addEventListener('message', event =>
      {
        const answer = answerOf(event.data);
        if (answer !== undefined)
        {
          resolve(answer);
        }
      });
    });
    this.#post(request(replyTo));
    return waitWithin(answered, milliseconds, unanswered).finally(() => reply.close());
  }

  /**
   * Opens a window with the browser, reusing the named window when it already shows a page, so a second click
   * focuses it rather than reloading it and losing what it holds.
   * @param {string} url The page.
   * @param {WindowRequest} request The request, for its name and size.
   * @returns {WindowOpenResult} What became of it.
   */
  #openInBrowser(url: string, request: WindowRequest): WindowOpenResult
  {
    const features = request.width !== undefined && request.height !== undefined
      ? `popup,width=${request.width},height=${request.height}`
      : '';
    const target = this.#openWindow('', request.name, features);
    if (target === null)
    {
      return 'blocked';
    }

    // a named window that already shows a page is the one to bring forward.
    if (target.location.href !== 'about:blank')
    {
      target.focus();
      return 'focused';
    }

    target.location.href = url;
    return 'opened';
  }

  /**
   * Posts on the shell channel, when there is one.
   * @param {ShellRequest} request The message.
   */
  #post(request: ShellRequest): void
  {
    this.#channel?.postMessage(request);
  }
}

/**
 * Opens the map editor, or brings it forward.
 * @param {WindowShell} shell The page's window shell.
 * @returns {WindowOpenResult} What became of it.
 */
const openMapEditor = (shell: WindowShell): WindowOpenResult =>
{
  return shell.open({ path: MAP_EDITOR_PATH, name: 'jmz-map-editor', width: 1600, height: 1000 });
};

/**
 * Opens the data editor, or brings it forward.
 * @param {WindowShell} shell The page's window shell.
 * @returns {WindowOpenResult} What became of it.
 */
const openDataEditor = (shell: WindowShell): WindowOpenResult =>
{
  return shell.open({ path: DATA_EDITOR_PATH, name: 'jmz-data-editor', width: 1600, height: 1000 });
};

/**
 * The page's own window shell, made on first use. A page calls this as it starts, so the shell's answer is in
 * before anyone can click anything.
 */
let sharedShell: WindowShell | null = null;

/**
 * Finds or makes the page's window shell, over the real shell channel and {@code window.open}.
 * @returns {WindowShell} The shell.
 */
const pageWindowShell = (): WindowShell =>
{
  sharedShell ??= new WindowShell({
    channel: openBroadcastChannel(CHANNEL_NAMES.shell),
    origin: window.location.origin,
    openWindow: (url, name, features) => window.open(url, name, features),
    readClipboardText: () => navigator.clipboard.readText(),
    openChannel: openBroadcastChannel,
  });

  return sharedShell;
};

export {
  CLIPBOARD_REPLY_PREFIX,
  DATA_EDITOR_PATH,
  MAP_EDITOR_PATH,
  openDataEditor,
  openMapEditor,
  pageWindowShell,
  PLAY_REPLY_PREFIX,
  WindowShell,
};
export type {
  ClipboardAnswer,
  OpenBrowserWindow,
  PlayAnswer,
  PlayResult,
  ShellAnnouncement,
  ShellRequest,
  WindowOpenResult,
  WindowRequest,
  WindowShellOptions,
};
