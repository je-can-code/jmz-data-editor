import { describe, expect, it } from 'vitest';
import { MAX_SETTLE_FRAMES, particleCountFor, settleFramesFor, WeatherField } from '../../../../src/mapEditor/modules/weather/weatherField.ts';
import type { WeatherParticle } from '../../../../src/mapEditor/modules/weather/weatherMotion.ts';
import type { WeatherLayer } from '../../../../src/mapEditor/modules/weather/weatherPresets.ts';
import { seededRoller } from '../../../../src/mapEditor/modules/weather/weatherRandom.ts';

/*
 * One layer of weather is a population of particles moved exactly as Sprite_WeatherLayer moves its own, rolled here from
 * a seed so every number is the same on every run. Its size is the layer's density scaled by the screen's area against
 * RPG Maker's default window, rounded. Built as an arrival, every particle is run forward a random slice of its own
 * journey (its lifetime, or the whole crossing at its own pace, margins and queue included, held to 12000 frames) and
 * left fully in and waiting for nothing, so the weather opens as weather that has been going; built as a change, each
 * starts at its edge and staggers in.
 *
 * A frame moves every particle on. One that leaves is rebuilt at an edge with fresh rolls and no wait; one whose first
 * life runs out turns into what its layer becomes, where it ended; and what that leaves behind starts again as the
 * layer's own. A retired layer replaces nothing, so it empties, and is drained once every particle is done. A screen of
 * another size keeps every particle at its place on it, stretched with it, and grows or thins the population to the
 * count the new size takes, newcomers settled.
 */
