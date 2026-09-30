import { describe, expect, it } from 'vitest';
import { FileChangeFeed, parseFileChange, type FileChange } from '../../../../src/mapEditor/core/sync/FileChangeFeed.ts';
import { FakeEventSource } from '../../support/standIns.ts';

/*
 * The server announces every change under data/ and the editor's own folder on one event stream. This client owes
 * the editor every well-formed change, nothing malformed (a change event the editor misreads could reload the wrong
 * map), and a signal each time the stream comes back after dropping, because whatever changed while it was down
 * was never announced and the editor has to look for itself. The first connection is not a return, so it raises
 * no such signal.
 */
describe('FileChangeFeed', () =>
{
  /**
   * Builds a feed over a stand-in stream.
   * @returns {{ feed: FileChangeFeed, sources: FakeEventSource[] }} The feed and every stream it opened.
   */
  const buildFeed = () =>
  {
    const sources: FakeEventSource[] = [];
    const feed = new FileChangeFeed('http://api/api/file-changes', url =>
    {
      const source = new FakeEventSource(url);
      sources.push(source);
      return source;
    });

    return { feed, sources };
  };

  describe('parseFileChange', () =>
  {
    it('reads the contract\'s shape', () =>
    {
      // Arrange.
      const data = JSON.stringify({ path: 'data/Map012.json', kind: 'write', client: 'window-2' });

      // Act.
      const change = parseFileChange(data);

      // Assert.
      expect(change)
        .toStrictEqual({ path: 'data/Map012.json', kind: 'write', client: 'window-2' });
    });

    it('refuses near misses of the shape', () =>
    {
      // Arrange: an unknown kind, a missing client, a numeric path, an array, bad JSON, and raw data.
      const samples: unknown[] = [
        JSON.stringify({ path: 'data/Map012.json', kind: 'delete', client: '' }),
        JSON.stringify({ path: 'data/Map012.json', kind: 'write' }),
        JSON.stringify({ path: 12, kind: 'write', client: '' }),
        JSON.stringify([ 'data/Map012.json' ]),
        '{ not json',
        { path: 'data/Map012.json', kind: 'write', client: '' },
      ];

      // Act.
      const parsed = samples.map(sample => parseFileChange(sample));

      // Assert.
      expect(parsed)
        .toStrictEqual([ null, null, null, null, null, null ]);
    });
  });

  it('opens the stream once, however often it is started', () =>
  {
    // Arrange.
    const { feed, sources } = buildFeed();

    // Act.
    feed.start();
    feed.start();

    // Assert.
    expect([ sources.length, sources[0].url, feed.isRunning ])
      .toStrictEqual([ 1, 'http://api/api/file-changes', true ]);
  });

  it('hands each well-formed change to its listeners and skips malformed ones', () =>
  {
    // Arrange.
    const { feed, sources } = buildFeed();
    const heard: FileChange[] = [];
    feed.onChange(change => heard.push(change));
    feed.start();

    // Act.
    sources[0].emitChange({ path: 'data/Map001.json', kind: 'write', client: '' });
    sources[0].emit('change', 'garbage');
    sources[0].emitChange({ path: 'data/MapInfos.json', kind: 'create', client: 'w' });

    // Assert.
    expect(heard)
      .toStrictEqual([
        { path: 'data/Map001.json', kind: 'write', client: '' },
        { path: 'data/MapInfos.json', kind: 'create', client: 'w' },
      ]);
  });

  it('signals a return after a drop, and not the first connection', () =>
  {
    // Arrange.
    const { feed, sources } = buildFeed();
    let returns = 0;
    feed.onReconnect(() =>
    {
      returns += 1;
    });
    feed.start();

    // Act.
    sources[0].emit('open');
    const afterFirstOpen = returns;
    sources[0].emit('error');
    sources[0].emit('open');
    sources[0].emit('open');

    // Assert.
    expect([ afterFirstOpen, returns ])
      .toStrictEqual([ 0, 1 ]);
  });

  it('closes the stream on stop, and listeners can leave', () =>
  {
    // Arrange.
    const { feed, sources } = buildFeed();
    const heard: FileChange[] = [];
    const leave = feed.onChange(change => heard.push(change));
    const leaveReconnect = feed.onReconnect(() => heard.push({ path: 'reconnect', kind: 'write', client: '' }));
    feed.start();

    // Act.
    leave();
    leaveReconnect();
    sources[0].emitChange({ path: 'data/Map001.json', kind: 'write', client: '' });
    sources[0].emit('error');
    sources[0].emit('open');
    feed.stop();

    // Assert.
    expect([ heard, sources[0].closed, feed.isRunning ])
      .toStrictEqual([ [], true, false ]);
  });
});
