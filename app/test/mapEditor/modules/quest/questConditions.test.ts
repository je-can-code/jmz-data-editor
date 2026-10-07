import { describe, expect, it } from 'vitest';
import {
  objectiveOf,
  questOf,
  questTagHolds,
  questTagsHold,
  waitsOnObjective,
} from '../../../../src/mapEditor/modules/quest/questConditions.ts';
import type { QuestLog, TrackedQuest } from '../../../../src/mapEditor/modules/quest/questLog.ts';
import type { QuestState, QuestTag } from '../../../../src/mapEditor/modules/quest/questTags.ts';

/*
 * A quest tag is judged exactly as J-OMNI-Quests judges it against the quests the game tracks: a tag naming an objective
 * holds while that objective is in the state it waits for, and never for an objective the quest lacks, even one another
 * quest has; a tag naming none, or a negative one, holds while the quest itself is in that state. Quests are found by
 * their key exactly, so a key differing by a letter or a suffix names another quest, and a quest the game does not track
 * (the plugin stops the game with an error when it asks after one) holds nothing, as does a key the plugin reads as a
 * number. A page's tags hold only while every one of them does.
 */

/**
 * The quests a game in progress tracks: a delivery under way, its objectives in each of the five states; and a sequel
 * whose key differs only by a suffix, completed, with an objective 7 the first quest lacks.
 */
const LOG: QuestLog = new Map<string, TrackedQuest>([
  [ 'herbalist_delivery', {
    key: 'herbalist_delivery',
    name: 'Herbalist Delivery',
    state: 'active',
    objectives: [
      { id: 0, state: 'completed' },
      { id: 1, state: 'active' },
      { id: 2, state: 'inactive' },
      { id: 3, state: 'failed' },
      { id: 4, state: 'missed' },
    ],
  } ],
  [ 'herbalist_delivery_2', {
    key: 'herbalist_delivery_2',
    name: 'Herbalist Delivery II',
    state: 'completed',
    objectives: [ { id: 0, state: 'completed' }, { id: 7, state: 'active' } ],
  } ],
]);

/**
 * Builds a tag as the reader reads one.
 * @param {string | null} key The key the quest is looked up by, written as it is unless null.
 * @param {number | null} objectiveId The objective, or null for the quest itself.
 * @param {QuestState} state The state waited for.
 * @returns {QuestTag} The tag.
 */
const tag = (key: string | null, objectiveId: number | null = null, state: QuestState = 'active'): QuestTag =>
{
  return { written: key ?? '2nd-errand', key, objectiveId, state };
};

/**
 * Every state, in the plugin's order.
 */
const STATES: readonly QuestState[] = [ 'inactive', 'active', 'completed', 'failed', 'missed' ];

