import { describe, expect, it, vi } from 'vitest';
import {
  openDataEditor,
  openMapEditor,
  WindowShell,
  type OpenBrowserWindow,
} from '../../../../src/core/infrastructure/shell/WindowShell.ts';
import { MemoryChannelNetwork } from '../../../mapEditor/support/standIns.ts';

/*
 * A page opens other windows through the NW.js shell when it is there, and by itself when it is not. The shell
 * owes pages one thing above all: the choice between the two is already made when a button is clicked, since a
 * browser only lets a page open a window from inside the click. So the page asks "hello" as it starts, and the
 * shell's "shell-ready" settles it. Under the shell, a request goes out on the channel with an absolute URL on the
 * page's own origin; without it, the browser opens the window, and a second request for the same window brings
 * the open one forward instead of reloading it and losing what it holds.
 */
describe('WindowShell', () =>
{
  const ORIGIN = 'http://127.0.0.1:18150';

  /**
   * A browser window stand-in that remembers the windows it opened by name.
   * @returns {{ openWindow: OpenBrowserWindow, windows: Map<string, { location: { href: string }, focus: () => void }> }} The opener and its windows.
   */
  const buildBrowser = () =>
  {
    const windows = new Map<string, { location: { href: string }; focus: ReturnType<typeof vi.fn> }>();
    const openWindow: OpenBrowserWindow = (_url, name) =>
    {
      const existing = windows.get(name);
      if (existing !== undefined)
      {
        return existing as unknown as Window;
      }

      const created = { location: { href: 'about:blank' }, focus: vi.fn() };
      windows.set(name, created);
      return created as unknown as Window;
    };

    return { openWindow, windows };
  };

  /**
   * A page's shell and the NW.js shell's end of the channel.
   * @returns {object} The network, the page's shell, the relay's channel and the browser.
   */
  const buildShell = () =>
  {
    const network = new MemoryChannelNetwork();
    const relay = network.open('jmz-shell');
    const heard: unknown[] = [];
    relay.addEventListener('message', event => heard.push(event.data));
    const browser = buildBrowser();
    const replies: ReturnType<MemoryChannelNetwork['open']>[] = [];
    const openChannel = (name: string) =>
    {
      const channel = network.open(name);
      replies.push(channel);
      return channel;
    };
    const shell = new WindowShell({ channel: network.open('jmz-shell'), origin: ORIGIN, openWindow: browser.openWindow, openChannel });
    return { network, relay, heard, browser, shell, replies };
  };

  it('asks whether the NW.js shell is there as soon as it starts', () =>
  {
    // Arrange: the page's shell, built above.
    const { network, heard } = buildShell();

    // Act.
    network.flush();

    // Assert.
    expect(heard)
      .toStrictEqual([ { type: 'hello' } ]);
  });

  it('hands windows to the NW.js shell once it answers, as absolute URLs on the page\'s origin', () =>
  {
    // Arrange.
    const { network, relay, heard, browser, shell } = buildShell();
    network.flush();
    relay.postMessage({ type: 'shell-ready' });
    network.flush();
    heard.length = 0;

    // Act.
    const result = openMapEditor(shell);
    network.flush();

    // Assert.
    expect([ shell.isRelayed, result, heard, browser.windows.size ])
      .toStrictEqual([ true, 'relayed', [ { type: 'open', url: `${ORIGIN}/map.html`, width: 1600, height: 1000 } ], 0 ]);
  });

  it('ignores anything on the channel but the shell\'s answer', () =>
  {
    // Arrange.
    const { network, relay, shell } = buildShell();

    // Act.
    relay.postMessage({ type: 'open', url: 'x' });
    relay.postMessage(null);
    relay.postMessage('shell-ready');
    network.flush();

    // Assert.
    expect(shell.isRelayed)
      .toBe(false);
  });

  it('opens the window itself where nothing answers', () =>
  {
    // Arrange.
    const { browser, shell } = buildShell();

    // Act.
    const result = openDataEditor(shell);

    // Assert.
    expect([ result, browser.windows.get('jmz-data-editor')?.location.href ])
      .toStrictEqual([ 'opened', `${ORIGIN}/` ]);
  });

  it('brings an open window forward instead of reloading it', () =>
  {
    // Arrange.
    const { browser, shell } = buildShell();
    openMapEditor(shell);

    // Act.
    const result = openMapEditor(shell);

    // Assert.
    const window = browser.windows.get('jmz-map-editor');
    expect([ result, window?.location.href, window?.focus.mock.calls.length ])
      .toStrictEqual([ 'focused', `${ORIGIN}/map.html`, 1 ]);
  });

  it('reports a window the browser refused to open', () =>
  {
    // Arrange.
    const shell = new WindowShell({ channel: null, origin: ORIGIN, openWindow: () => null });

    // Act.
    const result = openMapEditor(shell);

    // Assert.
    expect(result)
      .toBe('blocked');
  });

  it('asks the browser for a sized popup only when a size is given', () =>
  {
    // Arrange.
    const openWindow = vi.fn<OpenBrowserWindow>(() => null);
    const shell = new WindowShell({ channel: null, origin: ORIGIN, openWindow });

    // Act.
    shell.open({ path: '/a', name: 'a', width: 800, height: 600 });
    shell.open({ path: '/b', name: 'b' });

    // Assert.
    expect(openWindow.mock.calls)
      .toStrictEqual([ [ '', 'a', 'popup,width=800,height=600' ], [ '', 'b', '' ] ]);
  });

  it('stops listening once closed', () =>
  {
    // Arrange.
    const { network, relay, shell } = buildShell();

    // Act.
    shell.close();
    relay.postMessage({ type: 'shell-ready' });
    network.flush();

    // Assert.
    expect(shell.isRelayed)
      .toBe(false);
  });

  /*
   * A paste chosen from a menu has no clipboard event to carry the clipboard's text, so the page reads it. Under the
   * NW.js shell the page asks the shell, since NW.js leaves a page's own read waiting forever on a question it has
   * nowhere to ask. A read names the kind of clipboard it wants by its marker, and opens a reply channel of its own
   * under a random name before it asks: the answer is taken from there alone, never from the shell channel every
   * window hears, and the reply channel is closed once the read is over. A shell that never answers costs a moment,
   * never a hang. Without the shell, the page reads through the browser, and a refusal reads as nothing.
   */
  describe('readClipboard', () =>
  {
    /**
     * A page's shell the NW.js shell has answered.
     * @returns {ReturnType<typeof buildShell>} The shell, with the channel's traffic so far cleared.
     */
    const relayedShell = () =>
    {
      const built = buildShell();
      built.network.flush();
      built.relay.postMessage({ type: 'shell-ready' });
      built.network.flush();
      built.heard.length = 0;
      return built;
    };

    it('asks the NW.js shell for one kind of clipboard, naming a reply channel no other window knows', () =>
    {
      // Arrange.
      const { network, heard, shell } = relayedShell();

      // Act.
      shell.readClipboard('jmz-map-editor/events').catch(() => undefined);
      network.flush();

      // Assert.
      const [ request ] = heard as { type: string; marker: string; replyTo: string }[];
      expect([ heard.length, request.type, request.marker, /^jmz-clipboard-[0-9a-f-]{36}$/u.test(request.replyTo) ])
        .toStrictEqual([ 1, 'clipboard-read', 'jmz-map-editor/events', true ]);
    });

    it('takes the answer from its own reply channel, never from the shell channel, and closes the reply channel', async () =>
    {
      // Arrange.
      const { network, relay, heard, shell, replies } = relayedShell();
      const reading = shell.readClipboard('jmz-map-editor/events');
      network.flush();
      const [ request ] = heard as { replyTo: string }[];

      // Act: an answer said where every window hears it comes first; then the one on the reply channel.
      relay.postMessage({ type: 'clipboard-text', text: 'said to every window' });
      network.open(request.replyTo).postMessage({ type: 'clipboard-text', text: 'ours' });
      network.flush();
      const text = await reading;

      // Assert.
      expect([ text, replies.map(reply => [ reply.name, reply.closed ]) ])
        .toStrictEqual([ 'ours', [ [ request.replyTo, true ] ] ]);
    });

    it('reads nothing when the only answer is said on the shell channel', async () =>
    {
      // Arrange.
      vi.useFakeTimers();
      const { network, relay, shell } = relayedShell();
      const reading = shell.readClipboard('jmz-map-editor/events');
      network.flush();

      // Act.
      relay.postMessage({ type: 'clipboard-text', text: 'said to every window' });
      network.flush();
      await vi.advanceTimersByTimeAsync(2_000);
      const text = await reading;
      vi.useRealTimers();

      // Assert.
      expect(text)
        .toBeNull();
    });

    it('reads nothing when the NW.js shell does not answer in time, and closes the reply channel', async () =>
    {
      // Arrange.
      vi.useFakeTimers();
      const { shell, replies } = relayedShell();

      // Act.
      const reading = shell.readClipboard('jmz-map-editor/events');
      await vi.advanceTimersByTimeAsync(2_000);
      const text = await reading;
      vi.useRealTimers();

      // Assert.
      expect([ text, replies.map(reply => reply.closed) ])
        .toStrictEqual([ null, [ true ] ]);
    });

    it('reads nothing through the shell where it cannot open a reply channel', async () =>
    {
      // Arrange: a shell that answers, but no way to open a channel of the page's own.
      const network = new MemoryChannelNetwork();
      const relay = network.open('jmz-shell');
      const shell = new WindowShell({ channel: network.open('jmz-shell'), origin: ORIGIN, openWindow: () => null });
      relay.postMessage({ type: 'shell-ready' });
      network.flush();

      // Act.
      const text = await shell.readClipboard('jmz-map-editor/events');

      // Assert.
      expect([ shell.isRelayed, text ])
        .toStrictEqual([ true, null ]);
    });

    it('reads through the browser without the shell, and nothing when the browser refuses', async () =>
    {
      // Arrange.
      const reads = [ async () => 'from the browser', async () => Promise.reject(new Error('not allowed')) ];
      const shells = reads.map(readClipboardText => new WindowShell({ channel: null, origin: ORIGIN, openWindow: () => null, readClipboardText }));

      // Act.
      const texts = await Promise.all(shells.map(each => each.readClipboard('jmz-map-editor/events')));

      // Assert.
      expect(texts)
        .toStrictEqual([ 'from the browser', null ]);
    });

    it('reads nothing where the page has no way to read', async () =>
    {
      // Arrange: no shell, and no browser read.
      const shell = new WindowShell({ channel: null, origin: ORIGIN, openWindow: () => null });

      // Act.
      const text = await shell.readClipboard('jmz-map-editor/events');

      // Assert.
      expect(text)
        .toBeNull();
    });
  });
});
