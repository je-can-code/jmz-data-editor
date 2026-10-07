import { describe, expect, it } from 'vitest';
import type { QuestLog, TrackedQuest } from '../../../../src/mapEditor/modules/quest/questLog.ts';
import type { QuestState, QuestTag } from '../../../../src/mapEditor/modules/quest/questTags.ts';
import { questTagWords, shownNameOf } from '../../../../src/mapEditor/modules/quest/questWords.ts';

/*
 * A quest tag says when its page shows in the author's words, for the panels that say when a page shows: "while
 * \"Herbalist Delivery\" is active", "while objective 2 of \"Herbalist Delivery\" is completed". A quest is named as the
 * player sees it, its name less the escape codes the game draws as colours rather than letters, or by its key where it
 * has no name. A tag waiting on a negative objective waits on the quest itself, and says so. A quest the game does not
 * track, or an objective its quest lacks, keeps the page from ever showing, so it is named as the tag writes it and said
 * to be missing.
 */

/**
 * The quests a fresh save tracks: a delivery, its sequel, a quest whose name is coloured, and one with no name.
 */
const LOG: QuestLog = new Map<string, TrackedQuest>([
  [ 'herbalist_delivery', { key: 'herbalist_delivery', name: 'Herbalist Delivery', state: 'inactive', objectives: [ { id: 0, state: 'inactive' }, { id: 2, state: 'inactive' } ] } ],
  [ 'herbalist_delivery_2', { key: 'herbalist_delivery_2', name: 'Herbalist Delivery II', state: 'inactive', objectives: [ { id: 7, state: 'inactive' } ] } ],
  [ 'main-004', { key: 'main-004', name: 'Deal with the \\C[1]Water Entity\\C[0]', state: 'inactive', objectives: [] } ],
  [ 'mittens-001', { key: 'mittens-001', name: ' \\C[2]\\C[0] ', state: 'inactive', objectives: [] } ],
]);

/**
 * Builds a tag as the reader reads one.
 * @param {string} written The key as written.
 * @param {number | null} objectiveId The objective, or null for the quest itself.
 * @param {QuestState} state The state waited for.
 * @param {string | null} key The key the quest is looked up by; by default, the key as written.
 * @returns {QuestTag} The tag.
 */
const tag = (written: string, objectiveId: number | null = null, state: QuestState = 'active', key: string | null = written): QuestTag =>
{
  return { written, key, objectiveId, state };
};

describe('questWords', () =>
{
  describe('shownNameOf', () =>
  {
    it('reads a quest\'s name less its escape codes, and nothing for a name of codes and spaces alone', () =>
    {
      // Arrange.
      const quests = [ 'main-004', 'herbalist_delivery', 'mittens-001' ].map(key => LOG.get(key) as TrackedQuest);

      // Act.
      const names = quests.map(shownNameOf);

      // Assert.
      expect(names)
        .toStrictEqual([ 'Deal with the Water Entity', 'Herbalist Delivery', '' ]);
    });
  });

  describe('questTagWords', () =>
  {
    it('names a quest waited on alone by the name the player sees, in quotes', () =>
    {
      // Arrange.
      const tags = [ tag('herbalist_delivery'), tag('main-004') ];

      // Act.
      const words = tags.map(each => questTagWords(each, LOG));

      // Assert.
      expect(words)
        .toStrictEqual([ 'while "Herbalist Delivery" is active', 'while "Deal with the Water Entity" is active' ]);
    });

    it('names an objective of the quest, in each of the five states', () =>
    {
      // Arrange.
      const states: QuestState[] = [ 'inactive', 'active', 'completed', 'failed', 'missed' ];

      // Act.
      const words = states.map(state => questTagWords(tag('herbalist_delivery', 2, state), LOG));

      // Assert.
      expect(words)
        .toStrictEqual([
          'while objective 2 of "Herbalist Delivery" is inactive',
          'while objective 2 of "Herbalist Delivery" is active',
          'while objective 2 of "Herbalist Delivery" is completed',
          'while objective 2 of "Herbalist Delivery" is failed',
          'while objective 2 of "Herbalist Delivery" is missed',
        ]);
    });

    it('names the quest itself for a negative objective', () =>
    {
      // Arrange: the way every shipped quest-giver waits for its quest to be offered.
      const waiting = tag('herbalist_delivery_2', -1, 'inactive');

      // Act.
      const words = questTagWords(waiting, LOG);

      // Assert.
      expect(words)
        .toBe('while "Herbalist Delivery II" is inactive');
    });

    it('names a quest by its key where its name shows nothing', () =>
    {
      // Arrange.
      const unnamed = tag('mittens-001', -1, 'completed');

      // Act.
      const words = questTagWords(unnamed, LOG);

      // Assert.
      expect(words)
        .toBe('while quest mittens-001 is completed');
    });

    it('names a quest the game does not track as the tag writes it, saying no such quest, alone or with an objective', () =>
    {
      // Arrange: a key a suffix short of a tracked one; one a suffix past; and one the plugin reads as a number.
      const tags = [ tag('herbalist'), tag('herbalist_delivery_3', 2, 'inactive'), tag('2nd-errand', null, 'active', null) ];

      // Act.
      const words = tags.map(each => questTagWords(each, LOG));

      // Assert.
      expect(words)
        .toStrictEqual([
          'while quest herbalist is active (no such quest)',
          'while objective 2 of quest herbalist_delivery_3 is inactive (no such quest)',
          'while quest 2nd-errand is active (no such quest)',
        ]);
    });

    it('says no such objective for an objective the quest lacks, though its sequel has one by that id', () =>
    {
      // Arrange.
      const missing = tag('herbalist_delivery', 7, 'completed');

      // Act.
      const words = questTagWords(missing, LOG);

      // Assert.
      expect(words)
        .toBe('while objective 7 of "Herbalist Delivery" is completed (no such objective)');
    });
  });
});
