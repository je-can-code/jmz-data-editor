import {
  a2Column,
  autotileKind,
  isAutotile,
  isFloorTypeKind,
  isRoofKind,
  isWallTopKind,
  isWaterfallKind,
  makeAutotileId,
  TileId,
  tileSheet,
} from '../tiles/tileIds.ts';

/**
 * The palette's tabs, as MZ has them: every A sheet on one tab, a tab for each of B to E, and the regions.
 */
type PaletteTab = 'A' | 'B' | 'C' | 'D' | 'E' | 'R';

/**
 * The tabs in the order the palette shows them.
 */
const PALETTE_TABS: readonly PaletteTab[] = [ 'A', 'B', 'C', 'D', 'E', 'R' ];

/**
 * How many cells each palette row holds, as in MZ.
 */
const PALETTE_COLUMNS = 8;

/**
 * How many region ids there are: 0, which clears a cell's region, then 1 to 255.
 */
const REGION_COUNT = 256;

/**
 * One cell of the palette: what painting with it lays down, and the picture it shows.
 */
type PaletteCell = {
  /**
   * What a brush made from this cell carries: a tile id, with an autotile in its shape 0 (painting shapes it to
   * its neighbours), or a region id on the regions tab.
   */
  readonly id: number;

  /**
   * What the cell draws: the tile id of an autotile kind's ready-made tile (see {@link displayTileOf}), any other
   * tile as it is, or the region id on the regions tab.
   */
  readonly picture: number;
};

/**
 * Where one sheet's rows sit on a tab, so the palette can say which sheet a cell comes from.
 */
type PaletteSection = {
  readonly sheet: string;
  readonly firstRow: number;
  readonly rows: number;
};

/**
 * One tab laid out: rows of eight cells, row by row, and the sheet each run of rows comes from. A tab whose sheets
 * the tileset leaves empty has no rows.
 */
type PaletteLayout = {
  readonly tab: PaletteTab;
  readonly rows: number;
  readonly cells: readonly PaletteCell[];
  readonly sections: readonly PaletteSection[];
};

/**
 * A rectangle of palette cells: its top-left cell and its size, in cells.
 */
type PaletteRect = {
  readonly column: number;
  readonly row: number;
  readonly columns: number;
  readonly rows: number;
};

/**
 * Where a tile sits on the palette.
 */
type PalettePlace = {
  readonly tab: PaletteTab;
  readonly column: number;
  readonly row: number;
};

/**
 * One sheet the palette draws from: its name, where it sits among a tileset's nine sheet names (A1, A2, A3, A4, A5,
 * B, C, D, E), and the tile ids it puts on the palette, in order.
 */
type PaletteSheet = {
  readonly sheet: string;
  readonly nameIndex: number;
  readonly tiles: readonly number[];
};

/**
 * Lists the shape-0 tile ids of a run of autotile kinds.
 * @param {number} from The first kind.
 * @param {number} to The kind after the last.
 * @returns {number[]} One tile id per kind.
 */
const kindTiles = (from: number, to: number): number[] =>
{
  return Array.from({ length: to - from }, (_, index) => makeAutotileId(from + index, 0));
};

/**
 * Lists a run of plain tile ids.
 * @param {number} first The first id.
 * @param {number} count How many.
 * @returns {number[]} The ids.
 */
const idRun = (first: number, count: number): number[] =>
{
  return Array.from({ length: count }, (_, index) => first + index);
};

/**
 * The A sheets in the order the A tab stacks them. Their kinds already run in the order MZ lays them out: A1's
 * sixteen, A2's thirty-two, A3's roofs and building walls a row each in turn, A4's ceilings and wall faces a row each
 * in turn, then A5's plain tiles.
 */
const A_SHEETS: readonly PaletteSheet[] = [
  { sheet: 'A1', nameIndex: 0, tiles: kindTiles(0, 16) },
  { sheet: 'A2', nameIndex: 1, tiles: kindTiles(16, 48) },
  { sheet: 'A3', nameIndex: 2, tiles: kindTiles(48, 80) },
  { sheet: 'A4', nameIndex: 3, tiles: kindTiles(80, 128) },
  { sheet: 'A5', nameIndex: 4, tiles: idRun(TileId.A5, 128) },
];

