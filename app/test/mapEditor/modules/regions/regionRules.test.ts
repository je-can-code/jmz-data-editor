import { describe, expect, it } from 'vitest';
import { freshSavePages, landingGroundOf } from '../../../../src/mapEditor/core/locations/landingCheck.ts';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { RmmzTileset } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import type { PassabilityQuery } from '../../../../src/mapEditor/core/modules/PluginModule.ts';
import {
  noteRegions,
  parameterIds,
  regionRule,
  regionSettingsOf,
  type RegionSettings,
} from '../../../../src/mapEditor/modules/regions/regionRules.ts';
import { buildMapJson } from '../../support/fixtures.ts';

/*
 * J-RegionEffects keeps the player out of regions and off terrain, and the editor's rule must forbid exactly the steps the
 * plugin forbids, or the Passability overlay, a route preview and a transfer's landing would all promise a way the game
 * refuses, or refuse one it allows. So each part is mirrored from the plugin's source and pinned beside a near miss:
 *
 * - its parameters read as translateRegionIds reads them, JSON then parseInt, and a map's note as RPGManager and
 *   JsonMapper read it, line by line with the last tagged line winning;
 * - a step onto a region no one may step onto is refused, judged on the tile one step on with no wrapping and region 0
 *   off the map, from the plugin's parameters or the map's note;
 * - a step onto a region anyone may step onto goes before any tile is read, so a terrain tag never refuses it;
 * - a step through tiles whose deciding tile, the first without the star flag, carries a denied terrain tag is refused.
 *
 * And landings read the rule from either side of a step: a tile in a region kept clear, or whose terrain is denied, is no
 * landing, while the tile beside it is.
 */

/**
 * The settings Chef Adventure ships: region 10 kept clear everywhere, no region open everywhere, terrain tag 1 denied.
 */
const SHIPPED: RegionSettings = { denyRegions: [ 10 ], allowRegions: [], denyTerrainTags: [ 1 ] };

/**
 * A tileset whose tile 1 is open ground, tile 2 open ground of terrain tag 1, tile 3 a star of terrain tag 1, and tile 4
 * open ground of terrain tag 2.
 * @returns {RmmzTileset} The tileset.
 */
const buildTileset = (): RmmzTileset =>
{
  const flags = new Array(8).fill(0);
  flags[0] = 0x10;
  flags[1] = 0;
  flags[2] = 0x1000;
  flags[3] = 0x1010;
  flags[4] = 0x2000;
  return { id: 4, flags, mode: 1, name: 'Fixture', note: '', tilesetNames: [ '', '', '', '', '', '', '', '', '' ] };
};

/**
 * Builds a 5 by 3 map of open ground, with regions and a note.
 * @param {Readonly<Record<string, number>>} regions The regions painted, by {@code "x,y"}.
 * @param {string} note The map's note.
 * @param {number} scrollType How the map loops.
 * @returns {MapDocument} The map.
 */
const buildMap = (regions: Readonly<Record<string, number>> = {}, note = '', scrollType = 0): MapDocument =>
{
  const width = 5;
  const height = 3;
  const data = new Array(width * height * 6).fill(0);
  for (let index = 0; index < width * height; index++)
  {
    data[index] = 1;
  }

  Object.entries(regions).forEach(([ cell, region ]) =>
  {
    const [ x, y ] = cell.split(',').map(Number);
    data[(5 * height + y) * width + x] = region;
  });
  return MapDocument.fromJson('map:1', { ...buildMapJson(), width, height, data, note, scrollType, events: [ null ] });
};

/**
 * Builds what the rule is asked about one step.
 * @param {MapDocument} document The map.
 * @param {number} x The column stepped from.
 * @param {number} y The row stepped from.
 * @param {PassabilityQuery['direction']} direction The way.
 * @param {readonly number[]} tiles The tiles there, top first.
 * @returns {PassabilityQuery} The step.
 */
