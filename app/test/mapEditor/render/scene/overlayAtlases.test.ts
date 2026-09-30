import { describe, expect, it } from 'vitest';
import { passageMarkIndex, regionHue } from '../../../../src/mapEditor/render/scene/overlayAtlases.ts';

/*
 * The passability and region overlays draw one quad per cell from small atlases, so the index a cell picks is the
 * mark the author sees: nothing for a cell every step can leave, the red mark for the engine's own blocks, and the
 * amber row when a module's rule is among the reasons, so the author can tell a tile's passage from a plugin's.
 */
describe('overlayAtlases', () =>
{
  describe('passageMarkIndex', () =>
  {
    it('picks no mark for an open cell, the engine\'s row for its blocks, and the rule row when a rule denies', () =>
    {
      // Arrange: open; blocked down; blocked every way; blocked down and denied right; denied only.
      const cases: [ number, number ][] = [ [ 0, 0 ], [ 1, 0 ], [ 15, 0 ], [ 1, 4 ], [ 0, 8 ] ];

      // Act.
      const marks = cases.map(([ blocked, denied ]) => passageMarkIndex(blocked, denied));

      // Assert: the mark shows every stopped way; the rule row starts at 16.
      expect(marks)
        .toStrictEqual([ -1, 1, 15, 21, 24 ]);
    });
  });

  describe('regionHue', () =>
  {
    it('spreads neighbouring regions far apart around the colour wheel', () =>
    {
      // Arrange.
      const regions = [ 1, 2, 3 ];

      // Act.
      const hues = regions.map(regionHue);

      // Assert: every pair of neighbours at least 90 degrees apart.
      const gaps = hues.slice(1).map((hue, index) =>
      {
        const gap = Math.abs(hue - hues[index]) % 360;
        return Math.min(gap, 360 - gap) >= 90;
      });
      expect([ hues.every(hue => hue >= 0 && hue < 360), gaps ])
        .toStrictEqual([ true, [ true, true ] ]);
    });
  });
});
