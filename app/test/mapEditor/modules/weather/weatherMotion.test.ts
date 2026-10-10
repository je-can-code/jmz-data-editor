import { describe, expect, it } from 'vitest';
import {
  advance,
  applySway,
  entryEdgeFor,
  facingScaleX,
  glowFor,
  hasEscaped,
  hasExpired,
  isDying,
  originOn,
  resolveEdge,
  settledOpacityFor,
  spawn,
  succeed,
  type WeatherParticle,
  type WeatherRolls,
} from '../../../../src/mapEditor/modules/weather/weatherMotion.ts';
import type { WeatherLayer } from '../../../../src/mapEditor/modules/weather/weatherPresets.ts';

/*
 * One particle of weather moves by J-Weather's own arithmetic (WeatherMotion), line for line, so the editor's rain falls
 * as fast, as thick and from the same edges as the game's. Every roll is handed in, so each call here is a pure function
 * of its arguments and is held to an exact number.
 *
 * A particle is born at an edge a full margin outside the screen, queued back by its share of the motion's entry depth,
 * spread across the screen plus a margin each side; its speed is jittered per axis and pointed inward from the edge that
 * decided its heading; a motion travelling diagonally shares its particles between its two upstream edges in proportion
 * to the flux through each. One appearing anywhere is scattered over the screen itself. A frame moves it on: a particle
 * waiting out its stagger only waits; anything else ages, travels, sheds its drag, spins, turns over, pulses, grows,
 * wanders across its heading, and fades in toward its peak, or out once there is just time left to fade before its life
 * ends. It has escaped past the margin and the entry queue together, and expired once its age reaches its life; a
 * motion with no life never expires. Leading resolves to the edge the player walks toward, or, standing still, the side
 * the motion travels away from.
 */