describe('questConditions', () =>
{
  describe('waitsOnObjective', () =>
  {
    it('waits on an objective for an id of 0 or more, and on the quest itself for none or a negative one', () =>
    {
      // Arrange.
      const tags = [ tag('herbalist_delivery', 0), tag('herbalist_delivery', 3), tag('herbalist_delivery'), tag('herbalist_delivery', -1, 'inactive') ];

      // Act.
      const waits = tags.map(waitsOnObjective);

      // Assert.
      expect(waits)
        .toStrictEqual([ true, true, false, false ]);
    });
  });

  describe('questOf', () =>
  {
    it('finds the quest by its key exactly, passing over a key that differs by a suffix', () =>
    {
      // Arrange.
      const tags = [ tag('herbalist_delivery'), tag('herbalist_delivery_2') ];

      // Act.
      const names = tags.map(each => questOf(each, LOG)?.name);

      // Assert.
      expect(names)
        .toStrictEqual([ 'Herbalist Delivery', 'Herbalist Delivery II' ]);
    });

    it('finds nothing for a key the game tracks no quest by, or one read as a number', () =>
    {
      // Arrange: a key shorter by its last word, one longer by a suffix, and a key read as a number.
      const tags = [ tag('herbalist'), tag('herbalist_delivery_3'), tag(null) ];

      // Act.
      const quests = tags.map(each => questOf(each, LOG));

      // Assert.
      expect(quests)
        .toStrictEqual([ null, null, null ]);
    });
  });

  describe('objectiveOf', () =>
  {
    it('finds the objective by its id on the tag\'s own quest, and nothing for one only another quest has', () =>
    {
      // Arrange.
      const delivery = LOG.get('herbalist_delivery') as TrackedQuest;

      // Act.
      const found = [ objectiveOf(tag('herbalist_delivery', 2), delivery), objectiveOf(tag('herbalist_delivery', 7), delivery) ];

      // Assert.
      expect(found)
        .toStrictEqual([ { id: 2, state: 'inactive' }, null ]);
    });
  });

  describe('questTagHolds', () =>
  {
    it('holds a tag naming only a quest while that quest is active, and not for its completed sequel', () =>
    {
      // Arrange.
      const tags = [ tag('herbalist_delivery'), tag('herbalist_delivery_2') ];

      // Act.
      const held = tags.map(each => questTagHolds(each, LOG));

      // Assert.
      expect(held)
        .toStrictEqual([ true, false ]);
    });

    it('holds an objective\'s tag only while the objective is in the state waited for, for each of the five states', () =>
    {
      // Arrange: each objective of the delivery, 0 completed, 1 active, 2 inactive, 3 failed and 4 missed, asked about
      // each state in turn.
      const asked = [ 0, 1, 2, 3, 4 ].map(objectiveId => STATES.map(state => tag('herbalist_delivery', objectiveId, state)));

      // Act.
      const held = asked.map(row => row.map(each => questTagHolds(each, LOG)));

      // Assert: inactive, active, completed, failed, missed across; objectives 0 to 4 down.
      expect(held)
        .toStrictEqual([
          [ false, false, true, false, false ],
          [ false, true, false, false, false ],
          [ true, false, false, false, false ],
          [ false, false, false, true, false ],
          [ false, false, false, false, true ],
        ]);
    });

    it('never holds an objective the quest lacks, in any state, even while the sequel has it active', () =>
    {
      // Arrange: objective 7, which only the sequel has, asked of the delivery in every state.
      const tags = STATES.map(state => tag('herbalist_delivery', 7, state));

      // Act.
      const held = tags.map(each => questTagHolds(each, LOG));

      // Assert.
      expect(held)
        .toStrictEqual([ false, false, false, false, false ]);
    });

    it('judges the quest itself for a negative objective', () =>
    {
      // Arrange: the sequel completed and the delivery under way, each asked whether it is completed.
      const tags = [ tag('herbalist_delivery_2', -1, 'completed'), tag('herbalist_delivery', -1, 'completed'), tag('herbalist_delivery', -1, 'active') ];

      // Act.
      const held = tags.map(each => questTagHolds(each, LOG));

      // Assert.
      expect(held)
        .toStrictEqual([ true, false, true ]);
    });

    it('never holds for a quest the game does not track, whatever it waits for, nor for a key read as a number', () =>
    {
      // Arrange: an untracked quest, alone and with an objective in a state; and a key read as a number.
      const tags = [ tag('herbalist'), tag('herbalist_delivery_3', 2, 'inactive'), tag(null, 1) ];

      // Act.
      const held = tags.map(each => questTagHolds(each, LOG));

      // Assert.
      expect(held)
        .toStrictEqual([ false, false, false ]);
    });
  });

  describe('questTagsHold', () =>
  {
    it('holds a page while every one of its tags holds, and not once any one fails', () =>
    {
      // Arrange: a sequel completed and its quest under way, which hold; then the same with a third that does not.
      const pages = [
        [ tag('herbalist_delivery_2', -1, 'completed'), tag('herbalist_delivery', 1) ],
        [ tag('herbalist_delivery_2', -1, 'completed'), tag('herbalist_delivery', 1), tag('herbalist_delivery', 2, 'completed') ],
      ];

      // Act.
      const held = pages.map(tags => questTagsHold(tags, LOG));

      // Assert.
      expect(held)
        .toStrictEqual([ true, false ]);
    });
  });
});
