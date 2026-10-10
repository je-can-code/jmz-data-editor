import { describe, expect, it } from 'vitest';
import {
  arrivalThrough,
  edgesAt,
  facingLeaving,
  insideArrival,
  outsideArrival,
  partnerStrip,
  stripCentredOn,
  stripFromDrag,
  stripMiddle,
  stripRect,
} from '../../../../src/mapEditor/core/transferPairs/pairShapes.ts';

/*
 * Where a transfer's ends stand and where they send the player, worked out the way the shipped maps do it, so a pair the
 * editor places reads like one Jeremy placed by hand. A survey of all 384 maps found the habits these follow:
 *
 * - a map's edge exit is one event spread along one edge, one tile deep, and its partner sits on the opposite edge of the
 *   other map, as long as it; each sends the player one tile in from the other's edge, at its middle, facing the way they
 *   walked (85% land one tile in, 76% at the middle, 368 of 370 face the way of travel);
 * - a strip is dragged along the edge the drag began on, and the pointer straying into the map never bends it; a drag
 *   beginning in a corner follows the edge the pointer moved along most;
 * - the other strip starts centred on its edge, and moves along it to centre on wherever the author clicks, never off it;
 * - a building is entered one tile north of the exit inside, and left one tile below the door outside.
 *
 * Each shape is pinned beside a near miss one tile or one edge away.
 */
