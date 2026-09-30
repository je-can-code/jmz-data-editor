import { describe, expect, it, vi } from 'vitest';
import { asMapLinkMessage, MapLinkClient, MapLinkHost, REQUEST_TIMEOUT_MS } from '../../../../src/core/infrastructure/shell/MapLink.ts';
import { MemoryChannelNetwork } from '../../../mapEditor/support/standIns.ts';

/*
 * The data editor lists where an enemy stands on the maps, and a click on one of those rows owes the author the map
 * open in the map editor with that event picked out, whether the map editor was already open or not. So the click
 * brings the workspace forward at once (inside the click, where a browser allows it) and asks on the shell channel:
 * a workspace already listening shows the map straight away; a workspace still opening says so when it starts, and
 * is asked again. Each request is shown once however often it is asked, is settled when the workspace says it is
 * done, and is dropped after a while so a workspace opened much later never jumps to a map nobody asked for then.
 */
describe('MapLink', () =>
{
  /**
   * A data editor's link client and a way to start a workspace's host, on one channel network, with a hand-driven
   * timer.
   * @returns {object} The client, its spies, the network and a host starter.
   */
  const buildLink = () =>
  {
    const network = new MemoryChannelNetwork();
    const openWorkspace = vi.fn();
    const timers: (() => void)[] = [];
    let counter = 0;
    const client = new MapLinkClient({
      channel: network.open('jmz-shell'),
      openWorkspace,
      createId: () =>
      {
        counter += 1;
        return `request-${counter}`;
      },
      setTimer: callback =>
      {
        timers.push(callback);
        return timers.length;
      },
      clearTimer: handle =>
      {
        timers[(handle as number) - 1] = () => undefined;
      },
    });

    /**
     * Starts a workspace's end of the link.
     * @returns {object} The host, its channel, and the maps it was asked to show.
     */
    const startWorkspace = () =>
    {
      const shown: [ number, number | null ][] = [];
      const channel = network.open('jmz-shell');
      const host = new MapLinkHost(channel, (mapId, eventId) => shown.push([ mapId, eventId ]));
      host.start();
      return { host, channel, shown };
    };

    return { client, openWorkspace, network, timers, startWorkspace };
  };

  it('shows the map in a workspace already open, selecting the event, and settles the request', () =>
  {
    // Arrange.
    const { client, openWorkspace, network, startWorkspace } = buildLink();
    const { shown } = startWorkspace();
    network.flush();

    // Act.
    client.openMap(12, 5);
    network.flush();

    // Assert.
    expect([ shown, openWorkspace.mock.calls.length, client.isWaiting ])
      .toStrictEqual([ [ [ 12, 5 ] ], 1, false ]);
  });

  it('asks again once a workspace still opening says it is ready, and it shows the map once', () =>
  {
    // Arrange: nobody is listening when the row is clicked.
    const { client, network, startWorkspace } = buildLink();
    client.openMap(12, null);
    network.flush();

    // Act.
    const { shown } = startWorkspace();
    network.flush();

    // Assert.
    expect([ shown, client.isWaiting ])
      .toStrictEqual([ [ [ 12, null ] ], false ]);
  });

  it('shows a request once however often it arrives, and says done each time', () =>
  {
    // Arrange: the workspace has shown the request once.
    const { client, network, startWorkspace } = buildLink();
    const { channel, shown } = startWorkspace();
    network.flush();
    client.openMap(12, 5);
    network.flush();

    // Act: the same request arrives again.
    network.open('jmz-shell').postMessage({ type: 'open-map', requestId: 'request-1', mapId: 12, eventId: 5 });
    network.flush();

    // Assert.
    const answers = channel.sent.filter(message => (message as { type: string }).type === 'open-map-done');
    expect([ shown, answers ])
      .toStrictEqual([ [ [ 12, 5 ] ], [ { type: 'open-map-done', requestId: 'request-1' }, { type: 'open-map-done', requestId: 'request-1' } ] ]);
  });

  it('settles only on the answer to its own request', () =>
  {
    // Arrange.
    const { client, network } = buildLink();
    client.openMap(12, 5);

    // Act.
    network.open('jmz-shell').postMessage({ type: 'open-map-done', requestId: 'someone-else' });
    network.flush();

    // Assert.
    expect(client.isWaiting)
      .toBe(true);
  });

  it('drops a request nobody showed once it times out, so a later workspace is not sent to it', () =>
  {
    // Arrange.
    const { client, network, timers, startWorkspace } = buildLink();
    client.openMap(12, 5);
    network.flush();

    // Act.
    timers.splice(0).forEach(callback => callback());
    const { shown } = startWorkspace();
    network.flush();

    // Assert.
    expect([ client.isWaiting, shown ])
      .toStrictEqual([ false, [] ]);
  });

  it('lets a newer click replace a request still waiting', () =>
  {
    // Arrange.
    const { client, network, startWorkspace } = buildLink();
    client.openMap(12, 5);
    client.openMap(40, 2);
    network.flush();

    // Act.
    const { shown } = startWorkspace();
    network.flush();

    // Assert.
    expect(shown)
      .toStrictEqual([ [ 40, 2 ] ]);
  });

  it('only brings the workspace forward where there is no channel', () =>
  {
    // Arrange.
    const openWorkspace = vi.fn();
    const client = new MapLinkClient({ channel: null, openWorkspace, createId: () => 'request-1' });

    // Act.
    client.openMap(12, 5);

    // Assert.
    expect([ openWorkspace.mock.calls.length, client.isWaiting ])
      .toStrictEqual([ 1, false ]);
  });

  it('stops hearing and asking once closed', () =>
  {
    // Arrange.
    const { client, network, startWorkspace } = buildLink();
    client.openMap(12, 5);
    network.flush();

    // Act.
    client.close();
    const { shown } = startWorkspace();
    network.flush();

    // Assert.
    expect([ client.isWaiting, shown ])
      .toStrictEqual([ false, [] ]);
  });

  it('stops showing maps once the workspace stops listening', () =>
  {
    // Arrange.
    const { client, network, startWorkspace } = buildLink();
    const { host, shown } = startWorkspace();
    network.flush();
    host.stop();

    // Act.
    client.openMap(12, 5);
    network.flush();

    // Assert.
    expect([ shown, client.isWaiting ])
      .toStrictEqual([ [], true ]);
  });

  describe('asMapLinkMessage', () =>
  {
    it('reads the link\'s messages and refuses everything else on the channel, the shell\'s own included', () =>
    {
      // Arrange.
      const messages: unknown[] = [
        { type: 'open-map', requestId: 'r', mapId: 12, eventId: 5 },
        { type: 'open-map', requestId: 'r', mapId: 12, eventId: null },
        { type: 'open-map-done', requestId: 'r' },
        { type: 'workspace-ready' },
        { type: 'open-map', requestId: 'r', mapId: 0, eventId: 5 },
        { type: 'open-map', requestId: 'r', mapId: 12, eventId: 1.5 },
        { type: 'open-map', mapId: 12, eventId: 5 },
        { type: 'open-map-done' },
        { type: 'open', url: '/map.html' },
        { type: 'shell-ready' },
        'open-map',
        null,
      ];

      // Act.
      const read = messages.map(asMapLinkMessage);

      // Assert.
      expect(read)
        .toStrictEqual([
          { type: 'open-map', requestId: 'r', mapId: 12, eventId: 5 },
          { type: 'open-map', requestId: 'r', mapId: 12, eventId: null },
          { type: 'open-map-done', requestId: 'r' },
          { type: 'workspace-ready' },
          null, null, null, null, null, null, null, null,
        ]);
    });
  });

  it('waits long enough for a workspace window to open', () =>
  {
    // Arrange: nothing to arrange.

    // Act.
    const seconds = REQUEST_TIMEOUT_MS / 1000;

    // Assert.
    expect(seconds)
      .toBe(15);
  });
});
