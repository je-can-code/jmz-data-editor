import type { JsonValue } from '../../core/model/json.ts';
import type { ModuleNotice } from '../../core/modules/PluginModule.ts';
import { HOURS_PER_PHASE } from '../time/timePhases.ts';
import type { SkyCurve } from './timeTone.ts';

/**
 * The name the server serves J-Lighting-Time's day and night curve under, from {@code data/config.lighting-time.json}.
 */
const LIGHTING_TIME_CONFIG = 'lighting-time';

/**
 * The id of the notice J-Lighting's module shows while the curve fails it.
 */
const LIGHTING_TIME_CONFIG_NOTICE_ID = 'lighting.time-config';

/**
 * What the notice says first: what the failure means on the map, and the file to fix.
 */
const SKY_UNTIL_FIXED = 'The sky does not change with the clock until data/config.lighting-time.json is fixed.';

/**
 * What the notice says last: the curve is read again whenever the file changes on disk, so fixing it clears this.
 */
const CLEARS_ONCE_FIXED = 'This clears as soon as the file is fixed.';

/**
 * How many phases a day's sequence must list: one for every four hours, then the first again, since every hour reads
 * its own phase and the next one.
 */
const SEQUENCE_LENGTH = (24 / HOURS_PER_PHASE) + 1;

/**
 * How many numbers a tone holds: red, green, blue and grey.
 */
const TONE_CHANNELS = 4;

/**
 * One phase of the day as the server serves it: its tone, null when the file leaves it out, and its darkness.
 */
type ServedPhase = {
  readonly tone: readonly number[] | null;
  readonly darkness: number;
};

/**
 * J-Lighting-Time's curve as the server serves it ({@code server/internal/models/plugins/lighting_time.go}): read
 * strictly, so nothing else is there, the phases and the sequence coming back null when the file leaves them out.
 */
type LightingTimeConfig = {
  readonly phases: Readonly<Record<string, ServedPhase>> | null;
  readonly sequence: readonly string[] | null;
};

/**
 * Says what keeps a curve the strict read let through from serving the game, which would fail on it the moment the
 * clock reached the hour it breaks: a sequence naming a phase the file does not hold, which stops the game at boot; a
 * sequence too short to cover the day; or a tone that is not four numbers. Nothing is said of a curve that serves.
 * @param {LightingTimeConfig} config The curve as the server served it.
 * @returns {string | null} What is wrong, in a sentence, or null when nothing is.
 */
const curveProblemOf = (config: LightingTimeConfig): string | null =>
{
  const phases = config.phases ?? {};
  const sequence = config.sequence ?? [];
  const unknown = sequence.find(name => Object.hasOwn(phases, name) === false);
  if (unknown !== undefined)
  {
    return `Its sequence names "${unknown}", which is none of its phases.`;
  }

  if (sequence.length < SEQUENCE_LENGTH)
  {
    return `Its sequence lists ${sequence.length} phases, and a day needs ${SEQUENCE_LENGTH}: the six in order, then the first again.`;
  }

  const misshapen = sequence.find(name => (phases[name].tone ?? []).length !== TONE_CHANNELS);
  if (misshapen !== undefined)
  {
    const count = (phases[misshapen].tone ?? []).length;
    return `The tone of "${misshapen}" holds ${count} numbers, and a tone holds ${TONE_CHANNELS}: red, green, blue and grey.`;
  }

  return null;
};

/**
 * Reads the day and night curve from the project's config, as J_LIGHTING_TIME_PluginMetadata#initializeCurve does: the
 * tone and the darkness of each phase the sequence names, in the sequence's order. A project without the file, or with
 * a curve that cannot serve the game ({@link curveProblemOf}), has no curve, and {@link lightingTimeConfigNotice} says
 * so over the map.
 * @param {JsonValue | null} config The curve as the server served it, or null when the project has none.
 * @returns {SkyCurve | null} The curve, or null when there is none to draw with.
 */
const skyCurveFrom = (config: JsonValue | null): SkyCurve | null =>
{
  if (config === null)
  {
    return null;
  }

  // the server read the file into its model, so the shape is the model's.
  const served = config as unknown as LightingTimeConfig;
  if (curveProblemOf(served) !== null)
  {
    return null;
  }

  // a curve that serves names only phases it holds, each with a tone of four numbers.
  const phases = served.phases as Readonly<Record<string, ServedPhase>>;
  const sequence = served.sequence as readonly string[];
  return {
    tones: sequence.map(name => phases[name].tone as readonly number[]),
    darkness: sequence.map(name => phases[name].darkness),
  };
};

/**
 * Says what is wrong when the curve fails the sky, so a sky that stays put at every hour is never mistaken for the
 * game's look: the file could not be read (it is missing, is not JSON, or holds a field the strict read refuses), in
 * the server's words, or its curve cannot serve the game. Nothing is said of a curve that serves.
 * @param {JsonValue | null} config The curve as the server served it, or null when it could not be read.
 * @param {string | undefined} problem Why it could not be read, or undefined when nothing said why.
 * @returns {ModuleNotice | null} The notice, or null when the curve serves.
 */
const lightingTimeConfigNotice = (config: JsonValue | null, problem: string | undefined): ModuleNotice | null =>
{
  if (config === null)
  {
    const why = problem === undefined
      ? 'It was not read.'
      : `It could not be read: ${problem}.`;
    return { id: LIGHTING_TIME_CONFIG_NOTICE_ID, title: SKY_UNTIL_FIXED, detail: `${why} ${CLEARS_ONCE_FIXED}` };
  }

  const wrong = curveProblemOf(config as unknown as LightingTimeConfig);
  if (wrong === null)
  {
    return null;
  }

  return { id: LIGHTING_TIME_CONFIG_NOTICE_ID, title: SKY_UNTIL_FIXED, detail: `${wrong} ${CLEARS_ONCE_FIXED}` };
};

export { curveProblemOf, LIGHTING_TIME_CONFIG, LIGHTING_TIME_CONFIG_NOTICE_ID, lightingTimeConfigNotice, SEQUENCE_LENGTH, skyCurveFrom };
export type { LightingTimeConfig, ServedPhase };