/**
 * The upper sheets, one tab each. The palette shows a sheet's left half first and its right half beneath it, which is
 * exactly the order of its ids.
 */
const UPPER_SHEETS: Readonly<Record<'B' | 'C' | 'D' | 'E', PaletteSheet>> = {
  B: { sheet: 'B', nameIndex: 5, tiles: idRun(TileId.B, 256) },
  C: { sheet: 'C', nameIndex: 6, tiles: idRun(TileId.C, 256) },
  D: { sheet: 'D', nameIndex: 7, tiles: idRun(TileId.D, 256) },
  E: { sheet: 'E', nameIndex: 8, tiles: idRun(TileId.E, 256) },
};

/**
 * Picks the shape an autotile kind shows as on the palette, as MZ shows it: a floor kind (water, ground, a ceiling)
 * as the sample tile its block opens with (shape 47, which no map uses), a waterfall with both of its sides edged
 * (shape 3), and a roof or wall face edged all round (shape 15), so every kind reads as one piece standing alone.
 * @param {number} kind The autotile kind.
 * @returns {number} The shape.
 */
const displayShapeOf = (kind: number): number =>
{
  if (isFloorTypeKind(kind))
  {
    return 47;
  }

  return isWaterfallKind(kind)
    ? 3
    : 15;
};

/**
 * Finds the tile a palette cell draws for a tile: an autotile kind's ready-made tile, whatever shape it is given in,
 * and any other tile as it is.
 * @param {number} tileId The tile id.
 * @returns {number} The tile id to draw.
 */
const displayTileOf = (tileId: number): number =>
{
  if (isAutotile(tileId) === false)
  {
    return tileId;
  }

  const kind = autotileKind(tileId);
  return makeAutotileId(kind, displayShapeOf(kind));
};

/**
 * Reports whether a tileset names a sheet, which is what puts that sheet on the palette.
 * @param {readonly string[]} sheetNames The tileset's nine sheet names.
 * @param {number} nameIndex The sheet's place among them.
 * @returns {boolean} True when the name is not empty.
 */
const hasSheet = (sheetNames: readonly string[], nameIndex: number): boolean =>
{
  return (sheetNames[nameIndex] ?? '') !== '';
};

/**
 * Lists the sheets a tab draws from, for a tileset: the A sheets it names, in order, or the one upper sheet.
 * @param {PaletteTab} tab The tab; the regions tab draws from no sheet.
 * @param {readonly string[]} sheetNames The tileset's nine sheet names.
 * @returns {PaletteSheet[]} The sheets, empty when the tileset names none of them.
 */
const sheetsOnTab = (tab: PaletteTab, sheetNames: readonly string[]): PaletteSheet[] =>
{
  if (tab === 'R')
  {
    return [];
  }

  const candidates = tab === 'A'
    ? A_SHEETS
    : [ UPPER_SHEETS[tab] ];
  return candidates.filter(sheet => hasSheet(sheetNames, sheet.nameIndex));
};

/**
 * Reports whether a tab has anything to show for a tileset. The regions tab always does; a sheet tab does when the
 * tileset names one of its sheets.
 * @param {PaletteTab} tab The tab.
 * @param {readonly string[]} sheetNames The tileset's nine sheet names.
 * @returns {boolean} True when the tab can be chosen.
 */
const isTabAvailable = (tab: PaletteTab, sheetNames: readonly string[]): boolean =>
{
  return tab === 'R' || sheetsOnTab(tab, sheetNames).length > 0;
};

/**
 * Lays a tab out in rows of eight. The A tab stacks the A sheets the tileset names and leaves out the rest, so it
 * reads as rows of eight kinds: A1, then A2, then A3 and A4 with their top and side rows in turn, then A5. B to E
 * each show their 256 tiles, and the regions tab shows every region id, 0 first.
 * @param {PaletteTab} tab The tab.
 * @param {readonly string[]} sheetNames The tileset's nine sheet names.
 * @returns {PaletteLayout} The layout.
 */
