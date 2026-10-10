import { describe, expect, it } from 'vitest';
import { STAMP_HISTORY_CAP, StampHistory } from '../../../../src/mapEditor/core/stamps/StampHistory.ts';
import { stampOf } from '../../support/stampFixtures.ts';

/*
 * A window's stamps, newest first: what the Stamps panel lists and Ctrl+V places the newest of. It keeps no more than
 * its cap, the oldest dropping off first, so the panel stays quick to scan; the same piece of the same map copied twice
 * with nothing changed between is kept once, coming back to the front; and a stamp already kept, by its id, as one
 * pasted from another window is, never joins twice. Ids are the window's prefix and a count, unique across windows.
 * Every change is heard, and the list is the same array until it changes, so React re-renders only for a real change.
 */
describe('StampHistory', () =>
{
  it('keeps stamps newest first, and finds the newest and any one kept by its id', () =>
  {
    // Arrange.
    const history = new StampHistory('window-a');
    const first = stampOf({ id: 'window-a:1', origin: { x: 1, y: 0 } });
    const second = stampOf({ id: 'window-a:2', origin: { x: 2, y: 0 } });

    // Act.
    history.add(first);
    history.add(second);

    // Assert.
    expect([ history.stamps, history.newest(), history.has('window-a:1'), history.has('window-a:9') ])
      .toStrictEqual([ [ second, first ], second, true, false ]);
  });

  it('has no newest stamp before anything is copied', () =>
  {
    // Arrange.
    const history = new StampHistory('window-a');

    // Act.
    const newest = history.newest();

    // Assert.
    expect([ newest, history.stamps ])
      .toStrictEqual([ null, [] ]);
  });

  it('keeps no more than its cap, the oldest dropping off first, and a stamp dropped can join again as new', () =>
  {
    // Arrange: a cap of three.
    const history = new StampHistory('window-a', 3);
    const stamps = [ 1, 2, 3, 4 ].map(count => stampOf({ id: `window-a:${count}`, origin: { x: count, y: 0 } }));

    // Act.
    stamps.forEach(stamp => history.add(stamp));
    const afterFour = history.stamps.map(stamp => stamp.id);
    history.add(stamps[0]);

    // Assert.
    expect([ afterFour, history.stamps.map(stamp => stamp.id) ])
      .toStrictEqual([ [ 'window-a:4', 'window-a:3', 'window-a:2' ], [ 'window-a:1', 'window-a:4', 'window-a:3' ] ]);
  });

  it('keeps twenty-four stamps by default', () =>
  {
    // Arrange.
    const history = new StampHistory('window-a');

    // Act.
    Array.from({ length: 30 }, (_, count) => stampOf({ id: `window-a:${count}`, origin: { x: count, y: 0 } })).forEach(stamp => history.add(stamp));

    // Assert.
    expect([ STAMP_HISTORY_CAP, history.stamps.length, history.stamps[23].id ])
      .toStrictEqual([ 24, 24, 'window-a:6' ]);
  });

  it('keeps the same piece copied twice once, bringing the copy kept before to the front and handing it back', () =>
  {
    // Arrange: the same piece copied again under a new id, after another stamp.
    const history = new StampHistory('window-a');
    const first = stampOf({ id: 'window-a:1' });
    const other = stampOf({ id: 'window-a:2', origin: { x: 3, y: 3 } });
    history.add(first);
    history.add(other);

    // Act.
    const kept = history.add(stampOf({ id: 'window-a:3' }));

    // Assert.
    expect([ kept, history.stamps ])
      .toStrictEqual([ first, [ first, other ] ]);
  });

  it('never keeps a stamp twice by its id, as one pasted again from another window', () =>
  {
    // Arrange.
    const history = new StampHistory('window-a');
    const pasted = stampOf({ id: 'window-b:1' });
    history.add(pasted);
    history.add(stampOf({ id: 'window-a:1', origin: { x: 2, y: 2 } }));

    // Act.
    history.add({ ...pasted });

    // Assert.
    expect(history.stamps.map(stamp => stamp.id))
      .toStrictEqual([ 'window-b:1', 'window-a:1' ]);
  });

  it('names each new stamp with the window\'s prefix and a count', () =>
  {
    // Arrange.
    const history = new StampHistory('3f2a');

    // Act.
    const ids = [ history.nextId(), history.nextId() ];

    // Assert.
    expect(ids)
      .toStrictEqual([ '3f2a:1', '3f2a:2' ]);
  });

  it('tells listeners each change, keeps the list while nothing changes, and stops telling one that left', () =>
  {
    // Arrange.
    const history = new StampHistory('window-a');
    const stamp = stampOf({ id: 'window-a:1' });
    let heard = 0;
    const stop = history.subscribe(() =>
    {
      heard += 1;
    });

    // Act: a stamp kept, kept again while newest, then another after the listener left.
    history.add(stamp);
    const list = history.getSnapshot();
    history.add(stamp);
    const unchanged = history.getSnapshot() === list;
    stop();
    history.add(stampOf({ id: 'window-a:2', origin: { x: 1, y: 1 } }));

    // Assert.
    expect([ heard, unchanged, history.stamps.length ])
      .toStrictEqual([ 1, true, 2 ]);
  });

  it('refuses a cap that keeps nothing', () =>
  {
    // Arrange: nothing to set up.

    // Act.
    const build = () => new StampHistory('window-a', 0);

    // Assert.
    expect(build)
      .toThrow('a stamp history keeps a whole number of stamps, at least one, not 0');
  });
});
