import { describe, expect, it } from 'vitest';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { GamePreview } from '../../../../src/mapEditor/core/preview/GamePreview.ts';
import type { TrackedQuest } from '../../../../src/mapEditor/modules/quest/questLog.ts';
import {
  followedStateOf,
  questAt,
  questPreviewKey,
  readQuestSetting,
  stateOfObjectives,
  writeQuestSetting,
} from '../../../../src/mapEditor/modules/quest/questPreview.ts';

/*
 * What the preview sets of a quest is the quest's own state, or nothing so the quest stays where its objectives put it,
 * and each objective set, by id. It is kept in the preview as plain JSON the core never reads, so it is read back
 * leniently: anything J-OMNI-Quests has no state for, an objective named by no id, and an objective left in the state a
 * new game starts it in all read as nothing set, and a quest set to nothing at all is not kept.
 *
 * A quest is shown as the preview sets it, exactly as the plugin would hold it: each objective set in its state, and the
 * quest in a state of its own where the preview gives it one, whatever its objectives say, as the plugin's Finalize Quest
 * gives a quest one. Otherwise the quest is where its objectives put it, by the plugin's own rule (a failed objective
 * fails it, any under way keeps it under way, every one missed misses it, every one finished completes it, none begun
 * leaves it waiting to be found); with some done and the rest not begun it is under way, which is how the plugin leaves
 * a quest it progressed. A quest the preview sets nothing of is the log's own, untouched.
 */
