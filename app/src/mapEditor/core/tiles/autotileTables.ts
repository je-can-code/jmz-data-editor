/**
 * One quarter of a tile, as a column and row in half-tile units inside its kind's block on the sheet.
 */
type Quadrant = readonly [ qx: number, qy: number ];

/**
 * The four quarters an autotile shape draws, in the order top-left, top-right, bottom-left, bottom-right.
 */
type ShapeQuadrants = readonly [ Quadrant, Quadrant, Quadrant, Quadrant ];

/**
 * The 48 floor shapes: which quarters of a floor kind's 2x3-tile block each shape draws. Copied verbatim from
 * {@code Tilemap.FLOOR_AUTOTILE_TABLE} in {@code js/rmmz_core.js}, so the shapes these services store are exactly
 * the ones the game draws. Shape 47 is the palette's picture of the kind, which no map placement uses.
 */
const FLOOR_AUTOTILE_TABLE: readonly ShapeQuadrants[] = [
  [ [ 2, 4 ], [ 1, 4 ], [ 2, 3 ], [ 1, 3 ] ],
  [ [ 2, 0 ], [ 1, 4 ], [ 2, 3 ], [ 1, 3 ] ],
  [ [ 2, 4 ], [ 3, 0 ], [ 2, 3 ], [ 1, 3 ] ],
  [ [ 2, 0 ], [ 3, 0 ], [ 2, 3 ], [ 1, 3 ] ],
  [ [ 2, 4 ], [ 1, 4 ], [ 2, 3 ], [ 3, 1 ] ],
  [ [ 2, 0 ], [ 1, 4 ], [ 2, 3 ], [ 3, 1 ] ],
  [ [ 2, 4 ], [ 3, 0 ], [ 2, 3 ], [ 3, 1 ] ],
  [ [ 2, 0 ], [ 3, 0 ], [ 2, 3 ], [ 3, 1 ] ],
  [ [ 2, 4 ], [ 1, 4 ], [ 2, 1 ], [ 1, 3 ] ],
  [ [ 2, 0 ], [ 1, 4 ], [ 2, 1 ], [ 1, 3 ] ],
  [ [ 2, 4 ], [ 3, 0 ], [ 2, 1 ], [ 1, 3 ] ],
  [ [ 2, 0 ], [ 3, 0 ], [ 2, 1 ], [ 1, 3 ] ],
  [ [ 2, 4 ], [ 1, 4 ], [ 2, 1 ], [ 3, 1 ] ],
  [ [ 2, 0 ], [ 1, 4 ], [ 2, 1 ], [ 3, 1 ] ],
  [ [ 2, 4 ], [ 3, 0 ], [ 2, 1 ], [ 3, 1 ] ],
  [ [ 2, 0 ], [ 3, 0 ], [ 2, 1 ], [ 3, 1 ] ],
  [ [ 0, 4 ], [ 1, 4 ], [ 0, 3 ], [ 1, 3 ] ],
  [ [ 0, 4 ], [ 3, 0 ], [ 0, 3 ], [ 1, 3 ] ],
  [ [ 0, 4 ], [ 1, 4 ], [ 0, 3 ], [ 3, 1 ] ],
  [ [ 0, 4 ], [ 3, 0 ], [ 0, 3 ], [ 3, 1 ] ],
  [ [ 2, 2 ], [ 1, 2 ], [ 2, 3 ], [ 1, 3 ] ],
  [ [ 2, 2 ], [ 1, 2 ], [ 2, 3 ], [ 3, 1 ] ],
  [ [ 2, 2 ], [ 1, 2 ], [ 2, 1 ], [ 1, 3 ] ],
  [ [ 2, 2 ], [ 1, 2 ], [ 2, 1 ], [ 3, 1 ] ],
  [ [ 2, 4 ], [ 3, 4 ], [ 2, 3 ], [ 3, 3 ] ],
  [ [ 2, 4 ], [ 3, 4 ], [ 2, 1 ], [ 3, 3 ] ],
  [ [ 2, 0 ], [ 3, 4 ], [ 2, 3 ], [ 3, 3 ] ],
  [ [ 2, 0 ], [ 3, 4 ], [ 2, 1 ], [ 3, 3 ] ],
  [ [ 2, 4 ], [ 1, 4 ], [ 2, 5 ], [ 1, 5 ] ],
  [ [ 2, 0 ], [ 1, 4 ], [ 2, 5 ], [ 1, 5 ] ],
  [ [ 2, 4 ], [ 3, 0 ], [ 2, 5 ], [ 1, 5 ] ],
  [ [ 2, 0 ], [ 3, 0 ], [ 2, 5 ], [ 1, 5 ] ],
  [ [ 0, 4 ], [ 3, 4 ], [ 0, 3 ], [ 3, 3 ] ],
  [ [ 2, 2 ], [ 1, 2 ], [ 2, 5 ], [ 1, 5 ] ],
  [ [ 0, 2 ], [ 1, 2 ], [ 0, 3 ], [ 1, 3 ] ],
  [ [ 0, 2 ], [ 1, 2 ], [ 0, 3 ], [ 3, 1 ] ],
  [ [ 2, 2 ], [ 3, 2 ], [ 2, 3 ], [ 3, 3 ] ],
  [ [ 2, 2 ], [ 3, 2 ], [ 2, 1 ], [ 3, 3 ] ],
  [ [ 2, 4 ], [ 3, 4 ], [ 2, 5 ], [ 3, 5 ] ],
  [ [ 2, 0 ], [ 3, 4 ], [ 2, 5 ], [ 3, 5 ] ],
  [ [ 0, 4 ], [ 1, 4 ], [ 0, 5 ], [ 1, 5 ] ],
  [ [ 0, 4 ], [ 3, 0 ], [ 0, 5 ], [ 1, 5 ] ],
  [ [ 0, 2 ], [ 3, 2 ], [ 0, 3 ], [ 3, 3 ] ],
  [ [ 0, 2 ], [ 1, 2 ], [ 0, 5 ], [ 1, 5 ] ],
  [ [ 0, 4 ], [ 3, 4 ], [ 0, 5 ], [ 3, 5 ] ],
  [ [ 2, 2 ], [ 3, 2 ], [ 2, 5 ], [ 3, 5 ] ],
  [ [ 0, 2 ], [ 3, 2 ], [ 0, 5 ], [ 3, 5 ] ],
  [ [ 0, 0 ], [ 1, 0 ], [ 0, 1 ], [ 1, 1 ] ],
];

