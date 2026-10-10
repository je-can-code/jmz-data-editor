import { describe, expect, it } from 'vitest';
import type { LightingClock } from '../../../../src/mapEditor/core/renderer/lightingLayer.ts';
import { effectStrength, isAnimated } from '../../../../src/mapEditor/modules/lighting/lightEffects.ts';
import type { EffectTunings } from '../../../../src/mapEditor/modules/lighting/lightingConfig.ts';

/*
 * A light whose effect runs burns, at each frame of the view's clock, at the strength J-Lighting gives it there
 * (lightingEasing's own tests hold the curves), tuned as the project tunes that effect, from a start in its cycle and a
 * tempo of its own. Those two are rolled from the light's map and its name (lightSeeds' own tests hold the rolls), so a
 * light asked twice at one frame answers the same, the next frame it answers differently, and the torch beside it,
 * running the same effect, answers differently again.
 *
 * A steady light burns at full strength at every frame, and while the view does not animate every light does, as it
 * would with no effect running.
 */

/**
 * The game's tunings, as Chef Adventure ships them.
 */
const SHIPPED: EffectTunings = {
  flicker: { depth: 0.2, period: 40, chance: 0, variance: 0.18 },
  pulse: { depth: 0.45, period: 165, chance: 0, variance: 0.22 },
  glitch: { depth: 0.85, period: 55, chance: 0.28, variance: 0.12 },
};

/**
 * The view's clock at a frame, at midnight.
 * @param {number} frames The frame.
 * @param {boolean} animating Whether the view animates.
 * @returns {LightingClock} The clock.
 */
const at = (frames: number, animating = true): LightingClock => ({ frames, animating, timeOfDay: 0 });

describe('lightEffects', () =>
{
  describe('isAnimated', () =>
  {
    it('moves every effect a tag can name with time, and never a steady light', () =>
    {
      // Arrange.
      const effects = [ 'flicker', 'pulse', 'glitch', 'steady' ] as const;

      // Act.
      const animated = effects.map(isAnimated);

      // Assert.
      expect(animated)
        .toStrictEqual([ true, true, true, false ]);
    });
  });

  describe('effectStrength', () =>
  {
    const strengthOf = effectStrength(SHIPPED);

    it('burns a flickering torch at the strength its own cycle gives at the frame, the same each time it is asked', () =>
    {
      // Arrange: the first torch on map 6.
      const torch = { mapId: 6, id: 'page:12#0', effect: 'flicker' as const };

      // Act.
      const strengths = [ strengthOf(torch, at(100)), strengthOf(torch, at(100)) ];

      // Assert.
      expect(strengths)
        .toStrictEqual([ 0.9115909902530034, 0.9115909902530034 ]);
    });

    it('moves the torch on as the clock moves', () =>
    {
      // Arrange: the same torch, the next two frames.
      const torch = { mapId: 6, id: 'page:12#0', effect: 'flicker' as const };

      // Act.
      const strengths = [ strengthOf(torch, at(101)), strengthOf(torch, at(102)) ];

      // Assert: brighter each frame, from 0.91 at frame 100.
      expect(strengths)
        .toStrictEqual([ 0.9360984519453811, 0.958182748819905 ]);
    });

    it('burns the torch beside it, and the same torch on another map, at strengths of their own', () =>
    {
      // Arrange: the next event's torch on map 6, and event 12's torch on map 7, at the same frame.
      const torches = [ { mapId: 6, id: 'page:13#0', effect: 'flicker' as const }, { mapId: 7, id: 'page:12#0', effect: 'flicker' as const } ];

      // Act.
      const strengths = torches.map(torch => strengthOf(torch, at(100)));

      // Assert: neither at the first torch's 0.91.
      expect(strengths)
        .toStrictEqual([ 0.8872535368941584, 0.9905858955050714 ]);
    });

    it('runs a pulse and a glitch by their own tunings', () =>
    {
      // Arrange: the same light name as a pulse and as a glitch, at frame 240, where the glitch stutters; the glitch's
      // depth takes 0.85 away there, which no other effect's could.
      const pulse = { mapId: 6, id: 'page:12#0', effect: 'pulse' as const };
      const glitch = { mapId: 6, id: 'page:12#0', effect: 'glitch' as const };

      // Act.
      const strengths = [ strengthOf(pulse, at(240)), strengthOf(glitch, at(240)) ];

      // Assert.
      expect(strengths)
        .toStrictEqual([ 0.7096033728892897, 0.15000000000000002 ]);
    });

    it('burns a steady light at full strength at a frame where a flicker dims', () =>
    {
      // Arrange: a steady lamp under the torch's name.
      const lamp = { mapId: 6, id: 'page:12#0', effect: 'steady' as const };

      // Act.
      const strength = strengthOf(lamp, at(100));

      // Assert.
      expect(strength)
        .toBe(1);
    });

    it('burns every light at full strength while the view does not animate', () =>
    {
      // Arrange: the torch, at the frame where it dims, with Animate off.
      const torch = { mapId: 6, id: 'page:12#0', effect: 'flicker' as const };

      // Act.
      const strength = strengthOf(torch, at(100, false));

      // Assert.
      expect(strength)
        .toBe(1);
    });
  });
});
