import { describe, expect, it } from 'vitest';
import { areaEventTag, joinsChoicesAbove } from '../../../../src/mapEditor/core/commandList/commandGuards.ts';
import { cmd } from '../../support/commandFixtures.ts';

/*
 * Two plugins Chef Adventure runs read the list's shape rather than any one command, and the editor must neither
 * break nor hide what they rely on. HIME_LargeChoices merges a Show Choices that follows the end of another at once,
 * at the same indent, into one list of choices; KMS_AreaEvent reads a trigger area from a comment tag, but only in
 * the comments at the very top of a page. The guards spot both, so rows can say so, with near misses that must not
 * count: a Show Choices after anything else, or at another indent, and a tag below a command.
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
    it('reads the area from a tag in the page\'s top comments, on any of its lines', () =>
    {
      // Arrange.
      const list = [ cmd(108, 0, [ '<enemyId:5>' ]), cmd(408, 0, [ '<areaEvent:5x2>' ]), cmd(201, 0, [ 0, 2, 1, 1, 0, 0 ]), cmd(0, 0) ];

      // Act.
      const tag = areaEventTag(list, 0);

      // Assert.
      expect(tag)
        .toStrictEqual({ width: 5, height: 2, effective: true });
    });

    it('reads the tag the way the plugin does: any case, its Japanese name, spaces, and at least one tile', () =>
    {
      // Arrange.
      const lists = [
        [ cmd(108, 0, [ '<AREAEVENT : 3 x 4>' ]) ],
        [ cmd(108, 0, [ '<エリアイベント:2x1>' ]) ],
        [ cmd(108, 0, [ '<areaEvent:0x0>' ]) ],
      ];

      // Act.
      const tags = lists.map(list => areaEventTag(list, 0));

      // Assert.
      expect(tags)
        .toStrictEqual([ { width: 3, height: 4, effective: true }, { width: 2, height: 1, effective: true }, { width: 1, height: 1, effective: true } ]);
    });

    it('marks a tag below any other command as one the plugin never reads', () =>
    {
      // Arrange.
      const list = [ cmd(108, 0, [ 'intro' ]), cmd(250, 0, [ {} ]), cmd(108, 0, [ '<areaEvent:9x1>' ]) ];

      // Act.
      const tag = areaEventTag(list, 2);

      // Assert.
      expect(tag)
        .toStrictEqual({ width: 9, height: 1, effective: false });
    });

    it('finds nothing in a comment without the tag, or in a command that is not a comment', () =>
    {
      // Arrange.
      const list = [ cmd(108, 0, [ '<enemyId:5>' ]), cmd(355, 0, [ '<areaEvent:5x2>' ]) ];

      // Act.
      const tags = [ areaEventTag(list, 0), areaEventTag(list, 1), areaEventTag(list, 9) ];

      // Assert.
      expect(tags)
        .toStrictEqual([ null, null, null ]);
    });
  });
});
