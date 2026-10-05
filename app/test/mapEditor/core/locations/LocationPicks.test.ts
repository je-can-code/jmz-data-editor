import { describe, expect, it, vi } from 'vitest';
import { LocationPicks, startingCell, type LocationPickRequest, type MapLocation } from '../../../../src/mapEditor/core/locations/LocationPicks.ts';

/*
 * An editor asking for a place on a map waits on the answer while the window's picker shows the ask, so the asks owe
 * three things. Every ask is answered exactly once: with the place picked, with null when the author gives up, or with
 * null when a newer ask takes over, so no editor is ever left waiting on a picker that has gone. Only the open ask can
 * be settled, by its number, so a picker closing late can never answer the ask that replaced it. And the open ask is
 * the same object until it changes, which is what lets React read it straight through useSyncExternalStore.
 *
 * Where a picker starts on each map it shows matters as much: on the map the transfer goes to now it starts on the
 * landing tile, and on any other map with nothing, since the same numbers name an unrelated spot there.
 */
describe('LocationPicks', () =>
{
  /**
   * Where a transfer to Room of Sacrifice lands.
   */
  const START: MapLocation = { mapId: 322, x: 22, y: 13 };

  /**
   * Where a transfer to the cave lands.
   */
  const CAVE: MapLocation = { mapId: 5, x: 1, y: 1 };

  /**
   * Notes whether an answer has arrived, and what it was.
   * @param {Promise<MapLocation | null>} answer The answer to watch.
   * @returns {{ value: MapLocation | null | 'waiting' }} The answer once it lands, 'waiting' until then.
   */
  const watch = (answer: Promise<MapLocation | null>) =>
  {
    const seen: { value: MapLocation | null | 'waiting' } = { value: 'waiting' };
    answer
      .then(location =>
      {
        seen.value = location;
      })
      .catch(() => undefined);
    return seen;
  };

  /**
   * Lets every answer already given land.
   * @returns {Promise<void>} Settles on the next macrotask.
   */
  const landed = () => new Promise<void>(resolve =>
  {
    setTimeout(resolve, 0);
  });

  it('holds no ask until an editor makes one', () =>
  {
    // Arrange: nothing beyond a window's asks, fresh.
    const picks = new LocationPicks();

    // Act.
    const open = picks.current();

    // Assert.
    expect(open)
      .toBeNull();
  });

  it('opens an ask numbered from one with where it starts, the same object until it changes', () =>
  {
    // Arrange.
    const picks = new LocationPicks();

    // Act.
    picks.pick(START).catch(() => undefined);

    // Assert.
    expect([ picks.current(), picks.current() === picks.current() ])
      .toStrictEqual([ { id: 1, start: START }, true ]);
  });

  it('answers the editor with the place picked, and closes the ask', async () =>
  {
    // Arrange.
    const picks = new LocationPicks();
    const answer = picks.pick(START);
    const { id } = picks.current() as LocationPickRequest;

    // Act.
    picks.settle(id, CAVE);

    // Assert.
    expect([ await answer, picks.current() ])
      .toStrictEqual([ CAVE, null ]);
  });

  it('answers null when the author gives up', async () =>
  {
    // Arrange.
    const picks = new LocationPicks();
    const answer = picks.pick(START);

    // Act.
    picks.settle(1, null);

    // Assert.
    expect([ await answer, picks.current() ])
      .toStrictEqual([ null, null ]);
  });

  it('lets a new ask take over, answering the one before with null and leaving the new one open', async () =>
  {
    // Arrange.
    const picks = new LocationPicks();
    const first = watch(picks.pick(START));

    // Act.
    const second = watch(picks.pick(CAVE));
    await landed();

    // Assert.
    expect([ first.value, second.value, picks.current() ])
      .toStrictEqual([ null, 'waiting', { id: 2, start: CAVE } ]);
  });

  it('leaves the open ask alone when an ask it took over from is settled late', async () =>
  {
    // Arrange: the first ask was taken over by the second.
    const picks = new LocationPicks();
    picks.pick(START).catch(() => undefined);
    const second = watch(picks.pick(CAVE));

    // Act: the first picker closes after the second opened, with a place.
    picks.settle(1, { mapId: 9, x: 0, y: 0 });
    await landed();

    // Assert.
    expect([ second.value, picks.current() ])
      .toStrictEqual([ 'waiting', { id: 2, start: CAVE } ]);
  });

  it('answers an ask once, ignoring a second settle after it closed', async () =>
  {
    // Arrange: the ask was settled with the cave, and a listener hears what follows.
    const picks = new LocationPicks();
    const answer = picks.pick(START);
    picks.settle(1, CAVE);
    const heard = vi.fn();
    picks.subscribe(heard);

    // Act.
    picks.settle(1, null);

    // Assert.
    expect([ await answer, picks.current(), heard.mock.calls.length ])
      .toStrictEqual([ CAVE, null, 0 ]);
  });

  it('tells listeners once for every ask opened, taken over or settled, until they stop listening', () =>
  {
    // Arrange.
    const picks = new LocationPicks();
    const heard = vi.fn();
    const stop = picks.subscribe(heard);

    // Act: one ask, a second taking over, the second settled; then one more after the listener left.
    picks.pick(START).catch(() => undefined);
    picks.pick(CAVE).catch(() => undefined);
    picks.settle(2, null);
    stop();
    picks.pick(START).catch(() => undefined);

    // Assert.
    expect(heard.mock.calls.length)
      .toBe(3);
  });
});

describe('startingCell', () =>
{
  /**
   * Where a transfer to Room of Sacrifice lands.
   */
  const START: MapLocation = { mapId: 322, x: 22, y: 13 };

  it('starts on the landing tile on the map the transfer goes to now', () =>
  {
    // Arrange: nothing beyond the start above.

    // Act.
    const cell = startingCell(START, 322);

    // Assert.
    expect(cell)
      .toStrictEqual({ x: 22, y: 13 });
  });

  it('starts with nothing on any other map, even the one beside it', () =>
  {
    // Arrange: nothing beyond the start above.

    // Act.
    const cell = startingCell(START, 323);

    // Assert.
    expect(cell)
      .toBeNull();
  });
});
