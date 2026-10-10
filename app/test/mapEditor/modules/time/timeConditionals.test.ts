import { describe, expect, it } from 'vitest';
import { conditionalOf, tagsHold } from '../../../../src/mapEditor/modules/time/timeConditionals.ts';
import { snapshotAt, type GameDate } from '../../../../src/mapEditor/modules/time/timeSnapshot.ts';
import { readTimeTag, type TimeTag } from '../../../../src/mapEditor/modules/time/timeTags.ts';

/*
 * J-TIME's page tags, judged exactly as the plugin judges them (Game_Event's TIME alias, TimeMapper and Time_Snapshot).
 *
 * An exact tag holds when its unit of the moment equals it: the minute, the hour, the day, the month, the year, the part
 * of the day (by name or id) or the season. A clock span (timeRangePage, hourRangePage, minuteRangePage) opens and closes
 * on the moment's own date and holds strictly between its ends, to the second: 18-5 is dark at 18:00:00 and lit by
 * 18:00:30. One closing at an earlier hour is overnight, closing the next day, and holds in the span that opened the
 * night before too, so 18-5 holds at 02:00 as well as at 22:00, and never at 05:00 or noon. One closing at an earlier
 * minute closes an hour later, whatever its hours, as the plugin has it: 9:30-17:15 holds until 18:15. A minute range is
 * built around the moment's own hour, its two minutes compared as text, so 5-10 closes in the next hour.
 *
 * A calendar span (fullDateRangePage, dayRangePage, monthRangePage, yearRangePage) holds strictly between its ends; a
 * full date span's ends are its first and last seconds of the minutes it names; a day range ending before it starts
 * closes in the next month, December's in the next year's January; a month range ending before it starts closes the
 * next year. Dates are read as the game's Date reads them, so a day past a month's end is the next month's and a year
 * under 100 is 1900 and on. A full date span whose list is no JSON, which the plugin throws on, never holds. Every tag a
 * page carries must hold.
 */
