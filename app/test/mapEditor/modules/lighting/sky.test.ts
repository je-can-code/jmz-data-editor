import { describe, expect, it } from 'vitest';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { LightingClock } from '../../../../src/mapEditor/core/renderer/lightingLayer.ts';
import { skyAmbient, skyToneOf, TIME_SOURCE } from '../../../../src/mapEditor/modules/lighting/sky.ts';
import type { SkyCurve } from '../../../../src/mapEditor/modules/lighting/timeTone.ts';
import { buildMapJson } from '../../support/fixtures.ts';

/*
 * The sky over a map follows the window's clock as J-Lighting-Time declares it. Every map lies under the sky unless its
 * note carries <noToneChange>, read by the one reader of that tag (its own tests hold how the engine reads it). Over a
 * map with a sky, the clock's hour darkens by the curve, under the time source and naming no colour of its own, declared
 * even when it takes nothing away, as the plugin declares it; and casts the curve's tone, a phase tinting nothing
 * casting a tone of zeroes. Over a map with no sky, the clock declares nothing at all and casts no tone, which is not the
 * same as declaring nothing dark: the map's own darkness then stands alone.
 */

/**
 * Chef Adventure's curve.
 */
const CURVE: SkyCurve = {
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
};

/**
 * The view's clock at a time of day.
 * @param {number} timeOfDay The time of day, in minutes past midnight.
 * @returns {LightingClock} The clock.
 */
const at = (timeOfDay: number): LightingClock => ({ frames: 0, animating: true, timeOfDay });

/**
 * A map whose note is the given text.
 * @param {string} note The note.
 * @returns {MapDocument} The map.
 */
const mapNoted = (note: string): MapDocument =>
{
  return MapDocument.fromJson('map:12', { ...buildMapJson(), note });
};

describe('sky', () =>
{
  describe('skyAmbient', () =>
  {
    it('darkens a map with a sky by the curve at the clock\'s hour, naming no colour, under the time source', () =>
    {
      // Arrange: a field at 22:00.

      // Act.
      const declared = skyAmbient(CURVE)(mapNoted(''), at(1320));

      // Assert.
      expect(declared)
        .toStrictEqual({ darkness: 0.635, color: [ 0, 0, 0 ], declaresColor: false, source: TIME_SOURCE });
    });

    it('still declares an hour that takes nothing away, as the plugin does', () =>
    {
      // Arrange: a field at noon.

      // Act.
      const declared = skyAmbient(CURVE)(mapNoted(''), at(720));

      // Assert.
      expect(declared)
        .toStrictEqual({ darkness: 0, color: [ 0, 0, 0 ], declaresColor: false, source: 'time' });
    });

    it('declares nothing over a map with no sky, at any hour', () =>
    {
      // Arrange: a cave at 22:00.

      // Act.
      const declared = skyAmbient(CURVE)(mapNoted('<noToneChange>'), at(1320));

      // Assert.
      expect(declared)
        .toBeNull();
    });
  });

  describe('skyToneOf', () =>
  {
    it('casts the curve\'s tone at the hour over a map with a sky, the minutes past it changing nothing', () =>
    {
      // Arrange: a field at 22:00, at 22:59, and at 14:00.
      const field = mapNoted('');

      // Act.
      const tones = [ skyToneOf(field, 1320, CURVE), skyToneOf(field, 1379, CURVE), skyToneOf(field, 840, CURVE) ];

      // Assert.
      expect(tones)
        .toStrictEqual([ [ -32, -16, 37, 133 ], [ -32, -16, 37, 133 ], [ 19, 4, -19, 11 ] ]);
    });

    it('casts a tone of zeroes at an hour tinting nothing', () =>
    {
      // Arrange: a field at 8:00, Morning's first hour.

      // Act.
      const tone = skyToneOf(mapNoted(''), 480, CURVE);

      // Assert.
      expect(tone)
        .toStrictEqual([ 0, 0, 0, 0 ]);
    });

    it('casts no tone over a map with no sky', () =>
    {
      // Arrange: a cave at 22:00.

      // Act.
      const tone = skyToneOf(mapNoted('<noToneChange>'), 1320, CURVE);

      // Assert.
      expect(tone)
        .toBeNull();
    });
  });
});
