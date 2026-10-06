import { describe, expect, it } from 'vitest';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import {
  curveProblemOf,
  LIGHTING_TIME_CONFIG_NOTICE_ID,
  lightingTimeConfigNotice,
  skyCurveFrom,
  type LightingTimeConfig,
} from '../../../../src/mapEditor/modules/lighting/lightingTimeConfig.ts';

/*
 * J-Lighting-Time's day and night curve is read from the project's config as the plugin reads it at boot: the tone and
 * the darkness of each phase the sequence names, in the sequence's order. A curve the game could not use draws no sky,
 * and is said over the map with what is wrong, so a sky standing still at every hour is never mistaken for the game's
 * look: a file that could not be read, in the server's words; a sequence naming a phase the file does not hold, which
 * stops the game at boot; a sequence too short to cover the day; or a tone that is not four numbers. A phase or a
 * sequence the file leaves out arrives as null, which reads as none. A curve that serves draws the sky, and nothing is
 * said of it.
 */

/**
 * Chef Adventure's curve, as the server serves it.
 */
const SHIPPED: LightingTimeConfig = {
  phases: {
    Moontide: { tone: [ -30, -18, 34, 170 ], darkness: 0.72 },
    Dawn: { tone: [ 30, 6, -12, 40 ], darkness: 0.3 },
    Morning: { tone: [ 0, 0, 0, 0 ], darkness: 0 },
    Afternoon: { tone: [ 12, 8, -4, 0 ], darkness: 0 },
    Evening: { tone: [ 26, 0, -34, 22 ], darkness: 0.08 },
    Night: { tone: [ -34, -14, 40, 95 ], darkness: 0.55 },
  },
  sequence: [ 'Moontide', 'Dawn', 'Morning', 'Afternoon', 'Evening', 'Night', 'Moontide' ],
};

/**
 * Hands a curve over as the server's JSON.
 * @param {LightingTimeConfig} config The curve.
 * @returns {JsonValue} The same, as JSON.
 */
const served = (config: LightingTimeConfig): JsonValue => config as unknown as JsonValue;

