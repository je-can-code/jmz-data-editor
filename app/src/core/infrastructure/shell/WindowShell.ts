import { CHANNEL_NAMES, openBroadcastChannel, type ChannelMessageEvent, type MessageChannelLike } from '../messaging/MessageChannelLike.ts';

/**
 * What a page asks the NW.js shell on the shell channel. The shell ({@code nw-app/main.js}) listens through a
 * hidden window on the UI's origin: {@code hello} asks whether it is there, and {@code open} asks it to open a URL
 * of that origin as a real window in its own renderer process, or to focus the window already showing it.
 */
type ShellRequest =
  | { readonly type: 'hello' }
  | { readonly type: 'open'; readonly url: string; readonly width?: number; readonly height?: number };

/**
 * What the shell announces: that it is listening. It says so when it starts and in answer to every hello.
 */
type ShellAnnouncement = { readonly type: 'shell-ready' };

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
   * @param {WindowShellOptions} options The channel, the origin, and the browser's window opener.
   */
  constructor(options: WindowShellOptions)
  {
    this.#channel = options.channel;
    this.#origin = options.origin;
    this.#openWindow = options.openWindow;

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
   * Stops listening for the shell.
   */
  close(): void
  {
    this.#channel?.removeEventListener('message', this.#listener);
    this.#channel?.close();
    this.#channel = null;
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
  });

  return sharedShell;
};

export { DATA_EDITOR_PATH, MAP_EDITOR_PATH, openDataEditor, openMapEditor, pageWindowShell, WindowShell };
export type { OpenBrowserWindow, ShellAnnouncement, ShellRequest, WindowOpenResult, WindowRequest, WindowShellOptions };
