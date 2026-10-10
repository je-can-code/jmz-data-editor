import { describe, expect, it } from 'vitest';
import { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { editModuleProperty, ModulePropertyDrag, type MapPropertiesSource } from '../../../../src/mapEditor/core/properties/moduleProperties.ts';
import { buildMapJson } from '../../support/fixtures.ts';

/*
 * The settings a plugin module adds to Map Properties change the map the way every other property does: a change is
 * one named step in the map's own history, worked out from the map as it stands at that moment, so a change made
 * meanwhile (in another window, say) is never written over, and a change that changes nothing records nothing. A
 * setting changed continuously, as a slider drags, shows each value on the map at once and records only the value it
 * ends on, as one step, or nothing when it ends where it began; a value that cannot be written puts the map back as it
 * was before the drag and says why. A second map in the hub proves each step touches only its own map.
 */
describe('moduleProperties', () =>
{
  /**
   * A section offering one setting, the map's name on screen, written as it is given, except that "Nowhere" is
   * refused.
   * @param {MapDocument} map The map.
   * @returns {MapPropertiesModel} The setting.
   */
  const nameSection: MapPropertiesSource = map => ({
    note: null,
    fields: [ {
      key: 'name',
      label: 'Name',
      control: { kind: 'text', multiline: false },
      value: map.property('displayName'),
      step: 'Change name',
      write: value =>
      {
        if (value === 'Nowhere')
        {
          throw new Error('Nowhere is no name for a place');
        }

        return { displayName: value as string };
      },
    } ],
  });

  /**
   * A hub holding two fixture maps, both named Test Town.
   * @returns {DocumentHub} The hub.
   */
  const buildHub = (): DocumentHub =>
  {
    const hub = new DocumentHub({ clientId: 'window-a' });
    hub.adopt('map:1', buildMapJson() as unknown as JsonValue);
    hub.adopt('map:2', buildMapJson() as unknown as JsonValue);
    return hub;
  };

  /**
   * Reads a held map's name on screen.
   * @param {DocumentHub} hub The hub.
   * @param {number} mapId The map.
   * @returns {string} The name.
   */
  const nameIn = (hub: DocumentHub, mapId: number): string => hub.map(`map:${mapId}`).property('displayName');

  /**
   * Runs a change, and says why it was refused, if it was.
   * @param {() => void} change The change.
   * @returns {string} Why it was refused, or empty when it was not.
   */
  const refusal = (change: () => void): string =>
  {
    try
    {
      change();
      return '';
    }
    catch (error)
    {
      return (error as Error).message;
    }
  };

  describe('editModuleProperty', () =>
  {
    it('gives a setting a new value as one named step on that map alone, and undoes it', () =>
    {
      // Arrange.
      const hub = buildHub();

      // Act.
      const step = editModuleProperty(hub, 1, nameSection, 'name', 'Harbor');
      const changed = [ nameIn(hub, 1), nameIn(hub, 2) ];
      hub.undo(mapHistoryKey(1));

      // Assert.
      expect([ step?.label, step?.histories, changed, nameIn(hub, 1) ])
        .toStrictEqual([ 'Change name', [ 'map:1' ], [ 'Harbor', 'Test Town' ], 'Test Town' ]);
    });

    it('records nothing for the value the map already holds', () =>
    {
      // Arrange.
      const hub = buildHub();

      // Act.
      const step = editModuleProperty(hub, 1, nameSection, 'name', 'Test Town');

      // Assert.
      expect([ step, hub.history(mapHistoryKey(1)).rows ])
        .toStrictEqual([ null, [] ]);
    });

    it('records nothing for a setting the map does not offer', () =>
    {
      // Arrange.
      const hub = buildHub();

      // Act.
      const step = editModuleProperty(hub, 1, nameSection, 'title', 'Harbor');

      // Assert.
      expect([ step, nameIn(hub, 1), hub.history(mapHistoryKey(1)).rows ])
        .toStrictEqual([ null, 'Test Town', [] ]);
    });

    it('says why a value cannot be written, leaving the map as it was and free for the next change', () =>
    {
      // Arrange.
      const hub = buildHub();

      // Act.
      const why = refusal(() => editModuleProperty(hub, 1, nameSection, 'name', 'Nowhere'));
      const next = editModuleProperty(hub, 1, nameSection, 'name', 'Harbor');

      // Assert.
      expect([ why, next?.label, nameIn(hub, 1) ])
        .toStrictEqual([ 'Nowhere is no name for a place', 'Change name', 'Harbor' ]);
    });
  });

  describe('ModulePropertyDrag', () =>
  {
    it('shows each value on the map at once, and records the last as one step when it ends', () =>
    {
      // Arrange.
      const hub = buildHub();
      const drag = new ModulePropertyDrag(hub, 1, nameSection, 'name');

      // Act.
      drag.move('Harb');
      drag.move('Harbor');
      const showing = [ nameIn(hub, 1), hub.history(mapHistoryKey(1)).rows.length ];
      const step = drag.commit();
      hub.undo(mapHistoryKey(1));

      // Assert: the other map stays as it was, and the undo takes the drag back in one go.
      expect([ drag.key, showing, step?.label, nameIn(hub, 2), nameIn(hub, 1) ])
        .toStrictEqual([ 'name', [ 'Harbor', 0 ], 'Change name', 'Test Town', 'Test Town' ]);
    });

    it('records nothing for a drag that ends where it began', () =>
    {
      // Arrange.
      const hub = buildHub();
      const drag = new ModulePropertyDrag(hub, 1, nameSection, 'name');

      // Act.
      drag.move('Harbor');
      drag.move('Test Town');
      const step = drag.commit();

      // Assert.
      expect([ step, nameIn(hub, 1), hub.history(mapHistoryKey(1)).rows ])
        .toStrictEqual([ null, 'Test Town', [] ]);
    });

    it('puts back everything it showed when cancelled', () =>
    {
      // Arrange.
      const hub = buildHub();
      const drag = new ModulePropertyDrag(hub, 1, nameSection, 'name');

      // Act.
      drag.move('Harbor');
      drag.cancel();

      // Assert.
      expect([ nameIn(hub, 1), hub.history(mapHistoryKey(1)).rows ])
        .toStrictEqual([ 'Test Town', [] ]);
    });

    it('takes no more values once it has ended, and ends only once', () =>
    {
      // Arrange.
      const hub = buildHub();
      const drag = new ModulePropertyDrag(hub, 1, nameSection, 'name');
      drag.move('Harbor');
      drag.commit();

      // Act.
      drag.move('Bay');
      const again = drag.commit();
      drag.cancel();

      // Assert.
      expect([ nameIn(hub, 1), again, hub.history(mapHistoryKey(1)).rows.length ])
        .toStrictEqual([ 'Harbor', null, 1 ]);
    });

    it('puts the map back as it was before the drag when a value cannot be written, and says why', () =>
    {
      // Arrange.
      const hub = buildHub();
      const drag = new ModulePropertyDrag(hub, 1, nameSection, 'name');
      drag.move('Harbor');

      // Act.
      const why = refusal(() => drag.move('Nowhere'));
      const step = drag.commit();

      // Assert.
      expect([ why, nameIn(hub, 1), step ])
        .toStrictEqual([ 'Nowhere is no name for a place', 'Test Town', null ]);
    });

    it('keeps the map free while it shows the value the map already holds', () =>
    {
      // Arrange.
      const hub = buildHub();
      const drag = new ModulePropertyDrag(hub, 1, nameSection, 'name');

      // Act.
      drag.move('Test Town');
      const renamed = editModuleProperty(hub, 1, nameSection, 'name', 'Harbor');

      // Assert: the map was free for the next change, and the drag has nothing to record.
      expect([ renamed?.label, nameIn(hub, 1), drag.commit() ])
        .toStrictEqual([ 'Change name', 'Harbor', null ]);
    });

    it('opens nothing for a setting the map does not offer', () =>
    {
      // Arrange.
      const hub = buildHub();
      const drag = new ModulePropertyDrag(hub, 1, nameSection, 'title');

      // Act.
      drag.move('Harbor');
      const renamed = editModuleProperty(hub, 1, nameSection, 'name', 'Bay');

      // Assert: the map was free for the next change.
      expect([ renamed?.label, drag.commit() ])
        .toStrictEqual([ 'Change name', null ]);
    });
  });
});
