import { describe, expect, it } from 'vitest';
import { lightingClockAt } from '../../../src/mapEditor/render/lightingClock.ts';

/*
 * The lighting moves on a view's clock: whole engine frames, sixty a second, counted from the page's own clock, so a map
 * opened again or redrawn never starts its lights over. A renderer holding its animation still, as the parity check
 * holds it, holds the lighting's clock on the held moment's frame, whatever the time; and the clock says whether the
 * game look moves, which the view's Animate switch decides. It carries the time of day the window's clock shows as it
 * is handed over, held animation or not, since only the author moves it.
 */
describe('lightingClock', () =>
{
  describe('lightingClockAt', () =>
  {
    it('counts the whole engine frames the page\'s clock has run, a frame never landing early', () =>
    {
      // Arrange: a second in, a hair short of the next frame, and on it.
      const times = [ 1000, 1016.6, 1016.7 ];

      // Act.
      const clocks = times.map(time => lightingClockAt(time, null, true, 840));

      // Assert.
      expect(clocks)
        .toStrictEqual([
          { frames: 60, animating: true, timeOfDay: 840 },
          { frames: 60, animating: true, timeOfDay: 840 },
          { frames: 61, animating: true, timeOfDay: 840 },
        ]);
    });

    it('stays on the held moment\'s frame while the animation is held, whatever the time, and keeps the time of day', () =>
    {
      // Arrange: a moment 30 frames in, read at two times far apart, at two times of day.
      const held = { frames: 30 };

      // Act.
      const clocks = [ lightingClockAt(1000, held, true, 840), lightingClockAt(90_000, held, true, 1320) ];

      // Assert.
      expect(clocks)
        .toStrictEqual([ { frames: 30, animating: true, timeOfDay: 840 }, { frames: 30, animating: true, timeOfDay: 1320 } ]);
    });

    it('says the game look holds still while the view does not animate, its frame still counted', () =>
    {
      // Arrange: Animate off, a second in.

      // Act.
      const clock = lightingClockAt(1000, null, false, 0);

      // Assert.
      expect(clock)
        .toStrictEqual({ frames: 60, animating: false, timeOfDay: 0 });
    });
  });
});
