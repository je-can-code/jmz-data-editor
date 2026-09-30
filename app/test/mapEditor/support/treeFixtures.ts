import type { RmmzMapInfo } from '../../../src/mapEditor/core/model/rmmzTypes.ts';

/**
 * Builds one MapInfos row.
 * @param {number} id The map id.
 * @param {string} name Its name.
 * @param {number} order Its order number.
 * @param {number} parentId Its parent.
 * @param {Partial<RmmzMapInfo>} extra Anything else the row carries.
 * @returns {RmmzMapInfo} The row.
 */
const row = (id: number, name: string, order: number, parentId: number, extra: Partial<RmmzMapInfo> = {}): RmmzMapInfo =>
{
  return { id, expanded: false, name, order, parentId, scrollX: 0, scrollY: 0, ...extra };
};

/**
 * A small tree with the shapes that trip a careless model: a branch two deep, a sibling beside it, a second top-level
 * map, a free slot where a map was deleted, and rows carrying the fields MZ writes that the tree never touches
 * (an open branch, a fractional scroll position, the optional quick flag).
 *
 *   1 World
 *     2 Town
 *       3 Inn
 *     5 Cave
 *   6 Test
 *
 * @returns {(RmmzMapInfo | null)[]} The rows, index 0 null, slot 4 free.
 */
const buildTreeRows = (): (RmmzMapInfo | null)[] =>
{
  return [
    null,
    row(1, 'World', 1, 0, { expanded: true }),
    row(2, 'Town', 2, 1, { scrollX: 1200.4444444444443 }),
    row(3, 'Inn', 3, 2, { quick: true }),
    null,
    row(5, 'Cave', 4, 1),
    row(6, 'Test', 5, 0),
  ];
};

export { buildTreeRows, row };
