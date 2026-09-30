import { describe, expect, it } from 'vitest';
import {
  animationFrameAt,
  animationVector,
  engineFramesAt,
  waterfallIndex,
  waterSurfaceIndex,
} from '../../../../src/mapEditor/render/engine/animation.ts';

/*
 * Water moves in the editor at the engine's pace: Tilemap#update steps the animation every 30 frames at 60 frames a
 * second, the sea's surface steps 0, 1, 2, 1 and waterfalls cycle 0, 1, 2. The renderer feeds these two numbers to
 * every chunk's shader, so they alone decide which frame of water the editor shows at any moment.
 */
describe('animation', () =>
{
  describe('engineFramesAt and animationFrameAt', () =>
  {
    it('counts whole engine frames, and steps the animation every thirty of them', () =>
    {
      // Arrange: just before and after half a second, and a whole second.
      const moments = [ 0, 499, 500, 1000 ];

      // Act.
      const counts = moments.map(ms => [ engineFramesAt(ms), animationFrameAt(ms) ]);

      // Assert.
      expect(counts)
        .toStrictEqual([ [ 0, 0 ], [ 29, 0 ], [ 30, 1 ], [ 60, 2 ] ]);
    });
  });

  describe('waterSurfaceIndex and waterfallIndex', () =>
  {
    it('steps the sea 0, 1, 2, 1 and waterfalls 0, 1, 2, each repeating', () =>
    {
      // Arrange.
      const steps = [ 0, 1, 2, 3, 4, 5, 6 ];

      // Act.
      const frames = steps.map(step => [ waterSurfaceIndex(step), waterfallIndex(step) ]);

      // Assert.
      expect(frames)
        .toStrictEqual([ [ 0, 0 ], [ 1, 1 ], [ 2, 2 ], [ 1, 0 ], [ 0, 1 ], [ 1, 2 ], [ 2, 0 ] ]);
    });
  });

  describe('animationVector', () =>
  {
    it('pairs the sea frame with the waterfall frame for the shader', () =>
    {
      // Arrange: step 5 is sea frame 1 and waterfall frame 2.
      const step = 5;

      // Act.
      const vector = animationVector(step);

      // Assert.
      expect(vector)
        .toStrictEqual([ 1, 2 ]);
    });
  });
});
