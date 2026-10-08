import { describe, expect, it } from 'vitest';
import { mapDocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import {
  captureAreaStamp,
  captureEventsStamp,
  contentsPhrase,
  stampCaption,
  stampContentKey,
  stampContents,
  type Stamp,
} from '../../../../src/mapEditor/core/stamps/stamp.ts';
import { TilesetMode } from '../../../../src/mapEditor/core/tiles/autotileShapes.ts';
import { makeAutotileId } from '../../../../src/mapEditor/core/tiles/tileIds.ts';
import { mapWithEvents } from '../../support/eventFixtures.ts';
import { stampOf, tiledMap } from '../../support/stampFixtures.ts';
import { fill, put } from '../tiles/support/tileGridBuilder.ts';

/*
 * A stamp is anything captured off a map, as a value whole on its own: it must carry everything it needs to be placed
 * on any map, any number of times, after the map it came from has changed or is gone. So a capture takes whole copies
 * of its events, every page, command and note exactly as the map holds them, standing where they stood inside the
 * stamp, in id order, with their ids kept so commands naming one another can follow the copies; and a piece of the
 * tile data takes the layers the select tool would (all six under automatic layering, with the events standing there;
 * the chosen layer alone, and no events, under manual layering), cut to the map, together with the shape each carried
 * autotile's neighbours called for where it was copied from, which is what lets a hand-drawn shape survive a placement.
 * A copy never shares an object with the map. The words a stamp is described in are the ones the history panel and the
 * Stamps panel show, and its content key tells two copies of the same piece apart from everything else.
 *
 * The events fixture is a 6x4 map: event 1 at 1, 1 and event 2 at 2, 1, slot 3 empty, and event 4 at 5, 3. The tiles
 * fixture is an 8x5 map with a 3 by 3 block of grass at 2, 1 to 4, 3, joined all round in shape 0 but for its centre,
 * drawn by hand in shape 5, with a tree over the centre on layer 4, a shadow and region 4 beneath it, and events 1 on
 * the block's centre and 2 outside it, at 6, 4.
 */
const GRASS = 16;
const TREE = 10;

/**
 * Builds the events fixture as a held map.
 * @returns {MapDocument} The map.
 */
const eventsMap = (): MapDocument => MapDocument.fromJson(mapDocumentKey(1), mapWithEvents(6, 4, [ null, [ 1, 1 ], [ 2, 1 ], null, [ 5, 3 ] ]));

/**
 * Builds the tiles fixture as a held map.
 * @returns {MapDocument} The map.
 */
const tilesMap = (): MapDocument =>
{
  const file = tiledMap(8, 5, grid =>
  {
    fill(grid, 2, 1, 4, 3, 0, makeAutotileId(GRASS, 0));
    put(grid, 3, 2, 0, makeAutotileId(GRASS, 5));
    put(grid, 3, 2, 3, TREE);
    put(grid, 3, 2, 4, 0b1001);
    put(grid, 3, 2, 5, 4);
  }, [ null, [ 3, 2 ], [ 6, 4 ] ]);
  return MapDocument.fromJson(mapDocumentKey(2), file);
};

describe('captureEventsStamp', () =>
{
  it('copies whole events in id order inside the smallest rectangle around them, passing over ids the map does not hold', () =>
  {
    // Arrange: slot 3 is empty, and 9 lies beyond the list.
    const map = eventsMap();

    // Act.
    const stamp = captureEventsStamp(map, [ 4, 3, 9, 1 ], 'window-a:1');

    // Assert: the rectangle runs from 1, 1 to 5, 3; each event stands where it stood inside it, its own id kept.
    expect(stamp)
      .toStrictEqual({
        id: 'window-a:1',
        mapId: 1,
        tilesetId: 4,
        origin: { x: 1, y: 1 },
        width: 5,
        height: 3,
        tiles: null,
        events: [ { ...map.event(1), x: 0, y: 0 }, { ...map.event(4), x: 4, y: 2 } ],
      });
  });

  it('copies apart from the map, so changing the stamp never changes the map', () =>
  {
    // Arrange.
    const map = eventsMap();
    const stamp = captureEventsStamp(map, [ 1 ], 'window-a:1') as Stamp;

    // Act.
    stamp.events[0].pages[0].list.unshift({ code: 101, indent: 0, parameters: [] });
    (stamp.events[0] as { name: string }).name = 'Changed';

    // Assert.
    expect([ map.event(1)?.name, map.event(1)?.pages[0].list.length ])
      .toStrictEqual([ 'EV001', 1 ]);
  });

  it('captures nothing when no event asked for is held', () =>
  {
    // Arrange.
    const map = eventsMap();

    // Act.
    const stamp = captureEventsStamp(map, [ 3, 9 ], 'window-a:1');

    // Assert.
    expect(stamp)
      .toBeNull();
  });
});

describe('captureAreaStamp', () =>
{
  it('carries every layer and the events standing on the piece under automatic layering, cut to the map', () =>
  {
    // Arrange: a rectangle reaching from the block's centre past the map's bottom-right corner.
    const map = tilesMap();

    // Act.
    const stamp = captureAreaStamp(map, { x: 3, y: 2, width: 9, height: 9 }, 'auto', TilesetMode.area, 'window-a:2') as Stamp;

    // Assert: 5 by 3 cells on the map, all six layers, the centre's four layered values at the stamp's corner, and both
    // events, the second standing at 3, 2 inside the stamp.
    const { tiles } = stamp;
    const corner = [ 0, 1, 2, 3, 4, 5 ].map(layer => tiles?.values[layer * 15]);
    expect([ stamp.origin, stamp.width, stamp.height, tiles?.layers, tiles?.values.length, corner, stamp.events.map(event => [ event.id, event.x, event.y ]) ])
      .toStrictEqual([ { x: 3, y: 2 }, 5, 3, [ 0, 1, 2, 3, 4, 5 ], 90, [ makeAutotileId(GRASS, 5), 0, 0, TREE, 0b1001, 4 ], [ [ 1, 0, 0 ], [ 2, 3, 2 ] ] ]);
  });

  it('carries only the chosen layer, and no events, under manual layering', () =>
  {
    // Arrange.
    const map = tilesMap();

    // Act: layer 4 over the block's middle row.
    const stamp = captureAreaStamp(map, { x: 2, y: 2, width: 3, height: 1 }, 3, TilesetMode.area, 'window-a:3') as Stamp;

    // Assert.
    expect([ stamp.tiles, stamp.events ])
      .toStrictEqual([ { layers: [ 3 ], values: [ 0, TREE, 0 ], calledFor: [ -1, -1, -1 ] }, [] ]);
  });

  it('remembers the shape each carried autotile\'s neighbours called for where it was copied, and -1 for anything else', () =>
  {
    // Arrange: the block's middle row, its left cell meeting empty ground and its centre drawn by hand.
    const map = tilesMap();

    // Act.
    const stamp = captureAreaStamp(map, { x: 1, y: 2, width: 3, height: 1 }, 'auto', TilesetMode.area, 'window-a:4') as Stamp;

    // Assert: nothing at 1, 2 to shape; the block's left edge; the centre called for shape 0, though drawn in 5; and the
    // tree, the shadow and the region shaped by nothing.
    const { calledFor, values } = stamp.tiles as NonNullable<Stamp['tiles']>;
    expect([ calledFor.slice(0, 3), values.slice(0, 3), calledFor.slice(3) ])
      .toStrictEqual([ [ -1, 16, 0 ], [ 0, makeAutotileId(GRASS, 0), makeAutotileId(GRASS, 5) ], new Array(15).fill(-1) ]);
  });

  it('captures nothing for a rectangle off the map', () =>
  {
    // Arrange.
    const map = tilesMap();

    // Act.
    const stamp = captureAreaStamp(map, { x: 8, y: 0, width: 2, height: 2 }, 'auto', TilesetMode.area, 'window-a:5');

    // Assert.
    expect(stamp)
      .toBeNull();
  });
});

describe('what a stamp is called', () =>
{
  it('words what a stamp holds after a verb: one event alone as "event", tiles by their size, both together', () =>
  {
    // Arrange: the sizes and counts a stamp can hold.
    const cases: [ { width: number; height: number } | null, number ][] = [
      [ null, 1 ],
      [ null, 3 ],
      [ { width: 20, height: 15 }, 0 ],
      [ { width: 1, height: 1 }, 0 ],
      [ { width: 4, height: 2 }, 1 ],
      [ { width: 4, height: 2 }, 10 ],
      [ null, 0 ],
    ];

    // Act.
    const words = cases.map(([ tiles, events ]) => contentsPhrase(tiles, events));

    // Assert.
    expect(words)
      .toStrictEqual([ 'event', '3 events', '20 by 15 tiles', '1 tile', '4 by 2 tiles and 1 event', '4 by 2 tiles and 10 events', 'nothing' ]);
  });

  it('words a stamp\'s own contents, and its caption in the Stamps panel, naming the one layer its tiles came from', () =>
  {
    // Arrange: a stamp of two events, one of tiles from every layer with an event, and one of layer 4 alone.
    const twoEvents = stampOf({ width: 2, events: [ stampOf().events[0], { ...stampOf().events[0], id: 2, x: 1 } ] });
    const whole = stampOf({ width: 3, height: 2, tiles: { layers: [ 0, 1, 2, 3, 4, 5 ], values: new Array(36).fill(0), calledFor: new Array(36).fill(-1) } });
    const layerFour = stampOf({ width: 12, height: 6, events: [], tiles: { layers: [ 3 ], values: new Array(72).fill(0), calledFor: new Array(72).fill(-1) } });

    // Act.
    const words = [ twoEvents, whole, layerFour ].map(stamp => [ stampContents(stamp), stampCaption(stamp) ]);

    // Assert.
    expect(words)
      .toStrictEqual([
        [ '2 events', '2 events' ],
        [ '3 by 2 tiles and 1 event', '3 by 2 tiles, 1 event' ],
        [ '12 by 6 tiles', '12 by 6 tiles from layer 4' ],
      ]);
  });

  it('names two copies of the same piece of the same map alike whatever their ids, and anything else apart', () =>
  {
    // Arrange: the same piece copied twice, then the same events copied from another place on the map.
    const map = eventsMap();
    const first = captureEventsStamp(map, [ 1 ], 'window-a:1') as Stamp;
    const again = captureEventsStamp(map, [ 1 ], 'window-b:7') as Stamp;
    const moved = { ...first, origin: { x: 2, y: 1 } };

    // Act.
    const keys = [ first, again, moved ].map(stampContentKey);

    // Assert.
    expect([ keys[0] === keys[1], keys[0] === keys[2] ])
      .toStrictEqual([ true, false ]);
  });
});
