import { describe, expect, it } from 'vitest';
import { MapDocument } from '../../../src/mapEditor/core/model/MapDocument.ts';
import { NO_OVERLAY_STATE } from '../../../src/mapEditor/core/renderer/MapRenderer.ts';
import { pickEvent } from '../../../src/mapEditor/render/pickedEvent.ts';
import { buildMapJson } from '../support/fixtures.ts';

/*
 * A map view picks out an event when asked to, as when the data editor opens a map at one of its battlers: that event
 * shows selected, and the view centres on its tile. Only the event asked for is selected, never another on the same
 * map. An event the map does not hold, or no event at all, selects nothing and leaves the view where it is, since
 * there is nothing there to look at.
 *
 * The fixture holds the door (event 1) at 0, 0 and the chest (event 3) at 2, 1, with slot 2 empty between them.
 */
describe('pickEvent', () =>
{
  const map = MapDocument.fromJson('map:5', buildMapJson());

  it('selects the event asked for alone and looks at its tile', () =>
  {
    // Arrange: the chest, with the door on the same map.

    // Act.
    const picked = pickEvent(map, 3);

    // Assert.
    expect(picked)
      .toStrictEqual({ overlay: { ...NO_OVERLAY_STATE, selectedEvents: [ 3 ] }, cell: { x: 2, y: 1 } });
  });

  it('selects nothing and looks nowhere for an event the map does not hold', () =>
  {
    // Arrange: slot 2 is empty.

    // Act.
    const picked = pickEvent(map, 2);

    // Assert.
    expect(picked)
      .toStrictEqual({ overlay: NO_OVERLAY_STATE, cell: null });
  });

  it('selects nothing and looks nowhere when no event is picked', () =>
  {
    // Arrange: nothing to set up; no event is picked.

    // Act.
    const picked = pickEvent(map, null);

    // Assert.
    expect(picked)
      .toStrictEqual({ overlay: NO_OVERLAY_STATE, cell: null });
  });
});
