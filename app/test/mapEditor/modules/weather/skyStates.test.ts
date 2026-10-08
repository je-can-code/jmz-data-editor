import { describe, expect, it } from 'vitest';
import type { SkyConfig } from '../../../../src/mapEditor/modules/weather/skyConfig.ts';
import {
  allowedIn,
  candidatesFor,
  clampIntensity,
  closestTo,
  faceFor,
  hopsTo,
  intensitiesOf,
  isPossibleIn,
  monthMultiplierFor,
  nearestRung,
  settledType,
  settlingType,
  skySeasonName,
  skyTypeOf,
} from '../../../../src/mapEditor/modules/weather/skyStates.ts';
import { CHEF_SKY_CONFIG } from '../../support/skyFixtures.ts';

/*
 * What the sky is, at a moment, is decided as J-Weather-Time decides it (SkyStates, and SkyWalk's settling), against
 * Chef Adventure's own sky here, so a clear night wears starfall, a clear summer night fireflies, and nothing the plugin
 * would not do ever shows.
 *
 * A condition wears the first of its faces that applies at the season and the phase of the day, in the order written,
 * a face leaving out its seasons or its phases applying in all of them, and its own look when none applies: clear wears
 * fireflies on summer nights, starfall on every other night, scorcher on summer days, frigid on winter days, and its own
 * sun on spring and autumn days; breezy wears maple all autumn. The phases turn at 04:00 and 20:00, so a near miss
 * either side of each turn wears the other face.
 *
 * A season hard-gates the sky, so a condition it does not allow never shows in it, and a month weighing a condition at
 * nothing, or less, never rolls into it nor keeps it: sakura is no part of May. A strength is pulled to the nearest one a
 * condition is drawn at, a tie keeping the weaker, and a strength off the ladder to the condition's first.
 *
 * On a season's last day the sky stops rolling and steers: each phase takes, from where the sky could go next within
 * the season, the step with the fewest left to the condition the sky settles toward, the first written on a tie, and
 * one with no route there never. A sky already there stays.
 */