describe('timeConditionals', () =>
{
  /**
   * Chef Adventure's new game: 16 December 2026, at the top of the minute.
   */
  const START: GameDate = { seconds: 0, days: 16, months: 12, years: 2026 };

  /**
   * Reads a tag that is certainly one.
   * @param {string} line The tag.
   * @returns {TimeTag} The tag.
   */
  const tagOf = (line: string): TimeTag => readTimeTag(line) as TimeTag;

  /**
   * Judges one tag at a time of day on a date.
   * @param {string} line The tag.
   * @param {string} clock The time, such as {@code 18:00} or {@code 18:00:30}.
   * @param {GameDate} date The date and second, the second overridden by the clock's when it names one.
   * @returns {boolean} True when it holds.
   */
  const holdsAt = (line: string, clock: string, date: GameDate = START): boolean =>
  {
    const [ hours, minutes, seconds ] = clock.split(':').map(Number);
    const at = snapshotAt({ ...date, seconds: seconds ?? date.seconds }, hours * 60 + minutes);
    return tagsHold([ tagOf(line) ], at);
  };

  /**
   * Judges one tag at each of several times of day.
   * @param {string} line The tag.
   * @param {string[]} clocks The times.
   * @returns {boolean[]} Whether it holds at each.
   */
  const holdsAcross = (line: string, clocks: string[]): boolean[] => clocks.map(clock => holdsAt(line, clock));

  describe('exact tags', () =>
  {
    it('holds a minute tag at that minute of every hour only', () =>
    {
      // Arrange: the minutes either side, at two hours.
      const clocks = [ '09:29', '09:30', '09:31', '22:30' ];

      // Act.
      const held = holdsAcross('<minutePage:30>', clocks);

      // Assert.
      expect(held)
        .toStrictEqual([ false, true, false, true ]);
    });

    it('holds an hour tag through that hour only', () =>
    {
      // Arrange.
      const clocks = [ '17:59', '18:00', '18:59', '19:00' ];

      // Act.
      const held = holdsAcross('<hourPage:18>', clocks);

      // Assert.
      expect(held)
        .toStrictEqual([ false, true, true, false ]);
    });

    it('holds a day, month or year tag on the starting date it names, whatever the hour, and not on another', () =>
    {
      // Arrange: the 16th of December 2026, and each unit one off.
      const tags = [ '<dayPage:16>', '<monthPage:12>', '<yearPage:2026>', '<dayPage:15>', '<monthPage:11>', '<yearPage:2025>' ];

      // Act.
      const held = tags.map(line => [ holdsAt(line, '03:00'), holdsAt(line, '15:00') ]);

      // Assert.
      expect(held)
        .toStrictEqual([ [ true, true ], [ true, true ], [ true, true ], [ false, false ], [ false, false ], [ false, false ] ]);
    });

    it('holds a part of the day, named or by id, through its four hours only', () =>
    {
      // Arrange: Night by name, in capitals, and by id, around its hours.
      const clocks = [ '19:59', '20:00', '23:59', '00:00' ];

      // Act.
      const held = [ '<timeOfDayPage:night>', '<timeOfDayPage:NIGHT>', '<timeOfDayPage:5>' ].map(line => holdsAcross(line, clocks));

      // Assert.
      expect(held)
        .toStrictEqual([ [ false, true, true, false ], [ false, true, true, false ], [ false, true, true, false ] ]);
    });

    it('holds a season, named or by id, in the months it covers only', () =>
    {
      // Arrange: Winter by name and by id, and Spring, in December.
      const tags = [ '<seasonOfYearPage:winter>', '<seasonOfYearPage:3>', '<seasonOfYearPage:spring>' ];

      // Act.
      const held = tags.map(line => holdsAt(line, '12:00'));

      // Assert.
      expect(held)
        .toStrictEqual([ true, true, false ]);
    });
  });

  describe('clock spans', () =>
  {
    it('holds an overnight hour range on both sides of midnight, strictly between its ends', () =>
    {
      // Arrange: the first second, the next tick, late evening, midnight, the small hours, its last minute, its close, and
      // noon.
      const clocks = [ '18:00:00', '18:00:30', '23:00', '00:00', '02:00', '04:59', '05:00:00', '12:00' ];

      // Act.
      const held = holdsAcross('<hourRangePage:18-5>', clocks);

      // Assert.
      expect(held)
        .toStrictEqual([ false, true, true, true, true, true, false, false ]);
    });

    it('holds an hour range inside one day strictly between its ends', () =>
    {
      // Arrange.
      const clocks = [ '08:59', '09:00:00', '09:00:30', '16:59', '17:00:00', '22:00' ];

      // Act.
      const held = holdsAcross('<hourRangePage:9-17>', clocks);

      // Assert.
      expect(held)
        .toStrictEqual([ false, false, true, true, false, false ]);
    });

    it('holds Chef Adventure\'s day and night hours, 4:00-16:00 and 16:00-4:00, each where the other does not', () =>
    {
      // Arrange: the small hours, morning, afternoon and evening.
      const clocks = [ '02:00', '10:00', '15:59', '20:00' ];

      // Act.
      const held = [ '<timeRangePage:4:00-16:00>', '<timeRangePage:16:00-4:00>' ].map(line => holdsAcross(line, clocks));

      // Assert.
      expect(held)
        .toStrictEqual([ [ false, true, true, false ], [ true, false, false, true ] ]);
    });

    it('closes a clock span an hour later when its end minute comes before its start minute, as the plugin has it', () =>
    {
      // Arrange: 9:30-17:15 closes at 18:15.
      const clocks = [ '17:30', '18:14', '18:15:00' ];

      // Act.
      const held = holdsAcross('<timeRangePage:9:30-17:15>', clocks);

      // Assert.
      expect(held)
        .toStrictEqual([ true, true, false ]);
    });

    it('closes an overnight span with an earlier end minute an hour after its end, the next day', () =>
    {
      // Arrange: 22:30-1:15 closes at 02:15 the next morning, which the span opened the evening before reaches.
      const clocks = [ '22:00', '23:00', '02:00', '02:15:00' ];

      // Act.
      const held = holdsAcross('<timeRangePage:22:30-1:15>', clocks);

      // Assert.
      expect(held)
        .toStrictEqual([ false, true, true, false ]);
    });

    it('builds a minute range around the moment\'s own hour, closing it within that hour when its start comes first as text', () =>
    {
      // Arrange: 10-50, read as text 10 before 50.
      const clocks = [ '09:05', '09:30', '09:50:00', '22:30' ];

      // Act.
      const held = holdsAcross('<minuteRangePage:10-50>', clocks);

      // Assert.
      expect(held)
        .toStrictEqual([ false, true, false, true ]);
    });

    it('closes a minute range in the next hour when its start comes later as text, so 5-10 holds at half past', () =>
    {
      // Arrange: 5-10, where text 5 comes after text 10, closing at 10 past the next hour.
      const clocks = [ '09:04', '09:30', '23:30' ];

      // Act.
      const held = holdsAcross('<minuteRangePage:5-10>', clocks);

      // Assert: the last over midnight, the hour after 23 being 0.
      expect(held)
        .toStrictEqual([ false, true, true ]);
    });

    it('builds a minute range around the hour in the mapper, the next hour after 23 being 0', () =>
    {
      // Arrange: the moment at 23:30.
      const at = snapshotAt(START, 23 * 60 + 30);

      // Act.
      const conditional = conditionalOf(tagOf('<minuteRangePage:5-10>'), at);

      // Assert.
      expect(conditional)
        .toStrictEqual({ kind: 'clock', opens: [ 23, 5 ], closes: [ 0, 10 ] });
    });
  });

  describe('calendar spans', () =>
  {
    it('holds a full date span strictly between the first second of its first minute and the last of its last', () =>
    {
      // Arrange: 9:00 to 17:00 on the 16th of December 2026.
      const clocks = [ '09:00:00', '12:00', '17:00:30', '17:01:00' ];

      // Act.
      const held = holdsAcross('<fullDateRangePage:[0,9,16,12,2026]-[0,17,16,12,2026]>', clocks);

      // Assert.
      expect(held)
        .toStrictEqual([ false, true, true, false ]);
    });

    it('never holds a full date span whose list is no JSON, which the plugin throws on', () =>
    {
      // Arrange: a minute written with a leading zero.
      const line = '<fullDateRangePage:[00,9,16,12,2026]-[0,17,16,12,2026]>';

      // Act.
      const held = holdsAt(line, '12:00');

      // Assert.
      expect(held)
        .toBe(false);
    });

    it('holds a day range across the days it names, closing in the next month, and year, when its end day comes first', () =>
    {
      // Arrange: on the 16th of December, the 10th to the 20th, the 20th to the 5th, and the 1st to the 15th; then the
      // 20th to the 5th on the 25th, inside the span that closes on the 5th of January 2027.
      const tags = [ '<dayRangePage:10-20>', '<dayRangePage:20-5>', '<dayRangePage:1-15>' ];

      // Act.
      const held = [ ...tags.map(line => holdsAt(line, '12:00')), holdsAt('<dayRangePage:20-5>', '12:00', { ...START, days: 25 }) ];

      // Assert.
      expect(held)
        .toStrictEqual([ true, false, false, true ]);
    });

    it('holds a month range across the months it names, closing the next year when its end month comes first', () =>
    {
      // Arrange: in December, November to December, January to June, and November to February.
      const tags = [ '<monthRangePage:11-12>', '<monthRangePage:1-6>', '<monthRangePage:11-2>' ];

      // Act.
      const held = tags.map(line => holdsAt(line, '12:00'));

      // Assert.
      expect(held)
        .toStrictEqual([ true, false, true ]);
    });

    it('holds a year range from the first second of its first year until its last year begins', () =>
    {
      // Arrange: 2020 until 2030; 2027 until 2030; 2026 until 2027 at the first second of 2026, and at noon on the 1st.
      const newYear: GameDate = { seconds: 0, days: 1, months: 1, years: 2026 };

      // Act.
      const held = [
        holdsAt('<yearRangePage:2020-2030>', '12:00'),
        holdsAt('<yearRangePage:2027-2030>', '12:00'),
        holdsAt('<yearRangePage:2026-2027>', '00:00:00', newYear),
        holdsAt('<yearRangePage:2026-2027>', '12:00', newYear),
      ];

      // Assert.
      expect(held)
        .toStrictEqual([ true, false, false, true ]);
    });

    it('reads a day past the end of its month as the next month\'s, and a year under 100 as 1900 and on, as the game\'s dates do', () =>
    {
      // Arrange: the 31st of April 2026, which the game's dates read as the 1st of May; and the year 26, read as 1926.
      const april31: GameDate = { seconds: 0, days: 31, months: 4, years: 2026 };
      const year26: GameDate = { seconds: 0, days: 16, months: 12, years: 26 };

      // Act.
      const held = [
        holdsAt('<monthRangePage:5-5>', '12:00', april31),
        holdsAt('<monthPage:5>', '12:00', april31),
        holdsAt('<yearRangePage:1925-1927>', '12:00', year26),
      ];

      // Assert: May's span holds, though the exact month is still April.
      expect(held)
        .toStrictEqual([ true, false, true ]);
    });
  });

  describe('tagsHold', () =>
  {
    it('holds a page only while every tag it carries holds, and a page carrying none always', () =>
    {
      // Arrange: night hours in Winter; night hours in Spring; no tags at all; all at 22:00 in December.
      const at = snapshotAt(START, 22 * 60);
      const pages = [
        [ tagOf('<hourRangePage:18-5>'), tagOf('<seasonOfYearPage:winter>') ],
        [ tagOf('<hourRangePage:18-5>'), tagOf('<seasonOfYearPage:spring>') ],
        [],
      ];

      // Act.
      const held = pages.map(tags => tagsHold(tags, at));

      // Assert.
      expect(held)
        .toStrictEqual([ true, false, true ]);
    });
  });
});
