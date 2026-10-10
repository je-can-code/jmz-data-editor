import { describe, expect, it } from 'vitest';
import { WindowClock } from '../../../../src/mapEditor/core/time/WindowClock.ts';

/*
 * One window has one clock, which every map view in it reads the sky at, so two maps side by side never show two
 * different hours. It holds a time of day, brought onto the clock face, and tells whoever listens each time it moves,
 * and only then. The author moves it; the game's starting time, which a plugin module offers once it switches on, sets
 * it only until the author first moves it, so a starting time read again later, say from a plugin list changed on disk,
 * never takes back the hour the author chose.
 *
 * It holds a season too, which the author picks: none until then, which is the season the game starts in, whichever
 * that is. Picking one tells whoever listens, unless it is the season already held; the hour and the season move apart,
 * neither disturbing the other.
 *
 * And it holds the sky the author picks, a condition and a strength: none until then, as on a new game, whose sky is
 * random, and none again once the author picks none. Picking one tells whoever listens, unless it is the same condition
 * at the same strength, by value, and the clock keeps a copy of its own, so nothing a caller does to its object moves
 * the sky behind the listeners' backs. The sky moves apart from the hour and the season.
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

  it('holds no season until the author picks one, and tells every listener once one is picked', () =>
  {
    // Arrange: two listeners.
    const clock = new WindowClock(840);
    const before = clock.season();
    const heard: string[] = [];
    clock.subscribe(() => heard.push(`first in ${clock.season()}`));
    clock.subscribe(() => heard.push(`second in ${clock.season()}`));

    // Act: Summer picked.
    clock.chooseSeason(1);

    // Assert.
    expect([ before, clock.season(), heard ])
      .toStrictEqual([ null, 1, [ 'first in 1', 'second in 1' ] ]);
  });

  it('tells nobody when the season picked is the one it already holds', () =>
  {
    // Arrange: Summer held.
    const clock = new WindowClock(840);
    clock.chooseSeason(1);
    const heard: (number | null)[] = [];
    clock.subscribe(() => heard.push(clock.season()));

    // Act.
    clock.chooseSeason(1);

    // Assert.
    expect(heard)
      .toStrictEqual([]);
  });

  it('moves its hour and its season apart, neither disturbing the other', () =>
  {
    // Arrange: the game's start at 14:00, then Autumn picked.
    const clock = new WindowClock();
    clock.startAt(840);
    clock.chooseSeason(2);

    // Act: the author's 22:00, then Spring.
    clock.set(1320);
    const atNight = [ clock.time(), clock.season() ];
    clock.chooseSeason(0);

    // Assert.
    expect([ atNight, clock.time(), clock.season() ])
      .toStrictEqual([ [ 1320, 2 ], 1320, 0 ]);
  });

  it('keeps following the game\'s starting time with a season picked, until the author moves the hour', () =>
  {
    // Arrange: Summer picked before the game's start is known.
    const clock = new WindowClock();
    clock.chooseSeason(1);

    // Act: the game's start, 14:00, read.
    clock.startAt(840);

    // Assert.
    expect([ clock.time(), clock.moved, clock.season() ])
      .toStrictEqual([ 840, false, 1 ]);
  });

  it('holds no sky until the author picks one, and tells every listener once one is picked', () =>
  {
    // Arrange: two listeners.
    const clock = new WindowClock(840);
    const before = clock.sky();
    const heard: string[] = [];
    clock.subscribe(() => heard.push(`first under ${JSON.stringify(clock.sky())}`));
    clock.subscribe(() => heard.push(`second under ${JSON.stringify(clock.sky())}`));

    // Act: heavy rain picked.
    clock.chooseSky({ condition: 'rain', strength: 'heavy' });

    // Assert.
    const rain = '{"condition":"rain","strength":"heavy"}';
    expect([ before, clock.sky(), heard ])
      .toStrictEqual([ null, { condition: 'rain', strength: 'heavy' }, [ `first under ${rain}`, `second under ${rain}` ] ]);
  });

  it('tells nobody when the sky picked is the one it already holds, and tells everyone of the same condition at another strength, another condition at the same strength, and none', () =>
  {
    // Arrange: heavy rain held, and a listener.
    const clock = new WindowClock(840);
    clock.chooseSky({ condition: 'rain', strength: 'heavy' });
    const held = clock.sky();
    const heard: string[] = [];
    clock.subscribe(() => heard.push(JSON.stringify(clock.sky())));

    // Act: heavy rain again, as an object of its own; then light rain, light snow, and none, twice.
    clock.chooseSky({ condition: 'rain', strength: 'heavy' });
    const kept = clock.sky();
    clock.chooseSky({ condition: 'rain', strength: 'light' });
    clock.chooseSky({ condition: 'snow', strength: 'light' });
    clock.chooseSky(null);
    clock.chooseSky(null);

    // Assert: the same sky was kept as the very object held, unheard.
    expect([ kept === held, heard ])
      .toStrictEqual([
        true,
        [ '{"condition":"rain","strength":"light"}', '{"condition":"snow","strength":"light"}', 'null' ],
      ]);
  });

  it('keeps a sky of its own, which nothing done to the object it was handed moves', () =>
  {
    // Arrange: a pick the caller goes on holding.
    const clock = new WindowClock(840);
    const handed = { condition: 'rain', strength: 'heavy' };

    // Act: picked, then the caller's object changed.
    clock.chooseSky(handed);
    handed.strength = 'light';

    // Assert.
    expect(clock.sky())
      .toStrictEqual({ condition: 'rain', strength: 'heavy' });
  });

  it('moves its sky apart from its hour and its season', () =>
  {
    // Arrange: 14:00 in Autumn.
    const clock = new WindowClock(840);
    clock.chooseSeason(2);

    // Act: light snow picked.
    clock.chooseSky({ condition: 'snow', strength: 'light' });

    // Assert.
    expect([ clock.time(), clock.season(), clock.moved, clock.sky() ])
      .toStrictEqual([ 840, 2, false, { condition: 'snow', strength: 'light' } ]);
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