/**
 * The 16 wall shapes, used by roofs, building walls and wall sides. Copied verbatim from
 * {@code Tilemap.WALL_AUTOTILE_TABLE} in {@code js/rmmz_core.js}.
 */
const WALL_AUTOTILE_TABLE: readonly ShapeQuadrants[] = [
  [ [ 2, 2 ], [ 1, 2 ], [ 2, 1 ], [ 1, 1 ] ],
  [ [ 0, 2 ], [ 1, 2 ], [ 0, 1 ], [ 1, 1 ] ],
  [ [ 2, 0 ], [ 1, 0 ], [ 2, 1 ], [ 1, 1 ] ],
  [ [ 0, 0 ], [ 1, 0 ], [ 0, 1 ], [ 1, 1 ] ],
  [ [ 2, 2 ], [ 3, 2 ], [ 2, 1 ], [ 3, 1 ] ],
  [ [ 0, 2 ], [ 3, 2 ], [ 0, 1 ], [ 3, 1 ] ],
  [ [ 2, 0 ], [ 3, 0 ], [ 2, 1 ], [ 3, 1 ] ],
  [ [ 0, 0 ], [ 3, 0 ], [ 0, 1 ], [ 3, 1 ] ],
  [ [ 2, 2 ], [ 1, 2 ], [ 2, 3 ], [ 1, 3 ] ],
  [ [ 0, 2 ], [ 1, 2 ], [ 0, 3 ], [ 1, 3 ] ],
  [ [ 2, 0 ], [ 1, 0 ], [ 2, 3 ], [ 1, 3 ] ],
  [ [ 0, 0 ], [ 1, 0 ], [ 0, 3 ], [ 1, 3 ] ],
  [ [ 2, 2 ], [ 3, 2 ], [ 2, 3 ], [ 3, 3 ] ],
  [ [ 0, 2 ], [ 3, 2 ], [ 0, 3 ], [ 3, 3 ] ],
  [ [ 2, 0 ], [ 3, 0 ], [ 2, 3 ], [ 3, 3 ] ],
  [ [ 0, 0 ], [ 3, 0 ], [ 0, 3 ], [ 3, 3 ] ],
];

/**
 * The 4 waterfall shapes. Copied verbatim from {@code Tilemap.WATERFALL_AUTOTILE_TABLE} in {@code js/rmmz_core.js}.
 */
const WATERFALL_AUTOTILE_TABLE: readonly ShapeQuadrants[] = [
  [ [ 2, 0 ], [ 1, 0 ], [ 2, 1 ], [ 1, 1 ] ],
  [ [ 0, 0 ], [ 1, 0 ], [ 0, 1 ], [ 1, 1 ] ],
  [ [ 2, 0 ], [ 3, 0 ], [ 2, 1 ], [ 3, 1 ] ],
  [ [ 0, 0 ], [ 3, 0 ], [ 0, 1 ], [ 3, 1 ] ],
];

export { FLOOR_AUTOTILE_TABLE, WALL_AUTOTILE_TABLE, WATERFALL_AUTOTILE_TABLE };
export type { Quadrant, ShapeQuadrants };
