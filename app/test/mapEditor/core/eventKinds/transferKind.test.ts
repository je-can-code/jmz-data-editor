import { describe, expect, it } from 'vitest';
import { editQuickField } from '../../../../src/mapEditor/core/eventKinds/quickFields.ts';
import { isTransfer, readTransfers, transferQuickModel } from '../../../../src/mapEditor/core/eventKinds/transferKind.ts';
import { mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { applyEdits, command, event, eventIn, hubWith, page, text, transferPage } from '../../support/eventKindFixtures.ts';

/*
 * A transfer is an event whose job is to send the player somewhere: at least one page holding exactly one Transfer
 * Player that names its map and tile, at the top level so it always happens, beside nothing but sounds, screen
 * effects, waits, routes, notes and the bookkeeping doors carry (a common event, a switch, a variable, a plugin
 * command). Its other pages may be empty or only say something, as a locked door does.
 *
 * Everything else is left alone, since calling it a transfer would hide what else it does: a transfer inside a
 * conditional (it only sometimes happens), one reading its destination from variables, two on one page, one beside
 * talk on its own page, and a door whose other page is a battler.
 *
 * The panel edits each transfer's map, tile, facing and fade, rewriting only the Transfer Player, as one step one
 * undo takes back; the map and tile can also be picked together on the map, as one place. Several transfers that each
 * hold one share their settings whatever page it sits on.
 */
describe('transferKind', () =>
{
  describe('readTransfers', () =>
  {
    it('reads a plain transfer, one at an area comment, a door with a route, and one carrying bookkeeping', () =>
    {
      // Arrange.
      const route = command(205, [ 0, { repeat: false, skippable: false, wait: true, list: [ { code: 17 }, { code: 0 } ] } ]);
      const events = [
        event(1, [ transferPage([ 0, 5, 3, 4, 2, 0 ]) ]),
        event(2, [ transferPage([ 0, 6, 1, 14, 6, 0 ], [ command(108, [ '<areaEvent:[1, 4]>' ]) ]) ]),
        event(3, [ transferPage([ 0, 7, 2, 2, 8, 1 ], [ route, command(505, [ { code: 17 } ]) ]) ]),
        event(4, [ transferPage([ 0, 8, 5, 10, 8, 0 ], [ command(117, [ 5 ]), command(121, [ 134, 134, 0 ]), command(122, [ 1, 1, 0, 0, 0 ]), command(357, [ 'J-Plugin', 'go', 'Go', {} ]) ]) ]),
      ];

      // Act.
      const read = events.map(each => readTransfers(each)?.map(spot => [ spot.pageIndex, spot.listIndex, spot.model.mapId ]));

      // Assert.
      expect(read)
        .toStrictEqual([ [ [ 0, 1, 5 ] ], [ [ 0, 2, 6 ] ], [ [ 0, 3, 7 ] ], [ [ 0, 5, 8 ] ] ]);
    });

    it('reads every transfer page, beside empty pages and a locked door\'s message', () =>
    {
      // Arrange.
      const locked = page([ command(250, [ { name: 'Key', volume: 100, pitch: 100, pan: 0 } ]), command(230, [ 30 ]), ...text([ 'It will not open.' ]) ]);
      const events = [
        event(1, [ transferPage([ 0, 17, 1, 18, 6, 0 ]), transferPage([ 0, 200, 1, 18, 6, 0 ]) ]),
        event(2, [ transferPage([ 0, 20, 14, 7, 2, 1 ]), page([]) ]),
        event(3, [ locked, transferPage([ 0, 195, 15, 18, 8, 0 ]) ]),
      ];

      // Act.
      const read = events.map(each => readTransfers(each)?.map(spot => [ spot.pageIndex, spot.model.mapId ]));

      // Assert.
      expect(read)
        .toStrictEqual([ [ [ 0, 17 ], [ 1, 200 ] ], [ [ 0, 20 ] ], [ [ 1, 195 ] ] ]);
    });

    it('refuses a transfer inside a conditional, which only sometimes happens', () =>
    {
      // Arrange.
      const conditional = event(1, [ page([
        command(111, [ 0, 5, 0 ]),
        command(250, [ { name: 'Move1', volume: 90, pitch: 100, pan: 0 } ], 1),
        command(201, [ 0, 5, 3, 4, 2, 0 ], 1),
        command(0, [], 1),
        command(412),
      ]) ]);

      // Act.
      const transfer = isTransfer(conditional);

      // Assert.
      expect(transfer)
        .toBe(false);
    });

    it('refuses a transfer reading its destination from variables, two transfers on one page, and one beside talk', () =>
    {
      // Arrange.
      const events = [
        event(1, [ transferPage([ 1, 10, 11, 12, 2, 0 ]) ]),
        event(2, [ page([ command(201, [ 0, 5, 3, 4, 2, 0 ]), command(201, [ 0, 6, 3, 4, 2, 0 ]) ]) ]),
        event(3, [ transferPage([ 0, 5, 3, 4, 2, 0 ], text([ 'Off we go!' ])) ]),
      ];

      // Act.
      const answers = events.map(isTransfer);

      // Assert.
      expect(answers)
        .toStrictEqual([ false, false, false ]);
    });

    it('refuses a door whose other page is a battler, a scene, or a message carrying a comment', () =>
    {
      // Arrange: the game's bomb wall is a battler until it breaks, then a transfer.
      const battler = page([ command(108, [ '<enemyId:32>' ]), command(123, [ 'A', 0 ]) ]);
      const scene = page([ ...text([ 'Welcome.' ]), command(121, [ 3, 3, 0 ]) ]);
      const commented = page([ command(108, [ '<light:3>' ]), ...text([ 'Locked.' ]) ]);
      const events = [ battler, scene, commented ].map((other, index) => event(index + 1, [ other, transferPage() ]));

      // Act.
      const answers = events.map(isTransfer);

      // Assert.
      expect(answers)
        .toStrictEqual([ false, false, false ]);
    });

    it('refuses an event with no transfer at all, however it talks', () =>
    {
      // Arrange: a locked door that never opens, and an empty marker.
      const events = [ event(1, [ page([ command(250, [ { name: 'Key', volume: 100, pitch: 100, pan: 0 } ]), ...text([ 'Sealed.' ]) ]) ]), event(2, [ page([]) ]) ];

      // Act.
      const answers = events.map(isTransfer);

      // Assert.
      expect(answers)
        .toStrictEqual([ false, false ]);
    });
  });

  describe('transferQuickModel', () =>
  {
    it('offers the map, tile, the two picked together on the map, facing and fade of a transfer', () =>
    {
      // Arrange.
      const door = event(1, [ transferPage([ 0, 20, 14, 7, 2, 1 ]) ]);

      // Act.
      const model = transferQuickModel(door);

      // Assert.
      expect([ model.fields.map(field => [ field.key, field.label, field.section, field.control.kind, field.value ]), model.actions ])
        .toStrictEqual([
          [
            [ 'transfer.0.map', 'Map', '', 'map', 20 ],
            [ 'transfer.0.x', 'X', '', 'number', 14 ],
            [ 'transfer.0.y', 'Y', '', 'number', 7 ],
            [ 'transfer.0.place', 'Pick on the map', '', 'place', { mapId: 20, x: 14, y: 7 } ],
            [ 'transfer.0.direction', 'Facing', '', 'select', 2 ],
            [ 'transfer.0.fade', 'Fade', '', 'select', 1 ],
          ],
          [],
        ]);
    });

    it('names each transfer by its page when there are several, and keys them by their order', () =>
    {
      // Arrange.
      const door = event(1, [ page([]), transferPage([ 0, 17, 1, 18, 6, 0 ]), transferPage([ 0, 200, 1, 18, 6, 0 ]) ]);

      // Act.
      const model = transferQuickModel(door);

      // Assert.
      expect(model.fields.filter(field => field.label === 'Map').map(field => [ field.key, field.section, field.value ]))
        .toStrictEqual([ [ 'transfer.0.map', 'Page 2', 17 ], [ 'transfer.1.map', 'Page 3', 200 ] ]);
    });

    it('offers nothing for an event that is not a transfer', () =>
    {
      // Arrange.
      const sign = event(1, [ page(text([ 'North.' ])) ]);

      // Act.
      const model = transferQuickModel(sign);

      // Assert.
      expect(model)
        .toStrictEqual({ fields: [], actions: [] });
    });

    it('rewrites only the transfer for each setting', () =>
    {
      // Arrange.
      const door = event(1, [ transferPage([ 0, 20, 14, 7, 2, 1 ]) ]);
      const { fields } = transferQuickModel(door);
      const values: Record<string, JsonValue> = {
        'transfer.0.map': 33,
        'transfer.0.x': 4,
        'transfer.0.y': 9,
        'transfer.0.place': { mapId: 5, x: 3, y: 2 },
        'transfer.0.direction': 8,
        'transfer.0.fade': 2,
      };

      // Act.
      const written = fields.map(field => applyEdits(door, field.write(values[field.key])).pages[0].list);

      // Assert: the sound before it and the closing command after it never change.
      expect(written.map(list => [ list.length, list[0].code, list[1].parameters, list[2].code ]))
        .toStrictEqual([
          [ 3, 250, [ 0, 33, 14, 7, 2, 1 ], 0 ],
          [ 3, 250, [ 0, 20, 4, 7, 2, 1 ], 0 ],
          [ 3, 250, [ 0, 20, 14, 9, 2, 1 ], 0 ],
          [ 3, 250, [ 0, 5, 3, 2, 2, 1 ], 0 ],
          [ 3, 250, [ 0, 20, 14, 7, 8, 1 ], 0 ],
          [ 3, 250, [ 0, 20, 14, 7, 2, 2 ], 0 ],
        ]);
    });

    it('sends several transfers to one map as one step, whatever page each sits on, and one undo sends them back', () =>
    {
      // Arrange: one transfer on page 1, another on page 2 after an empty page.
      const first = event(1, [ transferPage([ 0, 20, 14, 7, 2, 1 ]) ]);
      const second = event(3, [ page([]), transferPage([ 0, 21, 2, 2, 8, 0 ]) ]);
      const { hub } = hubWith([ first, second ]);

      // Act.
      const step = editQuickField(hub, 1, [ 1, 3 ], transferQuickModel, { events: [], names: null }, 'transfer.0.map', 42);
      const moved = [ eventIn(hub, 1)?.pages[0].list[1].parameters, eventIn(hub, 3)?.pages[1].list[1].parameters ];
      hub.undo(mapHistoryKey(1));

      // Assert.
      expect([ step?.label, hub.history(mapHistoryKey(1)).rows.length, moved, eventIn(hub, 1), eventIn(hub, 3) ])
        .toStrictEqual([ 'Change transfer destination', 1, [ [ 0, 42, 14, 7, 2, 1 ], [ 0, 42, 2, 2, 8, 0 ] ], first, second ]);
    });
  });
});