const layoutPaletteTab = (tab: PaletteTab, sheetNames: readonly string[]): PaletteLayout =>
{
  if (tab === 'R')
  {
    const regions = idRun(0, REGION_COUNT);
    return {
      tab,
      rows: REGION_COUNT / PALETTE_COLUMNS,
      cells: regions.map(region => ({ id: region, picture: region })),
      sections: [ { sheet: 'R', firstRow: 0, rows: REGION_COUNT / PALETTE_COLUMNS } ],
    };
  }

  // every sheet fills whole rows, so each section starts where the one before it ends.
  const cells: PaletteCell[] = [];
  const sections: PaletteSection[] = [];
  sheetsOnTab(tab, sheetNames).forEach(({ sheet, tiles }) =>
  {
    sections.push({ sheet, firstRow: cells.length / PALETTE_COLUMNS, rows: tiles.length / PALETTE_COLUMNS });
    tiles.forEach(tileId => cells.push({ id: tileId, picture: displayTileOf(tileId) }));
  });

  return { tab, rows: cells.length / PALETTE_COLUMNS, cells, sections };
};

/**
 * Finds the cell at a column and row of a layout.
 * @param {PaletteLayout} layout The layout.
 * @param {number} column The column, 0 to 7.
 * @param {number} row The row.
 * @returns {PaletteCell | null} The cell, or null outside the layout.
 */
const cellAt = (layout: PaletteLayout, column: number, row: number): PaletteCell | null =>
{
  if (column < 0 || column >= PALETTE_COLUMNS || row < 0 || row >= layout.rows)
  {
    return null;
  }

  return layout.cells[row * PALETTE_COLUMNS + column];
};

/**
 * Finds the sheet a row of a layout comes from.
 * @param {PaletteLayout} layout The layout.
 * @param {number} row The row.
 * @returns {string} The sheet's name, such as A2, or an empty string outside the layout.
 */
const sheetOfRow = (layout: PaletteLayout, row: number): string =>
{
  const section = layout.sections.find(each => row >= each.firstRow && row < each.firstRow + each.rows);
  return section?.sheet ?? '';
};

/**
 * Builds the rectangle a drag across the palette covers, from where it started to where it is, clamped to the
 * layout, so dragging past the edge still selects up to it.
 * @param {PaletteLayout} layout The layout.
 * @param {{ column: number, row: number }} from Where the drag started.
 * @param {{ column: number, row: number }} to Where it is now.
 * @returns {PaletteRect} The rectangle, at least one cell; a layout with no rows gives an empty one.
 */
const rectBetween = (
  layout: PaletteLayout,
  from: { readonly column: number; readonly row: number },
  to: { readonly column: number; readonly row: number }): PaletteRect =>
{
  if (layout.rows === 0)
  {
    return { column: 0, row: 0, columns: 0, rows: 0 };
  }

  const clampColumn = (column: number) => Math.min(PALETTE_COLUMNS - 1, Math.max(0, column));
  const clampRow = (row: number) => Math.min(layout.rows - 1, Math.max(0, row));
  const left = clampColumn(Math.min(from.column, to.column));
  const right = clampColumn(Math.max(from.column, to.column));
  const top = clampRow(Math.min(from.row, to.row));
  const bottom = clampRow(Math.max(from.row, to.row));
  return { column: left, row: top, columns: right - left + 1, rows: bottom - top + 1 };
};

/**
 * Reads the ids a rectangle of the palette carries, row by row, which is what a brush made from it paints: its size
 * and values in the shape a brush holds them.
 * @param {PaletteLayout} layout The layout.
 * @param {PaletteRect} rect The rectangle; any part outside the layout is left out.
 * @returns {{ width: number, height: number, cells: number[] }} The rectangle's size in cells and its ids.
 */
const rectCells = (layout: PaletteLayout, rect: PaletteRect): { width: number; height: number; cells: number[] } =>
{
  // a rectangle with no cells carries nothing, wherever it sits.
  if (rect.columns < 1 || rect.rows < 1)
  {
    return { width: 0, height: 0, cells: [] };
  }

  const { column: left, row: top, columns, rows } = rectBetween(layout, { column: rect.column, row: rect.row }, {
    column: rect.column + rect.columns - 1,
    row: rect.row + rect.rows - 1,
  });
  const cells: number[] = [];
  for (let row = top; row < top + rows; row++)
  {
    for (let column = left; column < left + columns; column++)
    {
      cells.push(layout.cells[row * PALETTE_COLUMNS + column].id);
    }
  }

  return { width: columns, height: rows, cells };
};

