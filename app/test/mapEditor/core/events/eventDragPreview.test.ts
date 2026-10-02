import { describe, expect, it } from 'vitest';
import { EventDragPreview } from '../../../../src/mapEditor/core/events/eventDragPreview.ts';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { RmmzMap } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { mapWithEvents } from '../../support/eventFixtures.ts';

/*
 * A drag is worked out once as it starts, so each tile the pointer reaches costs only as much as the dragged events.
 * Its promises match the drop's: the group keeps its layout and slides along the map's edge instead of leaving it; a
 * tile held by an event outside the group is blocked, and shown so, while a tile the group leaves never is; every
 * dragged event has a ghost looking as its event looks, picture and priority, even one with no page to draw, and naming
 * its event, so a ghost of an event that draws no picture can show that event's marker; and an event not dragged never
 * gets a ghost.
 *
 * The fixture is a 5x4 map: event 1 at 0, 0 and event 2 at 1, 0 (dragged), event 3 at 2, 0 (staying), and event 4, with
 * no pages at all, at 0, 3.
 */
describe('EventDragPreview', () =>
{
  /**
   * Builds the fixture map: event 2 wears a character, and event 4 has no pages.
   * @returns {MapDocument} The map.
   */
  const fixture = (): MapDocument =>
  {
    const file: RmmzMap = mapWithEvents(5, 4, [ null, [ 0, 0 ], [ 1, 0 ], [ 2, 0 ], [ 0, 3 ] ]);
    const [ , , second, , fourth ] = file.events;
    if (second === null || fourth === null)
    {
      throw new Error('the fixture lost an event');
    }

    second.pages[0].image = { ...second.pages[0].image, characterName: 'Actor1', characterIndex: 2 };
    second.pages[0].priorityType = 1;
    fourth.pages = [];
    return MapDocument.fromJson('map:1', file);
  };

  it('shows each dragged event where it would land, looking as it does, and nothing blocked on free tiles', () =>
  {
    // Arrange.
    const map = fixture();
    const preview = new EventDragPreview(map, [ 1, 2 ]);

    // Act.
    const frame = preview.at(0, 2);

    // Assert.
    const ghosts = frame.ghosts.map(ghost => [ ghost.eventId, ghost.x, ghost.y, ghost.image.characterName, ghost.priorityType ]);
    expect([ preview.eventIds, frame.dx, frame.dy, ghosts, frame.blocked, frame.ok ])
      .toStrictEqual([ [ 1, 2 ], 0, 2, [ [ 1, 0, 2, '', 0 ], [ 2, 1, 2, 'Actor1', 1 ] ], [], true ]);
  });

  it('blocks a tile an event outside the group holds, and never one the group itself leaves', () =>
  {
    // Arrange: one tile right, event 1 lands where event 2 stood and event 2 lands on event 3.
    const map = fixture();
    const preview = new EventDragPreview(map, [ 1, 2 ]);

    // Act.
    const frame = preview.at(1, 0);

    // Assert.
    expect([ frame.blocked, frame.ok ])
      .toStrictEqual([ [ { x: 2, y: 0 } ], false ]);
  });

  it('slides the group along the map\'s edge rather than taking it off the map', () =>
  {
    // Arrange: dragged far left and one down.
    const map = fixture();
    const preview = new EventDragPreview(map, [ 1, 2 ]);

    // Act.
    const frame = preview.at(-4, 1);

    // Assert.
    expect([ frame.dx, frame.dy, frame.ghosts.map(ghost => [ ghost.x, ghost.y ]) ])
      .toStrictEqual([ 0, 1, [ [ 0, 1 ], [ 1, 1 ] ] ]);
  });

  it('gives an event with no pages a ghost with no picture, which still shows its tile', () =>
  {
    // Arrange.
    const map = fixture();
    const preview = new EventDragPreview(map, [ 4 ]);

    // Act.
    const [ ghost ] = preview.at(1, 0).ghosts;

    // Assert.
    expect([ ghost.eventId, ghost.x, ghost.y, ghost.image.characterName, ghost.image.tileId, ghost.priorityType ])
      .toStrictEqual([ 4, 1, 3, '', 0, 0 ]);
  });

  it('passes over ids the map does not hold, keeping the shift the pointer asks for with nothing to keep on the map', () =>
  {
    // Arrange: slot 9 is beyond the list.
    const map = fixture();
    const preview = new EventDragPreview(map, [ 9 ]);

    // Act.
    const frame = preview.at(-3, 7);

    // Assert.
    expect([ preview.eventIds, frame.dx, frame.dy, frame.ghosts, frame.ok ])
      .toStrictEqual([ [], -3, 7, [], true ]);
  });
});
