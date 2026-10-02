import { describe, expect, it } from 'vitest';
import { FileChangeFeed, type FileChange } from '../../../../src/mapEditor/core/sync/FileChangeFeed.ts';
import { SharedFileChangeFeed } from '../../../../src/mapEditor/core/sync/SharedFileChangeFeed.ts';
import { FakeEventSource, FakeLockManager, MemoryChannelNetwork } from '../../support/standIns.ts';

/*
 * Chromium keeps six connections per server for the whole app, and an open event stream holds one for good, so a
 * stream per window would starve every other request once a few windows were open. The shared feed owes the
 * editor exactly one stream: the lock holder opens it, delivers each change to itself as well as relaying it (a
 * channel never echoes to its sender), and when it closes the lock passes to another window, which opens its own
 * and reports that changes may have been missed during the handover.
 */
describe('SharedFileChangeFeed', () =>
{
  /**
   * One window's feed on a shared network and lock manager.
   * @param {MemoryChannelNetwork} network The channel network.
   * @param {FakeLockManager | null} locks The locks, or null for a platform without them.
   * @returns {{ shared: SharedFileChangeFeed, sources: FakeEventSource[], heard: string[] }} The feed and what it did.
   */
  const buildWindow = (network: MemoryChannelNetwork, locks: FakeLockManager | null) =>
  {
    const sources: FakeEventSource[] = [];
    const feed = new FileChangeFeed('http://api/api/file-changes', url =>
    {
      const source = new FakeEventSource(url);
      sources.push(source);
      return source;
    });
    const shared = new SharedFileChangeFeed(feed, network.open('jmz-file-changes'), locks);
    const heard: string[] = [];
    shared.onChange((change: FileChange) => heard.push(change.path));
    shared.onReconnect(() => heard.push('reconnect'));
    return { shared, sources, heard };
  };

  /**
   * Lets pending lock grants and releases settle.
   * @returns {Promise<void>} Settles after a turn of the event loop.
   */
  const settle = () => new Promise<void>(resolve =>
  {
    setTimeout(resolve, 0);
  });

  it('opens one stream across windows, held by the first to take the lock', async () =>
  {
    // Arrange.
    const network = new MemoryChannelNetwork();
    const locks = new FakeLockManager();
    const first = buildWindow(network, locks);
    const second = buildWindow(network, locks);

    // Act.
    first.shared.start();
    second.shared.start();
    await settle();

    // Assert.
    expect([ first.shared.isLeader, first.sources.length, second.shared.isLeader, second.sources.length ])
      .toStrictEqual([ true, 1, false, 0 ]);
  });

  it('delivers the leader\'s changes to the leader itself and relays them to the others', async () =>
  {
    // Arrange.
    const network = new MemoryChannelNetwork();
    const locks = new FakeLockManager();
    const first = buildWindow(network, locks);
    const second = buildWindow(network, locks);
    first.shared.start();
    second.shared.start();
    await settle();
    network.flush();
    first.heard.length = 0;
    second.heard.length = 0;

    // Act.
    first.sources[0].emitChange({ path: 'data/Map003.json', kind: 'write', client: '' });
    network.flush();

    // Assert.
    expect([ first.heard, second.heard ])
      .toStrictEqual([ [ 'data/Map003.json' ], [ 'data/Map003.json' ] ]);
  });

  it('hands the stream to another window when the leader closes, which reports the gap', async () =>
  {
    // Arrange.
    const network = new MemoryChannelNetwork();
    const locks = new FakeLockManager();
    const first = buildWindow(network, locks);
    const second = buildWindow(network, locks);
    first.shared.start();
    second.shared.start();
    await settle();
    network.flush();
    second.heard.length = 0;

    // Act.
    first.shared.stop();
    await settle();

    // Assert.
    expect([ first.sources[0].closed, second.shared.isLeader, second.sources.length, second.heard ])
      .toStrictEqual([ true, true, 1, [ 'reconnect' ] ]);
  });

  it('relays the stream\'s own reconnections too', async () =>
  {
    // Arrange.
    const network = new MemoryChannelNetwork();
    const locks = new FakeLockManager();
    const first = buildWindow(network, locks);
    const second = buildWindow(network, locks);
    first.shared.start();
    second.shared.start();
    await settle();
    network.flush();
    second.heard.length = 0;

    // Act.
    first.sources[0].emit('error');
    first.sources[0].emit('open');
    network.flush();

    // Assert.
    expect(second.heard)
      .toStrictEqual([ 'reconnect' ]);
  });

  it('watches the stream itself where there are no locks', () =>
  {
    // Arrange.
    const network = new MemoryChannelNetwork();
    const alone = buildWindow(network, null);

    // Act.
    alone.shared.start();
    alone.sources[0].emitChange({ path: 'data/Map009.json', kind: 'write', client: '' });

    // Assert.
    expect([ alone.shared.isLeader, alone.heard ])
      .toStrictEqual([ true, [ 'reconnect', 'data/Map009.json' ] ]);
  });

  it('ignores anything on the channel that is not a well-formed relay', () =>
  {
    // Arrange.
    const network = new MemoryChannelNetwork();
    const follower = buildWindow(network, new FakeLockManager());
    const stranger = network.open('jmz-file-changes');
    follower.shared.start();
    follower.heard.length = 0;

    // Act.
    stranger.postMessage('hello');
    stranger.postMessage({ type: 'change', change: { path: 'data/Map001.json', kind: 'explode', client: '' } });
    stranger.postMessage({ type: 'other' });
    network.flush();

    // Assert.
    expect(follower.heard)
      .toStrictEqual([]);
  });

  it('never leads when stopped before the lock arrives', async () =>
  {
    // Arrange.
    const network = new MemoryChannelNetwork();
    const locks = new FakeLockManager();
    const first = buildWindow(network, locks);
    const second = buildWindow(network, locks);
    first.shared.start();
    second.shared.start();
    await settle();

    // Act.
    second.shared.stop();
    first.shared.stop();
    await settle();

    // Assert.
    expect([ second.shared.isLeader, second.sources.length ])
      .toStrictEqual([ false, 0 ]);
  });
});
