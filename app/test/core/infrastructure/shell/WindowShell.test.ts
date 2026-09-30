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
    const shell = new WindowShell({ channel: network.open('jmz-shell'), origin: ORIGIN, openWindow: browser.openWindow });
    return { network, relay, heard, browser, shell };
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
});
