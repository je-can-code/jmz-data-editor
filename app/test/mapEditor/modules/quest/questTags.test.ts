import { describe, expect, it } from 'vitest';
import { readQuestTag, readQuestTags } from '../../../../src/mapEditor/modules/quest/questTags.ts';
import { command, page, text } from '../../support/eventKindFixtures.ts';

/*
 * J-OMNI-Quests' page tags, read exactly as the plugin reads them: from a page's comment lines, its first line (108) and
 * any later one (408) alike, each offered only when it is one tag filling the whole line, in the order written. Three
 * shapes: [QUEST_KEY] waits for the quest to be active, [QUEST_KEY, OBJECTIVE_ID] for that objective to be active, and
 * [QUEST_KEY, OBJECTIVE_ID, STATE] for that objective to be in the state named (inactive, active, completed, failed or
 * missed, in any case), a negative id there waiting on the quest itself. Case never matters, and one space may follow
 * the colon and each comma.
 *
 * The bracketed list is read the way J-Base's mapper reads any list, which reads a key made of a number, or of true or
 * false, as a number or a yes or no: no quest's key is ever one, so such a tag names no quest. A two-part tag with a
 * negative id, a state the plugin does not know, a fourth part, an empty list, a key holding a space, two spaces after a
 * comma, and the choice family, which gates a Show Choices branch, are no page tags at all; nor is a line holding words
 * besides its tag, a tag in a message, or a comment holding no text.
 */