describe('pairShapes', () =>
{
  const SIZE = { width: 40, height: 30 };

  describe('edgesAt', () =>
  {
    it('names the edge a tile lies on, both edges of a corner, and none inside the map', () =>
    {
      // Arrange: a tile on each edge, a corner, and a tile one in from the bottom edge.
      const cells = [ { x: 5, y: 0 }, { x: 5, y: 29 }, { x: 0, y: 5 }, { x: 39, y: 5 }, { x: 39, y: 29 }, { x: 5, y: 28 } ];

      // Act.
      const edges = cells.map(cell => edgesAt(cell, SIZE));

      // Assert.
      expect(edges)
        .toStrictEqual([ [ 'top' ], [ 'bottom' ], [ 'left' ], [ 'right' ], [ 'bottom', 'right' ], [] ]);
    });
  });

  describe('stripRect', () =>
  {
    it('lays a strip on its edge, one tile deep, its event on the top-left tile', () =>
    {
      // Arrange: the same strip on each edge.
      const strips = [ 'top', 'bottom', 'left', 'right' ] as const;

      // Act.
      const rects = strips.map(edge => stripRect({ edge, start: 30, length: 3 }, SIZE));

      // Assert.
      expect(rects)
        .toStrictEqual([
          { x: 30, y: 0, width: 3, height: 1 },
          { x: 30, y: 29, width: 3, height: 1 },
          { x: 0, y: 30, width: 1, height: 3 },
          { x: 39, y: 30, width: 1, height: 3 },
        ]);
    });
  });

  describe('stripFromDrag', () =>
  {
    it('runs a strip from where the drag began to the pointer, along the edge, whichever way it went', () =>
    {
      // Arrange: a drag rightwards and one leftwards along the bottom edge.
      const from = { x: 30, y: 29 };

      // Act.
      const rightwards = stripFromDrag(from, { x: 32, y: 29 }, SIZE);
      const leftwards = stripFromDrag(from, { x: 27, y: 29 }, SIZE);

      // Assert.
      expect([ rightwards, leftwards ])
        .toStrictEqual([ { edge: 'bottom', start: 30, length: 3 }, { edge: 'bottom', start: 27, length: 4 } ]);
    });

    it('keeps to the edge however far into the map the pointer strays, and stops at the map\'s side', () =>
    {
      // Arrange: a drag down the left edge with the pointer well inside the map, then one run past the map's foot.
      const from = { x: 0, y: 10 };

      // Act.
      const inside = stripFromDrag(from, { x: 12, y: 14 }, SIZE);
      const past = stripFromDrag(from, { x: 0, y: 45 }, SIZE);

      // Assert.
      expect([ inside, past ])
        .toStrictEqual([ { edge: 'left', start: 10, length: 5 }, { edge: 'left', start: 10, length: 20 } ]);
    });

    it('follows, from a corner, the edge the pointer moved along most, across the map while it has not moved', () =>
    {
      // Arrange: the top-left corner, dragged down, dragged across, and not dragged.
      const corner = { x: 0, y: 0 };

      // Act.
      const down = stripFromDrag(corner, { x: 1, y: 4 }, SIZE);
      const across = stripFromDrag(corner, { x: 4, y: 1 }, SIZE);
      const still = stripFromDrag(corner, corner, SIZE);

      // Assert.
      expect([ down, across, still ])
        .toStrictEqual([ { edge: 'left', start: 0, length: 5 }, { edge: 'top', start: 0, length: 5 }, { edge: 'top', start: 0, length: 1 } ]);
    });

    it('makes no strip from a drag beginning one tile in from the edge', () =>
    {
      // Arrange: one tile above the bottom edge.
      const from = { x: 30, y: 28 };

      // Act.
      const strip = stripFromDrag(from, { x: 32, y: 29 }, SIZE);

      // Assert.
      expect(strip)
        .toBeNull();
    });
  });

  describe('partnerStrip', () =>
  {
    it('puts the other end on the other map\'s opposite edge, as long, centred along it', () =>
    {
      // Arrange: a 3-tile strip on the bottom, and a 4-tile one on the left, against a 41 by 31 map.
      const other = { width: 41, height: 31 };

      // Act.
      const fromBottom = partnerStrip({ edge: 'bottom', start: 30, length: 3 }, other);
      const fromLeft = partnerStrip({ edge: 'left', start: 2, length: 4 }, other);

      // Assert: the earlier of two middles where the edge cannot centre it exactly.
      expect([ fromBottom, fromLeft ])
        .toStrictEqual([ { edge: 'top', start: 19, length: 3 }, { edge: 'right', start: 13, length: 4 } ]);
    });

    it('shortens the other end to the opposite edge when that edge is shorter than the strip', () =>
    {
      // Arrange: a 12-tile strip along the top, against a map 8 wide.
      const other = { width: 8, height: 20 };

      // Act.
      const partner = partnerStrip({ edge: 'top', start: 2, length: 12 }, other);

      // Assert.
      expect(partner)
        .toStrictEqual({ edge: 'bottom', start: 0, length: 8 });
    });
  });

  describe('stripCentredOn', () =>
  {
    it('moves a strip along its edge to centre on the tile clicked, wherever on the map it is', () =>
    {
      // Arrange: a 3-tile strip on the top edge, and a click well down the map.
      const strip = { edge: 'top' as const, start: 0, length: 3 };

      // Act.
      const moved = stripCentredOn(strip, { x: 20, y: 14 }, SIZE);

      // Assert.
      expect(moved)
        .toStrictEqual({ edge: 'top', start: 19, length: 3 });
    });

    it('keeps the strip on its edge near either end', () =>
    {
      // Arrange: a 4-tile strip on the right edge, clicked near the top and near the foot.
      const strip = { edge: 'right' as const, start: 10, length: 4 };

      // Act.
      const nearTop = stripCentredOn(strip, { x: 39, y: 1 }, SIZE);
      const nearFoot = stripCentredOn(strip, { x: 39, y: 29 }, SIZE);

      // Assert.
      expect([ nearTop, nearFoot ])
        .toStrictEqual([ { edge: 'right', start: 0, length: 4 }, { edge: 'right', start: 26, length: 4 } ]);
    });
  });

  describe('stripMiddle', () =>
  {
    it('finds the one middle tile of an odd strip, and the later of two of an even one', () =>
    {
      // Arrange: a 3-tile and a 4-tile strip from 30.
      const odd = { edge: 'top' as const, start: 30, length: 3 };
      const even = { edge: 'top' as const, start: 30, length: 4 };

      // Act.
      const middles = [ stripMiddle(odd), stripMiddle(even) ];

      // Assert.
      expect(middles)
        .toStrictEqual([ 31, 32 ]);
    });
  });

  describe('arrivalThrough', () =>
  {
    it('lands the player one tile in from the strip\'s edge, at its middle', () =>
    {
      // Arrange: a 3-tile strip from 3 on each edge.
      const edges = [ 'top', 'bottom', 'left', 'right' ] as const;

      // Act.
      const landings = edges.map(edge => arrivalThrough({ edge, start: 3, length: 3 }, SIZE));

      // Assert: as Map350's bottom strip lands on Map349 at 31, 1 from its top strip at 30, 0.
      expect(landings)
        .toStrictEqual([ { x: 4, y: 1 }, { x: 4, y: 28 }, { x: 1, y: 4 }, { x: 38, y: 4 } ]);
    });
  });

  describe('facingLeaving', () =>
  {
    it('faces the player the way they walked off the map', () =>
    {
      // Arrange: every edge.
      const edges = [ 'top', 'bottom', 'left', 'right' ] as const;

      // Act.
      const facings = edges.map(facingLeaving);

      // Assert: up, down, left and right, as RMMZ numbers them.
      expect(facings)
        .toStrictEqual([ 8, 2, 4, 6 ]);
    });
  });

  describe('insideArrival and outsideArrival', () =>
  {
    it('lands the player one tile north of the exit going in, and one tile below the door coming out', () =>
    {
      // Arrange: the door and the exit.
      const door = { x: 14, y: 6 };
      const exit = { x: 8, y: 15 };

      // Act.
      const inside = insideArrival(exit);
      const outside = outsideArrival(door);

      // Assert.
      expect([ inside, outside ])
        .toStrictEqual([ { x: 8, y: 14 }, { x: 14, y: 7 } ]);
    });
  });
});
