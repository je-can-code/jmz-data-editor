import { describe, expect, it } from 'vitest';
import { BUILT_IN_ENTRIES } from '../../../../src/mapEditor/core/commands/builtin/builtInCommands.ts';
import type { CommandCatalogEntry, CommandPlace } from '../../../../src/mapEditor/core/commands/catalogTypes.ts';
import { applyPlace, placeIn, placesEndingAt } from '../../../../src/mapEditor/core/commands/commandPlaces.ts';
import type { CommandDraft } from '../../../../src/mapEditor/core/commands/fieldValues.ts';

/*
 * A place among a command's inputs is three fields that together name a map and a tile on it, and the generated form
 * offers to pick it by clicking the tile on the map. So the form owes the author a picker right after the place's y,
 * and only while all three fields show: a place given by variables instead has nothing on a map to click. The picker
 * starts on the map and tile the fields hold now, and a place picked lands in all three fields exactly as typing them
 * would, leaving every other input of the command alone.
 */
describe('placesEndingAt', () =>
{
  /**
   * The place Set Vehicle Location names directly.
   */
  const PLACE: CommandPlace = { map: 'map', x: 'x', y: 'y' };

  it('offers the place after its y, while its map, x and y all show', () =>
  {
    // Arrange.
    const shown = new Set([ 'vehicle', 'designation', 'map', 'x', 'y' ]);

    // Act.
    const places = placesEndingAt([ PLACE ], 'y', shown);

    // Assert.
    expect(places)
      .toStrictEqual([ PLACE ]);
  });

  it('offers nothing after any other field of the place', () =>
  {
    // Arrange.
    const shown = new Set([ 'map', 'x', 'y' ]);

    // Act.
    const places = [ 'map', 'x' ].map(key => placesEndingAt([ PLACE ], key, shown));

    // Assert.
    expect(places)
      .toStrictEqual([ [], [] ]);
  });

  it('offers nothing while the map is hidden', () =>
  {
    // Arrange: the x and y show, the map does not.
    const shown = new Set([ 'x', 'y' ]);

    // Act.
    const places = placesEndingAt([ PLACE ], 'y', shown);

    // Assert.
    expect(places)
      .toStrictEqual([]);
  });

  it('offers nothing while the x is hidden', () =>
  {
    // Arrange: the map and y show, the x does not.
    const shown = new Set([ 'map', 'y' ]);

    // Act.
    const places = placesEndingAt([ PLACE ], 'y', shown);

    // Assert.
    expect(places)
      .toStrictEqual([]);
  });

  it('offers nothing while the y itself is hidden', () =>
  {
    // Arrange: the map and x show, the y does not.
    const shown = new Set([ 'map', 'x' ]);

    // Act.
    const places = placesEndingAt([ PLACE ], 'y', shown);

    // Assert.
    expect(places)
      .toStrictEqual([]);
  });
});

describe('placeIn', () =>
{
  it('reads the map and the tile the place\'s fields hold', () =>
  {
    // Arrange: a form whose other inputs hold numbers too.
    const values = { vehicle: 2, designation: 0, map: 7, x: 12, y: 30 };

    // Act.
    const location = placeIn(values, { map: 'map', x: 'x', y: 'y' });

    // Assert.
    expect(location)
      .toStrictEqual({ mapId: 7, x: 12, y: 30 });
  });
});

describe('applyPlace', () =>
{
  it('writes the map and the tile picked into their fields, leaving every other input as it was', () =>
  {
    // Arrange: the ship parked on map 1 at 0, 0.
    const entry = BUILT_IN_ENTRIES.find(each => each.id === 'core:202') as CommandCatalogEntry;
    const draft: CommandDraft = { command: { code: 202, indent: 0, parameters: [ 1, 0, 1, 0, 0 ] }, continuation: [] };

    // Act.
    const placed = applyPlace(entry, draft, { map: 'map', x: 'x', y: 'y' }, { mapId: 5, x: 4, y: 3 });

    // Assert.
    expect(placed)
      .toStrictEqual({ command: { code: 202, indent: 0, parameters: [ 1, 0, 5, 4, 3 ] }, continuation: [] });
  });
});
