import { describe, expect, it } from 'vitest';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { GamePreview } from '../../../../src/mapEditor/core/preview/GamePreview.ts';
import { newGameQuestLog, type TrackedQuest } from '../../../../src/mapEditor/modules/quest/questLog.ts';
import {
  BY_OBJECTIVES,
  chooseQuestState,
  QUEST_CHOICE,
  questEntryOf,
  questPreviewKind,
} from '../../../../src/mapEditor/modules/quest/questPreviewList.ts';

/*
 * J-OMNI-Quests' module lists in the Switches & Variables window every quest a new game tracks, in the config's order,
 * by the name the player sees (its escape codes left out), or by its key where the name shows nothing, its key beneath
 * either way, so a search finds it by name or key. Each quest opens onto its objectives, by id and description.
 *
 * Every objective offers the plugin's five states, standing at the one a new game starts it in until the author picks
 * another. The quest offers the same five as a state of its own, and first, standing until one is picked, where its
 * objectives put it, naming that state, so the author sees the quest move as its objectives do.
 *
 * Picking writes only that quest's value: its own state or back to its objectives, or one objective's state, an
 * objective put back in a new game's state being left alone; a quest left with nothing set is not kept at all. The kind
 * is counted in the chip as quests set.
 */
describe('questPreviewList', () =>
{
  /**
   * Cecil's two quests and one whose name shows nothing, as the server serves them.
   */
  const CONFIG = {
    quests: [
      {
        name: 'Drills',
        key: 'cecil-001',
        objectives: [
          { id: 0, description: 'The town\'s only guard wants lessons.' },
          { id: 1, description: 'It goes \\C[2]badly\\C[0]. Then less badly.' },
        ],
      },
      { name: 'The Patrol Route', key: 'cecil-002', objectives: [ { id: 0, description: 'The full circuit of Raevula, after dark.' } ] },
      { name: ' \\C[2]\\C[0] ', key: 'mittens-001', objectives: [] },
    ],
    tags: [],
    categories: [],
  } as unknown as JsonValue;

  const LOG = newGameQuestLog(CONFIG);

  const DRILLS = LOG.get('cecil-001') as TrackedQuest;

  describe('questPreviewKind', () =>
  {
    it('names the kind and what its list says, as an author reads them', () =>
    {
      // Arrange: nothing beyond the log.

      // Act.
      const kind = questPreviewKind(LOG);

      // Assert.
      expect([ kind.id, kind.title, kind.nouns, kind.searchHint, kind.noMatch ])
        .toStrictEqual([ 'quest.states', 'Quests', { one: 'quest', many: 'quests', state: 'set' }, 'Find a quest by name or key', 'No quest has that name or key.' ]);
    });

    it('lists every quest a new game tracks in the config\'s order, by the name the player sees or else its key', () =>
    {
      // Arrange.
      const kind = questPreviewKind(LOG);

      // Act.
      const entries = kind.entries(GamePreview.FRESH);

      // Assert.
      expect(entries.map(entry => [ entry.key, entry.title, entry.detail, entry.rows.length ]))
        .toStrictEqual([ [ 'cecil-001', 'Drills', 'cecil-001', 2 ], [ 'cecil-002', 'The Patrol Route', 'cecil-002', 1 ], [ 'mittens-001', 'mittens-001', 'mittens-001', 0 ] ]);
    });
  });

  describe('questEntryOf', () =>
  {
    it('offers a quest on a fresh save where its objectives put it, and each objective as a new game starts it', () =>
    {
      // Arrange: nothing set.

      // Act.
      const entry = questEntryOf(DRILLS, GamePreview.FRESH);

      // Assert.
      expect([
        entry.choice,
        entry.rows.map(row => [ row.label, row.detail, row.choice.id, row.choice.label, row.choice.value, row.choice.set ]),
        entry.rows[1].choice.options.map(option => option.label),
      ])
        .toStrictEqual([
          {
            id: QUEST_CHOICE,
            label: 'Show quest cecil-001 as',
            options: [
              { value: BY_OBJECTIVES, label: 'Inactive (from objectives)' },
              { value: 'inactive', label: 'Inactive' },
              { value: 'active', label: 'Active' },
              { value: 'completed', label: 'Completed' },
              { value: 'failed', label: 'Failed' },
              { value: 'missed', label: 'Missed' },
            ],
            value: BY_OBJECTIVES,
            set: false,
          },
          [
            [ '0', 'The town\'s only guard wants lessons.', '0', 'Show objective 0 of quest cecil-001 as', 'inactive', false ],
            [ '1', 'It goes badly. Then less badly.', '1', 'Show objective 1 of quest cecil-001 as', 'inactive', false ],
          ],
          [ 'Inactive', 'Active', 'Completed', 'Failed', 'Missed' ],
        ]);
    });

    it('shows what the preview sets: each objective set, the quest\'s own state, and where its objectives now put it', () =>
    {
      // Arrange: objective 1 under way, and the quest completed of its own.
      const preview = GamePreview.FRESH.with('quest.states', 'cecil-001', { state: 'completed', objectives: { 1: 'active' } });

      // Act.
      const entry = questEntryOf(DRILLS, preview);

      // Assert.
      expect([ entry.choice.value, entry.choice.set, entry.choice.options[0].label, entry.rows.map(row => [ row.choice.value, row.choice.set ]) ])
        .toStrictEqual([ 'completed', true, 'Active (from objectives)', [ [ 'inactive', false ], [ 'active', true ] ] ]);
    });
  });

  describe('chooseQuestState', () =>
  {
    it('sets the quest\'s own state, keeping its objectives and no other quest\'s', () =>
    {
      // Arrange: objective 1 under way, and Cecil's second quest set beside it.
      const preview = GamePreview.FRESH.with('quest.states', 'cecil-001', { objectives: { 1: 'active' } })
        .with('quest.states', 'cecil-002', { state: 'failed' });

      // Act.
      const value = chooseQuestState(preview, 'cecil-001', QUEST_CHOICE, 'completed');

      // Assert.
      expect(value)
        .toStrictEqual({ state: 'completed', objectives: { 1: 'active' } });
    });

    it('puts the quest back where its objectives put it', () =>
    {
      // Arrange.
      const preview = GamePreview.FRESH.with('quest.states', 'cecil-001', { state: 'missed', objectives: { 0: 'completed' } });

      // Act.
      const value = chooseQuestState(preview, 'cecil-001', QUEST_CHOICE, BY_OBJECTIVES);

      // Assert.
      expect(value)
        .toStrictEqual({ objectives: { 0: 'completed' } });
    });

    it('sets one objective, keeping the others set and the quest\'s own state', () =>
    {
      // Arrange.
      const preview = GamePreview.FRESH.with('quest.states', 'cecil-001', { state: 'active', objectives: { 0: 'completed' } });

      // Act.
      const value = chooseQuestState(preview, 'cecil-001', '1', 'failed');

      // Assert.
      expect(value)
        .toStrictEqual({ state: 'active', objectives: { 0: 'completed', 1: 'failed' } });
    });

    it('leaves an objective put back as a new game starts it alone, and the quest too once nothing of it is set', () =>
    {
      // Arrange: objectives 0 and 1 set.
      const preview = GamePreview.FRESH.with('quest.states', 'cecil-001', { objectives: { 0: 'completed', 1: 'active' } });

      // Act: objective 1 put back; then, from there, objective 0 too.
      const first = chooseQuestState(preview, 'cecil-001', '1', 'inactive');
      const both = chooseQuestState(preview.with('quest.states', 'cecil-001', first), 'cecil-001', '0', 'inactive');

      // Assert.
      expect([ first, both ])
        .toStrictEqual([ { objectives: { 0: 'completed' } }, undefined ]);
    });

    it('leaves an objective alone for an option that names no state', () =>
    {
      // Arrange.
      const preview = GamePreview.FRESH.with('quest.states', 'cecil-001', { state: 'active', objectives: { 1: 'active' } });

      // Act.
      const value = chooseQuestState(preview, 'cecil-001', '1', 'sideways');

      // Assert.
      expect(value)
        .toStrictEqual({ state: 'active' });
    });
  });
});
