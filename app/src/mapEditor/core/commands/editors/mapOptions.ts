import type { RmmzMapInfo } from '../../model/rmmzTypes.ts';

/**
 * One map a map picker offers, in the order and depth the map tree shows it.
 */
type MapOption = {
  readonly id: number;
  readonly name: string;
  readonly depth: number;
};

/**
 * Lists the maps as the map tree shows them: each map under its parent, siblings by their order, so a picker
 * reads like the tree the author knows. A map whose parent is missing sits at the top, and a parent loop (which
 * MZ never writes) is cut rather than followed forever.
 * @param {readonly (RmmzMapInfo | null)[]} infos The map tree's rows, index 0 null.
 * @returns {MapOption[]} The maps, in tree order.
 */
const mapOptions = (infos: readonly (RmmzMapInfo | null)[]): MapOption[] =>
{
  const rows = infos.filter((info): info is RmmzMapInfo => info !== null);
  const ids = new Set(rows.map(row => row.id));
  const childrenOf = (parentId: number) => rows
    .filter(row => (ids.has(row.parentId) ? row.parentId : 0) === parentId && row.id !== parentId)
    .sort((left, right) => left.order - right.order || left.id - right.id);

  const listed = new Set<number>();
  const walk = (parentId: number, depth: number): MapOption[] => childrenOf(parentId).flatMap(row =>
  {
    if (listed.has(row.id))
    {
      return [];
    }

    listed.add(row.id);
    return [ { id: row.id, name: row.name, depth }, ...walk(row.id, depth + 1) ];
  });

  // maps caught in a parent loop never hang from the top, so they are listed after everything else.
  const tree = walk(0, 0);
  const stranded = rows
    .filter(row => listed.has(row.id) === false)
    .sort((left, right) => left.id - right.id)
    .map(row => ({ id: row.id, name: row.name, depth: 0 }));
  return [ ...tree, ...stranded ];
};

/**
 * Writes a map the way MZ lists maps: its id padded to three digits, then its name.
 * @param {number} id The map id.
 * @param {string} name The map's name, or empty.
 * @returns {string} The label.
 */
const mapLabel = (id: number, name: string): string =>
{
  return `${String(id).padStart(3, '0')} ${name}`.trim();
};

export { mapLabel, mapOptions };
export type { MapOption };
