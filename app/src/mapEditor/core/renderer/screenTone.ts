import type { ScreenTone } from './lightingLayer.ts';

/**
 * Reports whether two tones are the same, none being the same only as none.
 * @param {ScreenTone | null} left One tone, or null for none.
 * @param {ScreenTone | null} right The other.
 * @returns {boolean} True when they match channel for channel, or are both none.
 */
const sameTone = (left: ScreenTone | null, right: ScreenTone | null): boolean =>
{
  if (left === null || right === null)
  {
    return left === right;
  }

  return left.every((channel, index) => channel === right[index]);
};

/**
 * Reports whether a tone changes anything at all. A tone of all zeroes is what the engine's screen shows with nobody
 * tinting it, and J-Lighting reads it as a source letting the screen go (ToneDeclaration#isNeutral), so it casts no
 * more than none does.
 * @param {ScreenTone | null} tone The tone, or null for none.
 * @returns {boolean} True for a tone with any channel off zero.
 */
const castsTone = (tone: ScreenTone | null): tone is ScreenTone =>
{
  return tone !== null && tone.some(channel => channel !== 0);
};

export { castsTone, sameTone };