describe('weatherField', () =>
{
  const DEFAULT_WINDOW = { width: 816, height: 624 };

  /**
   * Snow falling straight down, as Chef Adventure's fall motion draws it at full speed, with any knob named otherwise.
   * @param {Partial<WeatherLayer>} knobs The knobs to change.
   * @returns {WeatherLayer} The layer.
   */
  const fall = (knobs: Partial<WeatherLayer> = {}): WeatherLayer => ({
    edge: 'top',
    speedX: 0,
    speedY: 4,
    jitterX: 0,
    jitterY: 3,
    roll: 0,
    growth: 0,
    fadeIn: 25,
    staggerFrames: 120,
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
   * Rain that lands and leaves a ripple, as Chef Adventure's raindrop and ripple motions draw it.
   * @returns {WeatherLayer} The layer.
   */
  const raindrops = (): WeatherLayer => fall({
    asset: 'Rain_01A',
    life: 30,
    lifeJitter: 132,
    fadeOut: 40,
    staggerFrames: 0,
    becomes: fall({ edge: 'anywhere', speedY: 0, jitterY: 0, life: 26, fadeIn: 60, fadeOut: 12, growth: 0.011, staggerFrames: 0, scale: 0.09, asset: 'Particles' }),
  });

  /**
   * Writes over one particle's fields, as a test moves it somewhere it must not wait to reach.
   * @param {WeatherField} field The field.
   * @param {number} index The particle.
   * @param {Partial<WeatherParticle>} fields The fields.
   */
  const place = (field: WeatherField, index: number, fields: Partial<WeatherParticle>): void =>
  {
    Object.assign(field.particles[index], fields);
  };

  describe('particleCountFor', () =>
  {
    it('scales a density by the screen\'s area against the default window, rounded', () =>
    {
      // Arrange: moderate rain on the default window, on Chef Adventure's 1920x1080 screen, and on no screen.

      // Act.
      const counts = [ particleCountFor(450, DEFAULT_WINDOW), particleCountFor(450, { width: 1920, height: 1080 }), particleCountFor(450, { width: 0, height: 0 }) ];

      // Assert: 450 times 4.07 is 1832.58.
      expect(counts)
        .toStrictEqual([ 450, 1833, 0 ]);
    });
  });

  describe('settleFramesFor', () =>
  {
    it('settles a mortal particle over its life, and anything else over its whole crossing at its own pace, to a ceiling', () =>
    {
      // Arrange: a drop living 96 frames; a flake at 4 a frame across 256 twice plus 816 plus 624; one barely moving.
      const layer = fall();
      const mortal = { life: 96, velocityX: 0, velocityY: 4 } as WeatherParticle;
      const flake = { life: 0, velocityX: 0, velocityY: 4 } as WeatherParticle;
      const crawling = { life: 0, velocityX: 0.01, velocityY: 0 } as WeatherParticle;

      // Act.
      const frames = [ mortal, flake, crawling ].map(each => settleFramesFor(each, layer, DEFAULT_WINDOW));

      // Assert: 1952 over 4, and 1952 over the slowest pace counted, 0.05, held to the ceiling.
      expect(frames)
        .toStrictEqual([ 96, 488, MAX_SETTLE_FRAMES ]);
    });
  });

  describe('a population', () =>
  {
    it('built as a change, waits at its edge to stagger in', () =>
    {
      // Arrange.
      const layer = fall();

      // Act.
      const field = new WeatherField(layer, DEFAULT_WINDOW, seededRoller(7), false);

      // Assert: a hundred above the screen, most of them still waiting their turn.
      const { particles } = field;
      expect([ particles.length, particles.every(each => each.y === -256), particles.filter(each => each.stagger > 0).length > 90 ])
        .toStrictEqual([ 100, true, true ]);
    });

    it('built as an arrival, has been falling a while: none waiting, every one fully in, most on the screen', () =>
    {
      // Arrange.
      const layer = fall();

      // Act.
      const field = new WeatherField(layer, DEFAULT_WINDOW, seededRoller(7), true);

      // Assert.
      const { particles } = field;
      const onScreen = particles.filter(each => each.y >= 0 && each.y <= 624).length;
      expect([ particles.length, particles.filter(each => each.stagger > 0).length, particles.every(each => each.opacity === 255), onScreen ])
        .toStrictEqual([ 100, 0, true, 46 ]);
    });

    it('is the same population from the same seed, and another from another', () =>
    {
      // Arrange.
      const layer = fall();

      // Act.
      const fields = [ seededRoller(7), seededRoller(7), seededRoller(8) ].map(roll => new WeatherField(layer, DEFAULT_WINDOW, roll, true));

      // Assert.
      expect([ fields[1].particles, fields[2].particles[0].x === fields[0].particles[0].x ])
        .toStrictEqual([ fields[0].particles, false ]);
    });
  });

  describe('step', () =>
  {
    it('moves every particle on by its own speed, a frame at a time', () =>
    {
      // Arrange: a change with nothing to wait for, so every flake moves from its edge at once.
      const field = new WeatherField(fall({ staggerFrames: 0 }), DEFAULT_WINDOW, seededRoller(7), false);
      const before = field.particles.map(each => [ each.y, each.velocityY ]);

      // Act.
      field.step();

      // Assert.
      expect(field.particles.map(each => each.y))
        .toStrictEqual(before.map(([ y, speed ]) => y + speed));
    });

    it('rebuilds a particle that leaves the screen at its edge, with fresh rolls and nothing to wait for', () =>
    {
      // Arrange: the first flake a step from leaving past the bottom margin, the second well inside.
      const field = new WeatherField(fall(), DEFAULT_WINDOW, seededRoller(7), true);
      place(field, 0, { x: 400, y: 624 + 256, velocityY: 5, stagger: 0 });
      place(field, 1, { x: 400, y: 300, velocityY: 5, stagger: 0 });

      // Act.
      field.step();

      // Assert: the first is new, back above the screen; the second fell on.
      const [ first, second ] = field.particles;
      expect([ first.y, first.stagger, first.opacity, first.age, second.y ])
        .toStrictEqual([ -256, 0, 0, 0, 305 ]);
    });

    it('turns a drop that runs out of life into its ripple, where it landed, and the spent ripple back into a drop', () =>
    {
      // Arrange: the first drop a frame from the end of its life.
      const field = new WeatherField(raindrops(), DEFAULT_WINDOW, seededRoller(7), true);
      place(field, 0, { x: 300, y: 400, velocityY: 5, life: 96, age: 95, stagger: 0, stage: 0 });

      // Act: the frame it lands in, then the ripple run out in its turn.
      field.step();
      const ripple = { ...field.particles[0] };
      place(field, 0, { age: ripple.life - 1 });
      field.step();
      const [ after ] = field.particles;

      // Assert: the ripple stood where the drop landed, one stage on, its size the stage's; then a fresh drop at the top.
      expect([ ripple.x, ripple.y, ripple.stage, ripple.scaleX, ripple.stagger, field.paramsFor(0).asset, after.stage, after.y ])
        .toStrictEqual([ 300, 405, 1, 0.09, 0, 'Rain_01A', 0, -256 ]);
    });

    it('lets a drop that leaves before its life runs out go without a ripple', () =>
    {
      // Arrange: a mortal drop past the bottom margin with life to spare.
      const field = new WeatherField(raindrops(), DEFAULT_WINDOW, seededRoller(7), true);
      place(field, 0, { x: 300, y: 624 + 256, velocityY: 5, life: 96, age: 10, stagger: 0, stage: 0 });

      // Act.
      field.step();

      // Assert: a fresh drop, not a ripple.
      expect([ field.particles[0].stage, field.particles[0].y ])
        .toStrictEqual([ 0, -256 ]);
    });

    it('leaves a waiting particle where it is, counting down', () =>
    {
      // Arrange.
      const field = new WeatherField(fall(), DEFAULT_WINDOW, seededRoller(7), false);
      const waiting = field.particles.findIndex(each => each.stagger > 1);
      const before = { ...field.particles[waiting] };

      // Act.
      field.step();

      // Assert.
      expect([ field.particles[waiting].y, field.particles[waiting].stagger ])
        .toStrictEqual([ before.y, before.stagger - 1 ]);
    });
  });

  describe('retire', () =>
  {
    it('replaces nothing that finishes, leaves a finished particle where it is, and drains once every one is done', () =>
    {
      // Arrange: a retired layer of two flakes, both about to leave.
      const field = new WeatherField(fall({ density: 2 }), DEFAULT_WINDOW, seededRoller(7), true);
      field.retire();
      place(field, 0, { y: 624 + 256, velocityY: 5, stagger: 0 });
      place(field, 1, { y: 300, velocityY: 5, stagger: 0 });

      // Act: one frame, then the second sent past the edge and another frame.
      field.step();
      const drainedEarly = field.isDrained();
      place(field, 1, { y: 624 + 256 });
      field.step();
      field.step();

      // Assert: the first done where it left and never moved again; drained only once both were done.
      expect([ field.retired, drainedEarly, field.isDrained(), field.particles[0].y ])
        .toStrictEqual([ true, false, true, 624 + 256 + 5 ]);
    });
  });

  describe('resize', () =>
  {
    it('keeps every particle at its place on a screen of another size, stretched with it', () =>
    {
      // Arrange: one flake a quarter across and halfway down the default window.
      const field = new WeatherField(fall({ density: 1 }), DEFAULT_WINDOW, seededRoller(7), true);
      place(field, 0, { x: 204, y: 312 });

      // Act: a screen half as wide and twice as tall, with the same area.
      field.resize({ width: 408, height: 1248 });

      // Assert.
      expect([ field.particles[0].x, field.particles[0].y, field.particles.length, field.bounds ])
        .toStrictEqual([ 102, 624, 1, { width: 408, height: 1248 } ]);
    });

    it('grows the population for a bigger screen, its newcomers settled, and thins it from the end for a smaller one', () =>
    {
      // Arrange.
      const field = new WeatherField(fall(), DEFAULT_WINDOW, seededRoller(7), true);
      const firstTen = field.particles.slice(0, 10).map(each => ({ ...each }));

      // Act: a screen four times the area, then one a quarter of the first.
      field.resize({ width: 1632, height: 1248 });
      const grown = field.particles.length;
      const newcomersWaiting = field.particles.slice(100).filter(each => each.stagger > 0).length;
      field.resize({ width: 408, height: 312 });

      // Assert: the first ten kept, scaled by a half across and down from where they stood.
      expect([ grown, newcomersWaiting, field.particles.length, field.particles.slice(0, 10).map(each => [ each.x, each.y ]) ])
        .toStrictEqual([ 400, 0, 25, firstTen.map(each => [ each.x * 0.5, each.y * 0.5 ]) ]);
    });

    it('changes nothing for a screen of the same size', () =>
    {
      // Arrange.
      const field = new WeatherField(fall(), DEFAULT_WINDOW, seededRoller(7), true);
      const before = field.particles.map(each => ({ ...each }));

      // Act.
      field.resize({ width: 816, height: 624 });

      // Assert.
      expect(field.particles)
        .toStrictEqual(before);
    });
  });

  describe('lookOf', () =>
  {
    it('draws a waiting particle as nothing, and any other at its glow, turned over by its flip', () =>
    {
      // Arrange: a waiting flake, and a petal half turned over at full strength.
      const field = new WeatherField(fall({ density: 2, flip: 0.05 }), DEFAULT_WINDOW, seededRoller(7), true);
      place(field, 0, { stagger: 4, opacity: 255 });
      place(field, 1, { stagger: 0, opacity: 200, scaleX: 2, scaleY: 3, flipPhase: Math.PI, x: 10, y: 20, rotation: 1 });

      // Act.
      const looks = [ field.lookOf(0), field.lookOf(1) ];

      // Assert.
      expect([ looks[0].opacity, looks[1] ])
        .toStrictEqual([ 0, { x: 10, y: 20, rotation: 1, scaleX: -2, scaleY: 3, opacity: 200, stage: 0 } ]);
    });
  });
});