describe('weatherMotion', () =>
{
  const SCREEN = { width: 1920, height: 1080 };

  /**
   * Every roll at the middle of its range, with any named otherwise.
   * @param {Partial<WeatherRolls>} rolls The rolls to change.
   * @returns {WeatherRolls} The rolls.
   */
  const rolled = (rolls: Partial<WeatherRolls> = {}): WeatherRolls => ({
    along: 0.5,
    across: 0.5,
    speedX: 0.5,
    speedY: 0.5,
    scale: 0.5,
    stagger: 0.5,
    life: 0.5,
    edge: 0.5,
    phase: 0.5,
    flip: 0.5,
    pulse: 0.5,
    tilt: 0.5,
    stretchX: 0.5,
    stretchY: 0.5,
    ...rolls,
  });

  /**
   * A layer of moderate rain as Chef Adventure resolves it, with any knob named otherwise.
   * @param {Partial<WeatherLayer>} knobs The knobs to change.
   * @returns {WeatherLayer} The layer.
   */
  const rain = (knobs: Partial<WeatherLayer> = {}): WeatherLayer => ({
    edge: 'top',
    speedX: 0,
    speedY: 6.8,
    jitterX: 0,
    jitterY: 5.1,
    roll: 0,
    growth: 0,
    fadeIn: 25,
    staggerFrames: 120,
    life: 30,
    lifeJitter: 132,
    fadeOut: 40,
    scale: 1,
    scaleJitter: 0,
    peakOpacity: 255,
    tint: 0xffffff,
    asset: 'Rain_01A',
    density: 450,
    blend: 'normal',
    becomes: null,
    ...knobs,
  });

  /**
   * A particle standing still at the middle of the screen, with any field named otherwise.
   * @param {Partial<WeatherParticle>} fields The fields to change.
   * @returns {WeatherParticle} The particle.
   */
  const particle = (fields: Partial<WeatherParticle> = {}): WeatherParticle => ({
    x: 960,
    y: 540,
    velocityX: 0,
    velocityY: 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 0,
    phase: 0,
    age: 0,
    flipPhase: 0,
    pulsePhase: 0,
    stage: 0,
    life: 0,
    stagger: 0,
    done: false,
    ...fields,
  });

  describe('spawn', () =>
  {
    it('builds a raindrop a margin above the screen, its speed jittered, its life and its stagger rolled', () =>
    {
      // Arrange.
      const layer = rain();

      // Act.
      const born = spawn(layer, SCREEN, 'top', rolled());

      // Assert: across the middle, 256 above, 6.8 plus half of 5.1 down, 30 plus half of 132 frames, half of 120 waiting.
      expect(born)
        .toStrictEqual(particle({ x: 960, y: -256, velocityY: 9.35, phase: Math.PI, life: 96, stagger: 60 }));
    });

    it('points a speed inward from the edge it enters by, and rolls its size and its turn', () =>
    {
      // Arrange: embers rising from the bottom, whose authored speed already points up, sized with a jitter and turned
      // by a lean and a tilt.
      const layer = rain({ edge: 'bottom', speedX: 0.21, speedY: -1.68, jitterX: 0.7, jitterY: 0.7, scale: 0.3, scaleJitter: 0.1, lean: 0.25, tilt: 0.5, life: undefined, lifeJitter: undefined });

      // Act.
      const born = spawn(layer, SCREEN, 'bottom', rolled({ scale: 1, tilt: 0 }));

      // Assert: the vertical speed made upward whatever its sign, the horizontal one left alone, a quarter turn, no life.
      expect([ born.velocityX, born.velocityY, born.scaleX, born.scaleY, born.rotation, born.life, born.y ])
        .toStrictEqual([ 0.21 + 0.35, -Math.abs(-1.68 + 0.35), 0.4, 0.4, Math.PI / 2, 0, 1080 + 256 ]);
    });

    it('stretches each axis apart by its own roll, around the same size', () =>
    {
      // Arrange: shafts of light stretched by 30%.
      const layer = rain({ edge: 'anywhere', scale: 1.3, scaleJitter: 0.9, stretch: 0.3 });

      // Act.
      const born = spawn(layer, SCREEN, 'anywhere', rolled({ stretchX: 1, stretchY: 0 }));

      // Assert: the size is 1.3 plus half of 0.9, one axis 30% over it and the other 30% under.
      expect([ born.scaleX, born.scaleY ])
        .toStrictEqual([ 1.75 * 1.3, 1.75 * 0.7 ]);
    });

    it('starts a particle that turns over or blinks at its own place in the turn, and a still one at none', () =>
    {
      // Arrange: a petal turning over and blinking, and a raindrop doing neither.
      const petal = rain({ flip: 0.045, pulse: 0.5 });

      // Act.
      const turned = spawn(petal, SCREEN, 'top', rolled({ flip: 0.25, pulse: 0.75 }));
      const still = spawn(rain(), SCREEN, 'top', rolled({ flip: 0.25, pulse: 0.75 }));

      // Assert.
      expect([ turned.flipPhase, turned.pulsePhase, still.flipPhase, still.pulsePhase ])
        .toStrictEqual([ Math.PI / 2, Math.PI * 1.5, 0, 0 ]);
    });
  });

  describe('entryEdgeFor', () =>
  {
    it('shares a diagonal motion between its upstream edges by the flux through each', () =>
    {
      // Arrange: a shooting star heading down and right, 11 across a 1080-tall side (11880) against 10.2 down a
      // 1920-wide one (19584), so the left takes 11880 of 31464 of the rolls.
      const layer = rain({ speedX: 11, speedY: 10.2 });

      // Act: a roll just under the left's share, and one just over it.
      const edges = [ entryEdgeFor(layer, SCREEN, 'top', 0.377), entryEdgeFor(layer, SCREEN, 'top', 0.378) ];

      // Assert.
      expect(edges)
        .toStrictEqual([ 'left', 'top' ]);
    });

    it('keeps a single-axis motion on its one edge, and one that travels nowhere, or anywhere, where it is', () =>
    {
      // Arrange: rain falling straight down, a motion with no speed at all, and one appearing anywhere.
      const falling = rain();
      const still = rain({ speedY: 0 });

      // Act.
      const edges = [ entryEdgeFor(falling, SCREEN, 'top', 0.999), entryEdgeFor(still, SCREEN, 'left', 0.5), entryEdgeFor(falling, SCREEN, 'anywhere', 0.5) ];

      // Assert.
      expect(edges)
        .toStrictEqual([ 'top', 'left', 'anywhere' ]);
    });
  });

  describe('originOn', () =>
  {
    it('begins a particle a margin outside each edge, queued back by its share of the entry depth', () =>
    {
      // Arrange: a fog with a 280-pixel margin and a 700-pixel queue, rolled to the middle of both.
      const layer = rain({ margin: 280, entryDepth: 700 });
      const rolls = rolled();

      // Act.
      const origins = [ 'top', 'bottom', 'left', 'right' ].map(edge => originOn(edge, SCREEN, rolls, 280, layer));

      // Assert: across the screen plus a margin each side, and 280 plus 350 out.
      expect(origins)
        .toStrictEqual([
          { x: 960, y: -630 },
          { x: 960, y: 1710 },
          { x: -630, y: 540 },
          { x: 2550, y: 540 },
        ]);
    });

    it('scatters a particle appearing anywhere over the screen itself', () =>
    {
      // Arrange.
      const rolls = rolled({ along: 0.25, across: 0.75 });

      // Act.
      const origin = originOn('anywhere', SCREEN, rolls, 256, rain());

      // Assert.
      expect(origin)
        .toStrictEqual({ x: 480, y: 810 });
    });
  });

  describe('advance', () =>
  {
    it('only counts a waiting particle down, moving nothing', () =>
    {
      // Arrange.
      const waiting = particle({ stagger: 3, velocityY: 9 });

      // Act.
      advance(waiting, rain());

      // Assert.
      expect([ waiting.stagger, waiting.y, waiting.age, waiting.opacity ])
        .toStrictEqual([ 2, 540, 0, 0 ]);
    });

    it('moves a particle on, ages it, and fades it in toward its peak, held there', () =>
    {
      // Arrange: a drop far from the end of its life, and one a step from its peak.
      const falling = particle({ velocityY: 9, life: 96 });
      const almost = particle({ life: 96, opacity: 250 });

      // Act.
      advance(falling, rain());
      advance(almost, rain());

      // Assert.
      expect([ falling.y, falling.age, falling.opacity, almost.opacity ])
        .toStrictEqual([ 549, 1, 25, 255 ]);
    });

    it('fades a particle out once there is just time left to fade before its life ends, never below nothing', () =>
    {
      // Arrange: a drop with five frames left at full strength (five times 40 is 200, not over 255), and one with a
      // frame left almost gone.
      const dying = particle({ life: 96, age: 90, opacity: 255 });
      const gone = particle({ life: 96, age: 95, opacity: 10 });

      // Act.
      advance(dying, rain());
      advance(gone, rain());

      // Assert.
      expect([ dying.opacity, gone.opacity ])
        .toStrictEqual([ 215, 0 ]);
    });

    it('sheds its drag, spins, turns over, pulses and grows by the motion\'s own rates', () =>
    {
      // Arrange: a burning streak.
      const layer = rain({ drag: 0.5, roll: 0.25, flip: 0.125, pulseRate: 0.5, growth: 0.01 });
      const streak = particle({ velocityX: 8, velocityY: 4 });

      // Act.
      advance(streak, layer);

      // Assert.
      expect([ streak.x, streak.y, streak.velocityX, streak.velocityY, streak.rotation, streak.flipPhase, streak.pulsePhase, streak.scaleX, streak.scaleY ])
        .toStrictEqual([ 968, 544, 4, 2, 0.25, 0.125, 0.5, 1.01, 1.01 ]);
    });
  });

  describe('applySway', () =>
  {
    it('wanders across the heading by the difference two points on the sine make, never along it', () =>
    {
      // Arrange: a leaf drifting mostly across, and an ember climbing mostly up.
      const across = rain({ speedX: 1.5, speedY: 1, sway: 26, swayRate: 0.028 });
      const climbing = rain({ speedX: 0.21, speedY: -1.68, sway: 30, swayRate: 0.04 });
      const leaf = particle();
      const ember = particle();

      // Act.
      applySway(leaf, across);
      applySway(ember, climbing);

      // Assert: the leaf moved down, the ember sideways, by the sway times the sine's step.
      expect([ leaf.x, leaf.y, leaf.phase, ember.x, ember.y ])
        .toStrictEqual([ 960, 540 + 0.7279048783955101, 0.028, 960 + 1.1996800255990248, 540 ]);
    });

    it('leaves a motion with no wander exactly where it was', () =>
    {
      // Arrange.
      const drop = particle();

      // Act.
      applySway(drop, rain());

      // Assert.
      expect([ drop.x, drop.y, drop.phase ])
        .toStrictEqual([ 960, 540, 0 ]);
    });
  });

  describe('hasEscaped', () =>
  {
    it('lets a particle go only past the margin and the entry queue together, on every side', () =>
    {
      // Arrange: a fog's 280 and 700, so the line is 980 out; a particle on the line, and one just past it, each side.
      const layer = rain({ margin: 280, entryDepth: 700 });
      const at = [ particle({ x: -980 }), particle({ x: 2900 }), particle({ y: -980 }), particle({ y: 2060 }) ];
      const past = [ particle({ x: -981 }), particle({ x: 2901 }), particle({ y: -981 }), particle({ y: 2061 }) ];

      // Act.
      const escaped = [ ...at, ...past ].map(each => hasEscaped(each, SCREEN, layer));

      // Assert.
      expect(escaped)
        .toStrictEqual([ false, false, false, false, true, true, true, true ]);
    });
  });

  describe('lives', () =>
  {
    it('expires a particle once its age reaches its life, and never one with no life', () =>
    {
      // Arrange.
      const particles = [ particle({ life: 96, age: 95 }), particle({ life: 96, age: 96 }), particle({ life: 0, age: 5000 }) ];

      // Act.
      const expired = particles.map(hasExpired);

      // Assert.
      expect(expired)
        .toStrictEqual([ false, true, false ]);
    });

    it('is dying only with a life, a fade, and no more time left than its fade needs', () =>
    {
      // Arrange: time to spare, just enough time, no life, and no fade.
      const cases: [ WeatherParticle, WeatherLayer ][] = [
        [ particle({ life: 96, age: 80, opacity: 255 }), rain() ],
        [ particle({ life: 96, age: 90, opacity: 240 }), rain() ],
        [ particle({ life: 0, age: 90, opacity: 255 }), rain() ],
        [ particle({ life: 96, age: 95, opacity: 255 }), rain({ fadeOut: undefined }) ],
      ];

      // Act.
      const dying = cases.map(([ each, layer ]) => isDying(each, layer));

      // Assert.
      expect(dying)
        .toStrictEqual([ false, true, false, false ]);
    });

    it('settles a mortal particle at whatever its life gave it, and anything else at its peak', () =>
    {
      // Arrange: a ray part-way through its life at 40, and a raindrop that never expires.
      const ray = particle({ life: 600, opacity: 40 });
      const drop = particle({ opacity: 40 });

      // Act.
      const settled = [ settledOpacityFor(ray, rain({ peakOpacity: 66 })), settledOpacityFor(drop, rain({ peakOpacity: 66 })) ];

      // Assert.
      expect(settled)
        .toStrictEqual([ 40, 66 ]);
    });
  });

  describe('drawing', () =>
  {
    it('dims a blinking particle by its pulse\'s depth, through a cosine, and draws a steady one as it is', () =>
    {
      // Arrange: a firefly at the deepest point of its blink, one a quarter of the way, and a steady drop.
      const deep = particle({ opacity: 200, pulsePhase: Math.PI });
      const quarter = particle({ opacity: 200, pulsePhase: Math.PI / 2 });
      const steady = particle({ opacity: 200, pulsePhase: Math.PI });

      // Act.
      const glows = [ glowFor(deep, rain({ pulse: 0.85 })), glowFor(quarter, rain({ pulse: 0.85 })), glowFor(steady, rain()) ];

      // Assert.
      expect(glows.map(glow => Math.round(glow * 1000) / 1000))
        .toStrictEqual([ 30, 115, 200 ]);
    });

    it('draws a particle turned over by the cosine of its turn, mirrored past edge-on', () =>
    {
      // Arrange: a petal face on, half turned, and edge-on past the middle.
      const petals = [ particle({ scaleX: 2 }), particle({ scaleX: 2, flipPhase: Math.PI }), particle({ scaleX: 2, flipPhase: Math.PI / 3 }) ];

      // Act.
      const widths = petals.map(facingScaleX);

      // Assert.
      expect(widths.map(width => Math.round(width * 1000) / 1000))
        .toStrictEqual([ 2, -2, 1 ]);
    });
  });

  describe('resolveEdge', () =>
  {
    it('keeps a fixed edge, and resolves leading to where the player walks, the stronger axis winning', () =>
    {
      // Arrange: rain from the top, then a leaf on the leading edge with the player walking right, left, down and up.
      const leaf = rain({ edge: 'leading', speedX: 1.5, speedY: 1 });
      const walks = [ { x: 2, y: 1 }, { x: -2, y: 1 }, { x: 0, y: 3 }, { x: 0, y: -3 } ];

      // Act.
      const edges = [ resolveEdge(rain(), { x: 5, y: 0 }), ...walks.map(walk => resolveEdge(leaf, walk)) ];

      // Assert.
      expect(edges)
        .toStrictEqual([ 'top', 'right', 'left', 'bottom', 'top' ]);
    });

    it('resolves leading, with the player standing still, to the side the motion travels away from', () =>
    {
      // Arrange: a drift across to the right, one across to the left, a fall, and a climb.
      const motions = [ rain({ edge: 'leading', speedX: 2.5, speedY: 0 }), rain({ edge: 'leading', speedX: -2.5, speedY: 0 }), rain({ edge: 'leading' }), rain({ edge: 'leading', speedY: -1 }) ];

      // Act.
      const edges = motions.map(motion => resolveEdge(motion, { x: 0, y: 0 }));

      // Assert.
      expect(edges)
        .toStrictEqual([ 'left', 'right', 'top', 'bottom' ]);
    });
  });

  describe('succeed', () =>
  {
    it('stands the successor where its predecessor ended, one stage on, waiting for nothing', () =>
    {
      // Arrange: a raindrop that has landed, and the ripple it leaves.
      const landed = particle({ x: 300, y: 700, life: 96, age: 96 });
      const ripple = rain({ edge: 'anywhere', speedY: 0, jitterY: 0, life: 26, lifeJitter: undefined, staggerFrames: 0, scale: 0.09, scaleJitter: 0.05 });

      // Act.
      const born = succeed(landed, ripple, SCREEN, rolled({ scale: 0 }));

      // Assert.
      expect([ born.x, born.y, born.stage, born.stagger, born.life, born.scaleX, born.velocityY, born.opacity ])
        .toStrictEqual([ 300, 700, 1, 0, 26, 0.09, 0, 0 ]);
    });
  });
});
