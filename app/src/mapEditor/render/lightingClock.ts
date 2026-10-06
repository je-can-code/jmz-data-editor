import type { LightingClock } from '../core/renderer/lightingLayer.ts';
import { engineFramesAt } from './engine/animation.ts';

/**
 * A moment a renderer holds its animation still at, as far as the lighting reads it: how many engine frames in.
 */
type HeldMoment = {
  readonly frames: number;
};

/**
 * Reads a view's clock for its lighting at a frame: the engine frame the frame's time falls on, counted on the page's
 * own clock, so it never starts over with a map opened or redrawn and never jumps when a map is torn out into a window of
 * its own, unless the renderer holds its animation still, when it is the held moment's frame; and whether the game look
 * moves. The game counts its frames from the time that passed too, so a frame arriving a little late or early now and
 * then holds a light still for a frame, or moves it on two, as the game's own frames do.
 * @param {number} time The frame's time, in milliseconds on the page's clock.
 * @param {HeldMoment | null} held The moment the animation is held still at, or null when it follows the clock.
 * @param {boolean} animate Whether the game look moves.
 * @returns {LightingClock} The clock.
 */
const lightingClockAt = (time: number, held: HeldMoment | null, animate: boolean): LightingClock =>
{
  return {
    frames: held === null ? engineFramesAt(time) : held.frames,
    animating: animate,
  };
};

export { lightingClockAt };
export type { HeldMoment };
