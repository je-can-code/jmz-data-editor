import type { LightEffectTuning } from './lightingConfig.ts';
import type { LightEffect } from './lightTags.ts';

/**
 * The share of a flicker's movement its slow wave carries (LightingEasing.SLOW_WAVE_SHARE). Two waves at unrelated rates
 * are summed, because one alone reads as a pulse; beating two together gives a pattern too long for the eye to find.
 */
const SLOW_WAVE_SHARE = 0.6;

/**
 * How much faster a flicker's second wave runs than its first (LightingEasing.FAST_WAVE_RATIO): not a whole number, so
 * the two waves never line up every cycle and hand the regularity straight back.
 */
const FAST_WAVE_RATIO = 2.3;

/**
 * How far into a faulting window a glitch's stutter runs (LightingEasing.GLITCH_BURST_SHARE): its opening third, leaving
 * the long quiet tail that makes the next fault feel unscheduled.
 */
const GLITCH_BURST_SHARE = 0.35;

/**
 * How many frames each step of a glitch's stutter holds (LightingEasing.GLITCH_STEP_FRAMES): two, since one flips faster
 * than a screen reads and three starts to look like deliberate blinking.
 */
const GLITCH_STEP_FRAMES = 2;

/**
 * Folds a wave from -1 to 1 into how brightly a light burns, as LightingEasing#asMultiplier does: the top of the wave is
 * full strength, the bottom takes the whole depth away, so a light never burns brighter than its tag asks.
 * @param {number} wave Where the curve sits, -1 to 1.
 * @param {number} depth How much brightness may be taken away, 0 to 1.
 * @returns {number} The strength, from 1 - depth to 1.
 */
const asMultiplier = (wave: number, depth: number): number =>
{
  const dip = 0.5 - (wave * 0.5);
  return 1 - (depth * dip);
};

/**
 * A steady pseudo-random value for one window of a glitch, as LightingEasing#noiseAt makes it: the same window always
 * reads the same, so a window keeps its verdict for as long as it lasts rather than turning a fault into constant noise.
 * @param {number} window Which window, counted on the light's own clock.
 * @returns {number} A value from 0 to 1.
 */
const noiseAt = (window: number): number =>
{
  const scrambled = Math.sin(window * 12.9898) * 43758.5453;
  return scrambled - Math.floor(scrambled);
};

/**
 * How brightly a flame burns at a frame, as LightingEasing#flickerStrength works it out: two waves beating against one
 * another, so it never quite repeats.
 * @param {number} frameCount The engine's frame count.
 * @param {number} phase The light's own start in its cycle, in radians.
 * @param {number} depth How much brightness the flicker may take away, 0 to 1.
 * @param {number} periodFrames How many frames the slow wave takes to come back around.
 * @returns {number} The strength.
 */
const flickerStrength = (frameCount: number, phase: number, depth: number, periodFrames: number): number =>
{
  // where in the slow wave this frame sits.
  const slowAngle = ((frameCount / periodFrames) * Math.PI * 2) + phase;

  // the two waves, beating against each other so the pattern never quite repeats.
  const slowWave = Math.sin(slowAngle) * SLOW_WAVE_SHARE;
  const fastWave = Math.sin(slowAngle * FAST_WAVE_RATIO) * (1 - SLOW_WAVE_SHARE);
  return asMultiplier(slowWave + fastWave, depth);
};

/**
 * How brightly something charged burns at a frame, as LightingEasing#pulseStrength works it out: one clean wave, the same
 * every cycle, since a crystal that breathed unevenly would read as broken.
 * @param {number} frameCount The engine's frame count.
 * @param {number} phase The light's own start in its cycle, in radians.
 * @param {number} depth How much brightness the pulse may take away, 0 to 1.
 * @param {number} periodFrames How many frames one full breath takes.
 * @returns {number} The strength.
 */
const pulseStrength = (frameCount: number, phase: number, depth: number, periodFrames: number): number =>
{
  const angle = ((frameCount / periodFrames) * Math.PI * 2) + phase;
  return asMultiplier(Math.sin(angle), depth);
};

