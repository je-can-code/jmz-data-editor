import { describe, expect, it } from 'vitest';
import { framesToCross, leapBy, leapFor } from '../../../../src/mapEditor/modules/weather/weatherLeap.ts';
import { advance, hasEscaped, spawn, type WeatherParticle } from '../../../../src/mapEditor/modules/weather/weatherMotion.ts';
import type { WeatherLayer } from '../../../../src/mapEditor/modules/weather/weatherPresets.ts';
import { rollsFrom, seededRoller } from '../../../../src/mapEditor/modules/weather/weatherRandom.ts';

/*
 * Settling a whole map's weather the plugin's way, a frame at a time, is tens of millions of frames for a snowfall, so
 * the frames that move a particle by the same amounts each time are taken together. That is only allowed where it lands
 * a particle exactly where the single frames would, and leaves the screen on exactly the same frame: a particle that
 * lives until it leaves, sheds no speed, fades in and is not waiting, carried no further than the frame it crosses a line
 * on an axis it travels straight along, and, on an axis it wanders across, no nearer to either line than the whole reach
 * of its wander. Anything else is moved a frame at a time. The proof is the plugin's own frames: many particles of every
 * kind of motion that leaps, settled both ways, leave on the same frame and land in the same place.
 */
describe('weatherLeap', () =>
{
  const SCREEN = { width: 1920, height: 1080 };

  /**
   * A motion as Chef Adventure resolves one, with any knob named otherwise.
   * @param {Partial<WeatherLayer>} knobs The knobs to change.
   * @returns {WeatherLayer} The motion.
   */
  const motion = (knobs: Partial<WeatherLayer> = {}): WeatherLayer => ({
    edge: 'top',
    speedX: 0,
    speedY: 4,
    jitterX: 0,
    jitterY: 3,
    roll: 0,
    growth: 0,
    fadeIn: 25,
    staggerFrames: 0,
    scale: 1,
    scaleJitter: 0,
    peakOpacity: 255,
    tint: 0xffffff,
    asset: 'Snow_01',
    density: 100,
    blend: 'normal',
    becomes: null,
    ...knobs,
  });

  /**
   * The motions that leap: snow falling straight down, snow floating and turning, leaves drifting with a wander, embers
   * rising with a wander across their climb, and fog crawling with a deep entry queue.
   */
  const MOTIONS: Record<string, WeatherLayer> = {
    fall: motion(),
    float: motion({ edge: 'leading', speedX: 0.28, speedY: 0.21, jitterX: 0.56, jitterY: 0.56, roll: 0.004, fadeIn: 8, scale: 0.5 }),
    leaves: motion({ edge: 'leading', speedX: 1.5, speedY: 1, jitterX: 3, jitterY: 3, sway: 26, swayRate: 0.028, tilt: 1, flip: 0.03, roll: 0.02 }),
    embers: motion({ edge: 'bottom', speedX: 0.21, speedY: -1.68, jitterX: 0.7, jitterY: 0.7, sway: 30, swayRate: 0.056, roll: 0.006, fadeIn: 10, growth: 0.001 }),
    fog: motion({ edge: 'leading', speedX: 0.36, speedY: 0, jitterX: 0.33, jitterY: 0.045, fadeIn: 4, margin: 280, entryDepth: 700, pulse: 0.5, pulseRate: 0.01 }),
  };

  /**
   * A particle at rest in the middle of the screen, with any field named otherwise.
   * @param {Partial<WeatherParticle>} fields The fields.
   * @returns {WeatherParticle} The particle.
   */
  const particle = (fields: Partial<WeatherParticle> = {}): WeatherParticle => ({
    x: 960, y: 540, velocityX: 0, velocityY: 4, rotation: 0, scaleX: 1, scaleY: 1, opacity: 0, phase: 0, age: 0, flipPhase: 0,
    pulsePhase: 0, stage: 0, life: 0, stagger: 0, done: false, ...fields,
  });

  describe('framesToCross', () =>
  {
    it('finds the first frame strictly past either line, and none for a particle that does not move on the axis', () =>
    {
      // Arrange: 10 short of the high line at 4 a frame, 10 past the low line at -4, exactly on the line, and still.
      const cases: [ number, number ][] = [ [ 90, 4 ], [ 10, -4 ], [ 100, 4 ], [ 50, 0 ] ];

      // Act.
      const frames = cases.map(([ position, speed ]) => framesToCross(position, speed, 0, 100));

      // Assert: 3 frames reach 102; 3 reach -2; one step past the line; never.
      expect(frames)
        .toStrictEqual([ 3, 3, 1, Number.POSITIVE_INFINITY ]);
    });

    it('crosses on the first frame for a particle already past its line', () =>
    {
      // Arrange.

      // Act.
      const frames = framesToCross(120, 4, 0, 100);

      // Assert.
      expect(frames)
        .toBe(1);
    });
  });

  describe('leapFor', () =>
  {
    it('moves a frame at a time any particle whose frames differ: one with a life, a wait, a drag or a fade out', () =>
    {
      // Arrange.
      const cases: [ WeatherParticle, WeatherLayer ][] = [
        [ particle({ life: 96 }), motion() ],
        [ particle({ stagger: 3 }), motion() ],
        [ particle(), motion({ drag: 0.013 }) ],
        [ particle(), motion({ fadeIn: -1 }) ],
      ];

      // Act.
      const leaps = cases.map(([ each, params ]) => leapFor(each, params, SCREEN, 50));

      // Assert.
      expect(leaps)
        .toStrictEqual([ null, null, null, null ]);
    });

    it('carries a straight-moving particle across the frames left, or to the frame it leaves on', () =>
    {
      // Arrange: a flake 540 down at 4 a frame, which crosses 1080 plus 256 on its 200th frame.

      // Act.
      const leaps = [ leapFor(particle(), motion(), SCREEN, 50), leapFor(particle(), motion(), SCREEN, 500) ];

      // Assert.
      expect(leaps)
        .toStrictEqual([ { frames: 50, escapes: false }, { frames: 200, escapes: true } ]);
    });

    it('carries a wandering particle only as far as its wander\'s whole reach stays inside the lines across', () =>
    {
      // Arrange: embers wandering 30 either way across their climb (a reach of 60), drifting right at 1 a frame: one
      // 100 short of the right line plus its margin, so 40 frames from within reach, and one already within reach.
      const params = motion({ edge: 'bottom', speedX: 0.21, speedY: -1.68, sway: 30, swayRate: 0.05 });
      const roomy = particle({ x: 1920 + 256 - 100, velocityX: 1, velocityY: -2 });
      const crowded = particle({ x: 1920 + 256 - 50, velocityX: 1, velocityY: -2 });

      // Act.
      const leaps = [ leapFor(roomy, params, SCREEN, 500), leapFor(crowded, params, SCREEN, 500) ];

      // Assert.
      expect(leaps)
        .toStrictEqual([ { frames: 40, escapes: false }, null ]);
    });
  });

  describe('leapBy', () =>
  {
    it('lands a particle where as many single frames land it, its wander, turn, blink, growth and fade included', () =>
    {
      // Arrange: an ember and its twin.
      const params = MOTIONS['embers'];
      const leapt = particle({ x: 500, y: 900, velocityX: 0.4, velocityY: -1.9, phase: 1, pulsePhase: 0.5, opacity: 30 });
      const stepped = { ...leapt };

      // Act.
      leapBy(leapt, params, 120);
      for (let frame = 0; frame < 120; frame++)
      {
        advance(stepped, params);
      }

      // Assert: every field the same to a billionth.
      const keys = Object.keys(stepped) as (keyof WeatherParticle)[];
      expect(keys.filter(key => Math.abs(Number(leapt[key]) - Number(stepped[key])) > 1e-9))
        .toStrictEqual([]);
    });
  });

  describe('settling both ways', () =>
  {
    it('leaves the screen on the same frame, and lands in the same place, as the plugin\'s single frames', () =>
    {
      // Arrange: forty particles of every motion that leaps, each rolled from a seed and settled for up to 3000 frames,
      // counting how many leave and how often a leap is refused, so both ways are proved to have run.
      const mismatches: string[] = [];
      const roll = seededRoller(42);
      let left = 0;
      let refused = 0;

      // Act: each particle settled frame by frame, and by leaps where they are allowed, noting the frame each leaves on.
      Object.entries(MOTIONS).forEach(([ name, params ]) =>
      {
        for (let made = 0; made < 40; made++)
        {
          const born = spawn(params, SCREEN, params.edge === 'leading' ? 'left' : params.edge, rollsFrom(roll));
          born.stagger = 0;
          const budget = Math.floor(roll() * 3000);

          // the plugin's way: a frame at a time, stopping on the frame it leaves.
          const stepped = { ...born };
          let steppedOut = -1;
          for (let frame = 1; frame <= budget; frame++)
          {
            advance(stepped, params);
            if (hasEscaped(stepped, SCREEN, params))
            {
              steppedOut = frame;
              break;
            }
          }

          // the leaping way, a frame at a time wherever a leap is not allowed.
          const leapt = { ...born };
          let leaptOut = -1;
          let frame = 0;
          while (frame < budget && leaptOut < 0)
          {
            const leap = leapFor(leapt, params, SCREEN, budget - frame);
            if (leap === null)
            {
              refused += 1;
              advance(leapt, params);
              frame += 1;
              leaptOut = hasEscaped(leapt, SCREEN, params) ? frame : -1;
              continue;
            }

            leapBy(leapt, params, leap.frames);
            frame += leap.frames;
            leaptOut = leap.escapes ? frame : -1;
          }

          const apart = Math.max(Math.abs(stepped.x - leapt.x), Math.abs(stepped.y - leapt.y), Math.abs(stepped.opacity - leapt.opacity));
          if (steppedOut !== leaptOut || apart > 1e-6)
          {
            mismatches.push(`${name} ${made}: out on ${steppedOut} and ${leaptOut}, ${apart} apart`);
          }

          left += steppedOut > 0 ? 1 : 0;
        }
      });

      // Assert: no particle differs, many left the screen, and leaps were refused near the lines.
      expect([ mismatches, left > 40, refused > 100 ])
        .toStrictEqual([ [], true, true ]);
    });
  });
});
