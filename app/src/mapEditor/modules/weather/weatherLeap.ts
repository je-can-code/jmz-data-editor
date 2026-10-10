import {
  dragOf,
  entryDepthOf,
  flipOf,
  marginOf,
  peakOf,
  pulseRateOf,
  swayOf,
  swayRateOf,
  type WeatherBounds,
  type WeatherParticle,
} from './weatherMotion.ts';
import type { WeatherLayer } from './weatherPresets.ts';

/**
 * A stretch of frames a particle can be carried across at once: how many, and whether it leaves the screen on the last
 * of them.
 */
type Leap = {
  readonly frames: number;
  readonly escapes: boolean;
};

/**
 * How far a wander can carry a particle from the line it travels, either way: the sine difference it is moved by runs
 * from -2 to 2.
 */
const WANDER_REACH = 2;

/**
 * Finds the first frame, counting from 1, on which a particle travelling at a steady speed along one axis is past one of
 * that axis's lines, as WeatherMotion#hasEscaped tests it after every frame: strictly beyond either.
 * @param {number} position Where it is on the axis.
 * @param {number} speed How far it moves along the axis each frame.
 * @param {number} low The low line.
 * @param {number} high The high line.
 * @returns {number} The frame, or Infinity for a particle that never moves on the axis.
 */
const framesToCross = (position: number, speed: number, low: number, high: number): number =>
{
  if (speed > 0)
  {
    return Math.max(Math.floor((high - position) / speed) + 1, 1);
  }

  if (speed < 0)
  {
    return Math.max(Math.floor((low - position) / speed) + 1, 1);
  }

  return Number.POSITIVE_INFINITY;
};

/**
 * Works out how many frames of settling a particle can be carried across at once, exactly as the same number of single
 * frames would carry it: only a particle that lives until it leaves (no lifetime, so no fade out and no turning into
 * anything), that sheds no speed, fades in rather than out and is not waiting, so its every frame moves it by the same
 * amounts. It is carried no further than the frame it leaves the screen on, which is worked out for each axis it travels
 * in a straight line. A particle wandering across its heading is carried only as far as the whole reach of its wander
 * stays inside the lines on that axis; within reach of one, it is moved a frame at a time, as the plugin moves it.
 * @param {WeatherParticle} particle The particle.
 * @param {WeatherLayer} params The motion it lives by.
 * @param {WeatherBounds} bounds The screen.
 * @param {number} frames How many frames of settling are left.
 * @returns {Leap | null} The stretch, or null when the particle must be moved a frame at a time.
 */
const leapFor = (particle: WeatherParticle, params: WeatherLayer, bounds: WeatherBounds, frames: number): Leap | null =>
{
  if (particle.life !== 0 || particle.stagger > 0 || dragOf(params) !== 0 || params.fadeIn < 0)
  {
    return null;
  }

  const margin = marginOf(params) + entryDepthOf(params);
  const across = { position: particle.x, speed: particle.velocityX, low: -margin, high: bounds.width + margin };
  const down = { position: particle.y, speed: particle.velocityY, low: -margin, high: bounds.height + margin };

  // the wander moves whichever axis the motion mainly travels across, as WeatherMotion#applySway decides it.
  const sway = swayOf(params);
  const wanders = Math.abs(params.speedX) >= Math.abs(params.speedY) ? down : across;
  const straight = [ across, down ].filter(axis => sway === 0 || axis !== wanders);
  const crossing = Math.min(...straight.map(axis => framesToCross(axis.position, axis.speed, axis.low, axis.high)));
  let carried = Math.min(frames, crossing);

  // a wandering axis is safe for as long as its line, kept the whole reach of the wander inside each line, stays in.
  if (sway !== 0)
  {
    const reach = Math.abs(sway) * WANDER_REACH;
    const low = wanders.low + reach;
    const high = wanders.high - reach;
    if (wanders.position < low || wanders.position > high)
    {
      return null;
    }

    carried = Math.min(carried, framesToCross(wanders.position, wanders.speed, low, high) - 1);
    if (carried < 1)
    {
      return null;
    }
  }

  return { frames: carried, escapes: carried === crossing };
};

/**
 * Carries a particle across a stretch of frames at once, landing it exactly where that many frames of
 * WeatherMotion#advance would: it ages, travels, spins, turns over, pulses, grows and wanders by every frame's amount
 * together, the wander as the difference of two points on its sine, and fades in toward its peak, held there.
 * @param {WeatherParticle} particle The particle, which {@link leapFor} has said can be carried.
 * @param {WeatherLayer} params The motion it lives by.
 * @param {number} frames How many frames.
 */
const leapBy = (particle: WeatherParticle, params: WeatherLayer, frames: number): void =>
{
  particle.age += frames;
  particle.x += particle.velocityX * frames;
  particle.y += particle.velocityY * frames;
  particle.rotation += params.roll * frames;
  particle.flipPhase += flipOf(params) * frames;
  particle.pulsePhase += pulseRateOf(params) * frames;
  particle.scaleX += params.growth * frames;
  particle.scaleY += params.growth * frames;
  particle.opacity = Math.min(particle.opacity + (params.fadeIn * frames), peakOf(params));

  // a motion with no wander leaves its phase alone, as WeatherMotion#applySway does.
  const sway = swayOf(params);
  if (sway === 0)
  {
    return;
  }

  const before = Math.sin(particle.phase);
  particle.phase += swayRateOf(params) * frames;
  const offset = sway * (Math.sin(particle.phase) - before);
  if (Math.abs(params.speedX) >= Math.abs(params.speedY))
  {
    particle.y += offset;
    return;
  }

  particle.x += offset;
};

export { framesToCross, leapBy, leapFor };
export type { Leap };
