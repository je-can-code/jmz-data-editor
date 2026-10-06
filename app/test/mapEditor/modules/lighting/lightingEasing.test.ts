import { describe, expect, it } from 'vitest';
import type { LightEffectTuning } from '../../../../src/mapEditor/modules/lighting/lightingConfig.ts';
import {
  asMultiplier,
  flickerStrength,
  glitchStrength,
  noiseAt,
  phaseFrom,
  pulseStrength,
  rateFrom,
  strengthFor,
} from '../../../../src/mapEditor/modules/lighting/lightingEasing.ts';

/*
 * How brightly a light burns at a frame is J-Lighting's own arithmetic (LightingEasing), ported line for line, so a torch
 * in the editor gutters exactly as it gutters in the game, to the last bit, given the same frame, start in its cycle and
 * tempo. Every expected value below was read from the plugin's own code at those inputs, on the engine these tests run
 * on, the one the game and the editor run on too: a window's noise multiplies a sine by tens of thousands, so another
 * engine's sine, a bit off in its last place, reads a different noise.
 *
 * Every curve lands between 1 - depth and full strength, never above it. A flicker beats two waves against each other; a
 * pulse is one clean wave; a glitch is no wave at all: time cut into windows on the light's own clock, most of them quiet
 * at full strength, and a window whose noise falls within the chance stuttering through its opening third only, two
 * frames down by the whole depth, two at full strength, and again. The effect's period is stretched or shortened by the
 * light's own tempo, and a steady light is at full strength, always.
 *
 * The game rolls a light's start in its cycle and its tempo with Math.random; the editor hands in rolls of its own, and
 * turns them into a phase and a tempo exactly as the game turns Math.random's.
 */

/**
 * The game's tunings, as Chef Adventure ships them.
 */
const FLICKER: LightEffectTuning = { depth: 0.2, period: 40, chance: 0, variance: 0.18 };
const PULSE: LightEffectTuning = { depth: 0.45, period: 165, chance: 0, variance: 0.22 };
const GLITCH: LightEffectTuning = { depth: 0.85, period: 55, chance: 0.28, variance: 0.12 };

