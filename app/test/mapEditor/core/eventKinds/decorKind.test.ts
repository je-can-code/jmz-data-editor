import { describe, expect, it } from 'vitest';
import { isChest, readChest } from '../../../../src/mapEditor/core/eventKinds/chestKind.ts';
import { decorQuickModel, isDecor } from '../../../../src/mapEditor/core/eventKinds/decorKind.ts';
import { editQuickField, runQuickAction } from '../../../../src/mapEditor/core/eventKinds/quickFields.ts';
import { mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import { createEventPage } from '../../../../src/mapEditor/core/model/eventModel.ts';
import { applyEdits, CLOSED_GLASS, command, event, eventIn, hubWith, OPEN_GLASS, oreChest, page } from '../../support/eventKindFixtures.ts';

/*
 * Decor is an event that runs nothing on any page: a lamp, a waterfall, a butterfly, a marker. A page holding even a
 * comment is not decor, because comments are how plugins tag their events (a J-ABS battler, a light), and those
 * belong to the kinds that read the tags.
 *
 * The panel edits each page's picture (sheet and character, facing and frame), priority and trigger, each as one
 * step one undo takes back, and offers to make a one-page event a chest: the pattern written in, the event's own
 * picture kept as the closed chest, and its id, name, note and place untouched. An event whose page waits for a self
 * switch is not offered it, since a chest's pages wait for a self switch of their own and the event's would be lost.
 */
describe('decorKind', () =>
{
  describe('isDecor', () =>
  {
    it('recognises events that run nothing, on one page or several', () =>
    {
      // Arrange.
      const lamp = event(1, [ page([], { image: { ...CLOSED_GLASS, characterName: '!Flame' } }) ]);
      const door = event(2, [ page([], { image: { ...CLOSED_GLASS, characterName: '!Door1' } }), page([]) ]);

      // Act.
      const answers = [ isDecor(lamp), isDecor(door) ];

      // Assert.
      expect(answers)
        .toStrictEqual([ true, true ]);
    });

    it('leaves alone a battler\'s comments, any command, and an event with no pages', () =>
    {
      // Arrange.
      const events = [
        event(1, [ page([ command(108, [ '<enemyId:3>' ]) ]) ]),
        event(2, [ page([]), page([ command(230, [ 30 ]) ]) ]),
        event(3, []),
      ];

      // Act.
      const answers = events.map(isDecor);

      // Assert.
      expect(answers)
        .toStrictEqual([ false, false, false ]);
    });
  });

  describe('decorQuickModel', () =>
  {
    it('offers a page\'s picture, facing, frame, priority and trigger, and making it a chest', () =>
    {
      // Arrange.
      const lamp = event(1, [ page([], { image: { tileId: 0, characterName: '!Flame', direction: 4, pattern: 1, characterIndex: 2 }, priorityType: 2, trigger: 0 }) ]);

      // Act.
      const model = decorQuickModel(lamp, { events: [], names: null });

      // Assert.
      expect([ model.fields.map(field => [ field.key, field.label, field.value ]), model.actions.map(action => [ action.key, action.label ]) ])
        .toStrictEqual([
          [
            [ 'page.0.graphic', 'Graphic', { characterName: '!Flame', characterIndex: 2, tileId: 0 } ],
            [ 'page.0.direction', 'Facing', 4 ],
            [ 'page.0.pattern', 'Frame', 1 ],
            [ 'page.0.priority', 'Priority', 2 ],
            [ 'page.0.trigger', 'Trigger', 0 ],
          ],
          [ [ 'make-chest', 'Make it a chest' ] ],
        ]);
    });

    it('files each page\'s settings under it when there are several, and offers no chest for them', () =>
    {
      // Arrange.
      const door = event(2, [ page([]), page([]) ]);

      // Act.
      const model = decorQuickModel(door, { events: [], names: null });

      // Assert.
      expect([ model.fields.map(field => [ field.key, field.section ]).filter(([ key ]) => String(key).endsWith('trigger')), model.actions ])
        .toStrictEqual([ [ [ 'page.0.trigger', 'Page 1' ], [ 'page.1.trigger', 'Page 2' ] ], [] ]);
    });

    it('offers no chest for an event whose one page waits for a self switch, though it offers the page\'s settings', () =>
    {
      // Arrange: a lamp shown only once its self switch B is on.
      const lamp = event(1, [ page([], { conditions: { ...createEventPage().conditions, selfSwitchCh: 'B', selfSwitchValid: true } }) ]);

      // Act.
      const model = decorQuickModel(lamp, { events: [], names: null });

      // Assert.
      expect([ model.fields.map(field => field.key), model.actions ])
        .toStrictEqual([ [ 'page.0.graphic', 'page.0.direction', 'page.0.pattern', 'page.0.priority', 'page.0.trigger' ], [] ]);
    });

    it('offers nothing for an event that is not decor', () =>
    {
      // Arrange.
      const chest = oreChest(3);

      // Act.
      const model = decorQuickModel(chest, { events: [], names: null });

      // Assert.
      expect(model)
        .toStrictEqual({ fields: [], actions: [] });
    });

    it('writes each setting where the page keeps it', () =>
    {
      // Arrange.
      const lamp = event(1, [ page([], { image: { tileId: 0, characterName: '!Flame', direction: 4, pattern: 1, characterIndex: 2 } }) ]);
      const { fields } = decorQuickModel(lamp, { events: [], names: null });
      const values: Record<string, unknown> = {
        'page.0.graphic': { characterName: '', characterIndex: 0, tileId: 423 },
        'page.0.direction': 8,
        'page.0.pattern': 0,
        'page.0.priority': 1,
        'page.0.trigger': 1,
      };

      // Act.
      const pages = fields.map(field => applyEdits(lamp, field.write(values[field.key] as never)).pages[0]);

      // Assert.
      expect(pages.map(each => [ each.image, each.priorityType, each.trigger ]))
        .toStrictEqual([
          [ { tileId: 423, characterName: '', direction: 4, pattern: 1, characterIndex: 0 }, 0, 0 ],
          [ { tileId: 0, characterName: '!Flame', direction: 8, pattern: 1, characterIndex: 2 }, 0, 0 ],
          [ { tileId: 0, characterName: '!Flame', direction: 4, pattern: 0, characterIndex: 2 }, 0, 0 ],
          [ { tileId: 0, characterName: '!Flame', direction: 4, pattern: 1, characterIndex: 2 }, 1, 0 ],
          [ { tileId: 0, characterName: '!Flame', direction: 4, pattern: 1, characterIndex: 2 }, 0, 1 ],
        ]);
    });

    it('turns several torches to one facing as one step, and one undo turns them back', () =>
    {
      // Arrange.
      const torches = [ 1, 2 ].map(id => event(id, [ page([], { image: { tileId: 0, characterName: '!Flame', direction: 2 * id, pattern: 1, characterIndex: 0 } }) ]));
      const { hub } = hubWith(torches);

      // Act.
      const step = editQuickField(hub, 1, [ 1, 2 ], decorQuickModel, { events: [], names: null }, 'page.0.direction', 6);
      const turned = [ eventIn(hub, 1)?.pages[0].image.direction, eventIn(hub, 2)?.pages[0].image.direction ];
      hub.undo(mapHistoryKey(1));

      // Assert.
      expect([ step?.label, turned, eventIn(hub, 1), eventIn(hub, 2) ])
        .toStrictEqual([ 'Change graphic', [ 6, 6 ], torches[0], torches[1] ]);
    });

    it('makes a placed chest graphic a chest, opening like the chest already on the map, and one undo unmakes it', () =>
    {
      // Arrange.
      const placed = event(4, [ page([], { image: { ...CLOSED_GLASS } }) ], { name: 'loot', x: 2, y: 1 });
      const { hub } = hubWith([ oreChest(3), placed ]);

      // Act.
      const step = runQuickAction(hub, 1, [ 4 ], decorQuickModel, { events: [], names: null }, 'make-chest');
      const made = eventIn(hub, 4);
      const read = made === null ? null : readChest(made);
      hub.undo(mapHistoryKey(1));

      // Assert.
      expect([ step?.label, made?.name, made?.x, read?.closed, read?.opened, read?.rewards[0].reward, read?.messages[0].model.lines, eventIn(hub, 4) ])
        .toStrictEqual([ 'Make a chest', 'loot', 2, CLOSED_GLASS, OPEN_GLASS, { kind: 'item', id: 1, amount: 1 }, [ 'Item 1 was found!' ], placed ]);
      expect(isChest(placed))
        .toBe(false);
    });
  });
});
