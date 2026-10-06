import { describe, expect, it } from 'vitest';
import { readTimeTag, readTimeTags } from '../../../../src/mapEditor/modules/time/timeTags.ts';
import { command, page, text } from '../../support/eventKindFixtures.ts';

/*
 * J-TIME's page tags, read exactly as the plugin reads them: from a page's comment lines, its first line (108) and any
 * later one (408) alike, each offered only when it is one tag filling the whole line, in the order written. Fourteen
 * kinds: the exact units (minute, hour, day, month, year), the part of the day and the season by name or by id, the
 * clock span HH:MM-HH:MM, the full date span, and the unit ranges. Case never matters, and one space may follow the
 * colon. A value outside what a tag admits (a part of the day past 5, a season named fall), a line with words beside its
 * tag, a tag in a message, and the choice-branch family are no page tags at all.
 */
describe('timeTags', () =>
{
  describe('readTimeTag', () =>
  {
    it('reads every kind of page tag J-TIME declares as its own kind, with what it captures', () =>
    {
      // Arrange: one tag of each kind, in the order the plugin tests them.
      const lines = [
        '<minutePage:30>',
        '<hourPage:18>',
        '<dayPage:16>',
        '<monthPage:12>',
        '<yearPage:2026>',
        '<timeOfDayPage:night>',
        '<seasonOfYearPage:winter>',
        '<timeRangePage:16:00-4:00>',
        '<fullDateRangePage:[0,9,16,12,2026]-[0,17,16,12,2026]>',
        '<minuteRangePage:10-50>',
        '<hourRangePage:18-5>',
        '<dayRangePage:10-20>',
        '<monthRangePage:11-2>',
        '<yearRangePage:2020-2030>',
      ];

      // Act.
      const tags = lines.map(readTimeTag);

      // Assert.
      expect(tags)
        .toStrictEqual([
          { kind: 'Minute', captures: [ '30', undefined ] },
          { kind: 'Hour', captures: [ '18' ] },
          { kind: 'Day', captures: [ '16' ] },
          { kind: 'Month', captures: [ '12' ] },
          { kind: 'Year', captures: [ '2026' ] },
          { kind: 'TimeOfDay', captures: [ 'night' ] },
          { kind: 'SeasonOfYear', captures: [ 'winter' ] },
          { kind: 'TimeRange', captures: [ '16', '00', '4', '00' ] },
          { kind: 'FullDateRange', captures: [ '[0,9,16,12,2026]', '[0,17,16,12,2026]' ] },
          { kind: 'MinuteRange', captures: [ '10', '50' ] },
          { kind: 'HourRange', captures: [ '18', '5' ] },
          { kind: 'DayRange', captures: [ '10', '20' ] },
          { kind: 'MonthRange', captures: [ '11', '2' ] },
          { kind: 'YearRange', captures: [ '2020', '2030' ] },
        ]);
    });

    it('reads a tag in any case, with one space after the colon, and a part of the day or season by its id', () =>
    {
      // Arrange.
      const lines = [ '<HOURRANGEPAGE: 18-5>', '<timeOfDayPage:5>', '<seasonOfYearPage: 3>', '<TimeOfDayPage:Night>' ];

      // Act.
      const tags = lines.map(readTimeTag);

      // Assert.
      expect(tags)
        .toStrictEqual([
          { kind: 'HourRange', captures: [ '18', '5' ] },
          { kind: 'TimeOfDay', captures: [ '5' ] },
          { kind: 'SeasonOfYear', captures: [ '3' ] },
          { kind: 'TimeOfDay', captures: [ 'Night' ] },
        ]);
    });

    it('reads no tag from a value the tag does not admit, two spaces, the choice family, or a light', () =>
    {
      // Arrange: a part of the day past 5; autumn as fall; two spaces after the colon; a choice tag; a light.
      const lines = [ '<timeOfDayPage:12>', '<seasonOfYearPage:fall>', '<hourRangePage:  18-5>', '<hourRangeChoice:18-5>', '<light:[4]>' ];

      // Act.
      const tags = lines.map(readTimeTag);

      // Assert.
      expect(tags)
        .toStrictEqual([ null, null, null, null, null ]);
    });
  });

  describe('readTimeTags', () =>
  {
    it('reads the tags of a page\'s comments, first lines and later ones, in the order written', () =>
    {
      // Arrange: a lamp's lit page, its light, then its hours on the comment's second line, then a season.
      const shown = page([
        command(108, [ '<light:[4, #ffbb73, 40, flicker]>' ]),
        command(408, [ '<hourRangePage:18-5>' ]),
        command(108, [ '<seasonOfYearPage:winter>' ]),
      ]);

      // Act.
      const tags = readTimeTags(shown);

      // Assert.
      expect(tags)
        .toStrictEqual([ { kind: 'HourRange', captures: [ '18', '5' ] }, { kind: 'SeasonOfYear', captures: [ 'winter' ] } ]);
    });

    it('reads nothing from a line J-Base does not offer, a tag in a message, or a comment holding no text', () =>
    {
      // Arrange: words after the tag; a space before it; spoken in a message; a script line; a comment with no text.
      const shown = page([
        command(108, [ '<hourRangePage:18-5> lamp' ]),
        command(108, [ ' <hourRangePage:18-5>' ]),
        ...text([ '<hourRangePage:18-5>' ]),
        command(355, [ '<hourRangePage:18-5>' ]),
        command(108, []),
      ]);

      // Act.
      const tags = readTimeTags(shown);

      // Assert.
      expect(tags)
        .toStrictEqual([]);
    });
  });
});