describe('lightingEasing', () =>
{
  describe('asMultiplier', () =>
  {
    it('burns at full strength at the top of the wave, down by the whole depth at its foot, and halfway between', () =>
    {
      // Arrange: a depth of a fifth.
      const waves = [ 1, -1, 0 ];

      // Act.
      const strengths = waves.map(wave => asMultiplier(wave, 0.2));

      // Assert.
      expect(strengths)
        .toStrictEqual([ 1, 0.8, 0.9 ]);
    });
  });

  describe('noiseAt', () =>
  {
    it('gives each window a verdict of its own, the same every time it is asked', () =>
    {
      // Arrange: the first three windows, the second asked twice.
      const windows = [ 0, 1, 2, 1 ];

      // Act.
      const noise = windows.map(noiseAt);

      // Assert.
      expect(noise)
        .toStrictEqual([ 0, 0.9216903898159217, 0.05721816934965318, 0.9216903898159217 ]);
    });
  });

  describe('flickerStrength', () =>
  {
    it('beats two waves against each other, as the game does at each frame', () =>
    {
      // Arrange: the shipped flicker at its start, a quarter of the way round, and from a phase of 1 radian.
      const frames: [ number, number ][] = [ [ 0, 0 ], [ 10, 0 ], [ 25, 1 ] ];

      // Act.
      const strengths = frames.map(([ frame, phase ]) => flickerStrength(frame, phase, FLICKER.depth, FLICKER.period));

      // Assert.
      expect(strengths)
        .toStrictEqual([ 0.9, 0.9418403800104181, 0.8036197410643123 ]);
    });
  });

  describe('pulseStrength', () =>
  {
    it('swells and fades on one clean wave, as the game does at each frame', () =>
    {
      // Arrange: the shipped pulse at its start, at the top of its breath, and partway on from a phase of half a radian.
      const frames: [ number, number ][] = [ [ 0, 0 ], [ 41.25, 0 ], [ 60, 0.5 ] ];

      // Act.
      const strengths = frames.map(([ frame, phase ]) => pulseStrength(frame, phase, PULSE.depth, PULSE.period));

      // Assert.
      expect(strengths)
        .toStrictEqual([ 0.775, 1, 0.853587029693554 ]);
    });
  });

  describe('glitchStrength', () =>
  {
    it('holds a window whose noise is above the chance at full strength, where it would stutter if it faulted', () =>
    {
      // Arrange: frame 56 opens the second window, whose noise is 0.92, above the shipped chance of 0.28.
      const frame = 56;

      // Act.
      const strength = glitchStrength(frame, 0, GLITCH.depth, GLITCH.period, GLITCH.chance);

      // Assert.
      expect(strength)
        .toBe(1);
    });

    it('holds a faulting window at full strength once its opening third has passed', () =>
    {
      // Arrange: frame 20 is 0.36 of the way through the first window, which faults, on an even step.
      const frame = 20;

      // Act.
      const strength = glitchStrength(frame, 0, GLITCH.depth, GLITCH.period, GLITCH.chance);

      // Assert.
      expect(strength)
        .toBe(1);
    });

    it('drops by the whole depth on the even steps of a faulting window\'s opening, two frames to a step', () =>
    {
      // Arrange: the first two frames, the fifth, and the opening of the third window, whose noise is 0.06.
      const frames = [ 0, 1, 4, 110 ];

      // Act.
      const strengths = frames.map(frame => glitchStrength(frame, 0, GLITCH.depth, GLITCH.period, GLITCH.chance));

      // Assert.
      expect(strengths)
        .toStrictEqual([ 0.15000000000000002, 0.15000000000000002, 0.15000000000000002, 0.15000000000000002 ]);
    });

    it('holds full strength on the odd steps of a faulting window\'s opening', () =>
    {
      // Arrange: the third and fourth frames, and the last odd step before the opening third ends.
      const frames = [ 2, 3, 19 ];

      // Act.
      const strengths = frames.map(frame => glitchStrength(frame, 0, GLITCH.depth, GLITCH.period, GLITCH.chance));

      // Assert.
      expect(strengths)
        .toStrictEqual([ 1, 1, 1 ]);
    });

    it('shifts the windows by the light\'s phase, read as whole windows', () =>
    {
      // Arrange: frame 0 with a phase of 1, which puts it at the opening of the quiet second window.
      const phase = 1;

      // Act.
      const strength = glitchStrength(0, phase, GLITCH.depth, GLITCH.period, GLITCH.chance);

      // Assert.
      expect(strength)
        .toBe(1);
    });
  });

  describe('strengthFor', () =>
  {
    it('runs a flicker on its own curve, its period stretched by the light\'s tempo', () =>
    {
      // Arrange: a tempo 5% slow, at frame 123 from a phase of 0.7.

      // Act.
      const strength = strengthFor('flicker', 123, 0.7, FLICKER, 1.05);

      // Assert.
      expect(strength)
        .toBe(0.9128926662015735);
    });

    it('runs a pulse on its own curve, its period stretched by the light\'s tempo', () =>
    {
      // Arrange: a tempo twice as slow, at a quarter of the stretched period, the top of the breath; at the tuned period
      // that frame would be halfway down.
      const frame = 82.5;

      // Act.
      const strengths = [ strengthFor('pulse', frame, 0, PULSE, 2), strengthFor('pulse', frame, 0, PULSE, 1) ];

      // Assert.
      expect(strengths)
        .toStrictEqual([ 1, 0.775 ]);
    });

    it('runs a glitch on its own curve, with the effect\'s chance', () =>
    {
      // Arrange: the opening frame of the faulting first window.

      // Act.
      const strength = strengthFor('glitch', 0, 0, GLITCH, 1);

      // Assert.
      expect(strength)
        .toBe(0.15000000000000002);
    });

    it('burns a steady light at full strength whatever it is handed', () =>
    {
      // Arrange: the flicker's tuning, at a frame where a flicker dims.

      // Act.
      const strength = strengthFor('steady', 123, 0.7, FLICKER, 1.05);

      // Assert.
      expect(strength)
        .toBe(1);
    });
  });

  describe('phaseFrom', () =>
  {
    it('turns a roll into a start anywhere within one full turn', () =>
    {
      // Arrange: no roll, a quarter, and a half.
      const rolls = [ 0, 0.25, 0.5 ];

      // Act.
      const phases = rolls.map(phaseFrom);

      // Assert.
      expect(phases)
        .toStrictEqual([ 0, Math.PI / 2, Math.PI ]);
    });
  });

  describe('rateFrom', () =>
  {
    it('turns a roll into a tempo either side of the tuned period, by at most the variance', () =>
    {
      // Arrange: the lowest roll, the middle, and three quarters, with the shipped flicker's variance.
      const rolls = [ 0, 0.5, 0.75 ];

      // Act.
      const rates = rolls.map(roll => rateFrom(roll, FLICKER.variance));

      // Assert.
      expect(rates)
        .toStrictEqual([ 0.8200000000000001, 1, 1.09 ]);
    });
  });
});
