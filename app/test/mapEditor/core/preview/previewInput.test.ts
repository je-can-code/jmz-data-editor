import { describe, expect, it } from 'vitest';
import { readWholeNumber } from '../../../../src/mapEditor/core/preview/previewInput.ts';

/*
 * What is typed into a variable's preview box, or a list's maximum, counts once it is a whole number: negative ones
 * included, spaces around it ignored. Anything else, an empty box or a lone minus sign on the way to a negative number
 * among them, reads as nothing yet, so typing never sets a value the author did not mean, and neither does a number too
 * big to be held exactly.
 */
describe('readWholeNumber', () =>
{
  it('reads whole numbers, negative ones and ones with spaces around them included', () =>
  {
    // Arrange.
    const texts = [ '99', '0', '-5', ' 74 ', '9007199254740991' ];

    // Act.
    const read = texts.map(readWholeNumber);

    // Assert.
    expect(read)
      .toStrictEqual([ 99, 0, -5, 74, 9007199254740991 ]);
  });

  it('reads nothing from text that is no whole number yet, or one too big to hold exactly', () =>
  {
    // Arrange.
    const texts = [ '', '-', '9.5', '1e3', 'ninety', '9007199254740993' ];

    // Act.
    const read = texts.map(readWholeNumber);

    // Assert.
    expect(read)
      .toStrictEqual([ null, null, null, null, null, null ]);
  });
});