describe('questPreview', () =>
{
  /**
   * Cecil's first quest as a new game tracks it: three objectives, all inactive.
   */
  const DRILLS: TrackedQuest = {
    key: 'cecil-001',
    name: 'Drills',
    state: 'inactive',
    objectives: [
      { id: 0, state: 'inactive', description: 'The town\'s only guard wants lessons.' },
      { id: 1, state: 'inactive', description: 'It goes badly. Then less badly.' },
      { id: 2, state: 'inactive', description: 'Teaching teaches the teacher.' },
    ],
  };

  describe('readQuestSetting', () =>
  {
    it('reads nothing set from a value that is no object', () =>
    {
      // Arrange: nothing kept, a word, a list and null.
      const values: (JsonValue | undefined)[] = [ undefined, 'done', [ 'completed' ], null ];

      // Act.
      const settings = values.map(readQuestSetting);

      // Assert.
      expect(settings.map(setting => [ setting.state, [ ...setting.objectives ] ]))
        .toStrictEqual([ [ null, [] ], [ null, [] ], [ null, [] ], [ null, [] ] ]);
    });

    it('keeps the quest\'s own state, and each objective set to a state the plugin has', () =>
    {
      // Arrange.
      const value: JsonValue = { state: 'completed', objectives: { 1: 'active', 3: 'missed' } };

      // Act.
      const setting = readQuestSetting(value);

      // Assert.
      expect([ setting.state, [ ...setting.objectives ] ])
        .toStrictEqual([ 'completed', [ [ 1, 'active' ], [ 3, 'missed' ] ] ]);
    });

    it('drops a state the plugin does not have, an objective named by no id, and one left as a new game starts it', () =>
    {
      // Arrange: a quest "done", objective 1 "finished", objectives named x and -1, objective 2 inactive, and 4 failed.
      const value: JsonValue = { state: 'done', objectives: { 1: 'finished', x: 'active', '-1': 'active', 2: 'inactive', 4: 'failed' } };

      // Act.
      const setting = readQuestSetting(value);

      // Assert.
      expect([ setting.state, [ ...setting.objectives ] ])
        .toStrictEqual([ null, [ [ 4, 'failed' ] ] ]);
    });

    it('reads no objective from objectives that are no object', () =>
    {
      // Arrange.
      const value: JsonValue = { state: 'active', objectives: [ 'active' ] };

      // Act.
      const setting = readQuestSetting(value);

      // Assert.
      expect([ setting.state, setting.objectives.size ])
        .toStrictEqual([ 'active', 0 ]);
    });
  });

  describe('writeQuestSetting', () =>
  {
    it('writes nothing for a quest set to nothing, so the preview leaves it as a new game has it', () =>
    {
      // Arrange.
      const setting = { state: null, objectives: new Map() };

      // Act.
      const value = writeQuestSetting(setting);

      // Assert.
      expect(value)
        .toBeUndefined();
    });

    it('writes the quest\'s own state alone, its objectives alone in order of their ids, or both, and reads them back', () =>
    {
      // Arrange: the quest completed; objectives 2 and 0 set, in that order; and both.
      const settings = [
        { state: 'completed' as const, objectives: new Map() },
        { state: null, objectives: new Map([ [ 2, 'active' as const ], [ 0, 'completed' as const ] ]) },
        { state: 'missed' as const, objectives: new Map([ [ 1, 'failed' as const ] ]) },
      ];

      // Act.
      const values = settings.map(writeQuestSetting);

      // Assert.
      const readBack = values.map(value => readQuestSetting(value)).map(setting => [ setting.state, [ ...setting.objectives ] ]);
      expect([ values.map(value => JSON.stringify(value)), readBack ])
        .toStrictEqual([
          [ '{"state":"completed"}', '{"objectives":{"0":"completed","2":"active"}}', '{"state":"missed","objectives":{"1":"failed"}}' ],
          [ [ 'completed', [] ], [ null, [ [ 0, 'completed' ], [ 2, 'active' ] ] ], [ 'missed', [ [ 1, 'failed' ] ] ] ],
        ]);
    });
  });

  describe('stateOfObjectives', () =>
  {
    it('fails a quest once any objective fails, whatever the others say', () =>
    {
      // Arrange: one done, one failed, one under way.
      const states = [ 'completed', 'failed', 'active' ] as const;

      // Act.
      const state = stateOfObjectives(states);

      // Assert.
      expect(state)
        .toBe('failed');
    });

    it('leaves a quest waiting to be found while none of its objectives has begun, as with none at all', () =>
    {
      // Arrange.
      const quests = [ [ 'inactive', 'inactive' ] as const, [] ];

      // Act.
      const states = quests.map(stateOfObjectives);

      // Assert.
      expect(states)
        .toStrictEqual([ 'inactive', 'inactive' ]);
    });

    it('keeps a quest under way while any objective is', () =>
    {
      // Arrange: one done, one under way, one missed, one not begun.
      const states = [ 'completed', 'active', 'missed', 'inactive' ] as const;

      // Act.
      const state = stateOfObjectives(states);

      // Assert.
      expect(state)
        .toBe('active');
    });

    it('misses a quest whose every objective went by, rather than completing it', () =>
    {
      // Arrange.
      const states = [ 'missed', 'missed' ] as const;

      // Act.
      const state = stateOfObjectives(states);

      // Assert.
      expect(state)
        .toBe('missed');
    });

    it('completes a quest whose every objective is done or went by', () =>
    {
      // Arrange.
      const states = [ 'completed', 'missed', 'completed' ] as const;

      // Act.
      const state = stateOfObjectives(states);

      // Assert.
      expect(state)
        .toBe('completed');
    });

    it('keeps a quest under way with some objectives done and the rest not begun', () =>
    {
      // Arrange: the first done, the second not begun.
      const states = [ 'completed', 'inactive' ] as const;

      // Act.
      const state = stateOfObjectives(states);

      // Assert.
      expect(state)
        .toBe('active');
    });
  });

  describe('followedStateOf', () =>
  {
    it('puts a quest where its objectives as set put it, leaving a state of its own aside', () =>
    {
      // Arrange: objective 1 under way, with the quest completed of its own.
      const setting = readQuestSetting({ state: 'completed', objectives: { 1: 'active' } });

      // Act.
      const state = followedStateOf(DRILLS, setting);

      // Assert.
      expect(state)
        .toBe('active');
    });

    it('keeps the state the log gives a quest while the preview sets none of its objectives, ids it lacks included', () =>
    {
      // Arrange: a quest a game in progress tracks under way with no objective begun, and objective 7 set, which it lacks.
      const underWay: TrackedQuest = { ...DRILLS, state: 'active' };
      const setting = readQuestSetting({ objectives: { 7: 'completed' } });

      // Act.
      const state = followedStateOf(underWay, setting);

      // Assert.
      expect(state)
        .toBe('active');
    });
  });

  describe('questAt', () =>
  {
    it('hands back the quest itself while the preview sets nothing of it, though it sets a quest whose key is alike', () =>
    {
      // Arrange: Cecil's second quest set.
      const preview = GamePreview.FRESH.with('quest.states', 'cecil-0011', { state: 'completed' }).with('quest.states', 'cecil-002', { objectives: { 1: 'active' } });

      // Act.
      const shown = questAt(DRILLS, preview);

      // Assert.
      expect(shown)
        .toBe(DRILLS);
    });

    it('shows each objective set in its state, every other as a new game has it, and the quest where they put it', () =>
    {
      // Arrange: objective 0 done and 1 under way.
      const preview = GamePreview.FRESH.with('quest.states', 'cecil-001', { objectives: { 0: 'completed', 1: 'active' } });

      // Act.
      const shown = questAt(DRILLS, preview);

      // Assert.
      expect([ shown.state, shown.objectives.map(objective => objective.state), shown.objectives[1].description ])
        .toStrictEqual([ 'active', [ 'completed', 'active', 'inactive' ], 'It goes badly. Then less badly.' ]);
    });

    it('shows the quest in a state of its own whatever its objectives say', () =>
    {
      // Arrange: the quest missed of its own, with objective 1 under way.
      const preview = GamePreview.FRESH.with('quest.states', 'cecil-001', { state: 'missed', objectives: { 1: 'active' } });

      // Act.
      const shown = questAt(DRILLS, preview);

      // Assert.
      expect([ shown.state, shown.objectives.map(objective => objective.state) ])
        .toStrictEqual([ 'missed', [ 'inactive', 'active', 'inactive' ] ]);
    });
  });

  describe('questPreviewKey', () =>
  {
    it('names a quest as a piece of preview state, as a change to it is named', () =>
    {
      // Arrange: Cecil's first quest set, beside a fresh save.
      const changed = GamePreview.FRESH.with('quest.states', 'cecil-001', { state: 'completed' }).changedKeys(GamePreview.FRESH);

      // Act.
      const key = questPreviewKey('cecil-001');

      // Assert.
      expect([ key, [ ...changed ] ])
        .toStrictEqual([ 'quest.states:cecil-001', [ 'quest.states:cecil-001' ] ]);
    });
  });
});
