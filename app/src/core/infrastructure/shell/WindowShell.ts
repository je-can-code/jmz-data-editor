import { CHANNEL_NAMES, openBroadcastChannel, type ChannelMessageEvent, type MessageChannelLike } from '../messaging/MessageChannelLike.ts';

/**
 * What a page asks the NW.js shell on the shell channel. The shell ({@code nw-app/main.js}) listens through a
 * hidden window on the UI's origin: {@code hello} asks whether it is there, {@code open} asks it to open a URL
 * of that origin as a real window in its own renderer process, or to focus the window already showing it, and
 * {@code clipboard-read} asks it for the system clipboard's text, which a page under NW.js cannot read itself: only
 * when the clipboard is the kind the marker names, and answered on the reply channel {@code replyTo} names.
 */
type ShellRequest =
  | { readonly type: 'hello' }
  | { readonly type: 'open'; readonly url: string; readonly width?: number; readonly height?: number }
  | { readonly type: 'clipboard-read'; readonly marker: string; readonly replyTo: string };

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
 * Waits for a read that may never settle, for so long and no longer.
 * @param {Promise<string | null>} read The read.
 * @param {number} milliseconds How long to wait.
 * @returns {Promise<string | null>} What the read gave, or null when the time ran out first.
 */
const readWithin = (read: Promise<string | null>, milliseconds: number): Promise<string | null> =>
{
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>(resolve =>
  {
    timer = setTimeout(() => resolve(null), milliseconds);
  });

  return Promise.race([ read, timeout ]).finally(() => clearTimeout(timer));
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

  #listener = (event: ChannelMessageEvent) =>
  {
    const data = event.data as Partial<ShellAnnouncement> | null;
    if (data !== null && typeof data === 'object' && data.type === 'shell-ready')
    {
      this.#relayed = true;
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
      : readWithin(read().catch(() => null), BROWSER_READ_TIMEOUT_MS);
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
   * Asks the NW.js shell for a clipboard, on a reply channel of this read's own: opened before the request goes out,
   * so the answer cannot arrive before anyone listens, and closed once the read is over, answered or not.
   * @param {string} marker The marker the wanted clipboard carries.
   * @returns {Promise<string | null>} The shell's answer, or null when it did not come in time.
   */
  #readThroughShell(marker: string): Promise<string | null>
  {
    const replyTo = `${CLIPBOARD_REPLY_PREFIX}${crypto.randomUUID()}`;
    const reply = this.#openChannel?.(replyTo) ?? null;
    if (reply === null)
    {
      return Promise.resolve(null);
    }

    const answered = new Promise<string>(resolve =>
    {
      reply.addEventListener('message', event =>
      {
        const data = event.data as Partial<ClipboardAnswer> | null;
        if (data !== null && typeof data === 'object' && data.type === 'clipboard-text' && typeof data.text === 'string')
        {
          resolve(data.text);
        }
      });
    });
    this.#post({ type: 'clipboard-read', marker, replyTo });
    return readWithin(answered, SHELL_READ_TIMEOUT_MS).finally(() => reply.close());
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

export { CLIPBOARD_REPLY_PREFIX, DATA_EDITOR_PATH, MAP_EDITOR_PATH, openDataEditor, openMapEditor, pageWindowShell, WindowShell };
export type {
  ClipboardAnswer,
  OpenBrowserWindow,
  ShellAnnouncement,
  ShellRequest,
  WindowOpenResult,
  WindowRequest,
  WindowShellOptions,
};