describe('skyStates', () =>
{
  const SKY = CHEF_SKY_CONFIG;

  describe('skySeasonName and skyTypeOf', () =>
  {
    it('names the seasons as the sky block is written, and nothing for an id off the calendar', () =>
    {
      // Arrange: the four seasons, and an id past them and below them.
      const ids = [ 0, 1, 2, 3, 4, -1 ];

      // Act.
      const names = ids.map(skySeasonName);

      // Assert.
      expect(names)
        .toStrictEqual([ 'spring', 'summer', 'autumn', 'winter', '', '' ]);
    });

    it('finds a condition the sky has, and none it has not, what every object holds by birth and a note included', () =>
    {
      // Arrange: a sky with a note among its conditions.
      const noted = { ...SKY, types: { ...SKY.types, _comment: 'Eight.' } } as unknown as SkyConfig;
      const names = [ 'mist', 'hail', 'constructor', '_comment' ];

      // Act.
      const found = names.map(name => skyTypeOf(noted, name));

      // Assert.
      expect(found)
        .toStrictEqual([ { _comment: 'Caps at moderate on purpose.', preset: 'fog', intensities: [ 'light', 'moderate' ] }, null, null, null ]);
    });
  });

  describe('allowedIn, monthMultiplierFor and isPossibleIn', () =>
  {
    it('lists what each season allows, and nothing for a season the sky does not have', () =>
    {
      // Arrange: Summer, and a season the sky has no block for.

      // Act.
      const allowed = [ allowedIn(SKY, 'summer'), allowedIn(SKY, 'monsoon season') ];

      // Assert.
      expect(allowed)
        .toStrictEqual([ [ 'clear', 'overcast', 'breezy', 'rain' ], [] ]);
    });

    it('weighs a condition as the month leans, leaving it alone where the month or the sky says nothing', () =>
    {
      // Arrange: sakura in April and in May, clear in April, which April names nothing of, and a sky without months.
      const leanless = { ...SKY, months: undefined } as unknown as SkyConfig;

      // Act.
      const weights = [
        monthMultiplierFor(SKY, 4, 'sakura'),
        monthMultiplierFor(SKY, 5, 'sakura'),
        monthMultiplierFor(SKY, 4, 'clear'),
        monthMultiplierFor(leanless, 5, 'sakura'),
      ];

      // Assert.
      expect(weights)
        .toStrictEqual([ 4, 0, 1, 1 ]);
    });

    it('allows the sky a condition its season allows and its month wants any of, and no other', () =>
    {
      // Arrange: snow in December; snow in June, which Summer does not allow; sakura in April; sakura in May, weighed at
      // nothing; sakura in a sky leaning a little or below nothing in May; and mist in December, which Winter does not
      // allow.
      const lean = (weight: number) => ({ ...SKY, months: { 5: { sakura: weight } } } as unknown as SkyConfig);

      // Act.
      const possible = [
        isPossibleIn(SKY, 'snow', 'winter', 12),
        isPossibleIn(SKY, 'snow', 'summer', 6),
        isPossibleIn(SKY, 'sakura', 'spring', 4),
        isPossibleIn(SKY, 'sakura', 'spring', 5),
        isPossibleIn(lean(0.01), 'sakura', 'spring', 5),
        isPossibleIn(lean(-1), 'sakura', 'spring', 5),
        isPossibleIn(SKY, 'mist', 'winter', 12),
      ];

      // Assert.
      expect(possible)
        .toStrictEqual([ true, false, true, false, true, false, false ]);
    });
  });

  describe('intensitiesOf, nearestRung and clampIntensity', () =>
  {
    it('lists a condition\'s strengths, or the whole ladder for one listing none or one the sky has not', () =>
    {
      // Arrange: mist, rain without its list, and a condition the sky has not.
      const unlisted = { ...SKY, types: { ...SKY.types, rain: { preset: 'rain' } } } as unknown as SkyConfig;

      // Act.
      const strengths = [ intensitiesOf(SKY, 'mist'), intensitiesOf(unlisted, 'rain'), intensitiesOf(SKY, 'hail') ];

      // Assert.
      expect(strengths)
        .toStrictEqual([ [ 'light', 'moderate' ], [ 'light', 'moderate', 'heavy' ], [ 'light', 'moderate', 'heavy' ] ]);
    });

    it('keeps the weaker of two strengths as near as each other', () =>
    {
      // Arrange: light and heavy, reaching for moderate; and heavy alone.

      // Act.
      const rungs = [ nearestRung([ 'light', 'heavy' ], 1), nearestRung([ 'heavy', 'light' ], 1), nearestRung([ 'heavy' ], 0) ];

      // Assert.
      expect(rungs)
        .toStrictEqual([ 'light', 'heavy', 'heavy' ]);
    });

    it('pulls a strength to the nearest a condition is drawn at, and one off the ladder to its first', () =>
    {
      // Arrange: rain at heavy, which it is drawn at; a monsoon at light; a mist at heavy; and rain at a storm's strength.
      const asks: [ string, string ][] = [ [ 'rain', 'heavy' ], [ 'monsoon', 'light' ], [ 'mist', 'heavy' ], [ 'rain', 'torrential' ] ];

      // Act.
      const strengths = asks.map(([ condition, strength ]) => clampIntensity(SKY, condition, strength));

      // Assert.
      expect(strengths)
        .toStrictEqual([ 'heavy', 'heavy', 'moderate', 'light' ]);
    });
  });

  describe('faceFor', () =>
  {
    it('wears clear\'s faces by season and phase: fireflies on summer nights, starfall on others, scorcher, frigid, and its own sun', () =>
    {
      // Arrange: clear on a summer night at midnight and at 20:00, a winter, spring and autumn night, a summer and a
      // winter afternoon, and a spring and an autumn morning.
      const moments: [ string, number ][] = [
        [ 'summer', 0 ],
        [ 'summer', 5 ],
        [ 'winter', 5 ],
        [ 'spring', 0 ],
        [ 'autumn', 5 ],
        [ 'summer', 3 ],
        [ 'winter', 3 ],
        [ 'spring', 2 ],
        [ 'autumn', 2 ],
      ];

      // Act.
      const faces = moments.map(([ season, phase ]) => faceFor(SKY, 'clear', season, phase));

      // Assert.
      expect(faces)
        .toStrictEqual([ 'fireflies', 'fireflies', 'starfall', 'starfall', 'starfall', 'scorcher', 'frigid', 'clear', 'clear' ]);
    });

    it('turns clear\'s face at 04:00 and at 20:00, the phase either side of each turn wearing the other', () =>
    {
      // Arrange: a summer sky from 00:00 to 03:59, from 04:00, until 19:59 and from 20:00; and a winter sky likewise.
      const phases = [ 0, 1, 4, 5 ];

      // Act.
      const faces = [ 'summer', 'winter' ].map(season => phases.map(phase => faceFor(SKY, 'clear', season, phase)));

      // Assert.
      expect(faces)
        .toStrictEqual([ [ 'fireflies', 'scorcher', 'scorcher', 'fireflies' ], [ 'starfall', 'frigid', 'frigid', 'starfall' ] ]);
    });

    it('wears breezy\'s maple all autumn and its leaves otherwise, and a condition with no faces its own look', () =>
    {
      // Arrange: breezy at night and by day in autumn, and in spring; overcast in autumn; and a condition the sky has not.

      // Act.
      const faces = [
        faceFor(SKY, 'breezy', 'autumn', 0),
        faceFor(SKY, 'breezy', 'autumn', 3),
        faceFor(SKY, 'breezy', 'spring', 3),
        faceFor(SKY, 'overcast', 'autumn', 3),
        faceFor(SKY, 'hail', 'autumn', 3),
      ];

      // Assert.
      expect(faces)
        .toStrictEqual([ 'maple', 'maple', 'leaves', 'clouds', '' ]);
    });

    it('wears the first face written that applies, so a general rule written above a narrower one hides it', () =>
    {
      // Arrange: clear with its general night rule written above the summer one.
      const [ fireflies, starfall, ...days ] = (SKY.types['clear'].faces ?? []);
      const reordered = { ...SKY, types: { ...SKY.types, clear: { ...SKY.types['clear'], faces: [ starfall, fireflies, ...days ] } } } as SkyConfig;

      // Act.
      const face = faceFor(reordered, 'clear', 'summer', 5);

      // Assert.
      expect(face)
        .toBe('starfall');
    });
  });

  describe('candidatesFor and hopsTo', () =>
  {
    it('offers a condition\'s row kept to what the season allows, or everything allowed when it has no row or none of it is allowed', () =>
    {
      // Arrange: rain in Spring, whose row names mist and breezy; snow in Summer, with no row; a Summer row naming only
      // what Summer does not allow; and a season the sky does not have.
      const disallowing = {
        ...SKY,
        seasons: { ...SKY.seasons, summer: { ...SKY.seasons['summer'], transitions: { ...SKY.seasons['summer'].transitions, rain: { snow: 10, mist: 5 } } } },
      } as SkyConfig;

      // Act.
      const offered = [
        candidatesFor(SKY, 'rain', 'spring'),
        candidatesFor(SKY, 'snow', 'summer').map(candidate => candidate.type),
        candidatesFor(disallowing, 'rain', 'summer').map(candidate => candidate.type),
        candidatesFor(SKY, 'rain', 'monsoon season'),
      ];

      // Assert.
      expect(offered)
        .toStrictEqual([
          [ { type: 'rain', weight: 42 }, { type: 'overcast', weight: 28 }, { type: 'mist', weight: 18 }, { type: 'breezy', weight: 12 } ],
          [ 'clear', 'overcast', 'breezy', 'rain' ],
          [ 'clear', 'overcast', 'breezy', 'rain' ],
          [],
        ]);
    });

    it('counts the fewest steps between two conditions within a season, and none to a condition it cannot reach', () =>
    {
      // Arrange: clear to itself, overcast to clear, rain to clear in Spring, and clear to snow in Summer.

      // Act.
      const hops = [ hopsTo(SKY, 'clear', 'clear', 'spring'), hopsTo(SKY, 'overcast', 'clear', 'spring'), hopsTo(SKY, 'rain', 'clear', 'spring'), hopsTo(SKY, 'clear', 'snow', 'summer') ];

      // Assert.
      expect(hops)
        .toStrictEqual([ 0, 1, 2, -1 ]);
    });
  });

  describe('closestTo, settlingType and settledType', () =>
  {
    it('picks the candidate fewest steps from the target, the first written on a tie, never one with no route', () =>
    {
      // Arrange: a Spring that also allows a condition whose only way on is back into itself, so it never reaches clear.
      const { spring } = SKY.seasons;
      const stuckSky = {
        ...SKY,
        seasons: { ...SKY.seasons, spring: { allowed: [ ...spring.allowed, 'stuck' ], transitions: { ...spring.transitions, stuck: { stuck: 1 } } } },
      } as SkyConfig;
      const stuck = { type: 'stuck', weight: 1 };
      const fromRain = candidatesFor(stuckSky, 'rain', 'spring');

      // Act: Spring's rain row, every step but rain one from clear; the same with the stuck condition written first; and
      // the stuck condition alone.
      const picks = [
        closestTo(stuckSky, fromRain, 'clear', 'spring'),
        closestTo(stuckSky, [ stuck, ...fromRain ], 'clear', 'spring'),
        closestTo(stuckSky, [ stuck ], 'clear', 'spring'),
      ];

      // Assert.
      expect([ hopsTo(stuckSky, 'stuck', 'clear', 'spring'), picks ])
        .toStrictEqual([ -1, [ 'overcast', 'overcast', 'stuck' ] ]);
    });

    it('steers one step toward clear, stays at clear, and stays put with nowhere to go', () =>
    {
      // Arrange: rain, overcast and clear in Spring, and rain in a season the sky does not have.

      // Act.
      const steps = [
        settlingType(SKY, 'rain', 'spring'),
        settlingType(SKY, 'overcast', 'spring'),
        settlingType(SKY, 'clear', 'spring'),
        settlingType(SKY, 'rain', 'monsoon season'),
      ];

      // Assert.
      expect(steps)
        .toStrictEqual([ 'overcast', 'clear', 'clear', 'rain' ]);
    });

    it('takes one step for every phase of a settling day so far, the first phase\'s included', () =>
    {
      // Arrange: a Spring day that came in raining, at each of its first three phases; and an Autumn day that came in
      // under a monsoon, at its last.

      // Act.
      const settled = [
        settledType(SKY, 'rain', 'spring', 0),
        settledType(SKY, 'rain', 'spring', 1),
        settledType(SKY, 'rain', 'spring', 2),
        settledType(SKY, 'monsoon', 'autumn', 0),
        settledType(SKY, 'monsoon', 'autumn', 5),
      ];

      // Assert: rain eases to overcast and clears; a monsoon walks down through rain.
      expect(settled)
        .toStrictEqual([ 'overcast', 'clear', 'clear', 'rain', 'clear' ]);
    });
  });
});
