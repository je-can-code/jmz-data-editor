import { describe, expect, it } from 'vitest';
import { WindowClock } from '../../../../src/mapEditor/core/time/WindowClock.ts';

/*
 * One window has one clock, which every map view in it reads the sky at, so two maps side by side never show two
 * different hours. It holds a time of day, brought onto the clock face, and tells whoever listens each time it moves,
 * and only then. The author moves it; the game's starting time, which a plugin module offers once it switches on, sets
 * it only until the author first moves it, so a starting time read again later, say from a plugin list changed on disk,
 * never takes back the hour the author chose.
 */
describe('WindowClock', () =>
{
  it('stands at midnight until told otherwise, or at the time it is made with', () =>
  {
    // Arrange: nothing given, and 14:00.

    // Act.
    const clocks = [ new WindowClock(), new WindowClock(840) ];

    // Assert.
    expect(clocks.map(clock => clock.time()))
      .toStrictEqual([ 0, 840 ]);
  });

  it('moves to the time the author sets, brought onto the clock face, and tells every listener', () =>
  {
    // Arrange: two listeners.
    const clock = new WindowClock(840);
    const heard: string[] = [];
    clock.subscribe(() => heard.push(`first at ${clock.time()}`));
    clock.subscribe(() => heard.push(`second at ${clock.time()}`));

    // Act: an hour before midnight, written as a time before it.
    clock.set(-60);

    // Assert.
    expect([ clock.time(), heard ])
      .toStrictEqual([ 1380, [ 'first at 1380', 'second at 1380' ] ]);
  });

  it('tells nobody when set to the time it already shows', () =>
  {
    // Arrange.
    const clock = new WindowClock(840);
    const heard: number[] = [];
    clock.subscribe(() => heard.push(clock.time()));

    // Act.
    clock.set(840);

    // Assert.
    expect(heard)
      .toStrictEqual([]);
  });

  it('follows the game\'s starting time until the author moves it', () =>
  {
    // Arrange.
    const clock = new WindowClock();
    const heard: number[] = [];
    clock.subscribe(() => heard.push(clock.time()));

    // Act: a starting time, and another read later.
    clock.startAt(840);
    clock.startAt(540);

    // Assert.
    expect([ clock.time(), heard ])
      .toStrictEqual([ 540, [ 840, 540 ] ]);
  });

  it('keeps the hour the author chose when a starting time is read again later', () =>
  {
    // Arrange: the game's start, then the author's 22:00.
    const clock = new WindowClock();
    clock.startAt(840);
    clock.set(1320);
    const heard: number[] = [];
    clock.subscribe(() => heard.push(clock.time()));

    // Act.
    clock.startAt(840);

    // Assert.
    expect([ clock.time(), heard ])
      .toStrictEqual([ 1320, [] ]);
  });

  it('stops telling a listener that stopped listening, and keeps telling the others', () =>
  {
    // Arrange.
    const clock = new WindowClock();
    const heard: string[] = [];
    const stop = clock.subscribe(() => heard.push('stopped'));
    clock.subscribe(() => heard.push('kept'));

    // Act.
    stop();
    clock.set(60);

    // Assert.
    expect(heard)
      .toStrictEqual([ 'kept' ]);
  });
});
