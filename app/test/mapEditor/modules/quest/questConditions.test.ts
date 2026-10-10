import { describe, expect, it } from 'vitest';
import { GamePreview } from '../../../../src/mapEditor/core/preview/GamePreview.ts';
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
 *
 * Every tag is judged at the window's preview: a quest the preview sets is judged as it sets it, its objectives in the
 * states set and the quest in a state of its own or where its objectives put it, and a quest it leaves alone as the log
 * has it. What is set of one quest never reaches another, however alike their keys, and a quest the game does not track
 * holds nothing whatever the preview sets of it.
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
      { id: 0, state: 'completed', description: 'Pick the herbs.' },
      { id: 1, state: 'active', description: 'Carry them to town.' },
      { id: 2, state: 'inactive', description: 'Hand them over.' },
      { id: 3, state: 'failed', description: 'Keep them fresh.' },
      { id: 4, state: 'missed', description: 'Find the rare one.' },
    ],
  } ],
  [ 'herbalist_delivery_2', {
    key: 'herbalist_delivery_2',
    name: 'Herbalist Delivery II',
    state: 'completed',
    objectives: [ { id: 0, state: 'completed', description: 'Pick more herbs.' }, { id: 7, state: 'active', description: 'Rest.' } ],
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

/**
 * The same two quests as a new game tracks them: every quest and objective inactive.
 */
const NEW_GAME: QuestLog = new Map([ ...LOG ].map(([ key, quest ]) => [
  key,
  { ...quest, state: 'inactive' as const, objectives: quest.objectives.map(objective => ({ ...objective, state: 'inactive' as const })) },
]));

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
        .toStrictEqual([ { id: 2, state: 'inactive', description: 'Hand them over.' }, null ]);
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

    it('holds an objective\'s tag at the state the preview sets it, every other objective as a new game has it', () =>
    {
      // Arrange: objective 1 of the delivery under way.
      const preview = GamePreview.FRESH.with('quest.states', 'herbalist_delivery', { objectives: { 1: 'active' } });
      const tags = [ tag('herbalist_delivery', 1), tag('herbalist_delivery', 1, 'inactive'), tag('herbalist_delivery', 2, 'inactive'), tag('herbalist_delivery', 0) ];

      // Act.
      const held = tags.map(each => [ questTagHolds(each, NEW_GAME, preview), questTagHolds(each, NEW_GAME) ]);

      // Assert: at the preview, then on a fresh save.
      expect(held)
        .toStrictEqual([ [ true, false ], [ false, true ], [ true, true ], [ false, false ] ]);
    });

    it('holds a tag on the quest itself where its objectives put it, and at a state of its own once the preview gives one', () =>
    {
      // Arrange: objective 1 under way; then the same with the quest completed of its own.
      const underWay = GamePreview.FRESH.with('quest.states', 'herbalist_delivery', { objectives: { 1: 'active' } });
      const completed = GamePreview.FRESH.with('quest.states', 'herbalist_delivery', { state: 'completed', objectives: { 1: 'active' } });
      const tags = [ tag('herbalist_delivery'), tag('herbalist_delivery', -1, 'inactive'), tag('herbalist_delivery', -1, 'completed') ];

      // Act.
      const held = [ underWay, completed ].map(preview => tags.map(each => questTagHolds(each, NEW_GAME, preview)));

      // Assert: active, inactive, completed across; under way, then completed of its own, down.
      expect(held)
        .toStrictEqual([ [ true, false, false ], [ false, false, true ] ]);
    });

    it('wakes nothing on a quest whose key differs by a suffix, nor on a quest the game does not track', () =>
    {
      // Arrange: objective 0 of the sequel under way, which the delivery has too; and an untracked quest set active.
      const preview = GamePreview.FRESH.with('quest.states', 'herbalist_delivery_2', { objectives: { 0: 'active' } })
        .with('quest.states', 'herbalist', { state: 'active' });
      const tags = [ tag('herbalist_delivery', 0), tag('herbalist_delivery'), tag('herbalist_delivery_2', 0), tag('herbalist') ];

      // Act.
      const held = tags.map(each => questTagHolds(each, NEW_GAME, preview));

      // Assert.
      expect(held)
        .toStrictEqual([ false, false, true, false ]);
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

    it('holds a page at the preview while every one of its tags holds there, each quest as the preview sets it', () =>
    {
      // Arrange: a sequel's offer, waiting for the sequel to be inactive and the delivery completed, as quest-givers do.
      const offer = [ tag('herbalist_delivery_2', -1, 'inactive'), tag('herbalist_delivery', -1, 'completed') ];
      const done = GamePreview.FRESH.with('quest.states', 'herbalist_delivery', { state: 'completed' });

      // Act.
      const held = [ questTagsHold(offer, NEW_GAME), questTagsHold(offer, NEW_GAME, done), questTagsHold(offer, NEW_GAME, done.with('quest.states', 'herbalist_delivery_2', { state: 'active' })) ];

      // Assert: not on a fresh save; once the delivery is done; not once the sequel is under way too.
      expect(held)
        .toStrictEqual([ false, true, false ]);
    });
  });
});
