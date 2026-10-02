import { describe, expect, it } from 'vitest';
import { usageByEntry } from '../../../../src/mapEditor/core/commandList/commandUsage.ts';

/*
 * The search ranks commands by how many of the project's events use them. The server counts by command code and by
 * plugin command; the catalog knows entries by id. This owes the search each count under the id of the entry it
 * belongs to, built-in and plugin alike, and nothing under any other.
 */
describe('commandUsage', () =>
{
  describe('usageByEntry', () =>
  {
    it('files code counts under built-in ids and plugin counts under plugin ids', () =>
    {
      // Arrange.
      const counts = {
        events: 1700,
        codes: { 250: 959, 201: 883 },
        pluginCommands: [ { plugin: 'j/omni/J-OMNI-Quests', command: 'progress-quest', events: 264 } ],
      };

      // Act.
      const usage = usageByEntry(counts);

      // Assert.
      expect([ ...usage.entries() ])
        .toStrictEqual([ [ 'core:201', 883 ], [ 'core:250', 959 ], [ 'plugin:j/omni/J-OMNI-Quests:progress-quest', 264 ] ]);
    });
  });
});