const step = (document: MapDocument, x: number, y: number, direction: PassabilityQuery['direction'], tiles: readonly number[] = [ 0, 0, 0, 1 ]): PassabilityQuery =>
{
  return { document, tileset: buildTileset(), x, y, direction, tiles };
};

describe('parameterIds', () =>
{
  it('reads the list MZ writes, each entry by parseInt, leaving out what reads as no number', () =>
  {
    // Arrange: a list as MZ writes one, entries as numbers, one in hex, one with trailing words, and one of words alone.
    const texts = [ '["10"]', '[3, 4]', '["0x10", "7 tall", "none"]', '[]' ];

    // Act.
    const ids = texts.map(parameterIds);

    // Assert.
    expect(ids)
      .toStrictEqual([ [ 10 ], [ 3, 4 ], [ 16, 7 ], [] ]);
  });

  it('names nothing for a parameter that is missing, is not JSON, or is no list', () =>
  {
    // Arrange.
    const texts = [ undefined, 'not json', '"10"', '' ];

    // Act.
    const ids = texts.map(parameterIds);

    // Assert.
    expect(ids)
      .toStrictEqual([ [], [], [], [] ]);
  });
});

describe('regionSettingsOf', () =>
{
  it('reads the regions kept clear, the regions open and the terrain tags denied from the plugin\'s parameters', () =>
  {
    // Arrange: J-RegionEffects as Chef Adventure lists it, but with region 3 open.
    const plugin = {
      name: 'j/regions/J-RegionEffects',
      status: true,
      description: '',
      parameters: { globalAllowRegions: '["3"]', globalDenyRegions: '["10"]', globalDenyTerrainTags: '["1"]' },
    };

    // Act.
    const settings = regionSettingsOf(plugin);

    // Assert.
    expect(settings)
      .toStrictEqual({ denyRegions: [ 10 ], allowRegions: [ 3 ], denyTerrainTags: [ 1 ] });
  });
});

describe('noteRegions', () =>
{
  /**
   * The tag naming the regions kept clear, as the plugin's own expression reads it.
   */
  const DENY = /<denyRegions: ?(\[[\d, ]+\])>/iu;

  it('reads the regions a tag names, with one space after the colon or none, in any case', () =>
  {
    // Arrange.
    const notes = [ '<denyRegions:[1, 2]>', '<denyRegions: [3,4]>', '<DENYREGIONS:[5]>', '<denyRegions:  [6]>' ];

    // Act.
    const regions = notes.map(note => noteRegions(note, DENY));

    // Assert: two spaces is no tag at all.
    expect(regions)
      .toStrictEqual([ [ 1, 2 ], [ 3, 4 ], [ 5 ], [] ]);
  });

  it('lets the last line carrying the tag win, and the first tag on that line', () =>
  {
    // Arrange: two lines with the tag, the second carrying two tags; then the same over Windows line ends.
    const notes = [ '<denyRegions:[1]>\n<denyRegions:[2]><denyRegions:[3]>\n<noToneChange>', '<denyRegions:[4]>\r\n<denyRegions:[5]>' ];

    // Act.
    const regions = notes.map(note => noteRegions(note, DENY));

    // Assert.
    expect(regions)
      .toStrictEqual([ [ 2 ], [ 5 ] ]);
  });

  it('reads the list as JsonMapper does: split at each comma, each piece by parseFloat', () =>
  {
    // Arrange: pieces padded with spaces, two numbers with no comma between them, and an empty piece.
    const notes = [ '<denyRegions:[ 1, 2 ]>', '<denyRegions:[1 2]>', '<denyRegions:[,3]>' ];

    // Act.
    const regions = notes.map(note => noteRegions(note, DENY));

    // Assert.
    expect(regions)
      .toStrictEqual([ [ 1, 2 ], [ 1 ], [ 3 ] ]);
  });

  it('names nothing for a note without the tag', () =>
  {
    // Arrange.
    const note = '<weather:motes>\n<allowRegions:[2]>';

    // Act.
    const regions = noteRegions(note, DENY);

    // Assert.
    expect(regions)
      .toStrictEqual([]);
  });
});