/**
 * How brightly something failing burns at a frame, as LightingEasing#glitchStrength works it out: no wave at all, but
 * long stretches at full strength broken now and then by a stutter. Time is cut into windows on the light's own clock,
 * its phase shifting both when its windows fall and which of them fault; a window faults when its noise falls within the
 * chance, and then only its opening stutters, two frames dropped by the whole depth, two at full strength, and again.
 * @param {number} frameCount The engine's frame count.
 * @param {number} phase The light's own offset, which the game rolls as an angle and reads here as whole windows.
 * @param {number} depth How far the light drops during a stutter, 0 to 1.
 * @param {number} periodFrames How many frames one window lasts.
 * @param {number} chance How likely any window is to fault, 0 to 1.
 * @returns {number} The strength.
 */
const glitchStrength = (frameCount: number, phase: number, depth: number, periodFrames: number, chance: number): number =>
{
  // the light's own clock, so its phase moves when it bursts as well as which windows it bursts in.
  const ownClock = (frameCount / periodFrames) + phase;
  const window = Math.floor(ownClock);

  // most windows are uneventful, which is what makes the eventful ones land.
  if (noiseAt(window) > chance)
  {
    return 1;
  }

  // the burst fills only the opening of its window; the rest is the quiet that sells it.
  const throughWindow = ownClock - window;
  if (throughWindow > GLITCH_BURST_SHARE)
  {
    return 1;
  }

  const framesIntoWindow = throughWindow * periodFrames;
  const step = Math.floor(framesIntoWindow / GLITCH_STEP_FRAMES);
  return step % 2 === 0
    ? 1 - depth
    : 1;
};

/**
 * How brightly a light burns at a frame, for whichever way it animates, as LightingEasing#strengthFor works it out: the
 * effect's tuned period stretched or shortened by the light's own tempo, then the effect's own curve. A steady light
 * burns at full strength, always. Nothing here ever exceeds full strength.
 * @param {LightEffect} effect How the light animates.
 * @param {number} frameCount The engine's frame count.
 * @param {number} phase The light's own start in its cycle.
 * @param {LightEffectTuning} tuning How strongly and how fast the effect runs.
 * @param {number} rate The light's own tempo, as a multiplier on the tuned period.
 * @returns {number} The strength, from 1 - depth to 1.
 */
const strengthFor = (effect: LightEffect, frameCount: number, phase: number, tuning: LightEffectTuning, rate: number): number =>
{
  // the tuned period is what the effect was authored to; the rate is this one light's take on it.
  const period = tuning.period * rate;
  switch (effect)
  {
    case 'flicker':
      return flickerStrength(frameCount, phase, tuning.depth, period);
    case 'pulse':
      return pulseStrength(frameCount, phase, tuning.depth, period);
    case 'glitch':
      return glitchStrength(frameCount, phase, tuning.depth, period, tuning.chance);
    case 'steady':
      return 1;
  }
};

/**
 * Turns a roll from 0 to 1 into a light's start in its cycle, as LightingEasing#randomPhase turns Math.random's: anywhere
 * within one full turn, so no two lights in a room burn in formation.
 * @param {number} roll A number from 0 up to 1.
 * @returns {number} The phase, in radians.
 */
const phaseFrom = (roll: number): number =>
{
  return roll * Math.PI * 2;
};

/**
 * Turns a roll from 0 to 1 into a light's own tempo, as LightingEasing#randomRate turns Math.random's: a little either
 * side of the tuned period, so two lights of one effect drift in and out of agreement rather than hold a fixed stagger,
 * and the tuned period stays the room's average.
 * @param {number} roll A number from 0 up to 1.
 * @param {number} variance How far either side of the tuned period a light may sit, as a fraction.
 * @returns {number} The tempo, a multiplier from 1 - variance to 1 + variance.
 */
const rateFrom = (roll: number, variance: number): number =>
{
  return 1 + ((roll * 2) - 1) * variance;
};

export {
  asMultiplier,
  FAST_WAVE_RATIO,
  flickerStrength,
  GLITCH_BURST_SHARE,
  GLITCH_STEP_FRAMES,
  glitchStrength,
  noiseAt,
  phaseFrom,
  pulseStrength,
  rateFrom,
  SLOW_WAVE_SHARE,
  strengthFor,
};
