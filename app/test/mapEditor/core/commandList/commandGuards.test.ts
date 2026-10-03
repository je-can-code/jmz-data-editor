import { describe, expect, it } from 'vitest';
import { areaEventTag, joinsChoicesAbove } from '../../../../src/mapEditor/core/commandList/commandGuards.ts';
import { cmd } from '../../support/commandFixtures.ts';

/*
 * Two things Chef Adventure's plugins read deserve a note on their rows. HIME_LargeChoices merges a Show Choices that
 * follows the end of another at once, at the same indent, into one list of choices, and the editor must neither
 * break nor hide that merge. J-Pixelistics reads a trigger area from a comment tag on any line of the page, but only
 * a line that is the whole tag, since J-Base offers plugins nothing else. The guards spot both, with near misses that
 * must not count: a Show Choices after anything else, or at another indent, and a tag in the old shape, with a size
 * of zero, or sharing its line with other text.
 */
describe('commandGuards', () =>
{
  describe('joinsChoicesAbove', () =>
  {
    it('spots a Show Choices following another\'s end at once, at the same indent', () =>
    {
      // Arrange.
      const list = [ cmd(102, 1), cmd(402, 1), cmd(0, 2), cmd(404, 1), cmd(102, 1), cmd(404, 0), cmd(102, 1), cmd(230, 1), cmd(102, 1) ];

      // Act.
      const answers = [ 0, 4, 6, 8, 7, 99 ].map(index => joinsChoicesAbove(list, index));

      // Assert: the first has nothing above; the next follows an end; one follows an end at another indent; one
      // follows a wait; a wait is not choices at all; past the end is nothing.
      expect(answers)
        .toStrictEqual([ false, true, false, false, false, false ]);
    });
  });

  describe('areaEventTag', () =>
  {
    it('reads the area from a tag on any of a comment\'s lines', () =>
    {
      // Arrange.
      const list = [ cmd(108, 0, [ '<enemyId:5>' ]), cmd(408, 0, [ '<areaEvent:[5, 2]>' ]), cmd(201, 0, [ 0, 2, 1, 1, 0, 0 ]), cmd(0, 0) ];

      // Act.
      const tag = areaEventTag(list, 0);

      // Assert.
      expect(tag)
        .toStrictEqual({ width: 5, height: 2 });
    });

    it('reads the tag the way the game does: any case, and one optional space after the colon and around each size', () =>
    {
      // Arrange.
      const lists = [
        [ cmd(108, 0, [ '<AREAEVENT: [3, 4]>' ]) ],
        [ cmd(108, 0, [ '<areaEvent:[ 2 , 1 ]>' ]) ],
      ];

      // Act.
      const tags = lists.map(list => areaEventTag(list, 0));

      // Assert.
      expect(tags)
        .toStrictEqual([ { width: 3, height: 4 }, { width: 2, height: 1 } ]);
    });

    it('reads a tag below other commands, since the game reads every comment line on the page', () =>
    {
      // Arrange.
      const list = [ cmd(108, 0, [ 'intro' ]), cmd(250, 0, [ {} ]), cmd(108, 0, [ '<areaEvent:[9, 1]>' ]) ];

      // Act.
      const tag = areaEventTag(list, 2);

      // Assert.
      expect(tag)
        .toStrictEqual({ width: 9, height: 1 });
    });

    it('finds nothing in the old shape, at a size of zero, or with anything else on the line', () =>
    {
      // Arrange.
      const lists = [
        [ cmd(108, 0, [ '<areaEvent:5x2>' ]) ],
        [ cmd(108, 0, [ '<areaEvent:[0, 2]>' ]) ],
        [ cmd(108, 0, [ 'exit: <areaEvent:[5, 2]>' ]) ],
      ];

      // Act.
      const tags = lists.map(list => areaEventTag(list, 0));

      // Assert.
      expect(tags)
        .toStrictEqual([ null, null, null ]);
    });

    it('finds nothing in a comment without the tag, or in a command that is not a comment', () =>
    {
      // Arrange.
      const list = [ cmd(108, 0, [ '<enemyId:5>' ]), cmd(355, 0, [ '<areaEvent:[5, 2]>' ]) ];

      // Act.
      const tags = [ areaEventTag(list, 0), areaEventTag(list, 1), areaEventTag(list, 9) ];

      // Assert.
      expect(tags)
        .toStrictEqual([ null, null, null ]);
    });
  });
});
