import { describe, expect, it } from 'vitest';
import { weatherClockAt } from '../../../src/mapEditor/render/weatherClock.ts';

/*
 * The weather moves on a view's clock: whole engine frames, sixty a second, counted from the page's own clock, so a map
 * opened again or redrawn never starts its weather over; the game moves its weather a step a frame. A renderer holding
 * its animation still, as the parity check holds it, holds the weather's clock on the held moment's frame, whatever the
 * time; and the clock says whether the game look moves, which the view's Animate switch decides.
 */
describe('weatherClock', () =>
{
  describe('weatherClockAt', () =>
  {
    it('counts the whole engine frames the page\'s clock has run, a frame never landing early', () =>
    {
      // Arrange: a second in, a hair short of the next frame, and on it.
      const times = [ 1000, 1016.6, 1016.7 ];

      // Act.
      const clocks = times.map(time => weatherClockAt(time, null, true));

      // Assert.
      expect(clocks)
        .toStrictEqual([ { frames: 60, animating: true }, { frames: 60, animating: true }, { frames: 61, animating: true } ]);
    });

    it('stays on the held moment\'s frame while the animation is held, whatever the time', () =>
    {
      // Arrange: a moment 30 frames in, read at two times far apart.
      const held = { frames: 30 };

      // Act.
      const clocks = [ weatherClockAt(1000, held, false), weatherClockAt(90_000, held, false) ];

      // Assert.
      expect(clocks)
        .toStrictEqual([ { frames: 30, animating: false }, { frames: 30, animating: false } ]);
    });

    it('says the weather holds still while the view does not animate, its frame still counted', () =>
    {
      // Arrange: Animate off, a second in.

      // Act.
      const clock = weatherClockAt(1000, null, false);

      // Assert.
      expect(clock)
        .toStrictEqual({ frames: 60, animating: false });
    });
  });
});
