import type { Graphics } from 'pixi.js';
import type { AreaOnMap } from '../../core/events/eventAreas.ts';
import type { EventFootprint, ExitWay } from '../../core/renderer/MapRenderer.ts';
import { MARKER_RADIUS, MARKER_SQUARE, MARKER_WORLD_SIZE } from './markerAtlas.ts';

/**
 * How strongly a footprint's band is washed with its marker's colour, and an exit strip's: faint, so the tiles beneath
 * read through, an exit's a little stronger, so the strip reads as one piece.
 */
const BAND_ALPHA = 0.2;
const EXIT_BAND_ALPHA = 0.3;

/**
 * The band's outline, in its marker's colour: how strong, and how wide in world pixels.
 */
const OUTLINE_ALPHA = 0.85;
const OUTLINE_WIDTH = 2;

/**
 * The chevrons an exit strip points with, one on every tile of it but the event's own, where its marker sits: white over
 * the band, a little see-through, so the strip reads as a way out without hiding the tiles.
 */
const CHEVRON_COLOUR = 0xffffff;
const CHEVRON_ALPHA = 0.7;

/**
 * A chevron's shape, as shares of its tile: half its height across the way it points, how far its tip runs ahead of its
 * arms' ends, and how thick each arm is along the way.
 */
const CHEVRON_HALF = 0.2;
const CHEVRON_DEPTH = 0.18;
const CHEVRON_THICKNESS = 0.11;

/**
 * The red a footprint cut at the map's edge is marked in, the red every failing landing is marked in, and how wide the
 * line along the cut is, in world pixels.
 */
const CUT_RED = 0xe53935;
const CUT_WIDTH = 4;

/**
 * How big the badge on a cut is, as a share of a tile: its radius, the size of a failing landing's badge.
 */
const BADGE_SHARE = 0.21;

/**
 * How far each way an exit can send the player turns a chevron pointing right, in radians, clockwise on screen.
 */
const WAY_TURNS: Readonly<Record<Exclude<ExitWay, 0>, number>> = {
  2: Math.PI / 2,
  4: Math.PI,
  6: 0,
  8: -Math.PI / 2,
};

/**
 * The band's edges, in world pixels.
 */
type BandEdges = {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
};

/**
 * Works out where a footprint's band lies, in world pixels: inset from its tiles as far as a marker's square is from its
 * tile, so the marker on the event's own tile sits in the band's corner and the two read as one, and running right up to
 * the map's edge wherever the map cuts it.
 * @param {AreaOnMap} onMap Where the area lies on the map.
 * @param {number} tileSize How big a tile is, in world pixels.
 * @returns {BandEdges} The band's edges.
 */
const bandEdges = (onMap: AreaOnMap, tileSize: number): BandEdges =>
{
  const inset = (tileSize - MARKER_WORLD_SIZE) / 2;
  return {
    left: onMap.x * tileSize + inset,
    top: onMap.y * tileSize + inset,
    right: (onMap.x + onMap.width) * tileSize - (onMap.pastRight > 0 ? 0 : inset),
    bottom: (onMap.y + onMap.height) * tileSize - (onMap.pastBottom > 0 ? 0 : inset),
  };
};

/**
 * Draws a footprint's band: its tiles washed faintly in its marker's colour and outlined in it, the corners rounded as
 * the marker's own are, except where the map's edge cuts it square.
 * @param {Graphics} graphics Where to draw.
 * @param {AreaOnMap} onMap Where the area lies on the map.
 * @param {EventFootprint} footprint How it looks.
 * @param {number} tileSize How big a tile is, in world pixels.
 */
const drawBand = (graphics: Graphics, onMap: AreaOnMap, footprint: EventFootprint, tileSize: number): void =>
{
  const { left, top, right, bottom } = bandEdges(onMap, tileSize);
  const corner = (MARKER_RADIUS * MARKER_WORLD_SIZE) / MARKER_SQUARE;
  const cutRight = onMap.pastRight > 0;
  const cutBottom = onMap.pastBottom > 0;
  const { colour } = footprint;
  graphics.roundShape([
    { x: left, y: top, radius: corner },
    { x: right, y: top, radius: cutRight ? 0 : corner },
    { x: right, y: bottom, radius: cutRight || cutBottom ? 0 : corner },
    { x: left, y: bottom, radius: cutBottom ? 0 : corner },
  ], corner)
    .fill({ color: colour, alpha: footprint.exit === null ? BAND_ALPHA : EXIT_BAND_ALPHA })
    .stroke({ color: colour, alpha: OUTLINE_ALPHA, width: OUTLINE_WIDTH });
};

/**
 * Draws one chevron in the middle of a tile, pointing the way an exit sends the player.
 * @param {Graphics} graphics Where to draw.
 * @param {number} centreX The tile's middle, across, in world pixels.
 * @param {number} centreY The tile's middle, down, in world pixels.
 * @param {Exclude<ExitWay, 0>} way The way it points.
 * @param {number} tileSize How big a tile is, in world pixels.
 */
