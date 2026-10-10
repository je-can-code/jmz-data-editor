import { describe, expect, it } from 'vitest';
import {
  formatRegionList,
  parseDecimal,
  parseRegionList,
  parseWholeNumber,
  PROPERTY_LIMITS,
  SCROLL_TYPES,
} from '../../../../src/mapEditor/core/properties/propertyInputs.ts';

/*
 * Whatever the map properties form reads from a field is written into the map file, so it owes the file only values
 * MZ itself would write: whole numbers inside MZ's limits (a volume of 0 to 100, a pan of -100 to 100, a region of
 * 1 to 255), and region lists made only of region ids. A field taking fractions, such as a light's reach, reads plain
 * numbers to the places it allows. Anything else is refused whole, never trimmed into range or rounded, or read as far
 * as it makes sense, so a typo can never quietly become a different value.
 */
describe('propertyInputs', () =>
{
  describe('parseWholeNumber', () =>
  {
    it('reads whole numbers at and between the limits, signs and spaces allowed', () =>
    {
      // Arrange.
      const texts = [ '0', ' 100 ', '+7', '-100' ];

      // Act.
      const values = [
        parseWholeNumber(texts[0], PROPERTY_LIMITS.volume),
        parseWholeNumber(texts[1], PROPERTY_LIMITS.volume),
        parseWholeNumber(texts[2], PROPERTY_LIMITS.volume),
        parseWholeNumber(texts[3], PROPERTY_LIMITS.pan),
      ];

      // Assert.
      expect(values)
        .toStrictEqual([ 0, 100, 7, -100 ]);
    });

    it('refuses values just outside the limits, fractions, and anything that is not a number', () =>
    {
      // Arrange.
      const texts = [ '101', '-1', '12.5', '1e2', '', '12a', '--3' ];

      // Act.
      const values = texts.map(text => parseWholeNumber(text, PROPERTY_LIMITS.volume));

      // Assert.
      expect(values)
        .toStrictEqual([ null, null, null, null, null, null, null ]);
    });
  });

  describe('parseDecimal', () =>
  {
    /**
     * A reach in tiles: above 0 to 99, to two places.
     */
    const REACH = { min: 0.01, max: 99, places: 2 };

    it('reads numbers with as many places as the field takes, at and between its limits, however they are typed', () =>
    {
      // Arrange: a lone dot before the places, a dot with none after it, a sign, spaces, and both limits.
      const texts = [ '.5', '4.', '+2.25', ' 3 ', '0.01', '99' ];

      // Act.
      const values = texts.map(text => parseDecimal(text, REACH));

      // Assert.
      expect(values)
        .toStrictEqual([ 0.5, 4, 2.25, 3, 0.01, 99 ]);
    });

    it('refuses more places than the field takes, counted as typed, and numbers just outside its limits', () =>
    {
      // Arrange: three places, two typed as a trailing zero past a field of whole numbers, and either side of the limits.
      const texts = [ '2.255', '0', '99.01' ];

      // Act.
      const values = [ ...texts.map(text => parseDecimal(text, REACH)), parseDecimal('2.50', { min: 0, max: 100, places: 0 }) ];

      // Assert.
      expect(values)
        .toStrictEqual([ null, null, null, null ]);
    });

    it('refuses anything that is not a plain number', () =>
    {
      // Arrange: nothing, a word, an exponent, two dots, and a dot alone.
      const texts = [ '', 'four', '1e2', '1.2.3', '.' ];

      // Act.
      const values = texts.map(text => parseDecimal(text, REACH));

      // Assert.
      expect(values)
        .toStrictEqual([ null, null, null, null, null ]);
    });
  });

  describe('parseRegionList', () =>
  {
    it('reads region ids separated by commas or spaces, keeping repeats once', () =>
    {
      // Arrange.
      const text = '3, 1 7,,3';

      // Act.
      const regions = parseRegionList(text);

      // Assert.
      expect(regions)
        .toStrictEqual([ 3, 1, 7 ]);
    });

    it('reads an empty field as every region', () =>
    {
      // Arrange.
      const text = '  ';

      // Act.
      const regions = parseRegionList(text);

      // Assert.
      expect(regions)
        .toStrictEqual([]);
    });

    it('refuses the whole list when any entry is not a region id', () =>
    {
      // Arrange.
      const texts = [ '1, 256', '0', '1, two', '4.5' ];

      // Act.
      const lists = texts.map(parseRegionList);

      // Assert.
      expect(lists)
        .toStrictEqual([ null, null, null, null ]);
    });

    it('writes a list back the way the field shows it', () =>
    {
      // Arrange.
      const regions = [ 1, 3, 5 ];

      // Act.
      const text = formatRegionList(regions);

      // Assert.
      expect([ text, parseRegionList(text) ])
        .toStrictEqual([ '1, 3, 5', regions ]);
    });
  });

  it('offers the four scroll types in MZ\'s order', () =>
  {
    // Arrange: nothing to arrange.

    // Act.
    const values = SCROLL_TYPES.map(type => type.value);

    // Assert.
    expect(values)
      .toStrictEqual([ 0, 1, 2, 3 ]);
  });
});
