import { describe, expect, it } from 'vitest';
import {
  commonEventListPath,
  listCommonEvents,
  setCommonEventProperty,
} from '../../../../src/mapEditor/core/commandList/commonEvents.ts';
import { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { commonEventHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { cmd } from '../../support/commandFixtures.ts';

/*
 * The common events view lists every common event and edits one at a time, each in its own history, so an undo in
 * one never reaches into another. The service owes the view the rows the file holds (empty slots and slot 0 left
 * out, the filter matching a name or an exact id), where each common event's commands sit, and every change to a
 * name, trigger or switch as a named step in that common event's history, nothing recorded when nothing changed.
 */
describe('commonEvents', () =>
{
  /**
   * A common events file: slot 0, two common events, an empty slot between.
   * @returns {JsonValue} The file.
   */
  const buildCommonEvents = (): JsonValue => [
    null,
    { id: 1, list: [ cmd(250, 0, [ {} ]), cmd(0, 0) ] as never, name: 'Heal Party', switchId: 1, trigger: 0 },
    null,
    { id: 3, list: [ cmd(0, 0) ] as never, name: 'Night Falls', switchId: 12, trigger: 2 },
  ];

  describe('listCommonEvents', () =>
  {
    it('lists every common event in id order, counting commands without the list\'s end', () =>
    {
      // Arrange.
      const content = buildCommonEvents();

      // Act.
      const rows = listCommonEvents(content, '');

      // Assert.
      expect(rows)
        .toStrictEqual([
          { id: 1, name: 'Heal Party', trigger: 0, switchId: 1, commands: 1 },
          { id: 3, name: 'Night Falls', trigger: 2, switchId: 12, commands: 0 },
        ]);
    });

    it('keeps the ones whose name holds the filter, in any case, or whose id is it exactly', () =>
    {
      // Arrange.
      const content = buildCommonEvents();

      // Act.
      const found = [ ' night ', '3', '1', 'party', 'x' ].map(filter => listCommonEvents(content, filter).map(row => row.id));

      // Assert: "1" matches id 1 only, never id 13 or a name with a 1 in it.
      expect(found)
        .toStrictEqual([ [ 3 ], [ 3 ], [ 1 ], [ 1 ], [] ]);
    });

    it('lists nothing from content that is not a list of common events', () =>
    {
      // Arrange.

      // Act.
      const rows = [ listCommonEvents(undefined, ''), listCommonEvents({ nope: 1 }, '') ];

      // Assert.
      expect(rows)
        .toStrictEqual([ [], [] ]);
    });

    it('reads a common event with parts missing at MZ\'s defaults', () =>
    {
      // Arrange.
      const content: JsonValue = [ null, { id: 1 } ];

      // Act.
      const rows = listCommonEvents(content, '');

      // Assert.
      expect(rows)
        .toStrictEqual([ { id: 1, name: '', trigger: 0, switchId: 1, commands: 0 } ]);
    });
  });

  describe('commonEventListPath', () =>
  {
    it('points at a common event\'s list', () =>
    {
      // Arrange.

      // Act.
      const path = commonEventListPath(31);

      // Assert.
      expect(path)
        .toStrictEqual([ 31, 'list' ]);
    });
  });

  describe('setCommonEventProperty', () =>
  {
    it('changes a part as a named step in that common event\'s own history', () =>
    {
      // Arrange.
      const hub = new DocumentHub({ clientId: 'window-a' });
      hub.adopt('common-events', buildCommonEvents());

      // Act.
      const steps = [
        setCommonEventProperty(hub, 3, 'name', 'Dusk'),
        setCommonEventProperty(hub, 3, 'trigger', 1),
        setCommonEventProperty(hub, 1, 'switchId', 7),
      ];

      // Assert.
      expect([
        steps.map(step => step?.label),
        hub.history(commonEventHistoryKey(3)).rows.map(row => row.label),
        hub.history(commonEventHistoryKey(1)).rows.map(row => row.label),
        hub.document('common-events').valueAt([ 3, 'name' ]),
      ])
        .toStrictEqual([
          [ 'Rename common event', 'Change common event trigger', 'Change common event switch' ],
          [ 'Rename common event', 'Change common event trigger' ],
          [ 'Change common event switch' ],
          'Dusk',
        ]);
    });

    it('records nothing when the value is already there', () =>
    {
      // Arrange.
      const hub = new DocumentHub({ clientId: 'window-a' });
      hub.adopt('common-events', buildCommonEvents());

      // Act.
      const step = setCommonEventProperty(hub, 1, 'name', 'Heal Party');

      // Assert.
      expect([ step, hub.history(commonEventHistoryKey(1)).rows ])
        .toStrictEqual([ null, [] ]);
    });
  });
});
