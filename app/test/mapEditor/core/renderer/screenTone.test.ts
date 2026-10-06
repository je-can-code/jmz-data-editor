import { describe, expect, it } from 'vitest';
import type { ScreenTone } from '../../../../src/mapEditor/core/renderer/lightingLayer.ts';
import { castsTone, sameTone } from '../../../../src/mapEditor/core/renderer/screenTone.ts';

/*
 * A screen tone is compared channel by channel, none being the same only as none, so a tone cast again as a fresh array
 * changes nothing. A tone of all zeroes is what the screen shows with nobody tinting it, which J-Lighting reads as a
 * source letting the screen go, so it casts no more than none does; any channel off zero, grey included, casts.
 */
describe('screenTone', () =>
{
  /**
   * Night halfway to Moontide.
   */
  const NIGHT: ScreenTone = [ -32, -16, 37, 133 ];

  describe('sameTone', () =>
  {
    it('matches the same channels in another array, and none with none', () =>
    {
      // Arrange.
      const pairs: [ ScreenTone | null, ScreenTone | null ][] = [ [ NIGHT, [ -32, -16, 37, 133 ] ], [ null, null ] ];

      // Act.
      const same = pairs.map(([ left, right ]) => sameTone(left, right));

      // Assert.
      expect(same)
        .toStrictEqual([ true, true ]);
    });

    it('tells apart tones a single channel apart, and a tone from none either way round', () =>
    {
      // Arrange: grey one apart, and none beside the night on each side.
      const pairs: [ ScreenTone | null, ScreenTone | null ][] = [ [ NIGHT, [ -32, -16, 37, 134 ] ], [ NIGHT, null ], [ null, NIGHT ] ];

      // Act.
      const same = pairs.map(([ left, right ]) => sameTone(left, right));

      // Assert.
      expect(same)
        .toStrictEqual([ false, false, false ]);
    });
  });

  describe('castsTone', () =>
  {
    it('casts a tone with any channel off zero, grey alone included', () =>
    {
      // Arrange.
      const tones: ScreenTone[] = [ NIGHT, [ 0, 0, 0, 1 ] ];

      // Act.
      const casts = tones.map(castsTone);

      // Assert.
      expect(casts)
        .toStrictEqual([ true, true ]);
    });

    it('casts nothing for none, or a tone of all zeroes', () =>
    {
      // Arrange.
      const tones: (ScreenTone | null)[] = [ null, [ 0, 0, 0, 0 ] ];

      // Act.
      const casts = tones.map(castsTone);

      // Assert.
      expect(casts)
        .toStrictEqual([ false, false ]);
    });
  });
});
