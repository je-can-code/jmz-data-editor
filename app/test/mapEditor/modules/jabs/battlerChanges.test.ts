import { describe, expect, it } from 'vitest';
import { eventHistoryKey, mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import type { RmmzEventPage } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { changeBattlerPage, changeBattlers } from '../../../../src/mapEditor/modules/jabs/battlerChanges.ts';
import type { BattlerContext } from '../../../../src/mapEditor/modules/jabs/battlerEdits.ts';
import type { JabsDefaults } from '../../../../src/mapEditor/modules/jabs/battlerReading.ts';
import { motionDefaultsFrom } from '../../../../src/mapEditor/modules/jabs/motionTags.ts';
import { command, event, eventIn, hubWith, page } from '../../support/eventKindFixtures.ts';

/*
 * A change from a battler's quick panel is one step in the map's own history, made on every picked battler at once, each
 * on the page the panel shows of it, worked out from the map as it stands: so it undoes from the map like any other edit
 * to its events, the map coming back byte for byte, and a change any one battler refuses changes none of them. A change
 * from the event window is one step in that event's own history, named for the page, and undoes byte for byte too. A
 * change that leaves every page as it was makes no step at all.
 */
describe('battlerChanges', () =>
{
  /**
   * J-ABS's defaults as Chef Adventure sets them.
   */
  const DEFAULTS: JabsDefaults = {
    sight: 4,
    pursuit: 6,
    alertedSightBoost: 2,
    alertedPursuitBoost: 4,
    alertDuration: 300,
    canIdle: true,
    showHpBar: true,
    showName: true,
    inanimate: false,
  };

  /**
   * The enemies and defaults changes are read against.
   */
  const CONTEXT: BattlerContext = {
    enemyOf: enemyId => ({ id: enemyId, name: 'Slime', note: '<sight:3>' }),
    defaults: DEFAULTS,
    motionDefaults: motionDefaultsFrom(null),
  };

  /**
   * A battler page naming enemy 5, with the given further comment lines.
   * @param {string[]} lines The lines after the enemy's.
   * @returns {RmmzEventPage} The page.
   */
  const battlerPage = (lines: string[]): RmmzEventPage => page([ command(108, [ '<enemyId:5>' ]), ...lines.map(text => command(408, [ text ])) ]);

  /**
   * Reads every comment line of an event's page.
   * @param {ReturnType<typeof hubWith>['hub']} hub The hub.
   * @param {number} id The event.
   * @param {number} pageIndex The page.
   * @returns {unknown[]} The lines.
   */
  const linesOf = (hub: ReturnType<typeof hubWith>['hub'], id: number, pageIndex = 0): unknown[] =>
  {
    return (eventIn(hub, id) as NonNullable<ReturnType<typeof eventIn>>).pages[pageIndex].list.flatMap(each => (each.code === 0 ? [] : [ each.parameters[0] ]));
  };

  describe('changeBattlers', () =>
  {
    it('changes every picked battler as one step in the map\'s history, which undoes the map byte for byte', () =>
    {
      // Arrange: two battlers, one setting its own sight, and a lamp nobody picked.
      const { hub } = hubWith([
        event(1, [ battlerPage([ '<sight:2>' ]) ]),
        event(2, [ battlerPage([]) ]),
        event(3, [ page([ command(108, [ '<light:[3]>' ]) ]) ]),
      ]);
      const before = JSON.stringify(hub.map('map:1').toJson());

      // Act.
      const step = changeBattlers(hub, 1, () => 0, [ 1, 2 ], { row: 'sight', value: 7 }, CONTEXT);
      const changed = [ linesOf(hub, 1), linesOf(hub, 2), linesOf(hub, 3) ];
      hub.undo(mapHistoryKey(1));

      // Assert.
      expect([ step?.label, hub.history(mapHistoryKey(1)).rows.length, changed, JSON.stringify(hub.map('map:1').toJson()) === before ])
        .toStrictEqual([
          'Change battler sight',
          1,
          [ [ '<enemyId:5>', '<sight:7>' ], [ '<enemyId:5>', '<sight:7>' ], [ '<light:[3]>' ] ],
          true,
        ]);
    });

    it('changes each battler on the page the panel shows of it, as the map stands when the change is made', () =>
    {
      // Arrange: a battler of two pages, shown on its second.
      const { hub } = hubWith([ event(1, [ battlerPage([ '<sight:2>' ]), battlerPage([ '<sight:3>' ]) ]) ]);

      // Act.
      changeBattlers(hub, 1, () => 1, [ 1 ], { row: 'sight', value: null }, CONTEXT);

      // Assert: the first page keeps its sight.
      expect([ linesOf(hub, 1, 0), linesOf(hub, 1, 1) ])
        .toStrictEqual([ [ '<enemyId:5>', '<sight:2>' ], [ '<enemyId:5>' ] ]);
    });

    it('changes none of the picked battlers when any one of them refuses, and leaves out those with no battler page now', () =>
    {
      // Arrange: two battlers, the second with one motion fewer than the first; and an event no longer a battler.
      const { hub } = hubWith([
        event(1, [ page([ command(108, [ '<motion:[float]>' ]), command(108, [ '<motion:[ghost]>' ]), command(108, [ '<enemyId:5>' ]) ]) ]),
        event(2, [ page([ command(108, [ '<motion:[float]>' ]), command(108, [ '<enemyId:5>' ]) ]) ]),
        event(3, [ page([]) ]),
      ]);
      const before = JSON.stringify(hub.map('map:1').toJson());

      // Act.
      const refused = (() =>
      {
        try
        {
          changeBattlers(hub, 1, shown => (shown.id === 3 ? null : 0), [ 1, 2, 3 ], { row: 'motion', motion: 1, value: null }, CONTEXT);
          return 'changed';
        }
        catch (error)
        {
          return (error as Error).message;
        }
      })();

      // Assert.
      expect([ refused, JSON.stringify(hub.map('map:1').toJson()) === before, hub.history(mapHistoryKey(1)).rows.length ])
        .toStrictEqual([ 'that motion is no longer on this page', true, 0 ]);
    });

    it('makes no step when every picked battler already reads as asked', () =>
    {
      // Arrange.
      const { hub } = hubWith([ event(1, [ battlerPage([ '<sight:2>' ]) ]) ]);

      // Act.
      const step = changeBattlers(hub, 1, () => 0, [ 1 ], { row: 'sight', value: 2 }, CONTEXT);

      // Assert.
      expect([ step, hub.history(mapHistoryKey(1)).rows.length ])
        .toStrictEqual([ null, 0 ]);
    });
  });

  describe('changeBattlerPage', () =>
  {
    it('changes the page an event window shows as one step in the event\'s own history, undone byte for byte', () =>
    {
      // Arrange: a battler of two pages, its window showing the second.
      const { hub } = hubWith([ event(4, [ battlerPage([]), battlerPage([ '<pursuit:9>' ]) ]) ]);
      const before = JSON.stringify(hub.map('map:1').toJson());
      const target = { mapId: 1, eventId: 4 };

      // Act.
      const outcome = changeBattlerPage(hub, target, 1, { row: 'pursuit', value: 5 }, CONTEXT);
      const changed = [ linesOf(hub, 4, 0), linesOf(hub, 4, 1) ];
      hub.undo(eventHistoryKey(1, 4));

      // Assert: the map's own history never hears of it.
      expect([
        outcome.ok && outcome.step?.label,
        outcome.ok && outcome.page,
        changed,
        hub.history(mapHistoryKey(1)).rows.length,
        JSON.stringify(hub.map('map:1').toJson()) === before,
      ])
        .toStrictEqual([ 'Change battler pursuit (page 2)', 1, [ [ '<enemyId:5>' ], [ '<enemyId:5>', '<pursuit:5>' ] ], 0, true ]);
    });

    it('refuses a page gone from the event, and makes no step for a page already reading as asked', () =>
    {
      // Arrange.
      const { hub } = hubWith([ event(4, [ battlerPage([ '<pursuit:9>' ]) ]) ]);
      const target = { mapId: 1, eventId: 4 };

      // Act.
      const outcomes = [
        changeBattlerPage(hub, target, 3, { row: 'pursuit', value: 5 }, CONTEXT),
        changeBattlerPage(hub, target, 0, { row: 'pursuit', value: 9 }, CONTEXT),
      ];

      // Assert.
      expect(outcomes)
        .toStrictEqual([ { ok: false, message: 'That page is no longer on this event.' }, { ok: true, step: null, page: 0 } ]);
    });
  });
});