const drawChevron = (graphics: Graphics, centreX: number, centreY: number, way: Exclude<ExitWay, 0>, tileSize: number): void =>
{
  const half = CHEVRON_HALF * tileSize;
  const depth = CHEVRON_DEPTH * tileSize;
  const thick = CHEVRON_THICKNESS * tileSize;

  // a chevron pointing right, centred on the origin: the outer edge from the upper arm's end to the tip and back down,
  // then the inner edge home.
  const back = -depth / 2;
  const pointing: readonly (readonly [ number, number ])[] = [
    [ back - thick / 2, -half ],
    [ back + thick / 2, -half ],
    [ depth / 2 + thick / 2, 0 ],
    [ back + thick / 2, half ],
    [ back - thick / 2, half ],
    [ depth / 2 - thick / 2, 0 ],
  ];

  // turned to the way it points, about the tile's middle.
  const turn = WAY_TURNS[way];
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const points = pointing.flatMap(([ x, y ]) => [ centreX + x * cos - y * sin, centreY + x * sin + y * cos ]);
  graphics.poly(points, true).fill({ color: CHEVRON_COLOUR, alpha: CHEVRON_ALPHA });
};

/**
 * Draws an exit strip's chevrons: one on every tile of the strip on the map but the event's own, pointing the way the
 * exit sends the player. An exit keeping the way the player faced points nowhere, and draws none.
 * @param {Graphics} graphics Where to draw.
 * @param {AreaOnMap} onMap Where the area lies on the map.
 * @param {ExitWay} way The way the exit sends the player.
 * @param {number} tileSize How big a tile is, in world pixels.
 */
const drawChevrons = (graphics: Graphics, onMap: AreaOnMap, way: ExitWay, tileSize: number): void =>
{
  if (way === 0)
  {
    return;
  }

  for (let row = onMap.y; row < onMap.y + onMap.height; row++)
  {
    for (let column = onMap.x; column < onMap.x + onMap.width; column++)
    {
      // the event's own tile holds its marker.
      if (column !== onMap.x || row !== onMap.y)
      {
        drawChevron(graphics, (column + 0.5) * tileSize, (row + 0.5) * tileSize, way, tileSize);
      }
    }
  }
};

/**
 * Marks where the map's edge cuts a footprint: a red line along the cut, and on it, straddling the edge, a red badge
 * holding an exclamation mark, as a failing landing's is.
 * @param {Graphics} graphics Where to draw.
 * @param {AreaOnMap} onMap Where the area lies on the map.
 * @param {number} tileSize How big a tile is, in world pixels.
 */
const drawCut = (graphics: Graphics, onMap: AreaOnMap, tileSize: number): void =>
{
  const { left, top, right, bottom } = bandEdges(onMap, tileSize);
  const cutRight = onMap.pastRight > 0;
  const cutBottom = onMap.pastBottom > 0;

  // the line runs just inside the map, along each edge that cuts the band.
  const line = { color: CUT_RED, width: CUT_WIDTH };
  if (cutRight)
  {
    graphics.moveTo(right - CUT_WIDTH / 2, top).lineTo(right - CUT_WIDTH / 2, bottom).stroke(line);
  }

  if (cutBottom)
  {
    graphics.moveTo(left, bottom - CUT_WIDTH / 2).lineTo(right, bottom - CUT_WIDTH / 2).stroke(line);
  }

  // the badge sits on the cut: the middle of a cut side, or the corner where both edges cut it.
  const centreX = cutRight ? right : (left + right) / 2;
  const centreY = cutBottom ? bottom : (top + bottom) / 2;
  const radius = tileSize * BADGE_SHARE;
  graphics.circle(centreX, centreY, radius).fill(CUT_RED).stroke({ color: 0xffffff, width: 1.5 });

  // the exclamation mark: a bar, then a dot beneath it.
  const bar = radius * 0.28;
  graphics.rect(centreX - bar / 2, centreY - radius * 0.62, bar, radius * 0.78).fill(0xffffff);
  graphics.circle(centreX, centreY + radius * 0.48, bar * 0.62).fill(0xffffff);
};

/**
 * Draws an event's footprint: the part of its area on the map, a band washed in its marker's colour and joined to the
 * marker in its corner; an exit's with chevrons pointing the way it sends the player; and wherever the map's edge cuts
 * it, the cut marked in red. The graphics are drawn afresh.
 * @param {Graphics} graphics Where to draw.
 * @param {AreaOnMap} onMap Where the area lies on the map, with some of it on the map.
 * @param {EventFootprint} footprint How it looks.
 * @param {number} tileSize How big a tile is, in world pixels.
 */
const drawFootprint = (graphics: Graphics, onMap: AreaOnMap, footprint: EventFootprint, tileSize: number): void =>
{
  graphics.clear();
  drawBand(graphics, onMap, footprint, tileSize);
  if (footprint.exit !== null)
  {
    drawChevrons(graphics, onMap, footprint.exit, tileSize);
  }

  if (onMap.pastRight > 0 || onMap.pastBottom > 0)
  {
    drawCut(graphics, onMap, tileSize);
  }
};

export { bandEdges, drawFootprint };
export type { BandEdges };
