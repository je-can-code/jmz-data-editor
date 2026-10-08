import { describe, expect, it } from 'vitest';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { ConfigRead, OnDemandConfig, SkyCondition } from '../../../../src/mapEditor/core/modules/PluginModule.ts';
import type { SkyPick } from '../../../../src/mapEditor/core/time/WindowClock.ts';
import { skyPhaseOf } from '../../../../src/mapEditor/modules/weather/skyCalendar.ts';
import { skyConditionNames, skyConfigFrom, type SkyConfig } from '../../../../src/mapEditor/modules/weather/skyConfig.ts';
import { isPossibleIn, SKY_SEASONS } from '../../../../src/mapEditor/modules/weather/skyStates.ts';
import {
  NO_SKY_PICKED,
  NO_SKY_TO_READ,
  READING_THE_SKY,
  readSkyAt,
  skyConditionsAt,
  skyOfferFor,
  skyPhaseAt,
} from '../../../../src/mapEditor/modules/weather/skyWeather.ts';
import { weatherConfigFrom } from '../../../../src/mapEditor/modules/weather/weatherConfig.ts';
import { locateGameProject, readDataFile } from '../../../support/gameProject.ts';
import { CHEF_SKY_CONFIG, CHEF_START, CHEF_WEATHER_CONFIG } from '../../support/skyFixtures.ts';

/*
 * The sky J-Weather-Time drives is worked out at each moment of the window's clock as the plugin hands it to J-Weather
 * (ForecastDirector.skyFor), for the condition and the strength the author picked, since a new game's forecast is random:
 * the face the condition wears at the season and the phase of the day of the clock's date and hour, the date the clock's
 * season moves the game's start to, at the picked strength pulled into the condition's range, and the condition beside
 * it for a place's climate to read. It says what that comes to in the author's words, as J-Weather writes weather down,
 * "look (strength)", saying when the look is a face the condition wears at this hour and season.
 *
 * A condition the sky could not be in at that moment shows nothing, and says why: one the project's sky does not have,
 * one the season does not allow, and one the month weighs at nothing. On a season's last day the sky steers toward the
 * condition it settles to, a step each phase from the condition picked, which the day came in with, as the plugin walks
 * it; the day before and the day after roll as any other. No sky picked shows nothing either.
 *
 * Offered to the map views, the sky is read out of J-Weather's own config, only once something needs it, so a sky not
 * yet read, and a config holding no sky the plugin could walk, show nothing and say so; each new read of the config is
 * read afresh. And against the game's own config, every condition the sky can be in at every season and every phase of
 * the day wears a look the config holds, at a strength that look has.
 */
