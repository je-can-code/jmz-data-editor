import { describe, expect, it } from 'vitest';
import { blueprintMapContent } from '../../../../src/mapEditor/core/blueprints/blueprintMaps.ts';
import {
  BLUEPRINT_EVENT_IDS,
  BLUEPRINT_EVENTS_ADDED,
  BLUEPRINT_EVENTS_REMOVED,
  BLUEPRINT_NO_TILES,
  BLUEPRINT_RESIZED,
  BLUEPRINT_SETTINGS,
  blueprintEditRefusal,
  BLUEPRINTS_UNREAD,
  blueprintShapeCheck,
  layersKeptMessage,
} from '../../../../src/mapEditor/core/blueprints/blueprintShape.ts';
import { BLUEPRINTS_DOCUMENT } from '../../../../src/mapEditor/core/blueprints/blueprints.ts';
import { DocumentHub, type HubEvent } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { blueprintHistoryKey, eventHistoryKey, mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import { blueprintMapId } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import { createMapEvent } from '../../../../src/mapEditor/core/model/eventModel.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzMap } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { resizeMap } from '../../../../src/mapEditor/core/properties/mapPropertyEdits.ts';
import type { Stamp } from '../../../../src/mapEditor/core/stamps/stamp.ts';
import { openedBlueprint } from '../../support/blueprintFixtures.ts';
import { mapWithEvents } from '../../support/eventFixtures.ts';
import { stampOf } from '../../support/stampFixtures.ts';

/*
 * For now a blueprint's size and its events are fixed: removing an event would delete events on every map, and growing it
 * would paint over cells its copies never owned. Its tiles, on the layers it carries, and everything about its events but
 * their ids are free to change, events moved about inside it included, since where a copy stands is never linked.
 * Anything else a change could reach (a layer the blueprint does not carry, the map's own settings, which are no part of a
 * blueprint) would be lost when the blueprint is read back, or break the field model, so it is refused too.
 *
 * The rule holds whatever tool makes the change, which is why the window's commit check enforces it: a stroke on the
 * wrong layer, a resize, an event added by any path, each is put back whole and the author hears why in plain words. A
 * blueprint the blueprints no longer hold takes no change at all, and edits to anything else pass untouched.
 *
 * The blueprint fixture is 3 by 2, carrying layer 2 alone, with events 2 and 5.
 */
describe('blueprintShape', () =>
{
  /**
   * The blueprint fixture's stamp: 3 by 2, layer 2 alone, events 2 and 5.
   * @returns {Stamp} The stamp.
   */
  const campStamp = (): Stamp => stampOf({
    width: 3,
    height: 2,
    tiles: { layers: [ 2 ], values: [ 1, 2, 3, 4, 5, 6 ], calledFor: [ -1, -1, -1, -1, -1, -1 ] },
    events: [ { ...createMapEvent(2, 0, 0), name: 'Goblin' }, { ...createMapEvent(5, 2, 1), name: 'Lamp' } ],
  });

  /**
   * The blueprint fixture laid out as a map file, changed as the test likes.
   * @param {(file: RmmzMap) => void} change Changes the file.
   * @returns {RmmzMap} The file.
   */
  const changedCamp = (change: (file: RmmzMap) => void = () => undefined): RmmzMap =>
  {
    const file = blueprintMapContent(campStamp());
    change(file);
    return file;
  };

  /**
   * The flat index of a value of the 3 by 2 fixture.
   * @param {number} x The column.
   * @param {number} y The row.
   * @param {number} z The layer.
   * @returns {number} The index.
   */
  const at = (x: number, y: number, z: number): number => (z * 2 + y) * 3 + x;

  describe('blueprintEditRefusal', () =>
  {
    it('lets through events moved and changed but for their ids, and tiles changed on the layers the blueprint carries', () =>
    {
      // Arrange: the goblin moved, renamed and given a second page, the lamp's note changed, and two tiles on layer 2.
      const after = changedCamp(file =>
      {
        const goblin = file.events[2] as NonNullable<RmmzMap['events'][number]>;
        file.events[2] = { ...goblin, x: 1, name: 'Guard', pages: [ ...goblin.pages, goblin.pages[0] ] };
        file.events[5] = { ...file.events[5] as NonNullable<RmmzMap['events'][number]>, note: 'brighter' };
        file.data[at(0, 0, 2)] = 99;
        file.data[at(2, 1, 2)] = 98;
      });

      // Act.
      const refusal = blueprintEditRefusal(changedCamp(), after, [ 2 ]);

      // Assert.
      expect(refusal)
        .toBeNull();
    });

    it('refuses a change of size first, whatever else changed with it', () =>
    {
      // Arrange: grown a column, the lamp left outside and taken away with it.
      const after = changedCamp(file =>
      {
        file.width = 4;
        file.data = [ ...file.data, ...new Array(12).fill(0) ];
        file.events[5] = null;
      });

      // Act.
      const refusal = blueprintEditRefusal(changedCamp(), after, [ 2 ]);

      // Assert.
      expect(refusal)
        .toBe(BLUEPRINT_RESIZED);
    });

    it('refuses an event added, in a slot of its own or the list grown for it', () =>
    {
      // Arrange: one in the empty slot 3, and one past the end of the list.
      const inSlot = changedCamp(file =>
      {
        file.events[3] = createMapEvent(3, 1, 1);
      });
      const pastEnd = changedCamp(file =>
      {
        file.events = [ ...file.events, createMapEvent(6, 1, 1) ];
      });

      // Act.
      const refusals = [ blueprintEditRefusal(changedCamp(), inSlot, [ 2 ]), blueprintEditRefusal(changedCamp(), pastEnd, [ 2 ]) ];

      // Assert.
      expect(refusals)
        .toStrictEqual([ BLUEPRINT_EVENTS_ADDED, BLUEPRINT_EVENTS_ADDED ]);
    });

    it('refuses an event taken away, and an event whose id no longer names its slot', () =>
    {
      // Arrange: the lamp taken away, and the goblin told it is event 7.
      const taken = changedCamp(file =>
      {
        file.events[5] = null;
      });
      const renumbered = changedCamp(file =>
      {
        file.events[2] = { ...file.events[2] as NonNullable<RmmzMap['events'][number]>, id: 7 };
      });

      // Act.
      const refusals = [ blueprintEditRefusal(changedCamp(), taken, [ 2 ]), blueprintEditRefusal(changedCamp(), renumbered, [ 2 ]) ];

      // Assert.
      expect(refusals)
        .toStrictEqual([ BLUEPRINT_EVENTS_REMOVED, BLUEPRINT_EVENT_IDS ]);
    });

    it('refuses a change to the map\'s own settings, which are no part of a blueprint', () =>
    {
      // Arrange: another tileset, and a note.
      const tileset = changedCamp(file =>
      {
        file.tilesetId = 9;
      });
      const note = changedCamp(file =>
      {
        file.note = 'dark';
      });

      // Act.
      const refusals = [ blueprintEditRefusal(changedCamp(), tileset, [ 2 ]), blueprintEditRefusal(changedCamp(), note, [ 2 ]) ];

      // Assert.
      expect(refusals)
        .toStrictEqual([ BLUEPRINT_SETTINGS, BLUEPRINT_SETTINGS ]);
    });

    it('refuses tiles on a layer the blueprint does not carry, on a blueprint carrying none, and where the layers are not known', () =>
    {
      // Arrange: layer 2 changed, and a shadow beside it, which the blueprint does not carry.
      const shadowed = changedCamp(file =>
      {
        file.data[at(0, 0, 2)] = 99;
        file.data[at(1, 1, 4)] = 0b1111;
      });

      // Act.
      const refusals = [
        blueprintEditRefusal(changedCamp(), shadowed, [ 2 ]),
        blueprintEditRefusal(changedCamp(), shadowed, null),
        blueprintEditRefusal(changedCamp(), shadowed, undefined),
        blueprintEditRefusal(changedCamp(), shadowed, [ 0, 1, 2, 3, 4, 5 ]),
      ];

      // Assert.
      expect(refusals)
        .toStrictEqual([ 'This blueprint keeps layer 3 alone, so only that layer can change.', BLUEPRINT_NO_TILES, BLUEPRINTS_UNREAD, null ]);
    });

    it('lets through a change that changed no tile, whatever the blueprint carries', () =>
    {
      // Arrange: the lamp moved, in a blueprint of events alone and in a window not knowing the layers.
      const moved = changedCamp(file =>
      {
        file.events[5] = { ...file.events[5] as NonNullable<RmmzMap['events'][number]>, x: 0 };
      });

      // Act.
      const refusals = [ blueprintEditRefusal(changedCamp(), moved, null), blueprintEditRefusal(changedCamp(), moved, undefined) ];

      // Assert.
      expect(refusals)
        .toStrictEqual([ null, null ]);
    });
  });

  describe('layersKeptMessage', () =>
  {
    it('names the layers a blueprint keeps as the layer strip does, the shadows and the regions included', () =>
    {
      // Arrange: one tile layer, and several layers with the shadows and the regions.

      // Act.
      const messages = [ layersKeptMessage([ 0 ]), layersKeptMessage([ 1, 4, 5 ]) ];

      // Assert.
      expect(messages)
        .toStrictEqual([
          'This blueprint keeps layer 1 alone, so only that layer can change.',
          'This blueprint keeps layer 2, the shadows and the regions alone, so only those layers can change.',
        ]);
    });
  });

  describe('blueprintShapeCheck', () =>
  {
    /**
     * Collects the refusals a window announces.
     * @param {DocumentHub} hub The window's documents.
     * @returns {HubEvent[]} The refusals, as they come.
     */
    const refusalsIn = (hub: DocumentHub): HubEvent[] =>
    {
      const refusals: HubEvent[] = [];
      hub.subscribe(event =>
      {
        if (event.type === 'refused')
        {
          refusals.push(event);
        }
      });

      return refusals;
    };

    it('puts back a stroke painting a layer the blueprint does not carry, and says why', () =>
    {
      // Arrange: a stroke on layer 1, which shows as it goes.
      const { hub, map, mapId } = openedBlueprint('k3x9q2mf', campStamp());
      const refusals = refusalsIn(hub);
      const before = map.toJson();
      const stroke = hub.begin('Paint', [ mapHistoryKey(mapId) ]);
      stroke.tiles(map.key, [ [ map.cellIndex(0, 0, 0), 7 ] ]);

      // Act.
      const step = stroke.commit();

      // Assert.
      expect([ step, map.toJson(), hub.history(blueprintHistoryKey('k3x9q2mf')).rows, refusals.map(event => event.type === 'refused' && event.message) ])
        .toStrictEqual([ null, before, [], [ 'This blueprint keeps layer 3 alone, so only that layer can change.' ] ]);
    });

    it('records a stroke on the layer the blueprint carries as one step in the blueprint\'s own history', () =>
    {
      // Arrange.
      const { hub, map, mapId } = openedBlueprint('k3x9q2mf', campStamp());

      // Act.
      const step = hub.edit('Paint', [ mapHistoryKey(mapId) ], tx => tx.tiles(map.key, [ [ map.cellIndex(0, 0, 2), 7 ] ]));

      // Assert.
      expect([ step?.histories, map.cellAt(0, 0, 2), hub.isDirty(map.key), hub.isDirty(BLUEPRINTS_DOCUMENT) ])
        .toStrictEqual([ [ 'blueprint:k3x9q2mf' ], 7, true, false ]);
    });

    it('refuses a resize of a blueprint, however it is asked for, and leaves its size as it was', () =>
    {
      // Arrange.
      const { hub, map, mapId } = openedBlueprint('k3x9q2mf', campStamp());
      const refusals = refusalsIn(hub);

      // Act.
      const step = resizeMap(hub, mapId, 5, 2, 'top-left');

      // Assert.
      expect([ step, map.width, refusals.map(event => event.type === 'refused' && [ event.label, event.message ]) ])
        .toStrictEqual([ null, 3, [ [ 'Resize to 5 by 2', BLUEPRINT_RESIZED ] ] ]);
    });

    it('refuses any change to a blueprint the blueprints no longer hold', () =>
    {
      // Arrange: the camp deleted while its map is open.
      const { hub, map, mapId } = openedBlueprint('k3x9q2mf', campStamp());
      hub.edit('Delete blueprint', [ blueprintHistoryKey('k3x9q2mf') ], tx => tx.set(BLUEPRINTS_DOCUMENT, [ 'data', 'blueprints', 'k3x9q2mf' ], undefined));
      const refusals = refusalsIn(hub);

      // Act.
      const step = hub.edit('Move event', [ mapHistoryKey(mapId) ], tx => tx.set(map.key, [ 'events', 2, 'x' ], 1));

      // Assert.
      expect([ step, map.event(2)?.x, refusals.map(event => event.type === 'refused' && event.message) ])
        .toStrictEqual([ null, 0, [ 'That blueprint is no longer there.' ] ]);
    });

    it('lets edits to maps and to the blueprints themselves through untouched', () =>
    {
      // Arrange: a map, which takes a new event, beside the open camp.
      const { hub } = openedBlueprint('k3x9q2mf', campStamp());
      hub.adopt('map:4', mapWithEvents(4, 4, [ null, [ 0, 0 ] ]) as unknown as JsonValue);

      // Act.
      const steps = [
        hub.edit('New event', [ mapHistoryKey(4) ], tx => tx.set('map:4', [ 'events', 2 ], createMapEvent(2, 1, 1) as unknown as JsonValue)),
        hub.edit('Rename', [ blueprintHistoryKey('k3x9q2mf') ], tx => tx.set(BLUEPRINTS_DOCUMENT, [ 'data', 'blueprints', 'k3x9q2mf', 'name' ], 'Camp 2')),
      ];

      // Assert.
      expect(steps.map(step => step?.label))
        .toStrictEqual([ 'New event', 'Rename' ]);
    });

    it('lets an event\'s window, holding no blueprints, change the blueprint\'s events, and refuses it the tiles', () =>
    {
      // Arrange: a window holding the camp's map alone, as an event window that took it from the workspace does.
      const hub = new DocumentHub({ clientId: 'window-b' });
      hub.addCommitCheck(blueprintShapeCheck(hub));
      const mapId = blueprintMapId('k3x9q2mf');
      hub.adopt('blueprint-map:k3x9q2mf', blueprintMapContent(campStamp()) as unknown as JsonValue);
      const refusals = refusalsIn(hub);

      // Act.
      const renamed = hub.edit('Rename event', [ eventHistoryKey(mapId, 2) ], tx => tx.set('blueprint-map:k3x9q2mf', [ 'events', 2, 'name' ], 'Guard'));
      const painted = hub.edit('Paint', [ eventHistoryKey(mapId, 2) ], tx => tx.tiles('blueprint-map:k3x9q2mf', [ [ at(0, 0, 2), 9 ] ]));

      // Assert.
      expect([ renamed?.label, painted, refusals.map(event => event.type === 'refused' && event.message) ])
        .toStrictEqual([ 'Rename event', null, [ BLUEPRINTS_UNREAD ] ]);
    });
  });
});
