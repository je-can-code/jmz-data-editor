import { describe, expect, it } from 'vitest';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { newGameQuestLog, questConfigNotice, type ServedQuest } from '../../../../src/mapEditor/modules/quest/questLog.ts';

/*
 * A new game tracks every quest data/config.quest.json lists, exactly as J-OMNI-Quests works it out: the quests whose
 * name marks them as the editor's dividers (starting __, == or --) are left out, every other quest is tracked by its key,
 * a later quest taking the key of an earlier one, and every quest and every objective starts inactive, the objectives
 * ordered by id. Nothing moves a quest before a new game's first event runs, so this is what a fresh save holds. A
 * config whose quests or a quest's objectives the file leaves out tracks none of them, and a project without the file
 * tracks no quest at all.
 *
 * That last never passes quietly: a config that could not be read comes with a notice naming the file, saying pages
 * waiting on a quest never show until it is fixed, why in the server's words or that it was not read, and that the
 * notice clears as soon as the file is fixed, since the file is read again whenever it changes; a config that was read
 * comes with none.
 */

/**
 * A quest as the server serves it, every field its model declares.
 * @param {string} key Its key.
 * @param {string} name Its name.
 * @param {number[]} objectiveIds Its objectives' ids, in the order the file lists them.
 * @returns {ServedQuest} The quest.
 */
const served = (key: string, name: string, objectiveIds: number[]): ServedQuest =>
{
  const objectives = objectiveIds.map(id => ({
    id,
    type: 'Indiscriminate',
    description: '',
    logs: { inactive: '', active: '', completed: '', failed: '', missed: '' },
    fulfillment: { indiscriminate: { hint: '' }, destination: { mapId: 0, x1: 0, x2: 0, y1: 0, y2: 0 }, fetch: { type: 0, id: 0, amount: 0 }, slay: { id: 0, amount: 0 }, quest: { keys: [] } },
    hiddenByDefault: true,
    isOptional: false,
  }));
  return { name, key, objectives, categoryKey: 'side', tagKeys: [], unknownHint: '', overview: '', recommendedLevel: 1, iconIndex: 0 } as ServedQuest;
};

/**
 * A config as the server serves it.
 * @param {ServedQuest[] | null} quests Its quests, or null as for a file leaving them out.
 * @returns {JsonValue} The config.
 */
const config = (quests: ServedQuest[] | null): JsonValue =>
{
  return { quests, tags: [], categories: [] } as unknown as JsonValue;
};

describe('questLog', () =>
{
  describe('newGameQuestLog', () =>
  {
    it('tracks every quest by its key, each inactive, with every objective inactive and ordered by id', () =>
    {
      // Arrange: two quests whose keys differ by a letter, one listing its objectives out of order.
      const quests = config([ served('herbalist_delivery', 'Herbalist Delivery', [ 2, 0, 1 ]), served('herbalist_deliver', 'Herbalist Errand', [ 0 ]) ]);

      // Act.
      const log = newGameQuestLog(quests);

      // Assert.
      expect([ ...log ])
        .toStrictEqual([
          [ 'herbalist_delivery', {
            key: 'herbalist_delivery',
            name: 'Herbalist Delivery',
            state: 'inactive',
            objectives: [ { id: 0, state: 'inactive' }, { id: 1, state: 'inactive' }, { id: 2, state: 'inactive' } ],
          } ],
          [ 'herbalist_deliver', { key: 'herbalist_deliver', name: 'Herbalist Errand', state: 'inactive', objectives: [ { id: 0, state: 'inactive' } ] } ],
        ]);
    });

    it('leaves out the dividers, named from __, == or --, and keeps a name holding those marks later on', () =>
    {
      // Arrange: Chef Adventure's own divider, the two other marks, and a quest whose name only holds one partway.
      const quests = config([
        served('divider-main', '=== MAIN QUESTS', [ 0 ]),
        served('divider-old', '__ RETIRED', [ 0 ]),
        served('divider-wip', '-- UNFINISHED', [ 0 ]),
        served('tribute-002', 'Tribute -- Part II', [ 0 ]),
      ]);

      // Act.
      const keys = [ ...newGameQuestLog(quests).keys() ];

      // Assert.
      expect(keys)
        .toStrictEqual([ 'tribute-002' ]);
    });

    it('tracks the later of two quests sharing a key, its objectives with it', () =>
    {
      // Arrange: the same key twice, the later quest with other objectives.
      const quests = config([ served('cerak-001', 'Old Cerak', [ 0, 1 ]), served('cerak-001', 'Cerak\'s Request', [ 0, 1, 2, 3 ]) ]);

      // Act.
      const log = newGameQuestLog(quests);

      // Assert.
      expect([ log.size, log.get('cerak-001')?.name, log.get('cerak-001')?.objectives.map(objective => objective.id) ])
        .toStrictEqual([ 1, 'Cerak\'s Request', [ 0, 1, 2, 3 ] ]);
    });

    it('tracks no quest for a config leaving its quests out, and no objective for a quest leaving its objectives out', () =>
    {
      // Arrange.
      const bare = { ...served('mittens-001', 'Mittens', []), objectives: null } as ServedQuest;

      // Act.
      const logs = [ newGameQuestLog(config(null)), newGameQuestLog(config([ bare ])) ];

      // Assert.
      expect(logs.map(log => [ ...log ]))
        .toStrictEqual([ [], [ [ 'mittens-001', { key: 'mittens-001', name: 'Mittens', state: 'inactive', objectives: [] } ] ] ]);
    });

    it('tracks no quest for a project without the file', () =>
    {
      // Arrange: nothing was read.

      // Act.
      const log = newGameQuestLog(null);

      // Assert.
      expect(log.size)
        .toBe(0);
    });
  });

  describe('questConfigNotice', () =>
  {
    it('says pages waiting on a quest never show until the file is fixed, and why, in the server\'s words', () =>
    {
      // Arrange: the server could not decode the file.
      const problem = 'data/config.quest.json: json: unknown field "quest"';

      // Act.
      const notice = questConfigNotice(null, problem);

      // Assert.
      expect(notice)
        .toStrictEqual({
          id: 'quest.config',
          title: 'Pages waiting on a quest never show until data/config.quest.json is fixed.',
          detail: 'It could not be read: data/config.quest.json: json: unknown field "quest". This clears as soon as the file is fixed.',
        });
    });

    it('says the file was not read when nothing said why', () =>
    {
      // Arrange: no config, and no reason.

      // Act.
      const notice = questConfigNotice(null, undefined);

      // Assert.
      expect(notice?.detail)
        .toBe('It was not read. This clears as soon as the file is fixed.');
    });

    it('says nothing of a config that was read', () =>
    {
      // Arrange.
      const quests = config([ served('herbalist_delivery', 'Herbalist Delivery', [ 0 ]) ]);

      // Act.
      const notice = questConfigNotice(quests, undefined);

      // Assert.
      expect(notice)
        .toBeNull();
    });
  });
});
