import { describe, expect, it } from 'vitest';
import {
  isZeroParallax,
  parallaxOrigin,
  parallaxTileOffset,
  type ParallaxSettings,
} from '../../../../src/mapEditor/render/engine/parallax.ts';

/*
 * The parallax sits behind the map exactly where the engine would show it for the same camera: fixed to the map for
 * a parallax named with a leading !, following at half speed when it loops, drifting by its scroll speed every frame,
 * and otherwise still behind the view. The engine keeps the origin in Game_Map#parallaxOx and #parallaxOy, wraps it
 * at the picture's size and rounds its negation into the tiling sprite; the editor's tiling sprite covers the map
 * from its corner instead of the screen's, so the offset carries the camera too. The parity check matched a looping,
 * scrolling parallax pixel for pixel; these tests pin each mode.
 */

/**
 * Builds parallax settings.
 * @param {Partial<ParallaxSettings>} overrides What differs from a still parallax called Sky.
 * @returns {ParallaxSettings} The settings.
 */
const settings = (overrides: Partial<ParallaxSettings> = {}): ParallaxSettings =>
{
  return { name: 'Sky', loopX: false, loopY: false, sx: 0, sy: 0, ...overrides };
};

describe('parallax', () =>
{
  describe('isZeroParallax', () =>
  {
    it('fixes a parallax to the map only when its file name starts with !', () =>
    {
      // Arrange.
      const names = [ '!Stars', 'Stars', 'folder/!Stars', 'St!ars' ];

      // Act.
      const zero = names.map(isZeroParallax);

      // Assert.
      expect(zero)
        .toStrictEqual([ true, false, true, false ]);
    });
  });

  describe('parallaxOrigin', () =>
  {
    it('moves one to one with the display for a ! parallax, at half speed for a looping one, and not at all otherwise', () =>
    {
      // Arrange: the display 10 tiles across and 4 down, no frames of drift.
      const display = { x: 10, y: 4 };

      // Act.
      const origins = [
        parallaxOrigin(settings({ name: '!Sky' }), display, 0, 48),
        parallaxOrigin(settings({ loopX: true, loopY: true }), display, 0, 48),
        parallaxOrigin(settings(), display, 0, 48),
      ];

      // Assert.
      expect(origins)
        .toStrictEqual([ { x: 480, y: 192 }, { x: 240, y: 96 }, { x: 0, y: 0 } ]);
    });

    it('drifts a looping parallax by a quarter of its scroll speed a frame, and never a still one', () =>
    {
      // Arrange: 60 frames at scroll speed 2 across and -4 down, the display at the origin.
      const display = { x: 0, y: 0 };

      // Act.
      const origins = [
        parallaxOrigin(settings({ loopX: true, loopY: true, sx: 2, sy: -4 }), display, 60, 48),
        parallaxOrigin(settings({ sx: 2, sy: -4 }), display, 60, 48),
      ];

      // Assert.
      expect(origins)
        .toStrictEqual([ { x: 30, y: -60 }, { x: 0, y: 0 } ]);
    });
  });

  describe('parallaxTileOffset', () =>
  {
    it('keeps a still parallax fixed to the view by carrying the camera', () =>
    {
      // Arrange: the camera 100 pixels across and 60 down.
      const camera = { x: 100, y: 60 };

      // Act.
      const offset = parallaxTileOffset(settings(), camera, 0, 48, { x: 512, y: 256 });

      // Assert.
      expect(offset)
        .toStrictEqual({ x: 100, y: 60 });
    });

    it('pins a ! parallax to the map whatever the camera', () =>
    {
      // Arrange.
      const cameras = [ { x: 0, y: 0 }, { x: 96, y: 480 } ];

      // Act.
      const offsets = cameras.map(camera => parallaxTileOffset(settings({ name: '!Sky' }), camera, 0, 48, { x: 512, y: 256 }));

      // Assert: the second camera's origin wraps at the picture, which moves the picture a whole tile of itself.
      expect(offsets)
        .toStrictEqual([ { x: 0, y: 0 }, { x: 0, y: 256 } ]);
    });

    it('rounds a half-speed origin the way the engine\'s tiling sprite does', () =>
    {
      // Arrange: a looping parallax with the camera 97 pixels across, an origin of 48.5.
      const camera = { x: 97, y: 0 };

      // Act.
      const offset = parallaxTileOffset(settings({ loopX: true }), camera, 0, 48, { x: 512, y: 256 });

      // Assert: Math.round(-48.5) is -48, so the offset is 97 - 48.
      expect(offset)
        .toStrictEqual({ x: 49, y: 0 });
    });
  });
});
