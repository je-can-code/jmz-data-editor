import { NO_IMAGE } from '../events/eventDragPreview.ts';
import { blockedCells, isOnMap } from '../events/eventPlacement.ts';
import type { MapCell } from '../renderer/camera.ts';
import type { CellRect, GhostEvent, GhostTile } from '../renderer/MapRenderer.ts';
import type { Shaping } from '../tiles/layering.ts';
import { clipGhosts } from '../tools/tileClip.ts';
import type { Stamp, StampTiles } from './stamp.ts';
import type { StampTarget } from './stampPlacement.ts';

/**
 * What the map shows under the pointer while the stamp tool is in hand: the stamp's footprint, its tiles and events
 * where a click would put them, the tiles a click is refused on because another event holds them, and a few words.
 */
type StampPreview = {
  readonly hover: CellRect;
  readonly ghostTiles: readonly GhostTile[];
  readonly ghostEvents: readonly GhostEvent[];
  readonly blockedCells: readonly MapCell[];
  readonly label: string;
};

/**
 * Lists the ghosts of a stamp's tiles on the tile layers, where they would land, as copied: what falls past the map's
 * edge, empty cells and the shadow and region layers show nothing.
 * @param {StampTarget} map The map, for its size.
 * @param {Stamp} stamp The stamp, which holds tiles.
 * @param {MapCell} at Where its corner would land.
 * @returns {GhostTile[]} The ghosts, bottom layer first.
 */
const tileGhosts = (map: StampTarget, stamp: Stamp, at: MapCell): GhostTile[] =>
{
  const { layers, values } = stamp.tiles as StampTiles;
  const source = { x: stamp.origin.x, y: stamp.origin.y, width: stamp.width, height: stamp.height };
  return clipGhosts({ source, layers, values }, at, map);
};

/**
 * Words what a click would do, beside the stamp's footprint.
 * @param {number} blocked How many tiles another event holds where the stamp's events would land.
 * @param {boolean} tilesLeftOut Whether the stamp's tiles belong to another tileset.
 * @param {number} events How many of the stamp's events land on the map.
 * @param {Shaping} shaping Whether the tiles go down exactly as copied.
 * @returns {string} The words.
 */
const previewLabel = (blocked: number, tilesLeftOut: boolean, events: number, shaping: Shaping): string =>
{
  if (blocked > 0)
  {
    return 'Another event is in the way';
  }

  if (tilesLeftOut)
  {
    return events === 0 ? 'Another tileset: nothing to place' : 'Another tileset: events only';
  }

  return shaping === 'exact' ? 'Stamp (exact)' : 'Stamp';
};

/**
 * Previews a stamp with its top-left corner on the cell under the pointer: its footprint, which may hang past the map's
 * edge; its tiles as copied, unless they belong to another tileset; its events, each looking as its first page does,
 * leaving out any that would land past the edge; and in red the tiles where another event already stands, which would
 * refuse the click. Each ghost event names no event on this map, so one drawing no picture shows its tile outlined.
 * @param {StampTarget} map The map, as it stands.
 * @param {Stamp} stamp The stamp.
 * @param {MapCell} at Where its corner would land.
 * @param {Shaping} shaping Whether the tiles would go down exactly as copied (Shift held).
 * @returns {StampPreview} The preview.
 */
const previewStamp = (map: StampTarget, stamp: Stamp, at: MapCell, shaping: Shaping): StampPreview =>
{
  const tilesFit = stamp.tiles !== null && stamp.tilesetId === map.tilesetId;
  const ghostEvents: GhostEvent[] = [];
  stamp.events.forEach(event =>
  {
    // each ghost keeps its page's own picture object, so a ghost moved to the next tile is moved, not drawn afresh.
    const x = at.x + event.x;
    const y = at.y + event.y;
    const [ page ] = event.pages;
    if (isOnMap({ x, y }, map))
    {
      ghostEvents.push(page === undefined
        ? { x, y, image: NO_IMAGE, priorityType: 0 }
        : { x, y, image: page.image, priorityType: page.priorityType });
    }
  });

  const blocked = blockedCells(map, ghostEvents, new Set());
  return {
    hover: { x: at.x, y: at.y, width: stamp.width, height: stamp.height },
    ghostTiles: tilesFit ? tileGhosts(map, stamp, at) : [],
    ghostEvents,
    blockedCells: blocked,
    label: previewLabel(blocked.length, stamp.tiles !== null && tilesFit === false, ghostEvents.length, shaping),
  };
};

export { previewStamp };
export type { StampPreview };
