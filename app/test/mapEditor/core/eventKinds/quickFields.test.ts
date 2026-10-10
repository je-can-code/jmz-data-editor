import { describe, expect, it } from 'vitest';
import { chestQuickModel, readChest } from '../../../../src/mapEditor/core/eventKinds/chestKind.ts';
import {
  editQuickField,
  groupSelection,
  QuickFieldDrag,
  quickSections,
  runQuickAction,
  sharedActions,
  sharedFields,
  type QuickField,
  type QuickModel,
  type QuickModelSource,
} from '../../../../src/mapEditor/core/eventKinds/quickFields.ts';
import { transferQuickModel } from '../../../../src/mapEditor/core/eventKinds/transferKind.ts';
import type { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import { cloneJson, type JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { command, event, eventIn, hubWith, oreChest, page, text, transferPage } from '../../support/eventKindFixtures.ts';

/*
 * The framework every quick panel runs on. A kind describes, per event, the settings it offers under keys that mean
 * the same thing on every event of the kind; with several events selected, the panel shows the keys they all have,
 * with the same control, holding the value they share or saying they differ. An edit gives every selected event
 * that has the setting its new value as one step in the map's history, so one undo takes it back from all of them,
 * and each event's edit is worked out from the map as it stands at that moment: a change made since the panel last
 * read the map (in another window, say) is never written over by an edit addressed to where things used to be.
 * A setting changed continuously, as a slider drags, shows each value on the map at once and records only the value it
 * ends on, as one step, or nothing when it ends where it began; a value that cannot be written puts the map back as it
 * was before the drag. A selection is sorted by kind, so each kind's panel only ever sees its own events.
 */
describe('quickFields', () =>
{
  /**
   * Builds a model with number fields of the given keys, values and bounds.
   * @param {readonly [ string, JsonValue, number? ][]} entries Each field's key, value, and highest allowed value.
   * @returns {QuickModel} The model.
   */
  const modelOf = (entries: readonly [ string, JsonValue, number? ][]): QuickModel =>
  {
    const fields: QuickField[] = entries.map(([ key, value, max ]) => ({
      key,
      label: key,
      section: '',
      control: { kind: 'number', min: 0, max: max ?? 99 },
      value,
      step: 'Change',
      write: () => [],
    }));
    return { fields, actions: [] };
  };

  describe('sharedFields', () =>
  {
    it('shows the settings every event has, with the value they share or none where they differ', () =>
    {
      // Arrange: both have a and b; only the first has c; b differs.
      const models = [ modelOf([ [ 'a', 1 ], [ 'b', 2 ], [ 'c', 3 ] ]), modelOf([ [ 'b', 5 ], [ 'a', 1 ] ]) ];

      // Act.
      const shared = sharedFields(models);

      // Assert.
      expect(shared.map(field => [ field.key, field.value, field.mixed ]))
        .toStrictEqual([ [ 'a', 1, false ], [ 'b', null, true ] ]);
    });

    it('does not share a setting shown with different controls', () =>
    {
      // Arrange: a gold amount and an item amount allow different most.
      const models = [ modelOf([ [ 'amount', 5, 9999999 ] ]), modelOf([ [ 'amount', 5, 9999 ] ]) ];

      // Act.
      const shared = sharedFields(models);

      // Assert.
      expect(shared)
        .toStrictEqual([]);
    });

    it('keeps a hint only when every event gives the same one, and shows the first event\'s preview', () =>
    {
      // Arrange.
      const image = { tileId: 0, characterName: '!Flame', direction: 2, pattern: 1, characterIndex: 0 };
      const withHint = (hint: string): QuickModel => ({
        fields: [ { ...modelOf([ [ 'a', 1 ] ]).fields[0], hint, preview: image } ],
        actions: [],
      });

      // Act.
      const same = sharedFields([ withHint('Rusk'), withHint('Rusk') ]);
      const different = sharedFields([ withHint('Rusk'), withHint('Jeph') ]);

      // Assert.
      expect([ same[0].hint, different[0].hint, different[0].preview ])
        .toStrictEqual([ 'Rusk', undefined, image ]);
    });

    it('shares nothing when nothing is selected', () =>
    {
      // Arrange: no models at all.

      // Act.
      const shared = [ sharedFields([]), sharedActions([]) ];

      // Assert.
      expect(shared)
        .toStrictEqual([ [], [] ]);
    });
  });

  describe('sharedActions', () =>
  {
    it('offers the actions every event offers', () =>
    {
      // Arrange: a chest with two rewards offers removing each; a chest with one does not.
      const two = oreChest(1, [
        command(250, [ { name: 'Chest1', volume: 90, pitch: 100, pan: 0 } ]),
        command(205, [ 0, { repeat: false, skippable: false, wait: true, list: [ { code: 0 } ] } ]),
        command(123, [ 'A', 0 ]),
        command(126, [ 1, 0, 0, 1 ]),
        command(126, [ 2, 0, 0, 1 ]),
      ]);
      const one = oreChest(2);

      // Act.
      const shared = sharedActions([ chestQuickModel(two), chestQuickModel(one) ]);

      // Assert.
      expect(shared.map(action => [ action.key, action.label ]))
        .toStrictEqual([ [ 'reward.add', 'Add a reward' ] ]);
    });
  });

  describe('editQuickField', () =>
  {
    it('gives every selected event the value as one step in the map\'s history, and one undo and redo move them all', () =>
    {
      // Arrange.
      const doors = [ event(1, [ transferPage([ 0, 5, 3, 4, 2, 0 ]) ]), event(3, [ transferPage([ 0, 6, 1, 1, 8, 1 ]) ]) ];
      const { hub } = hubWith(doors);

      // Act.
      const step = editQuickField(hub, 1, [ 1, 3 ], transferQuickModel, { events: [], names: null }, 'transfer.0.fade', 2);
      const faded = [ 1, 3 ].map(id => eventIn(hub, id)?.pages[0].list[1].parameters[5]);
      hub.undo(mapHistoryKey(1));
      const undone = cloneJson([ eventIn(hub, 1), eventIn(hub, 3) ]);
      hub.redo(mapHistoryKey(1));
      const redone = [ 1, 3 ].map(id => eventIn(hub, id)?.pages[0].list[1].parameters[5]);

      // Assert.
      expect([ step?.label, step?.histories, faded, undone, redone ])
        .toStrictEqual([ 'Change transfer fade', [ 'map:1' ], [ 2, 2 ], doors, [ 2, 2 ] ]);
    });

    it('leaves alone a selected event that lacks the setting, and records nothing when none has it', () =>
    {
      // Arrange: a door beside a sign, and an empty slot.
      const door = event(1, [ transferPage([ 0, 5, 3, 4, 2, 0 ]) ]);
      const sign = event(3, [ page(text([ 'North.' ])) ]);
      const { hub } = hubWith([ door, sign ]);

      // Act.
      const step = editQuickField(hub, 1, [ 1, 3, 4 ], transferQuickModel, { events: [], names: null }, 'transfer.0.x', 9);
      const none = editQuickField(hub, 1, [ 3, 4 ], transferQuickModel, { events: [], names: null }, 'transfer.0.x', 9);

      // Assert.
      expect([ step?.entries.length, eventIn(hub, 1)?.pages[0].list[1].parameters[2], eventIn(hub, 3), none ])
        .toStrictEqual([ 1, 9, sign, null ]);
    });

    it('records nothing for the value the event already holds', () =>
    {
      // Arrange.
      const { hub } = hubWith([ event(1, [ transferPage([ 0, 5, 3, 4, 2, 0 ]) ]) ]);

      // Act.
      const step = editQuickField(hub, 1, [ 1 ], transferQuickModel, { events: [], names: null }, 'transfer.0.map', 5);

      // Assert.
      expect([ step, hub.history(mapHistoryKey(1)).rows ])
        .toStrictEqual([ null, [] ]);
    });

    it('works each edit out from the map as it stands, never from where a command used to sit', () =>
    {
      // Arrange: a message goes in ahead of the reward after the panel read the chest, moving the reward down.
      const chest = oreChest(3);
      const { hub } = hubWith([ chest ]);
      const readBefore = readChest(chest)?.rewards[0].listIndex;
      hub.edit('Insert text', [ mapHistoryKey(1) ], tx =>
      {
        tx.splice('map:1', [ 'events', 3, 'pages', 0, 'list' ], 8, 0, text([ 'Hm?' ]) as unknown as JsonValue[]);
      });

      // Act.
      editQuickField(hub, 1, [ 3 ], chestQuickModel, { events: [], names: null }, 'reward.0.amount', 99);
      const list = eventIn(hub, 3)?.pages[0].list ?? [];

      // Assert: the reward moved from 12 to 14 and took the amount there; the new message is untouched.
      expect([ readBefore, list[14], list[8].code, list[9].parameters ])
        .toStrictEqual([ 12, { code: 126, indent: 0, parameters: [ 32, 0, 0, 99 ] }, 101, [ 'Hm?' ] ]);
    });
  });

  describe('QuickFieldDrag', () =>
  {
    /**
     * A kind offering one setting, an event's move speed on its first page, written as one change, or as a change and
     * then one the map cannot take when the value is 99.
     * @param {RmmzMapEvent} each The event.
     * @returns {QuickModel} The setting.
     */
    const speedOf: QuickModelSource = (each: RmmzMapEvent): QuickModel => ({
      fields: [ {
        key: 'speed',
        label: 'Speed',
        section: '',
        control: { kind: 'number', min: 1, max: 99 },
        value: each.pages[0].moveSpeed,
        step: 'Change speed',
        write: value => [
          { kind: 'set', path: [ 'pages', 0, 'moveSpeed' ], value },
          ...(value === 99 ? [ { kind: 'set', path: [ 'nowhere', 'at', 'all' ], value } as const ] : []),
        ],
      } ],
      actions: [],
    });

    /**
     * Reads an event's speed from the hub's map.
     * @param {DocumentHub} hub The hub.
     * @param {number} id The event.
     * @returns {number | undefined} The speed.
     */
    const speedIn = (hub: DocumentHub, id: number) => eventIn(hub, id)?.pages[0].moveSpeed;

    /**
     * A hub holding two walkers at speed 3 and a third, not selected, at speed 3 too.
     * @returns {{ hub: DocumentHub, drag: QuickFieldDrag }} The hub, and a drag of the first two walkers' speed.
     */
    const walkers = () =>
    {
      const { hub } = hubWith([ 1, 2, 3 ].map(id => event(id, [ page([]) ])));
      const drag = new QuickFieldDrag(hub, 1, [ 1, 2 ], speedOf, { events: [], names: null }, 'speed');
      return { hub, drag };
    };

    it('shows each value on the map at once, and records the last as one step when it ends', () =>
    {
      // Arrange.
      const { hub, drag } = walkers();

      // Act.
      drag.move(4);
      drag.move(5);
      const showing = [ speedIn(hub, 1), speedIn(hub, 2), hub.history(mapHistoryKey(1)).rows.length ];
      const step = drag.commit();
      hub.undo(mapHistoryKey(1));

      // Assert: the walker not selected stays at 3, and the undo takes both back from 5 in one go.
      expect([ drag.key, showing, step?.label, speedIn(hub, 3), [ speedIn(hub, 1), speedIn(hub, 2) ] ])
        .toStrictEqual([ 'speed', [ 5, 5, 0 ], 'Change speed', 3, [ 3, 3 ] ]);
    });

    it('records nothing for a drag that ends where it began', () =>
    {
      // Arrange.
      const { hub, drag } = walkers();

      // Act.
      drag.move(6);
      drag.move(3);
      const step = drag.commit();

      // Assert.
      expect([ step, speedIn(hub, 1), hub.history(mapHistoryKey(1)).rows ])
        .toStrictEqual([ null, 3, [] ]);
    });

    it('puts back everything it showed when cancelled', () =>
    {
      // Arrange.
      const { hub, drag } = walkers();

      // Act.
      drag.move(6);
      drag.cancel();

      // Assert.
      expect([ speedIn(hub, 1), speedIn(hub, 2), hub.history(mapHistoryKey(1)).rows ])
        .toStrictEqual([ 3, 3, [] ]);
    });

    it('takes no more values once it has ended, and ends only once', () =>
    {
      // Arrange.
      const { hub, drag } = walkers();
      drag.move(6);
      drag.commit();

      // Act.
      drag.move(7);
      const again = drag.commit();
      drag.cancel();

      // Assert.
      expect([ speedIn(hub, 1), again, hub.history(mapHistoryKey(1)).rows.length ])
        .toStrictEqual([ 6, null, 1 ]);
    });

    it('puts the map back as it was before the drag when a value cannot be written, and says why', () =>
    {
      // Arrange: 99 writes the speed, then a change the map cannot take.
      const { hub, drag } = walkers();
      drag.move(6);

      // Act.
      let failure = '';
      try
      {
        drag.move(99);
      }
      catch (error)
      {
        failure = (error as Error).message;
      }
      const step = drag.commit();

      // Assert.
      expect([ failure, speedIn(hub, 1), speedIn(hub, 2), step ])
        .toStrictEqual([ 'no container at events/1/nowhere/at', 3, 3, null ]);
    });

    it('keeps the map free while it shows a value every selected event already holds', () =>
    {
      // Arrange: the walkers already move at 3.
      const { hub, drag } = walkers();

      // Act.
      drag.move(3);
      const painted = hub.edit('Paint', [ mapHistoryKey(1) ], tx =>
      {
        tx.set('map:1', [ 'events', 3, 'pages', 0, 'moveSpeed' ], 5);
      });

      // Assert: the map was free for the next edit, and the drag has nothing to record.
      expect([ painted?.label, speedIn(hub, 3), drag.commit() ])
        .toStrictEqual([ 'Paint', 5, null ]);
    });

    it('opens nothing for a setting none of the selected events has', () =>
    {
      // Arrange: the walkers have no "pace".
      const { hub } = walkers();
      const drag = new QuickFieldDrag(hub, 1, [ 1, 2 ], speedOf, { events: [], names: null }, 'pace');

      // Act.
      drag.move(6);
      const painted = hub.edit('Paint', [ mapHistoryKey(1) ], tx =>
      {
        tx.set('map:1', [ 'events', 3, 'pages', 0, 'moveSpeed' ], 5);
      });

      // Assert: the map was free for the next edit.
      expect([ painted?.label, drag.commit() ])
        .toStrictEqual([ 'Paint', null ]);
    });
  });

  describe('runQuickAction', () =>
  {
    it('runs an action on every selected event that offers it as one step, and records nothing when none does', () =>
    {
      // Arrange.
      const chests = [ oreChest(1), oreChest(3) ];
      const door = event(4, [ transferPage() ]);
      const { hub } = hubWith([ ...chests, door ]);

      // Act.
      const step = runQuickAction(hub, 1, [ 1, 3, 4 ], chestQuickModel, { events: [], names: null }, 'reward.add');
      const counts = [ 1, 3 ].map(id => readChest(eventIn(hub, id) as never)?.rewards.length);
      const none = runQuickAction(hub, 1, [ 4 ], chestQuickModel, { events: [], names: null }, 'reward.add');
      hub.undo(mapHistoryKey(1));

      // Assert.
      expect([ step?.label, counts, none, eventIn(hub, 1), eventIn(hub, 3), eventIn(hub, 4) ])
        .toStrictEqual([ 'Add chest reward', [ 2, 2 ], null, chests[0], chests[1], door ]);
    });
  });

  describe('quickSections', () =>
  {
    it('files settings and actions under their headings where each first appears, settings before actions', () =>
    {
      // Arrange: a chest with two rewards offers headed settings, a removal under each reward, and the addition under the last.
      const two = oreChest(1, [
        command(250, [ { name: 'Chest1', volume: 90, pitch: 100, pan: 0 } ]),
        command(205, [ 0, { repeat: false, skippable: false, wait: true, list: [ { code: 0 } ] } ]),
        command(123, [ 'A', 0 ]),
        command(126, [ 1, 0, 0, 1 ]),
        command(125, [ 0, 0, 50 ]),
      ]);
      const model = chestQuickModel(two);

      // Act.
      const sections = quickSections(sharedFields([ model ]), sharedActions([ model ]));

      // Assert.
      expect(sections.map(section => [ section.title, section.fields.map(field => field.key), section.actions.map(action => action.key) ]))
        .toStrictEqual([
          [ 'Reward 1', [ 'reward.0.kind', 'reward.0.item', 'reward.0.amount' ], [ 'reward.0.remove' ] ],
          [ 'Reward 2', [ 'reward.1.kind', 'reward.1.amount' ], [ 'reward.1.remove', 'reward.add' ] ],
          [ 'Look', [ 'look.closed.graphic', 'look.closed.direction', 'look.closed.pattern', 'look.opened.graphic', 'look.opened.direction', 'look.opened.pattern' ], [] ],
        ]);
    });
  });

  describe('groupSelection', () =>
  {
    it('sorts a selection by kind in the order each first appears, apart from events no kind knows and empty slots', () =>
    {
      // Arrange.
      const events = [ null, event(1, []), event(2, []), event(3, []), null, event(5, []) ];
      const kinds: Record<number, string | null> = { 1: 'transfer', 2: 'chest', 3: 'transfer', 5: null };

      // Act.
      const groups = groupSelection(events, [ 3, 2, 4, 1, 5, 3 ], each => kinds[each.id]);

      // Assert.
      expect(groups)
        .toStrictEqual({
          groups: [ { kind: 'transfer', eventIds: [ 3, 1 ] }, { kind: 'chest', eventIds: [ 2 ] } ],
          unclaimed: [ 5 ],
          missing: [ 4 ],
        });
    });
  });
});