describe('regionRule', () =>
{
  it('refuses a step onto a region kept clear on every map, naming it, and allows the step beside it', () =>
  {
    // Arrange: region 10 at 2, 1.
    const map = buildMap({ '2,1': 10 });
    const rule = regionRule(SHIPPED);

    // Act: from 1, 1 rightwards onto it, and from 1, 1 downwards beside it.
    const reasons = [ rule.deny(step(map, 1, 1, 6)), rule.deny(step(map, 1, 1, 2)) ];

    // Assert.
    expect(reasons)
      .toStrictEqual([ 'Region 10 keeps everyone out.', null ]);
  });

  it('judges the tile a step goes onto, never the tile it leaves', () =>
  {
    // Arrange: region 10 at 2, 1.
    const map = buildMap({ '2,1': 10 });
    const rule = regionRule(SHIPPED);

    // Act: from 2, 1 out to the right.
    const reason = rule.deny(step(map, 2, 1, 6));

    // Assert.
    expect(reason)
      .toBeNull();
  });

  it('refuses a step onto a region the map\'s note keeps clear, and allows one onto another region', () =>
  {
    // Arrange: regions 7 and 8, with the note keeping 7 clear.
    const map = buildMap({ '2,1': 7, '1,2': 8 }, '<denyRegions:[7]>');
    const rule = regionRule(SHIPPED);

    // Act.
    const reasons = [ rule.deny(step(map, 1, 1, 6)), rule.deny(step(map, 1, 1, 2)) ];

    // Assert.
    expect(reasons)
      .toStrictEqual([ 'Region 7 keeps everyone out.', null ]);
  });

  it('reads a map\'s note again once it changes', () =>
  {
    // Arrange: region 7, at first kept clear by nothing.
    const map = buildMap({ '2,1': 7 });
    const rule = regionRule(SHIPPED);
    const before = rule.deny(step(map, 1, 1, 6));

    // Act.
    map.apply(map.setPatch([ 'note' ], '<denyRegions:[7]>'));

    // Assert.
    expect([ before, rule.deny(step(map, 1, 1, 6)) ])
      .toStrictEqual([ null, 'Region 7 keeps everyone out.' ]);
  });

  it('reads a step off the map\'s edge as onto region 0, never wrapping round a map that loops', () =>
  {
    // Arrange: region 0 kept clear, and region 9 on the far side of a map looping across.
    const zero = regionRule({ ...SHIPPED, denyRegions: [ 0 ] });
    const nine = regionRule({ ...SHIPPED, denyRegions: [ 9 ] });
    const map = buildMap({ '4,0': 9 }, '', 2);

    // Act: leftwards off the map from 0, 0.
    const reasons = [ zero.deny(step(map, 0, 0, 4)), nine.deny(step(map, 0, 0, 4)) ];

    // Assert.
    expect(reasons)
      .toStrictEqual([ 'Region 0 keeps everyone out.', null ]);
  });

  it('refuses a step through tiles whose deciding tile carries a denied terrain tag, and allows another tag', () =>
  {
    // Arrange: the deciding tile of terrain tag 1, then of terrain tag 2.
    const map = buildMap();
    const rule = regionRule(SHIPPED);

    // Act.
    const reasons = [ rule.deny(step(map, 1, 1, 2, [ 0, 0, 0, 2 ])), rule.deny(step(map, 1, 1, 2, [ 0, 0, 0, 4 ])) ];

    // Assert.
    expect(reasons)
      .toStrictEqual([ 'Terrain tag 1 keeps everyone off.', null ]);
  });

  it('reads the terrain tag of the first tile without the star flag, skipping a star of a denied tag above it', () =>
  {
    // Arrange: a star of terrain tag 1 over open ground; and open ground over ground of terrain tag 1.
    const map = buildMap();
    const rule = regionRule(SHIPPED);

    // Act.
    const reasons = [ rule.deny(step(map, 1, 1, 2, [ 0, 0, 3, 1 ])), rule.deny(step(map, 1, 1, 2, [ 0, 0, 1, 2 ])) ];

    // Assert: neither deciding tile carries the denied tag.
    expect(reasons)
      .toStrictEqual([ null, null ]);
  });

  it('lets a step onto a region open everywhere or on this map through whatever the terrain, and not onto another', () =>
  {
    // Arrange: terrain tag 1 everywhere stepped from; region 3 open everywhere, region 5 open by the note, region 6 not.
    const map = buildMap({ '2,1': 3, '1,2': 5, '0,1': 6 }, '<allowRegions:[5]>');
    const rule = regionRule({ ...SHIPPED, allowRegions: [ 3 ] });
    const tagged = [ 0, 0, 0, 2 ];

    // Act.
    const reasons = [ rule.deny(step(map, 1, 1, 6, tagged)), rule.deny(step(map, 1, 1, 2, tagged)), rule.deny(step(map, 1, 1, 4, tagged)) ];

    // Assert.
    expect(reasons)
      .toStrictEqual([ null, null, 'Terrain tag 1 keeps everyone off.' ]);
  });

  it('keeps a region out that is both kept clear and open, as the plugin asks about keeping clear first', () =>
  {
    // Arrange: region 5 kept clear everywhere and opened by the note.
    const map = buildMap({ '2,1': 5 }, '<allowRegions:[5]>');
    const rule = regionRule({ ...SHIPPED, denyRegions: [ 5 ] });

    // Act.
    const reason = rule.deny(step(map, 1, 1, 6));

    // Assert.
    expect(reason)
      .toBe('Region 5 keeps everyone out.');
  });
});

