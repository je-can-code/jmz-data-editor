import { describe, expect, it } from 'vitest';
import { readTimeTag, type TimeTag } from '../../../../src/mapEditor/modules/time/timeTags.ts';
import { clockWords, timeTagWords } from '../../../../src/mapEditor/modules/time/timeWords.ts';

/*
 * Each time tag said as an author would say when it holds, so a panel can say when a page shows: a clock span from its
 * opening to its closing time on a 24-hour face, closing an hour later where the plugin closes it later; a part of the
 * day by its name and hours, whether the tag named it or gave its id; a season by its name; an hour as that hour's
 * span; and the calendar's units and spans by their numbers. A full date span the plugin could not read is said as
 * written.
 */
describe('timeWords', () =>
{
  /**
   * Says one tag.
   * @param {string} line The tag.
   * @returns {string} The words.
   */
  const wordsOf = (line: string): string => timeTagWords(readTimeTag(line) as TimeTag);

  describe('clockWords', () =>
  {
    it('writes a time with two digits each, counting on past 23 to the end of the day', () =>
    {
      // Arrange: five past four, and the end of the day.
      const times = [ [ 4, 5 ], [ 24, 0 ] ];

      // Act.
      const words = times.map(([ hours, minutes ]) => clockWords(hours, minutes));

      // Assert.
      expect(words)
        .toStrictEqual([ '04:05', '24:00' ]);
    });
  });

  describe('timeTagWords', () =>
  {
    it('says the clock spans Chef Adventure uses', () =>
    {
      // Arrange.
      const lines = [ '<hourRangePage:18-5>', '<timeRangePage:4:00-16:00>', '<timeRangePage:16:00-4:00>', '<timeOfDayPage:night>' ];

      // Act.
      const words = lines.map(wordsOf);

      // Assert.
      expect(words)
        .toStrictEqual([ 'from 18:00 to 05:00', 'from 04:00 to 16:00', 'from 16:00 to 04:00', 'at Night, from 20:00 to 24:00' ]);
    });

    it('closes a clock span an hour later where the plugin does, when its end minute comes before its start minute', () =>
    {
      // Arrange.
      const line = '<timeRangePage:9:30-17:15>';

      // Act.
      const words = wordsOf(line);

      // Assert.
      expect(words)
        .toBe('from 09:30 to 18:15');
    });

    it('says a part of the day and a season by name, whether the tag names it or gives its id', () =>
    {
      // Arrange.
      const lines = [ '<timeOfDayPage:1>', '<timeOfDayPage:MORNING>', '<seasonOfYearPage:0>', '<seasonOfYearPage:Winter>' ];

      // Act.
      const words = lines.map(wordsOf);

      // Assert.
      expect(words)
        .toStrictEqual([ 'at Dawn, from 04:00 to 08:00', 'at Morning, from 08:00 to 12:00', 'in Spring', 'in Winter' ]);
    });

    it('says the exact units', () =>
    {
      // Arrange.
      const lines = [ '<minutePage:30>', '<hourPage:23>', '<dayPage:16>', '<monthPage:12>', '<yearPage:2026>' ];

      // Act.
      const words = lines.map(wordsOf);

      // Assert.
      expect(words)
        .toStrictEqual([ 'at minute 30 of each hour', 'from 23:00 to 24:00', 'on day 16', 'in month 12', 'in 2026' ]);
    });

    it('says a minute range within the hour, into the next, or two hours on, as the plugin closes it', () =>
    {
      // Arrange: 10 before 50 as text; 5 after 10 as text; 50 after 10 as text and as numbers.
      const lines = [ '<minuteRangePage:10-50>', '<minuteRangePage:5-10>', '<minuteRangePage:50-10>' ];

      // Act.
      const words = lines.map(wordsOf);

      // Assert.
      expect(words)
        .toStrictEqual([
          'from minute 10 of each hour to minute 50',
          'from minute 5 of each hour to minute 10 of the next',
          'from minute 50 of each hour to minute 10 two hours on',
        ]);
    });

    it('says the calendar\'s spans', () =>
    {
      // Arrange.
      const lines = [
        '<dayRangePage:10-20>',
        '<monthRangePage:11-2>',
        '<yearRangePage:2020-2030>',
        '<fullDateRangePage:[0,9,29,5,2021]-[30,17,29,5,2021]>',
      ];

      // Act.
      const words = lines.map(wordsOf);

      // Assert.
      expect(words)
        .toStrictEqual([ 'from day 10 to day 20', 'from month 11 to month 2', 'from 2020 until 2030', 'from 09:00 on 29/5/2021 to 17:30 on 29/5/2021' ]);
    });

    it('says a full date span\'s list as written when it is no JSON', () =>
    {
      // Arrange: a minute written with a leading zero.
      const line = '<fullDateRangePage:[00,9,29,5,2021]-[0,17,29,5,2021]>';

      // Act.
      const words = wordsOf(line);

      // Assert.
      expect(words)
        .toBe('from [00,9,29,5,2021] to 17:00 on 29/5/2021');
    });
  });
});