describe('skyWeather', () =>
{
  const SKY = CHEF_SKY_CONFIG;

  /**
   * The phase of the window's clock at a time of day and season, from a new Chef Adventure game's start.
   * @param {number} minutes The time of day.
   * @param {number | null} season The season, or null for the game's own.
   * @returns {number} The phase.
   */
  const at = (minutes: number, season: number | null = null): number => skyPhaseAt(CHEF_START, minutes, season);

  /**
   * A pick of the sky.
   * @param {string} condition The condition.
   * @param {string} strength The strength.
   * @returns {SkyPick} The pick.
   */
  const sky = (condition: string, strength: string): SkyPick => ({ condition, strength });

  describe('skyPhaseAt', () =>
  {
    it('counts the clock\'s hour on the date its season moves the game\'s start to', () =>
    {
      // Arrange: 22:00 on the game's own date, December 16, 2026, and in Summer, on June 16, 2027.

      // Act.
      const phases = [ at(1320), at(1320, 1) ];

      // Assert.
      expect(phases)
        .toStrictEqual([ skyPhaseOf(2026, 12, 16, 5), skyPhaseOf(2027, 6, 16, 5) ]);
    });
  });

  describe('readSkyAt', () =>
  {
    it('wears the face a condition wears at the clock\'s hour and season, saying so, and its own look plainly', () =>
    {
      // Arrange: a clear winter night, a clear summer night, and heavy rain at a winter noon.
      const asks: [ SkyPick, number ][] = [ [ sky('clear', 'moderate'), at(1320) ], [ sky('clear', 'heavy'), at(1320, 1) ], [ sky('rain', 'heavy'), at(720) ] ];

      // Act.
      const readings = asks.map(([ pick, phase ]) => readSkyAt(SKY, pick, phase));

      // Assert.
      expect(readings)
        .toStrictEqual([
          { weather: { preset: 'starfall', intensity: 'moderate', type: 'clear' }, words: 'Shows as starfall (moderate) at this hour and season.' },
          { weather: { preset: 'fireflies', intensity: 'heavy', type: 'clear' }, words: 'Shows as fireflies (heavy) at this hour and season.' },
          { weather: { preset: 'rain', intensity: 'heavy', type: 'rain' }, words: 'Shows as rain (heavy).' },
        ]);
    });

    it('turns clear\'s face as the clock passes 04:00 and 20:00, a minute either side wearing the other, in Winter and in Summer', () =>
    {
      // Arrange: 03:59, 04:00, 19:59 and 20:00.
      const times = [ 239, 240, 1199, 1200 ];

      // Act.
      const faces = [ null, 1 ].map(season => times.map(minutes => readSkyAt(SKY, sky('clear', 'light'), at(minutes, season)).weather?.preset));

      // Assert.
      expect(faces)
        .toStrictEqual([ [ 'starfall', 'frigid', 'frigid', 'starfall' ], [ 'fireflies', 'scorcher', 'scorcher', 'fireflies' ] ]);
    });

    it('wears each season\'s face at noon as the clock\'s season moves the date', () =>
    {
      // Arrange: Spring, Summer, Autumn and Winter, each at noon.
      const seasons = [ 0, 1, 2, 3 ];

      // Act.
      const faces = seasons.map(season => [ 'clear', 'breezy' ].map(condition => readSkyAt(SKY, sky(condition, 'light'), at(720, season)).weather?.preset));

      // Assert.
      expect(faces)
        .toStrictEqual([ [ 'clear', 'leaves' ], [ 'scorcher', 'leaves' ], [ 'clear', 'maple' ], [ 'frigid', 'leaves' ] ]);
    });

    it('pulls the picked strength into the range the condition is drawn at', () =>
    {
      // Arrange: a light monsoon and a heavy mist, in Autumn.

      // Act.
      const strengths = [ sky('monsoon', 'light'), sky('mist', 'heavy') ].map(pick => readSkyAt(SKY, pick, at(720, 2)).weather?.intensity);

      // Assert.
      expect(strengths)
        .toStrictEqual([ 'heavy', 'moderate' ]);
    });

    it('shows nothing for a condition the sky has not, nor one its season does not allow, and says why', () =>
    {
      // Arrange: hail in Winter, snow in Summer, and mist in Winter.
      const asks: [ SkyPick, number ][] = [ [ sky('hail', 'heavy'), at(720) ], [ sky('snow', 'heavy'), at(720, 1) ], [ sky('mist', 'light'), at(720) ] ];

      // Act.
      const readings = asks.map(([ pick, phase ]) => readSkyAt(SKY, pick, phase));

      // Assert.
      expect(readings)
        .toStrictEqual([
          { weather: null, words: 'The project\'s sky has no condition named hail.' },
          { weather: null, words: 'The sky is never snow in Summer, so none shows.' },
          { weather: null, words: 'The sky is never mist in Winter, so none shows.' },
        ]);
    });

    it('shows nothing for a condition its month weighs at nothing, and shows it in a month that wants it', () =>
    {
      // Arrange: sakura on May 16, which May weighs at nothing, and on April 16.

      // Act.
      const readings = [ 5, 4 ].map(month => readSkyAt(SKY, sky('sakura', 'light'), skyPhaseOf(2027, month, 16, 2)));

      // Assert.
      expect(readings)
        .toStrictEqual([
          { weather: null, words: 'The sky is never sakura in May, so none shows.' },
          { weather: { preset: 'sakura', intensity: 'light', type: 'sakura' }, words: 'Shows as sakura (light).' },
        ]);
    });

    it('steers the sky toward clear on a season\'s last day, from the condition the day came in with, a step each phase', () =>
    {
      // Arrange: a heavy rain coming into May 30, Spring's last day, at midnight and at 04:00; and a light mist coming
      // into November 30, Autumn's last day, at midnight, where clear's night face is starfall.
      const asks: [ SkyPick, number ][] = [
        [ sky('rain', 'heavy'), skyPhaseOf(2027, 5, 30, 0) ],
        [ sky('rain', 'heavy'), skyPhaseOf(2027, 5, 30, 1) ],
        [ sky('mist', 'light'), skyPhaseOf(2027, 11, 30, 0) ],
      ];

      // Act.
      const readings = asks.map(([ pick, phase ]) => readSkyAt(SKY, pick, phase));

      // Assert: rain eases to overcast and clears; the mist clears at once.
      expect(readings)
        .toStrictEqual([
          { weather: { preset: 'clouds', intensity: 'heavy', type: 'overcast' }, words: 'The last day of Spring settles the sky toward clear, so it shows as clouds (heavy).' },
          { weather: { preset: 'clear', intensity: 'heavy', type: 'clear' }, words: 'The last day of Spring settles the sky toward clear, so it shows as clear (heavy).' },
          { weather: { preset: 'starfall', intensity: 'light', type: 'clear' }, words: 'The last day of Autumn settles the sky toward clear, so it shows as starfall (light).' },
        ]);
    });

    it('rolls as any other day the day before a season\'s last and the first of the next, and gates a settling day by its season', () =>
    {
      // Arrange: heavy rain on May 29 and June 1, at midnight; and snow coming into May 30, which Spring does not allow.
      const asks: [ SkyPick, number ][] = [
        [ sky('rain', 'heavy'), skyPhaseOf(2027, 5, 29, 0) ],
        [ sky('rain', 'heavy'), skyPhaseOf(2027, 6, 1, 0) ],
        [ sky('snow', 'heavy'), skyPhaseOf(2027, 5, 30, 0) ],
      ];

      // Act.
      const readings = asks.map(([ pick, phase ]) => readSkyAt(SKY, pick, phase));

      // Assert.
      expect(readings)
        .toStrictEqual([
          { weather: { preset: 'rain', intensity: 'heavy', type: 'rain' }, words: 'Shows as rain (heavy).' },
          { weather: { preset: 'rain', intensity: 'heavy', type: 'rain' }, words: 'Shows as rain (heavy).' },
          { weather: null, words: 'The sky is never snow in Spring, so none shows.' },
        ]);
    });
  });

  describe('skyConditionsAt', () =>
  {
    it('lists every condition in the config\'s order, those the season or month rules out greyed, with its strengths', () =>
    {
      // Arrange: a winter noon.

      // Act.
      const conditions = skyConditionsAt(SKY, at(720));

      // Assert.
      expect(conditions.map(condition => [ condition.name, condition.possible, condition.strengths.join(' ') ]))
        .toStrictEqual([
          [ 'clear', true, 'light moderate heavy' ],
          [ 'overcast', true, 'light moderate heavy' ],
          [ 'breezy', true, 'light moderate heavy' ],
          [ 'rain', true, 'light moderate heavy' ],
          [ 'mist', false, 'light moderate' ],
          [ 'sakura', false, 'light moderate' ],
          [ 'monsoon', false, 'heavy' ],
          [ 'snow', true, 'light moderate heavy' ],
        ]);
    });

    it('gives a condition picked its usual middle strength, or the nearest it has to the strength picked before', () =>
    {
      // Arrange: clear, mist and monsoon in Autumn.
      const byName = new Map<string, SkyCondition>(skyConditionsAt(SKY, at(720, 2)).map(condition => [ condition.name, condition ]));
      const asks: [ string, string | null ][] = [ [ 'clear', null ], [ 'monsoon', null ], [ 'clear', 'heavy' ], [ 'mist', 'heavy' ], [ 'monsoon', 'light' ] ];

      // Act.
      const strengths = asks.map(([ name, wanted ]) => byName.get(name)?.strengthFor(wanted));

      // Assert.
      expect(strengths)
        .toStrictEqual([ 'moderate', 'heavy', 'heavy', 'moderate', 'heavy' ]);
    });
  });

  describe('skyOfferFor', () =>
  {
    /**
     * J-Weather's config as the window holds it, read when the test says, counting the asks.
     * @returns {{ config: OnDemandConfig, arrive: (read: ConfigRead) => void, asked: () => number }} The config.
     */
    const heldConfig = () =>
    {
      let read: ConfigRead | undefined;
      let asked = 0;
      const config: OnDemandConfig = {
        current: () => read,
        request: () =>
        {
          asked += 1;
        },
        subscribe: () => () => undefined,
      };
      const arrive = (next: ConfigRead) =>
      {
        read = next;
      };
      return { config, arrive, asked: () => asked };
    };

    it('says no sky is picked without reading anything, lists the ladder of strengths, and asks nothing of the config itself', () =>
    {
      // Arrange.
      const held = heldConfig();
      const offer = skyOfferFor(held.config, CHEF_START);

      // Act.
      const reading = offer.readingAt(null, 1320, null);

      // Assert.
      expect([ reading, offer.strengths, held.asked() ])
        .toStrictEqual([ { weather: null, words: NO_SKY_PICKED }, [ 'light', 'moderate', 'heavy' ], 0 ]);
    });

    it('shows nothing until the config is read, and nothing from a config that could not be read or holds no sky, saying which', () =>
    {
      // Arrange: the config unread, then unreadable, then read without a sky.
      const held = heldConfig();
      const offer = skyOfferFor(held.config, CHEF_START);
      const pick = sky('rain', 'heavy');
      const seen: unknown[] = [];

      // Act.
      seen.push([ offer.readingAt(pick, 720, null), offer.conditionsAt(720, null) ]);
      held.arrive({ content: null, problem: 'missing' });
      seen.push([ offer.readingAt(pick, 720, null), offer.conditionsAt(720, null) ]);
      held.arrive({ content: { motions: {}, presets: {} }, problem: null });
      seen.push([ offer.readingAt(pick, 720, null), offer.conditionsAt(720, null) ]);

      // Assert.
      expect(seen)
        .toStrictEqual([
          [ { weather: null, words: READING_THE_SKY }, { conditions: [], problem: READING_THE_SKY } ],
          [ { weather: null, words: NO_SKY_TO_READ }, { conditions: [], problem: NO_SKY_TO_READ } ],
          [ { weather: null, words: NO_SKY_TO_READ }, { conditions: [], problem: NO_SKY_TO_READ } ],
        ]);
    });

    it('reads the sky from the config once read, at the clock\'s hour and season, and afresh from each later read', () =>
    {
      // Arrange: the game's config read; then a read where clear wears no faces.
      const held = heldConfig();
      const offer = skyOfferFor(held.config, CHEF_START);
      const pick = sky('clear', 'moderate');
      held.arrive({ content: CHEF_WEATHER_CONFIG, problem: null });
      const before = [ offer.readingAt(pick, 1320, null).weather, offer.conditionsAt(1320, null).conditions.length ];
      const faceless = JSON.parse(JSON.stringify(CHEF_WEATHER_CONFIG)) as { sky: { types: { clear: { faces?: unknown } } } };
      delete faceless.sky.types.clear.faces;

      // Act.
      held.arrive({ content: faceless as unknown as JsonValue, problem: null });
      const after = offer.readingAt(pick, 1320, null).weather;

      // Assert.
      expect([ before, after ])
        .toStrictEqual([ [ { preset: 'starfall', intensity: 'moderate', type: 'clear' }, 8 ], { preset: 'clear', intensity: 'moderate', type: 'clear' } ]);
    });
  });

  describe('the game\'s own sky', () =>
  {
    const project = locateGameProject();
    const config = project === null ? null : readDataFile(project, 'config.weather.json') as JsonValue;
    const shipped = skyConfigFrom(config);
    const looks = weatherConfigFrom(config);

    it.skipIf(project === null)('wears a look the config holds, at a strength it has, for every condition at every season and phase', () =>
    {
      // Arrange: every condition at a mid-season date of each season, at each phase of the day.
      const read = shipped as SkyConfig;
      const moments = [ 4, 7, 10, 1 ].flatMap(month => [ 0, 1, 2, 3, 4, 5 ].map(phase => skyPhaseOf(2027, month, 16, phase)));

      // Act: what the sky shows wherever it can be.
      const shown = moments.flatMap(phase => skyConditionNames(read)
        .flatMap(condition => [ 'light', 'moderate', 'heavy' ].map(strength => readSkyAt(read, sky(condition, strength), phase).weather)))
        .filter(weather => weather !== null);
      const missing = shown.filter(weather => looks?.presets[weather.preset]?.stops[weather.intensity] === undefined);

      // Assert: something showed, every look among the config's, and the seasons as the sky names them.
      expect([ shown.length > 0, missing, Object.keys(read.seasons).filter(name => SKY_SEASONS.includes(name)).length ])
        .toStrictEqual([ true, [], 4 ]);
    });

    it.skipIf(project === null)('lets the clock\'s every season show some condition, so its picker always has one to pick', () =>
    {
      // Arrange: the game's sky, and the month each season moves the clock's date to.
      const read = shipped as SkyConfig;
      const opening = [ 3, 6, 9, 12 ];

      // Act.
      const possible = SKY_SEASONS.map((season, index) => skyConditionNames(read).filter(name => isPossibleIn(read, name, season, opening[index])));

      // Assert: none of them so few that a picker would look empty.
      expect(possible.map(names => names.length >= 4))
        .toStrictEqual([ true, true, true, true ]);
    });
  });
});