describe('landings over J-RegionEffects\' rule', () =>
{
  /**
   * Judges two tiles of a map painted with the tiles and regions given, by the shipped settings.
   * @param {MapDocument} map The map.
   * @param {readonly (readonly [ number, number ])[]} tiles The tiles to judge.
   * @returns {unknown[]} What the landing check says of each.
   */
  const judge = (map: MapDocument, tiles: readonly (readonly [ number, number ])[]) =>
  {
    const ground = landingGroundOf(map, buildTileset(), [ regionRule(SHIPPED) ], freshSavePages(null, 0, null));
    return tiles.map(([ x, y ]) => ground.problemAt(x, y));
  };

  it('refuses a landing in a region kept clear, since no step leads back off it, and lands beside it', () =>
  {
    // Arrange: region 10 at 2, 1 alone.
    const map = buildMap({ '2,1': 10 });

    // Act.
    const problems = judge(map, [ [ 2, 1 ], [ 3, 1 ] ]);

    // Assert.
    expect(problems)
      .toStrictEqual([ { kind: 'denied', reasons: [ 'Region 10 keeps everyone out.' ] }, null ]);
  });

  it('refuses a landing on ground of a denied terrain tag, and lands on that terrain under open ground', () =>
  {
    // Arrange: ground of terrain tag 1 at 1, 1 on the bottom layer; the same at 3, 1 under open ground on layer 2.
    const map = buildMap();
    const { width, height } = map;
    const data = [ ...map.cells ];
    data[(0 * height + 1) * width + 1] = 2;
    data[(0 * height + 1) * width + 3] = 2;
    data[(1 * height + 1) * width + 3] = 1;
    const painted = MapDocument.fromJson('map:1', { ...buildMapJson(), width, height, data, note: '', events: [ null ] });

    // Act.
    const problems = judge(painted, [ [ 1, 1 ], [ 3, 1 ] ]);

    // Assert.
    expect(problems)
      .toStrictEqual([ { kind: 'denied', reasons: [ 'Terrain tag 1 keeps everyone off.' ] }, null ]);
  });
});
