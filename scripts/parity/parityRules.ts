/**
 * The parity check's rules, apart from the browser and the game so they can be tested: which views cover a map,
 * which maps are worth comparing at every animation step, what explains a difference in the events pass, and which
 * differences the engine predicts against snapshot.js.
 */
import type { CellDifference } from './compareImages.ts';
import type { ProbeEvent, ProbeMap } from './gameProbe.ts';

/**
 * The parts of a map file the check reads.
 */
type MapFile = {
  width: number;
  height: number;
  tilesetId: number;
  data: number[];
};

/**
 * The tile size.
 */
const TILE = 48;

/**
 * Reports whether a map holds animated A1 tiles: water, whose surface steps, or waterfalls.
 * @param {MapFile} map The map.
 * @returns {boolean} True when its animation steps are worth comparing.
 */
const animates = (map: MapFile): boolean =>
{
  const cells = map.width * map.height * 4;
  for (let index = 0; index < cells; index++)
  {
    const tileId = map.data[index];
    if (tileId >= 2048 && tileId < 2816)
    {
      // kinds 2 and 3 are the still sea decorations; every other A1 kind moves.
      const kind = Math.floor((tileId - 2048) / 48);
      if (kind !== 2 && kind !== 3)
      {
        return true;
      }
    }
  }

  return false;
};

/**
 * Lists display positions whose screens together cover a whole map along one axis, as the engine would allow them:
 * nothing past the far edge, where Game_Map#setDisplayPos would clamp.
 * @param {number} size The map's size along the axis, in tiles.
 * @param {number} screen The screen's size along it, in tiles.
 * @returns {number[]} The positions.
 */
const coverAxis = (size: number, screen: number): number[] =>
{
  const end = size - screen;
  if (end <= 0)
  {
    return [ 0 ];
  }

  const positions: number[] = [];
  for (let position = 0; position < end; position += screen)
  {
    positions.push(position);
  }

  positions.push(end);
  return positions;
};

/**
 * Builds what the probe draws for one map: views covering all of it, at every animation step when it animates.
 * @param {number} mapId The map.
 * @param {MapFile} map Its file.
 * @param {{ width: number, height: number }} screen The game's screen, in pixels.
 * @returns {ProbeMap} The probe's orders.
 */
const probeMapFor = (mapId: number, map: MapFile, screen: { width: number; height: number }): ProbeMap =>
{
  const xs = coverAxis(map.width, screen.width / TILE);
  const ys = coverAxis(map.height, screen.height / TILE);
  const views = xs.flatMap(x => ys.map(y => ({ x, y })));
  return { mapId, views, steps: animates(map) ? [ 0, 1, 2, 3 ] : [ 0 ] };
};

/**
 * Reports whether an event's sprite covers a cell: its footprint standing bottom-centre on its own cell, 6 pixels up
 * as a character stands, widened by a margin.
 * @param {ProbeEvent} event The event.
 * @param {{ x: number, y: number }} cell The cell.
 * @param {number} margin How many cells to widen the footprint by on every side.
 * @returns {boolean} True when it covers the cell.
 */
const spriteCovers = (event: ProbeEvent, cell: { x: number; y: number }, margin: number): boolean =>
{
  const centre = event.x * TILE + TILE / 2;
  const bottom = event.y * TILE + TILE - 6;
  const left = Math.floor((centre - event.width / 2) / TILE) - margin;
  const right = Math.floor((centre + event.width / 2 - 1) / TILE) + margin;
  const top = Math.floor((bottom - event.height) / TILE) - margin;
  return cell.x >= left && cell.x <= right && cell.y >= top && cell.y <= event.y + margin;
};

/**
 * Explains a differing cell of the events pass by an event around it that the game draws differently from a plain
 * drawing of its first page, which is what the editor draws. A cell under a plainly drawn event stays unexplained
 * however much its neighbours move: a difference there would be the editor's own.
 * @param {CellDifference} cell The cell.
 * @param {readonly ProbeEvent[]} events The game's events on the map.
 * @returns {string | null} Why it differs, or null when nothing explains it.
 */
const explainCell = (cell: CellDifference, events: readonly ProbeEvent[]): string | null =>
{
  const departs = (event: ProbeEvent): boolean => event.visible === false || event.departures.length > 0;
  if (events.some(event => departs(event) === false && spriteCovers(event, cell, 0)))
  {
    return null;
  }

  // what hangs off a departing sprite (gauges, a squash) reaches a cell further.
  const departing = events.find(event => departs(event) && spriteCovers(event, cell, 1));
  if (departing === undefined)
  {
    return null;
  }

  return departing.visible
    ? `event ${departing.id} ${departing.departures.join(', ')}`
    : `event ${departing.id} is hidden in the game`;
};

/**
 * Lists the cells where the engine predicts snapshot.js to draw differently: a star tile under a later non-star tile,
 * which the engine draws last, and a table or the cell under one, whose legs and edge snapshot.js leaves out.
 * @param {MapFile} map The map.
 * @param {readonly number[]} flags The tileset's flags.
 * @returns {Map<string, string>} The reason, by "x,y".
 */
const snapshotPredictions = (map: MapFile, flags: readonly number[]): Map<string, string> =>
{
  const { width, height, data } = map;
  const read = (x: number, y: number, z: number): number => (x < 0 || y < 0 || x >= width || y >= height ? 0 : data[(z * height + y) * width + x] ?? 0);
  const isStar = (id: number): boolean => id > 0 && ((flags[id] ?? 0) & 0x10) !== 0;
  const isTable = (id: number): boolean => id >= 2816 && id < 4352 && ((flags[id] ?? 0) & 0x80) !== 0;
  const predicted = new Map<string, string>();
  for (let y = 0; y < height; y++)
  {
    for (let x = 0; x < width; x++)
    {
      const ids = [ 0, 1, 2, 3 ].map(z => read(x, y, z));
      if (ids.some((id, index) => isStar(id) && ids.slice(index + 1).some(above => above > 0 && isStar(above) === false)))
      {
        predicted.set(`${x},${y}`, 'star tile drawn above a later layer');
      }

      if (ids.some(isTable) || (isTable(read(x, y - 1, 1)) && isTable(ids[1]) === false))
      {
        predicted.set(`${x},${y}`, 'table legs or edge');
      }
    }
  }

  return predicted;
};

export { animates, coverAxis, explainCell, probeMapFor, snapshotPredictions, spriteCovers, TILE };
export type { MapFile };