describe('lightingTimeConfig', () =>
{
  describe('curveProblemOf', () =>
  {
    it('finds nothing wrong with the curve Chef Adventure ships', () =>
    {
      // Arrange: the shipped curve.

      // Act.
      const problem = curveProblemOf(SHIPPED);

      // Assert.
      expect(problem)
        .toBeNull();
    });

    it('names a phase the sequence names and the file does not hold, even one every object answers to', () =>
    {
      // Arrange: Dusk in place of Evening, and a sequence naming what every object carries.
      const curves = [
        { ...SHIPPED, sequence: [ 'Moontide', 'Dawn', 'Morning', 'Afternoon', 'Dusk', 'Night', 'Moontide' ] },
        { ...SHIPPED, sequence: [ 'constructor', 'Dawn', 'Morning', 'Afternoon', 'Evening', 'Night', 'Moontide' ] },
      ];

      // Act.
      const problems = curves.map(curveProblemOf);

      // Assert.
      expect(problems)
        .toStrictEqual([ 'Its sequence names "Dusk", which is none of its phases.', 'Its sequence names "constructor", which is none of its phases.' ]);
    });

    it('says a sequence too short for the day is, and passes one with phases to spare', () =>
    {
      // Arrange: the sequence without its closing Moontide, and with one more at the end.
      const curves = [ { ...SHIPPED, sequence: SHIPPED.sequence?.slice(0, 6) ?? [] }, { ...SHIPPED, sequence: [ ...SHIPPED.sequence ?? [], 'Dawn' ] } ];

      // Act.
      const problems = curves.map(curveProblemOf);

      // Assert.
      expect(problems)
        .toStrictEqual([ 'Its sequence lists 6 phases, and a day needs 7: the six in order, then the first again.', null ]);
    });

    it('says a tone of other than four numbers is, short or long', () =>
    {
      // Arrange: Night's tone without its grey, and Dawn's with a fifth number.
      const phases = SHIPPED.phases ?? {};
      const curves = [
        { ...SHIPPED, phases: { ...phases, Night: { tone: [ -34, -14, 40 ], darkness: 0.55 } } },
        { ...SHIPPED, phases: { ...phases, Dawn: { tone: [ 30, 6, -12, 40, 1 ], darkness: 0.3 } } },
      ];

      // Act.
      const problems = curves.map(curveProblemOf);

      // Assert.
      expect(problems)
        .toStrictEqual([
          'The tone of "Night" holds 3 numbers, and a tone holds 4: red, green, blue and grey.',
          'The tone of "Dawn" holds 5 numbers, and a tone holds 4: red, green, blue and grey.',
        ]);
    });

    it('reads phases, a sequence or a tone the file leaves out as none', () =>
    {
      // Arrange: no phases; no sequence; Morning with no tone.
      const curves: LightingTimeConfig[] = [
        { ...SHIPPED, phases: null },
        { ...SHIPPED, sequence: null },
        { ...SHIPPED, phases: { ...SHIPPED.phases, Morning: { tone: null, darkness: 0 } } },
      ];

      // Act.
      const problems = curves.map(curveProblemOf);

      // Assert.
      expect(problems)
        .toStrictEqual([
          'Its sequence names "Moontide", which is none of its phases.',
          'Its sequence lists 0 phases, and a day needs 7: the six in order, then the first again.',
          'The tone of "Morning" holds 0 numbers, and a tone holds 4: red, green, blue and grey.',
        ]);
    });
  });

  describe('skyCurveFrom', () =>
  {
    it('reads each phase the sequence names, in the sequence\'s order, both ends included', () =>
    {
      // Arrange: the shipped curve.

      // Act.
      const curve = skyCurveFrom(served(SHIPPED));

      // Assert.
      expect(curve)
        .toStrictEqual({
          tones: [
            [ -30, -18, 34, 170 ],
            [ 30, 6, -12, 40 ],
            [ 0, 0, 0, 0 ],
            [ 12, 8, -4, 0 ],
            [ 26, 0, -34, 22 ],
            [ -34, -14, 40, 95 ],
            [ -30, -18, 34, 170 ],
          ],
          darkness: [ 0.72, 0.3, 0, 0, 0.08, 0.55, 0.72 ],
        });
    });

    it('has no curve for a project without the file, or with a curve the game could not use', () =>
    {
      // Arrange: no file, and a sequence one short.
      const configs = [ null, served({ ...SHIPPED, sequence: SHIPPED.sequence?.slice(1) ?? [] }) ];

      // Act.
      const curves = configs.map(skyCurveFrom);

      // Assert.
      expect(curves)
        .toStrictEqual([ null, null ]);
    });
  });

  describe('lightingTimeConfigNotice', () =>
  {
    it('says nothing of a curve that serves', () =>
    {
      // Arrange: the shipped curve.

      // Act.
      const notice = lightingTimeConfigNotice(served(SHIPPED), undefined);

      // Assert.
      expect(notice)
        .toBeNull();
    });

    it('says the file could not be read, in the server\'s words, or that nothing said why', () =>
    {
      // Arrange: a missing file, and a read that gave no reason.

      // Act.
      const notices = [
        lightingTimeConfigNotice(null, 'open /game/data/config.lighting-time.json: no such file or directory'),
        lightingTimeConfigNotice(null, undefined),
      ];

      // Assert.
      expect(notices)
        .toStrictEqual([
          {
            id: LIGHTING_TIME_CONFIG_NOTICE_ID,
            title: 'The sky does not change with the clock until data/config.lighting-time.json is fixed.',
            detail: 'It could not be read: open /game/data/config.lighting-time.json: no such file or directory. This clears as soon as the file is fixed.',
          },
          {
            id: LIGHTING_TIME_CONFIG_NOTICE_ID,
            title: 'The sky does not change with the clock until data/config.lighting-time.json is fixed.',
            detail: 'It was not read. This clears as soon as the file is fixed.',
          },
        ]);
    });

    it('says what keeps a curve that was read from serving the game', () =>
    {
      // Arrange: Dusk in place of Evening.
      const config = served({ ...SHIPPED, sequence: [ 'Moontide', 'Dawn', 'Morning', 'Afternoon', 'Dusk', 'Night', 'Moontide' ] });

      // Act.
      const notice = lightingTimeConfigNotice(config, undefined);

      // Assert.
      expect(notice)
        .toStrictEqual({
          id: LIGHTING_TIME_CONFIG_NOTICE_ID,
          title: 'The sky does not change with the clock until data/config.lighting-time.json is fixed.',
          detail: 'Its sequence names "Dusk", which is none of its phases. This clears as soon as the file is fixed.',
        });
    });
  });
});
