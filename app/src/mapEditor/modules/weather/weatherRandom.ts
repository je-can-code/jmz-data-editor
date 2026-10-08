import { hashText } from '../lighting/lightSeeds.ts';
import type { WeatherRolls } from './weatherMotion.ts';

/**
 * A stream of rolls, each from 0 up to 1, as Math.random gives them.
 */
type Roller = () => number;

/**
 * What a hash is folded down by to land from 0 up to 1: one more than the largest 32-bit number.
 */
const HASH_RANGE = 2 ** 32;

/**
 * The salt that keeps a weather layer's seed apart from a light's, should the two ever be named alike.
 */
const WEATHER_SALT = 0x5bd1e995;

/**
 * Makes a stream of rolls from a seed, Mulberry32's way: small, quick enough for the thousands of rolls a heavy shower
 * takes a frame, and the same stream from the same seed every time.
 * @param {number} seed The seed, a 32-bit number.
 * @returns {Roller} The stream.
 */
const seededRoller = (seed: number): Roller =>
{
  let state = seed >>> 0;
  return () =>
  {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / HASH_RANGE;
  };
};

/**
 * Seeds one layer of a map's weather from where it falls and what it is: the map, the look, its strength and which of
 * the look's layers it is. The game rolls with Math.random and never draws the same shower twice; here a map shows the
 * same shower each time it opens, so what the author saw yesterday is what they see today.
 * @param {number} mapId The map.
 * @param {string} preset The look.
 * @param {string} intensity Its strength.
 * @param {number} layerIndex Which of the look's layers.
 * @returns {number} The seed.
 */
const weatherSeed = (mapId: number, preset: string, intensity: string, layerIndex: number): number =>
{
  return hashText(`weather:map:${mapId}/${preset}/${intensity}/${layerIndex}`, WEATHER_SALT);
};

/**
 * Draws a fresh roll for every independent choice a particle makes at birth, in the order J-Weather draws them
 * (Sprite_WeatherLayer.rolls), one each, never shared.
 * @param {Roller} roll The stream.
 * @returns {WeatherRolls} The rolls.
 */
const rollsFrom = (roll: Roller): WeatherRolls =>
{
  return {
    along: roll(),
    across: roll(),
    speedX: roll(),
    speedY: roll(),
    scale: roll(),
    stagger: roll(),
    life: roll(),
    edge: roll(),
    phase: roll(),
    flip: roll(),
    pulse: roll(),
    tilt: roll(),
    stretchX: roll(),
    stretchY: roll(),
  };
};

export { rollsFrom, seededRoller, weatherSeed };
export type { Roller };
