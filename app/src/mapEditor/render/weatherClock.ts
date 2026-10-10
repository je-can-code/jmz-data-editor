import type { WeatherClock } from '../core/renderer/weatherLayer.ts';
import { engineFramesAt } from './engine/animation.ts';

/**
 * Reads a view's clock for its weather at a frame: the engine frame the frame's time falls on, counted on the page's own
 * clock, so it never starts over with a map opened or redrawn, unless the renderer holds its animation still, when it is
 * the held moment's frame; and whether the game look moves. The game moves its weather a step a frame, and counts its
 * frames from the time that passed, so a frame arriving a little late moves the weather on two steps, as the game's own
 * frames do.
 * @param {number} time The frame's time, in milliseconds on the page's clock.
 * @param {{ frames: number } | null} held The moment the animation is held still at, or null when it follows the clock.
 * @param {boolean} animate Whether the game look moves.
 * @returns {WeatherClock} The clock.
 */
const weatherClockAt = (time: number, held: { readonly frames: number } | null, animate: boolean): WeatherClock =>
{
  return {
    frames: held === null ? engineFramesAt(time) : held.frames,
    animating: animate,
  };
};

export { weatherClockAt };
