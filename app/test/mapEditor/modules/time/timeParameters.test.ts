import { describe, expect, it } from 'vitest';
import { isClockMinute, startingTimeOf } from '../../../../src/mapEditor/modules/time/timeParameters.ts';
import type { PluginsJsEntry } from '../../../../src/services/plugins/PluginsJsReader.ts';

/*
 * The window's clock starts where a new game does, read from J-TIME's parameters as the plugin reads them: its Starting
 * Hour and Starting Minute, each a number from text, so an empty parameter reads as 0. A game running on real time
 * starts at the time on the player's own clock, as the game would show it. A starting value the clock cannot show (an
 * hour of 25, a minute of 60, a parameter js/plugins.js does not have) falls back to J-TIME's own default, 9:00.
 */
describe('timeParameters', () =>
{
  /**
   * The moment the tests read real time at: 21:37 on 2026-10-06.
   */
  const NOW = new Date(2026, 9, 6, 21, 37, 12);

  /**
   * J-TIME as js/plugins.js lists it, with the given parameters.
   * @param {Record<string, string>} parameters The parameters.
   * @returns {PluginsJsEntry} The entry.
   */
  const time = (parameters: Record<string, string>): PluginsJsEntry => ({ name: 'j/time/J-TIME', status: true, description: '', parameters });

  describe('startingTimeOf', () =>
  {
    it('starts at the Starting Hour and Starting Minute on artificial time', () =>
    {
      // Arrange: Chef Adventure's 14:00, and a 06:45 start.
      const plugins = [
        time({ useRealTime: 'false', startingHour: '14', startingMinute: '0' }),
        time({ useRealTime: 'false', startingHour: '6', startingMinute: '45' }),
      ];

      // Act.
      const starts = plugins.map(plugin => startingTimeOf(plugin, NOW));

      // Assert.
      expect(starts)
        .toStrictEqual([ 840, 405 ]);
    });

    it('starts at the time on the player\'s own clock on real time', () =>
    {
      // Arrange: real time, whatever the starting parameters say.
      const plugin = time({ useRealTime: 'true', startingHour: '14', startingMinute: '0' });

      // Act.
      const start = startingTimeOf(plugin, NOW);

      // Assert.
      expect(start)
        .toBe(1297);
    });

    it('reads an empty parameter as 0, as the plugin does', () =>
    {
      // Arrange.
      const plugin = time({ useRealTime: 'false', startingHour: '', startingMinute: '' });

      // Act.
      const start = startingTimeOf(plugin, NOW);

      // Assert.
      expect(start)
        .toBe(0);
    });

    it('falls back to J-TIME\'s own 9:00 for values the clock cannot show, or parameters it does not have', () =>
    {
      // Arrange: an hour past the day with a minute past the hour, a fraction of an hour, and no parameters at all.
      const plugins = [ time({ startingHour: '25', startingMinute: '60' }), time({ startingHour: '7.5', startingMinute: '30' }), time({}) ];

      // Act.
      const starts = plugins.map(plugin => startingTimeOf(plugin, NOW));

      // Assert.
      expect(starts)
        .toStrictEqual([ 540, 570, 540 ]);
    });
  });

  describe('isClockMinute', () =>
  {
    it('takes a whole minute from 0 to 59, and nothing either side or between', () =>
    {
      // Arrange.
      const minutes = [ 0, 59, -1, 60, 2.5 ];

      // Act.
      const onClock = minutes.map(isClockMinute);

      // Assert.
      expect(onClock)
        .toStrictEqual([ true, true, false, false, false ]);
    });
  });
});