/**
 * Finds where a tile sits on the palette of a tileset: an autotile by its kind, whatever its shape. The eyedropper and
 * the stack view use it to show a tile picked off the map.
 * @param {readonly string[]} sheetNames The tileset's nine sheet names.
 * @param {number} tileId The tile id.
 * @returns {PalettePlace | null} The tab, column and row, or null for a tile the tileset's palette does not show.
 */
const locateTile = (sheetNames: readonly string[], tileId: number): PalettePlace | null =>
{
  const sheet = tileSheet(tileId);
  if (sheet === 'none')
  {
    return tileId === 0 && hasSheet(sheetNames, UPPER_SHEETS.B.nameIndex)
      ? { tab: 'B', column: 0, row: 0 }
      : null;
  }

  // the tab the tile's sheet is on, and the id its cell carries there.
  const tab: PaletteTab = sheet.startsWith('A')
    ? 'A'
    : sheet as PaletteTab;
  const id = isAutotile(tileId)
    ? makeAutotileId(autotileKind(tileId), 0)
    : tileId;
  const index = layoutPaletteTab(tab, sheetNames).cells.findIndex(cell => cell.id === id);
  if (index < 0)
  {
    return null;
  }

  return { tab, column: index % PALETTE_COLUMNS, row: Math.floor(index / PALETTE_COLUMNS) };
};

/**
 * Names what an A1 kind is, by its place on the sheet.
 * @param {number} kind An A1 kind.
 * @returns {string} Ocean, deep sea, ocean decoration, water or waterfall.
 */
const a1Role = (kind: number): string =>
{
  if (kind === 0)
  {
    return 'ocean';
  }

  if (kind === 1)
  {
    return 'deep sea';
  }

  if (kind < 4)
  {
    return 'ocean decoration';
  }

  return isWaterfallKind(kind)
    ? 'waterfall'
    : 'water';
};

/**
 * Names what an autotile kind is: water and its kin on A1, ground or a decoration on A2, a roof or building wall on
 * A3, a ceiling or wall face on A4.
 * @param {number} kind The autotile kind.
 * @returns {string} The name.
 */
const autotileRole = (kind: number): string =>
{
  if (kind < 16)
  {
    return a1Role(kind);
  }

  if (kind < 48)
  {
    return a2Column(kind) < 4
      ? 'ground'
      : 'decoration';
  }

  if (kind < 80)
  {
    return isRoofKind(kind)
      ? 'roof'
      : 'building wall';
  }

  return isWallTopKind(kind)
    ? 'ceiling'
    : 'wall face';
};

/**
 * The first autotile kind on each A sheet, for numbering a kind within its sheet.
 */
const FIRST_KIND: Readonly<Record<'A1' | 'A2' | 'A3' | 'A4', number>> = { A1: 0, A2: 16, A3: 48, A4: 80 };

/**
 * Names a tile for people: its sheet, what it is, and its number on that sheet counting from 1, such as
 * "A2 ground 5", "A4 wall face 9", "A5 tile 12" or "B tile 124". The empty tile is "Empty".
 * @param {number} tileId The tile id.
 * @returns {string} The name.
 */
const describeTile = (tileId: number): string =>
{
  const sheet = tileSheet(tileId);
  if (sheet === 'none')
  {
    return tileId === 0
      ? 'Empty'
      : `Tile ${tileId}`;
  }

  if (isAutotile(tileId))
  {
    const kind = autotileKind(tileId);
    const first = FIRST_KIND[sheet as keyof typeof FIRST_KIND];
    return `${sheet} ${autotileRole(kind)} ${kind - first + 1}`;
  }

  const first = sheet === 'A5'
    ? TileId.A5
    : TileId[sheet as 'B' | 'C' | 'D' | 'E'];
  return `${sheet} tile ${tileId - first + 1}`;
};

export {
  cellAt,
  describeTile,
  displayShapeOf,
  displayTileOf,
  isTabAvailable,
  layoutPaletteTab,
  locateTile,
  PALETTE_COLUMNS,
  PALETTE_TABS,
  rectBetween,
  rectCells,
  REGION_COUNT,
  sheetOfRow,
  sheetsOnTab,
};
export type { PaletteCell, PaletteLayout, PalettePlace, PaletteRect, PaletteSection, PaletteSheet, PaletteTab };
