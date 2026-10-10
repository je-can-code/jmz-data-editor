import type { JsonValue } from '../../../src/mapEditor/core/model/json.ts';
import type { SkyConfig } from '../../../src/mapEditor/modules/weather/skyConfig.ts';
import type { GameDate } from '../../../src/mapEditor/modules/time/timeSnapshot.ts';

/**
 * Chef Adventure's sky as config.weather.json held it on 2026-10-08, its notes and its forecast's own settings left out:
 * eight conditions, clear's faces written summer night first, breezy's maple in autumn, each season's allowed conditions
 * and graph, the months' leans (sakura weighed at nothing in May), and clear as the condition a season's last day
 * settles toward. A copy rather than the file, so these tests hold whatever the game's config becomes.
 */
const CHEF_SKY = {
  types: {
    clear: {
      preset: 'clear',
      intensities: [ 'light', 'moderate', 'heavy' ],
      _comment: 'Order matters - the first rule whose keys all match wins, so the summer night rule must sit above the general night rule.',
      faces: [
        { phases: [ 0, 5 ], seasons: [ 'summer' ], preset: 'fireflies' },
        { phases: [ 0, 5 ], preset: 'starfall' },
        { phases: [ 1, 2, 3, 4 ], seasons: [ 'summer' ], preset: 'scorcher' },
        { phases: [ 1, 2, 3, 4 ], seasons: [ 'winter' ], preset: 'frigid' },
      ],
    },
    overcast: { preset: 'clouds', intensities: [ 'light', 'moderate', 'heavy' ] },
    breezy: { preset: 'leaves', intensities: [ 'light', 'moderate', 'heavy' ], faces: [ { seasons: [ 'autumn' ], preset: 'maple' } ] },
    rain: { preset: 'rain', intensities: [ 'light', 'moderate', 'heavy' ] },
    mist: { _comment: 'Caps at moderate on purpose.', preset: 'fog', intensities: [ 'light', 'moderate' ] },
    sakura: { preset: 'sakura', intensities: [ 'light', 'moderate' ] },
    monsoon: { preset: 'rain', intensities: [ 'heavy' ] },
    snow: { preset: 'snow', intensities: [ 'light', 'moderate', 'heavy' ] },
  },
  seasons: {
    spring: {
      _comment: 'Mild and showery.',
      allowed: [ 'clear', 'overcast', 'breezy', 'rain', 'mist', 'sakura' ],
      transitions: {
        clear: { clear: 42, breezy: 28, overcast: 20, sakura: 10 },
        overcast: { overcast: 18, clear: 26, rain: 36, mist: 20 },
        breezy: { breezy: 32, clear: 28, overcast: 20, sakura: 20 },
        rain: { rain: 42, overcast: 28, mist: 18, breezy: 12 },
        mist: { mist: 34, clear: 34, overcast: 14, breezy: 18 },
        sakura: { sakura: 45, breezy: 30, clear: 25 },
      },
    },
    summer: {
      allowed: [ 'clear', 'overcast', 'breezy', 'rain' ],
      transitions: {
        clear: { clear: 52, breezy: 30, overcast: 18 },
        overcast: { overcast: 16, clear: 38, rain: 36, breezy: 10 },
        breezy: { breezy: 30, clear: 48, overcast: 22 },
        rain: { rain: 34, overcast: 30, breezy: 24, clear: 12 },
      },
    },
    autumn: {
      allowed: [ 'clear', 'overcast', 'breezy', 'rain', 'mist', 'monsoon' ],
      transitions: {
        clear: { clear: 32, breezy: 44, overcast: 24 },
        overcast: { overcast: 18, clear: 24, rain: 38, mist: 20 },
        breezy: { breezy: 36, clear: 26, overcast: 20, rain: 18 },
        rain: { rain: 34, overcast: 24, monsoon: 22, breezy: 20 },
        monsoon: { monsoon: 42, rain: 58 },
        mist: { mist: 32, clear: 36, overcast: 14, breezy: 18 },
      },
    },
    winter: {
      allowed: [ 'clear', 'overcast', 'breezy', 'rain', 'snow' ],
      transitions: {
        clear: { clear: 38, overcast: 20, breezy: 22, snow: 20 },
        overcast: { overcast: 16, clear: 26, snow: 44, rain: 14 },
        breezy: { breezy: 30, clear: 30, overcast: 16, snow: 24 },
        rain: { rain: 24, overcast: 30, snow: 30, breezy: 16 },
        snow: { snow: 46, overcast: 18, clear: 18, breezy: 18 },
      },
    },
  },
  months: {
    1: { snow: 3 },
    2: { snow: 0.5, rain: 1.5 },
    3: { sakura: 2.5 },
    4: { sakura: 4, rain: 1.3 },
    5: { sakura: 0, rain: 1.3 },
    6: { clear: 1.2 },
    7: { clear: 1.6 },
    8: { clear: 2.5, rain: 0.5 },
    9: { breezy: 1.2, rain: 2, monsoon: 0.3 },
    10: { monsoon: 3.5, rain: 1.5 },
    11: { monsoon: 0.4, mist: 1.8 },
    12: { snow: 2.5 },
  },
  settleTo: 'clear',
} as const;

/**
 * Chef Adventure's sky, as the editor reads it.
 */
const CHEF_SKY_CONFIG = CHEF_SKY as unknown as SkyConfig;

/**
 * J-Weather's config holding Chef Adventure's sky, with no motions or looks to draw, which the sky never reads.
 */
const CHEF_WEATHER_CONFIG = { motions: {}, presets: {}, sky: CHEF_SKY } as unknown as JsonValue;

/**
 * The date a new Chef Adventure game starts on: December 16, 2026, at the top of the minute, in Winter.
 */
const CHEF_START: GameDate = { seconds: 0, days: 16, months: 12, years: 2026 };

export { CHEF_SKY_CONFIG, CHEF_START, CHEF_WEATHER_CONFIG };
