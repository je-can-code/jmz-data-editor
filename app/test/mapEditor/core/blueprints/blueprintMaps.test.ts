import { describe, expect, it } from 'vitest';
import {
  blueprintContentOf,
  blueprintMapContent,
  blueprintStampOf,
  holdBlueprintMap,
  mapFileGrid,
} from '../../../../src/mapEditor/core/blueprints/blueprintMaps.ts';
import { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { blueprintMapId, mapDocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import { createMapEvent } from '../../../../src/mapEditor/core/model/eventModel.ts';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import { captureAreaStamp, type Stamp } from '../../../../src/mapEditor/core/stamps/stamp.ts';
import { TilesetMode } from '../../../../src/mapEditor/core/tiles/autotileShapes.ts';
import { makeAutotileId } from '../../../../src/mapEditor/core/tiles/tileIds.ts';
import { newMapContent } from '../../../../src/mapEditor/core/tree/treePlans.ts';
import { holdBlueprints } from '../../support/blueprintFixtures.ts';
import { stampOf, tiledMap } from '../../support/stampFixtures.ts';
import { fill, put } from '../tiles/support/tileGridBuilder.ts';

/*
 * A blueprint opens as a small map, so every tool that paints a map or edits its events works on it unchanged, and what
 * the map holds afterwards is read back as the blueprint. Both ways must be exact. Laying a stamp out puts each layer it
 * carries where it belongs and leaves every other layer empty, and puts each event in the slot its id names, since that
 * id is what every copy's link names it by; a map nothing has changed reads back as the very stamp it came from, so
 * opening a blueprint and closing it again changes nothing. Reading a changed map back keeps what the stamp remembered of
 * the map it was copied from (the shape each autotile's old neighbours called for, read past the blueprint's own edges)
 * wherever nothing changed around a cell, and reads it afresh only where a change could have reshaped it, so a placement
 * of the blueprint still keeps the shapes drawn by hand that the change never reached.
 *
 * The tiles fixture is an 8x5 map with a 3 by 3 block of grass at 2, 1 to 4, 3, joined all round in shape 0 but for its
 * centre, drawn by hand in shape 5, a tree over the centre on layer 4 with a shadow and region 4 beneath it, and events 1
 * on the block's centre and 2 outside it. The blueprint is the block, every layer carried, with event 1.
 */
const GRASS = 16;
const TREE = 10;

/**
 * Captures the blueprint fixture: the grass block off the tiles fixture, every layer carried, with the event on it.
 * @returns {Stamp} The stamp.
 */
const blockStamp = (): Stamp =>
{
  const file = tiledMap(8, 5, grid =>
  {
    fill(grid, 2, 1, 4, 3, 0, makeAutotileId(GRASS, 0));
    put(grid, 3, 2, 0, makeAutotileId(GRASS, 5));
    put(grid, 3, 2, 3, TREE);
    put(grid, 3, 2, 4, 0b1001);
    put(grid, 3, 2, 5, 4);
  }, [ null, [ 3, 2 ], [ 6, 4 ] ]);
  const source = MapDocument.fromJson(mapDocumentKey(2), file);
  return captureAreaStamp(source, { x: 2, y: 1, width: 3, height: 3 }, 'auto', TilesetMode.area, 'blueprint:k3x9q2mf') as Stamp;
};

/**
 * Builds a blueprint opened as a map, from a stamp, as a held map document.
 * @param {Stamp} stamp The blueprint's stamp.
 * @returns {MapDocument} The map.
 */
const openedAsMap = (stamp: Stamp): MapDocument =>
{
  return MapDocument.fromJson('blueprint-map:k3x9q2mf', blueprintMapContent(stamp));
};

describe('blueprintMaps', () =>
{
  describe('blueprintMapContent', () =>
  {
    it('lays a stamp of every layer out as a map its size and tileset, each layer where it belongs, with a new map\'s settings', () =>
    {
      // Arrange.
      const stamp = blockStamp();

      // Act.
      const file = blueprintMapContent(stamp);
      const map = MapDocument.fromJson('blueprint-map:k3x9q2mf', file);

      // Assert: the centre's stack, layer by layer, beside the corner, which holds grass alone.
      const { data: _data, events: _events, width: _width, height: _height, ...settings } = file;
      const { data: _newData, events: _newEvents, width: _newWidth, height: _newHeight, ...fresh } = newMapContent(4);
      expect([
        [ map.width, map.height, map.tilesetId ],
        [ 0, 1, 2, 3, 4, 5 ].map(z => map.cellAt(1, 1, z)),
        [ 0, 1, 2, 3, 4, 5 ].map(z => map.cellAt(0, 0, z)),
        settings,
      ])
        .toStrictEqual([
          [ 3, 3, 4 ],
          [ makeAutotileId(GRASS, 5), 0, 0, TREE, 0b1001, 4 ],
          [ makeAutotileId(GRASS, 0), 0, 0, 0, 0, 0 ],
          fresh,
        ]);
    });

    it('fills the one layer a stamp carries, leaving every other layer empty', () =>
    {
      // Arrange: a 2 by 1 stamp of layer 3 alone.
      const stamp = stampOf({ width: 2, height: 1, events: [], tiles: { layers: [ 3 ], values: [ TREE, 11 ], calledFor: [ -1, -1 ] } });

      // Act.
      const map = MapDocument.fromJson('blueprint-map:k3x9q2mf', blueprintMapContent(stamp));

      // Assert.
      expect([ [ 0, 1, 2, 3, 4, 5 ].map(z => map.cellAt(0, 0, z)), [ 0, 1, 2, 3, 4, 5 ].map(z => map.cellAt(1, 0, z)) ])
        .toStrictEqual([ [ 0, 0, 0, TREE, 0, 0 ], [ 0, 0, 0, 11, 0, 0 ] ]);
    });

    it('puts each event in the slot its id names, standing where it stands inside the stamp, every slot between empty', () =>
    {
      // Arrange: a stamp of events alone, events 4 and 2, as a map copied them.
      const stamp = stampOf({
        width: 3,
        height: 2,
        events: [ { ...createMapEvent(2, 0, 1), name: 'Lamp' }, { ...createMapEvent(4, 2, 0), name: 'Goblin' } ],
      });

      // Act.
      const file = blueprintMapContent(stamp);

      // Assert.
      expect([ file.events.map(event => (event === null ? null : [ event.id, event.name, event.x, event.y ])), file.data.every(value => value === 0) ])
        .toStrictEqual([ [ null, null, [ 2, 'Lamp', 0, 1 ], null, [ 4, 'Goblin', 2, 0 ] ], true ]);
    });

    it('leaves a stamp of tiles alone with no events, and the stamp it was handed as it was', () =>
    {
      // Arrange.
      const stamp = stampOf({ width: 1, height: 1, events: [], tiles: { layers: [ 0 ], values: [ 7 ], calledFor: [ -1 ] } });
      const handed = structuredClone(stamp);

      // Act.
      const file = blueprintMapContent(stamp);
      file.data[0] = 99;

      // Assert.
      expect([ file.events, stamp ])
        .toStrictEqual([ [], handed ]);
    });

    it('copies the events, so changing the map never reaches the stamp', () =>
    {
      // Arrange.
      const stamp = blockStamp();

      // Act.
      const file = blueprintMapContent(stamp);
      (file.events[1] as { name: string }).name = 'Renamed';

      // Assert.
      expect(stamp.events[0].name)
        .toBe('EV001');
    });
  });

  describe('blueprintContentOf', () =>
  {
    it('reads the layers the blueprint carries, whatever another layer holds, and every event in id order', () =>
    {
      // Arrange: layer 3 carried; layer 0 written to anyway, which the blueprint does not carry.
      const stamp = stampOf({
        width: 2,
        height: 1,
        events: [ { ...createMapEvent(5, 1, 0), name: 'Lamp' }, { ...createMapEvent(3, 0, 0), name: 'Goblin' } ],
        tiles: { layers: [ 3 ], values: [ TREE, 11 ], calledFor: [ -1, -1 ] },
      });
      const file = blueprintMapContent(stamp);
      file.data[0] = 42;

      // Act.
      const content = blueprintContentOf(mapFileGrid(file), [ 3 ]);

      // Assert.
      expect([ content.tiles, content.events.map(event => event.name) ])
        .toStrictEqual([ { layers: [ 3 ], values: [ TREE, 11 ] }, [ 'Goblin', 'Lamp' ] ]);
    });

    it('reads no tiles for a blueprint of events alone', () =>
    {
      // Arrange.
      const file = blueprintMapContent(stampOf());

      // Act.
      const content = blueprintContentOf(mapFileGrid(file), null);

      // Assert.
      expect([ content.tiles, content.events.length ])
        .toStrictEqual([ null, 1 ]);
    });
  });

  describe('blueprintStampOf', () =>
  {
    it('reads a map nothing has changed back as the very stamp it was laid out from', () =>
    {
      // Arrange.
      const stamp = blockStamp();
      const map = openedAsMap(stamp);

      // Act.
      const readBack = blueprintStampOf(map, stamp, TilesetMode.area);

      // Assert.
      expect(readBack)
        .toStrictEqual(stamp);
    });

    it('keeps the shape remembered for an autotile no change reached, and reads it afresh wherever a change could reshape one', () =>
    {
      // Arrange: the grass in the block's top-left corner taken away.
      const stamp = blockStamp();
      const map = openedAsMap(stamp);
      map.apply(map.tilesPatch([ [ map.cellIndex(0, 0, 0), 0 ] ]));

      // Act.
      const { tiles } = blueprintStampOf(map, stamp, TilesetMode.area);

      // Assert: on layer 0, the corner is no autotile now; the cells beside it are read afresh, open towards it alone (16
      // its left, 20 its top), and so is the centre, its top-left corner open (1); the far side keeps what the map it
      // was copied from called for, the block's edges there (36, 24, 40, 28, 38), where the blueprint alone would join
      // past its own edge and call for 0.
      const before = (stamp.tiles as NonNullable<Stamp['tiles']>).calledFor.slice(0, 9);
      const after = (tiles as NonNullable<Stamp['tiles']>).calledFor.slice(0, 9);
      expect([ before, after ])
        .toStrictEqual([
          [ 34, 20, 36, 16, 0, 24, 40, 28, 38 ],
          [ -1, 16, 36, 20, 1, 24, 40, 28, 38 ],
        ]);
    });

    it('reads every event as it stands, moved or changed, keeping what the stamp knew of where it was copied from', () =>
    {
      // Arrange: the event moved to the block's corner and renamed.
      const stamp = blockStamp();
      const map = openedAsMap(stamp);
      map.apply(map.setPatch([ 'events', 1, 'x' ], 0));
      map.apply(map.setPatch([ 'events', 1, 'name' ], 'Guard'));

      // Act.
      const readBack = blueprintStampOf(map, stamp, TilesetMode.area);

      // Assert.
      expect([ readBack.events.map(event => [ event.id, event.name, event.x, event.y ]), readBack.mapId, readBack.origin, readBack.tiles ])
        .toStrictEqual([ [ [ 1, 'Guard', 0, 1 ] ], 2, { x: 2, y: 1 }, stamp.tiles ]);
    });

    it('reads no tiles back for a blueprint of events alone, whatever its map\'s layers hold', () =>
    {
      // Arrange: a stamp of one event, its map painted on anyway.
      const stamp = stampOf();
      const map = openedAsMap(stamp);
      map.apply(map.tilesPatch([ [ 0, 7 ] ]));

      // Act.
      const readBack = blueprintStampOf(map, stamp, TilesetMode.area);

      // Assert.
      expect(readBack)
        .toStrictEqual(stamp);
    });
  });

  describe('holdBlueprintMap', () =>
  {
    it('holds a blueprint as a map laid out from the blueprints the window holds, and the same one after', () =>
    {
      // Arrange: the camp beside a blueprint whose id differs by a character.
      const hub = new DocumentHub({ clientId: 'window-a' });
      holdBlueprints(hub, { k3x9q2mf: { name: 'Camp', stamp: blockStamp() }, k3x9q2mg: { name: 'Lamp', stamp: stampOf() } });

      // Act.
      const map = holdBlueprintMap(hub, 'k3x9q2mf');
      const again = holdBlueprintMap(hub, 'k3x9q2mf');

      // Assert.
      expect([ map.key, map.mapId, map.toJson(), again === map, hub.isDirty(map.key) ])
        .toStrictEqual([ 'blueprint-map:k3x9q2mf', blueprintMapId('k3x9q2mf'), blueprintMapContent(blockStamp()), true, false ]);
    });

    it('refuses a blueprint the blueprints no longer hold, holding nothing', () =>
    {
      // Arrange.
      const hub = new DocumentHub({ clientId: 'window-a' });
      holdBlueprints(hub, { k3x9q2mg: { name: 'Lamp', stamp: stampOf() } });

      // Act.
      const hold = () => holdBlueprintMap(hub, 'k3x9q2mf');

      // Assert.
      expect(hold)
        .toThrow('That blueprint is no longer there.');
      expect(hub.has('blueprint-map:k3x9q2mf'))
        .toBe(false);
    });
  });
});
