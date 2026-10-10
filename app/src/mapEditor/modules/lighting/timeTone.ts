import { HOURS_PER_PHASE, isClockHour, phaseOfHour } from '../time/timePhases.ts';

/**
 * A tone as J-Lighting-Time works with one: red, green, blue and grey, as the engine's screen tone takes them.
 */
type Tone = readonly number[];

/**
 * J-Lighting-Time's day and night curve, as J_LIGHTING_TIME_PluginMetadata#initializeCurve reads it from the project's
 * config: the tone each phase of the day settles on, and its darkness, both in the order a day cycles through them, the
 * first phase listed again at the end so one lookup serves every hour.
 */
type SkyCurve = {
  readonly tones: readonly Tone[];
  readonly darkness: readonly number[];
};

/**
 * Works out how far through its own phase an hour sits, as TimeToneResolver#rateIntoPhase does. A phase's first hour
 * sits exactly on that phase's own value, which is what makes the hours named Night look like night rather than spend
 * themselves still fading out of evening, so the fraction starts at 0 and stops short of 1: the value it travels toward
 * is the next phase's, and the next phase opens on it.
 * @param {number} hours The hour of the day, 0 to 23.
 * @returns {number} The fraction of the way across, 0 up to but never 1.
 */
const rateIntoPhase = (hours: number): number =>
{
  const hoursIntoPhase = hours % HOURS_PER_PHASE;
  return hoursIntoPhase / HOURS_PER_PHASE;
};

/**
 * Works out the tone a fraction of the way from one tone to another, as TimeToneResolver#between does: each channel
 * moves its own share of the gap, rounded, since tones are whole numbers. Order matters: it travels from the first
 * toward the second.
 * @param {Tone} fromTone The tone being left behind.
 * @param {Tone} toTone The tone being approached.
 * @param {number} rate The fraction of the way across, 0 to 1.
 * @returns {number[]} The tone.
 */
const between = (fromTone: Tone, toTone: Tone, rate: number): number[] =>
{
  return fromTone.map((fromChannel, index) =>
  {
    const toChannel = toTone[index];

    // the gap between the two, whichever is the brighter, and how much of it this rate travels.
    const distance = fromChannel > toChannel
      ? fromChannel - toChannel
      : toChannel - fromChannel;
    const travelled = Math.round(distance * rate);

    // up or down toward the target, depending on which side of it the channel starts.
    return toChannel > fromChannel
      ? fromChannel + travelled
      : fromChannel - travelled;
  });
};

/**
 * Works out the sky's tone at an hour of the day, as TimeToneResolver#toneOfHour does: the hour's phase, partway to the
 * next phase's tone by how far through the phase the hour sits. An hour off the clock casts no colour.
 * @param {number} hours The hour of the day.
 * @param {readonly Tone[]} toneSequence The tone each phase settles on, in the order they cycle.
 * @returns {number[]} The tone, red, green, blue and grey.
 */
const toneOfHour = (hours: number, toneSequence: readonly Tone[]): number[] =>
{
  // an hour off the clock has no tone of its own; a fresh one each time, since a caller keeps what it is handed.
  if (isClockHour(hours) === false)
  {
    return [ 0, 0, 0, 0 ];
  }

  const phase = phaseOfHour(hours);
  return between(toneSequence[phase], toneSequence[phase + 1], rateIntoPhase(hours));
};

/**
 * Works out how much light the sky takes away at an hour of the day, as TimeToneResolver#darknessOfHour does: a single
 * fraction, so it travels in a line from the hour's phase toward the next. An hour off the clock takes none away.
 * @param {number} hours The hour of the day.
 * @param {readonly number[]} darknessSequence The darkness each phase settles on, in the order they cycle.
 * @returns {number} The darkness, from 0 to 1.
 */
const darknessOfHour = (hours: number, darknessSequence: readonly number[]): number =>
{
  if (isClockHour(hours) === false)
  {
    return 0;
  }

  const phase = phaseOfHour(hours);
  const destination = darknessSequence[phase + 1];
  const rate = rateIntoPhase(hours);
  const origin = darknessSequence[phase];

  // the arithmetic and its order are the plugin's own, so the darkness is the same number to the last bit.
  return origin + ((destination - origin) * rate);
};

export { between, darknessOfHour, rateIntoPhase, toneOfHour };
export type { SkyCurve, Tone };
