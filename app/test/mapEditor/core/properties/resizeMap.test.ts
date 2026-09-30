import { describe, expect, it } from 'vitest';
import { planResize, RESIZE_ANCHORS, type ResizeAnchor, type ResizeSource } from '../../../../src/mapEditor/core/properties/resizeMap.ts';
import { buildMapJson } from '../../support/fixtures.ts';

/*
 * A resize owes the map its content in the right place. The anchor is the edge or corner that stays put: every
 * layer's cells (tiles, shadows and regions alike) are carried to where the anchor puts them, new cells are empty,
 * and every event moves with the tiles under it. An event that would land outside the new size is listed to go
 * rather than kept somewhere no one can see it. Centred, the odd cell goes to the far side whether the map grows or
 * shrinks. Sizes outside what MZ allows are refused.
 *
 * The fixture is a 3 by 2 map whose 36 cells all differ, with a door at (0, 0) and a chest at (2, 1), so a cell
 * or an event in the wrong place always shows.
 */
describe('planResize', () =>
{
  /**
   * The fixture map as a resize source.
   * @returns {ResizeSource} The source.
   */
  const source = (): ResizeSource =>
  {
    const map = buildMapJson();
    return { width: map.width, height: map.height, cells: map.data, events: map.events };
  };

  /**
   * Reads one cell of a flattened six-layer array.
   * @param {readonly number[]} data The cells.
   * @param {number} width The map's width.
   * @param {number} height The map's height.
   * @param {number} x The column.
   * @param {number} y The row.
   * @param {number} z The layer.
   * @returns {number} The cell.
   */
  const cellOf = (data: readonly number[], width: number, height: number, x: number, y: number, z: number): number =>
  {
    return data[(z * height + y) * width + x];
  };

  it('shifts the map by where each of the nine anchors pins it', () =>
  {
    // Arrange: grow by two each way.
    const expected: Readonly<Record<ResizeAnchor, [ number, number ]>> = {
      'top-left': [ 0, 0 ],
      'top': [ 1, 0 ],
      'top-right': [ 2, 0 ],
      'left': [ 0, 1 ],
      'center': [ 1, 1 ],
      'right': [ 2, 1 ],
      'bottom-left': [ 0, 2 ],
      'bottom': [ 1, 2 ],
      'bottom-right': [ 2, 2 ],
    };

    // Act.
    const offsets = RESIZE_ANCHORS.map(anchor =>
    {
      const plan = planResize(source(), 5, 4, anchor);
      return [ anchor, [ plan.offsetX, plan.offsetY ] ];
    });

    // Assert.
    expect(Object.fromEntries(offsets))
      .toStrictEqual(expected);
  });

  it('carries every layer to the top-left of a bigger map and leaves the new cells empty', () =>
  {
    // Arrange.
    const plan = planResize(source(), 5, 4, 'top-left');

    // Act.
    const { data, width, height } = plan.tiles;
    const cells = [
      cellOf(data, width, height, 0, 0, 0),
      cellOf(data, width, height, 2, 1, 0),
      cellOf(data, width, height, 2, 1, 5),
      cellOf(data, width, height, 3, 0, 0),
      cellOf(data, width, height, 0, 2, 4),
    ];

    // Assert: layer 0 holds 1 to 6 and the region layer 31 to 36.
    expect([ width, height, data.length, cells ])
      .toStrictEqual([ 5, 4, 5 * 4 * 6, [ 1, 6, 36, 0, 0 ] ]);
  });

  it('moves the map and its events together into the corner it is pinned to', () =>
  {
    // Arrange.
    const plan = planResize(source(), 5, 4, 'bottom-right');

    // Act.
    const { data, width, height } = plan.tiles;
    const corner = [ cellOf(data, width, height, 2, 2, 0), cellOf(data, width, height, 4, 3, 0), cellOf(data, width, height, 0, 0, 0) ];

    // Assert.
    expect([ corner, plan.moved, plan.dropped ])
      .toStrictEqual([ [ 1, 6, 0 ], [ { id: 1, x: 2, y: 2 }, { id: 3, x: 4, y: 3 } ], [] ]);
  });

  it('cuts the far side when shrinking from the top-left, dropping the event left outside', () =>
  {
    // Arrange.
    const plan = planResize(source(), 2, 1, 'top-left');

    // Act.
    const layerZero = plan.tiles.data.slice(0, 2);
    const regions = plan.tiles.data.slice(10, 12);

    // Assert.
    expect([ layerZero, regions, plan.moved, plan.dropped ])
      .toStrictEqual([ [ 1, 2 ], [ 31, 32 ], [ { id: 1, x: 0, y: 0 } ], [ 3 ] ]);
  });

  it('cuts the near side when shrinking from the bottom-right, keeping the event that stays inside', () =>
  {
    // Arrange.
    const plan = planResize(source(), 2, 1, 'bottom-right');

    // Act.
    const layerZero = plan.tiles.data.slice(0, 2);

    // Assert.
    expect([ plan.offsetX, plan.offsetY, layerZero, plan.moved, plan.dropped ])
      .toStrictEqual([ -1, -1, [ 5, 6 ], [ { id: 3, x: 1, y: 0 } ], [ 1 ] ]);
  });

  it('sends the odd cell to the far side from the centre, growing and shrinking alike', () =>
  {
    // Arrange: grow by three across, shrink by one and by three down.
    const tall = { ...source(), height: 4, cells: new Array(3 * 4 * 6).fill(7) };

    // Act.
    const grown = planResize(source(), 6, 2, 'center');
    const shrunkByOne = planResize(source(), 3, 1, 'center');
    const shrunkByThree = planResize(tall, 3, 1, 'center');

    // Assert.
    expect([ grown.offsetX, shrunkByOne.offsetY, shrunkByThree.offsetY ])
      .toStrictEqual([ 1, 0, -1 ]);
  });

  it('refuses sizes a map cannot have', () =>
  {
    // Arrange.
    const sizes: [ number, number ][] = [ [ 0, 5 ], [ 5, 257 ], [ 2.5, 5 ] ];

    // Act.
    const attempts = sizes.map(([ width, height ]) => () => planResize(source(), width, height, 'center'));

    // Assert.
    attempts.forEach(attempt => expect(attempt)
      .toThrow('A map is 1 to 256 tiles on each side.'));
  });

  it('accepts the largest and smallest sizes', () =>
  {
    // Arrange: nothing beyond the fixture.

    // Act.
    const plans = [ planResize(source(), 256, 1, 'top-left'), planResize(source(), 1, 256, 'top-left') ];

    // Assert.
    expect(plans.map(plan => [ plan.tiles.width, plan.tiles.height, plan.tiles.data.length ]))
      .toStrictEqual([ [ 256, 1, 256 * 6 ], [ 1, 256, 256 * 6 ] ]);
  });
});