describe('questTags', () =>
{
  describe('readQuestTag', () =>
  {
    it('reads a quest alone as waiting for that quest to be active', () =>
    {
      // Arrange.
      const line = '<pageQuestCondition:[herbalist_delivery]>';

      // Act.
      const tag = readQuestTag(line);

      // Assert.
      expect(tag)
        .toStrictEqual({ written: 'herbalist_delivery', key: 'herbalist_delivery', objectiveId: null, state: 'active' });
    });

    it('reads a quest and an objective as waiting for that objective to be active, with a space after the comma or none', () =>
    {
      // Arrange.
      const lines = [ '<pageQuestCondition:[herbalist_delivery, 2]>', '<pageQuestCondition:[herbalist_delivery,2]>' ];

      // Act.
      const tags = lines.map(readQuestTag);

      // Assert.
      expect(tags)
        .toStrictEqual([
          { written: 'herbalist_delivery', key: 'herbalist_delivery', objectiveId: 2, state: 'active' },
          { written: 'herbalist_delivery', key: 'herbalist_delivery', objectiveId: 2, state: 'active' },
        ]);
    });

    it('reads a quest, an objective and each of the five states, in any case, as waiting for that objective to be in it', () =>
    {
      // Arrange.
      const lines = [
        '<pageQuestCondition:[richpoor-001, 0, inactive]>',
        '<pageQuestCondition:[richpoor-001, 1, Active]>',
        '<pageQuestCondition:[richpoor-001, 2, COMPLETED]>',
        '<pageQuestCondition:[richpoor-001,3,failed]>',
        '<PAGEQUESTCONDITION: [richpoor-001, 4, missed]>',
      ];

      // Act.
      const tags = lines.map(readQuestTag);

      // Assert.
      expect(tags)
        .toStrictEqual([
          { written: 'richpoor-001', key: 'richpoor-001', objectiveId: 0, state: 'inactive' },
          { written: 'richpoor-001', key: 'richpoor-001', objectiveId: 1, state: 'active' },
          { written: 'richpoor-001', key: 'richpoor-001', objectiveId: 2, state: 'completed' },
          { written: 'richpoor-001', key: 'richpoor-001', objectiveId: 3, state: 'failed' },
          { written: 'richpoor-001', key: 'richpoor-001', objectiveId: 4, state: 'missed' },
        ]);
    });

    it('reads a negative objective in the three-part shape, which waits on the quest itself, and an id as a number', () =>
    {
      // Arrange: the shape every shipped quest-giver uses, and an objective written with a leading zero.
      const lines = [ '<pageQuestCondition:[cerak-001, -1, inactive]>', '<pageQuestCondition:[cerak-001, 007]>' ];

      // Act.
      const tags = lines.map(readQuestTag);

      // Assert.
      expect(tags)
        .toStrictEqual([
          { written: 'cerak-001', key: 'cerak-001', objectiveId: -1, state: 'inactive' },
          { written: 'cerak-001', key: 'cerak-001', objectiveId: 7, state: 'active' },
        ]);
    });

    it('reads a key the mapper reads as a number, or as true or false, as naming no quest, keeping what is written', () =>
    {
      // Arrange: a key starting with digits, a decimal, a word for infinity, and true in capitals.
      const lines = [
        '<pageQuestCondition:[2nd-errand]>',
        '<pageQuestCondition:[1.5, 2]>',
        '<pageQuestCondition:[Infinity, 0, inactive]>',
        '<pageQuestCondition:[TRUE]>',
      ];

      // Act.
      const tags = lines.map(readQuestTag);

      // Assert.
      expect(tags)
        .toStrictEqual([
          { written: '2nd-errand', key: null, objectiveId: null, state: 'active' },
          { written: '1.5', key: null, objectiveId: 2, state: 'active' },
          { written: 'Infinity', key: null, objectiveId: 0, state: 'inactive' },
          { written: 'TRUE', key: null, objectiveId: null, state: 'active' },
        ]);
    });

    it('keeps a key that only begins like a number, or only holds the word true, as text', () =>
    {
      // Arrange: near misses of the keys above: no digit at the start, a lone hyphen, and true inside a longer key.
      const lines = [ '<pageQuestCondition:[e5]>', '<pageQuestCondition:[-]>', '<pageQuestCondition:[true-love, 1]>' ];

      // Act.
      const keys = lines.map(line => readQuestTag(line)?.key);

      // Assert.
      expect(keys)
        .toStrictEqual([ 'e5', '-', 'true-love' ]);
    });

    it('reads no tag from a shape the plugin does not declare, two spaces, the choice family, or another plugin\'s tag', () =>
    {
      // Arrange: a negative id with no state; an unknown state; a fourth part; an empty list; a key holding a space; two
      // spaces after a comma; a choice tag; J-TIME's hours.
      const lines = [
        '<pageQuestCondition:[herbalist_delivery, -1]>',
        '<pageQuestCondition:[herbalist_delivery, 1, done]>',
        '<pageQuestCondition:[herbalist_delivery, 1, active, 2]>',
        '<pageQuestCondition:[]>',
        '<pageQuestCondition:[herbalist delivery]>',
        '<pageQuestCondition:[herbalist_delivery,  1]>',
        '<choiceQuestCondition:[herbalist_delivery]>',
        '<hourRangePage:18-5>',
      ];

      // Act.
      const tags = lines.map(readQuestTag);

      // Assert.
      expect(tags)
        .toStrictEqual([ null, null, null, null, null, null, null, null ]);
    });
  });

  describe('readQuestTags', () =>
  {
    it('reads the tags of a page\'s comments, first lines and later ones, in the order written, passing over other tags', () =>
    {
      // Arrange: a quest-giver's page waiting for the next quest to be inactive and the last one completed, with its
      // light between them on the comment's second line.
      const shown = page([
        command(108, [ '<pageQuestCondition:[richpoor-002, -1, inactive]>' ]),
        command(408, [ '<light:[2]>' ]),
        command(408, [ '<pageQuestCondition:[richpoor-001, -1, completed]>' ]),
      ]);

      // Act.
      const tags = readQuestTags(shown);

      // Assert.
      expect(tags)
        .toStrictEqual([
          { written: 'richpoor-002', key: 'richpoor-002', objectiveId: -1, state: 'inactive' },
          { written: 'richpoor-001', key: 'richpoor-001', objectiveId: -1, state: 'completed' },
        ]);
    });

    it('reads nothing from a line J-Base does not offer, a tag in a message, or a comment holding no text', () =>
    {
      // Arrange: words after the tag; a space before it; spoken in a message; a script line; a comment with no text; a
      // comment holding a number.
      const shown = page([
        command(108, [ '<pageQuestCondition:[herbalist_delivery]> offer' ]),
        command(108, [ ' <pageQuestCondition:[herbalist_delivery]>' ]),
        ...text([ '<pageQuestCondition:[herbalist_delivery]>' ]),
        command(355, [ '<pageQuestCondition:[herbalist_delivery]>' ]),
        command(108, []),
        command(408, [ 7 ]),
      ]);

      // Act.
      const tags = readQuestTags(shown);

      // Assert.
      expect(tags)
        .toStrictEqual([]);
    });
  });
});
