import type { RouteWalk, WalkStep } from '../../core/moveRoutes/routeWalk.ts';
import type { MapCell, WorldPoint } from '../../core/renderer/camera.ts';
import type { OverlayPainter, OverlayStyle } from '../../core/renderer/MapRenderer.ts';

/**
 * The colours a route draws in: its path, a wall that stops it, and a step it can only guess.
 */
const RouteColour = {
  path: 0xffb74d,
  stopped: 0xef5350,
  guess: 0xffd54f,
} as const;

/**
 * How the path's lines are drawn, in world pixels, so they thicken as the map is zoomed in.
 */
const PATH: OverlayStyle = { stroke: RouteColour.path, strokeAlpha: 0.95, strokeWidth: 4 };

/**
 * How the cross over a stopping wall is drawn.
 */
const STOPPED: OverlayStyle = { stroke: RouteColour.stopped, strokeWidth: 4 };

/**
 * How many short lines draw a leap's arc.
 */
const ARC_SEGMENTS = 8;

/**
 * Finds a tile's middle, in world pixels.
 * @param {MapCell} cell The tile.
 * @param {number} tileSize The tile size.
 * @returns {WorldPoint} The middle.
 */
const middleOf = (cell: MapCell, tileSize: number): WorldPoint =>
{
  return { x: (cell.x + 0.5) * tileSize, y: (cell.y + 0.5) * tileSize };
};

/**
 * Draws an arrowhead at the end of a line, pointing along it.
 * @param {OverlayPainter} painter Where to draw.
 * @param {WorldPoint} from Where the line comes from.
 * @param {WorldPoint} to Where it ends, at the arrow's tip.
 * @param {number} tileSize The tile size.
 */
const arrowhead = (painter: OverlayPainter, from: WorldPoint, to: WorldPoint, tileSize: number): void =>
{
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const length = tileSize * 0.22;
  [ angle + Math.PI * 0.8, angle - Math.PI * 0.8 ].forEach(wing =>
  {
    painter.line(to.x, to.y, to.x + Math.cos(wing) * length, to.y + Math.sin(wing) * length, PATH);
  });
};

/**
 * Draws a leap as an arc of short lines rising between where it starts and where it lands, higher for a longer leap,
 * with an arrowhead where it lands.
 * @param {OverlayPainter} painter Where to draw.
 * @param {WorldPoint} from Where the leap starts.
 * @param {WorldPoint} to Where it lands.
 * @param {number} tileSize The tile size.
 */
const drawLeap = (painter: OverlayPainter, from: WorldPoint, to: WorldPoint, tileSize: number): void =>
{
  const rise = tileSize * 0.4 + Math.hypot(to.x - from.x, to.y - from.y) * 0.25;
  let previous = from;
  for (let segment = 1; segment <= ARC_SEGMENTS; segment++)
  {
    const along = segment / ARC_SEGMENTS;
    const point = { x: from.x + (to.x - from.x) * along, y: from.y + (to.y - from.y) * along - Math.sin(Math.PI * along) * rise };

    // the last short line points the arrow the way the leap comes down.
    if (segment === ARC_SEGMENTS)
    {
      arrowhead(painter, previous, point, tileSize);
    }

    painter.line(previous.x, previous.y, point.x, point.y, PATH);
    previous = point;
  }
};

/**
 * Draws a cross over a tile, for the wall that kept a step out of it.
 * @param {OverlayPainter} painter Where to draw.
 * @param {MapCell} cell The tile.
 * @param {number} tileSize The tile size.
 */
const drawStopped = (painter: OverlayPainter, cell: MapCell, tileSize: number): void =>
{
  const { x, y } = middleOf(cell, tileSize);
  const reach = tileSize * 0.3;
  painter.line(x - reach, y - reach, x + reach, y + reach, STOPPED);
  painter.line(x - reach, y + reach, x + reach, y - reach, STOPPED);
};

/**
 * Draws one step of a walk: a line with an arrowhead for a step to the next tile, an arc for a leap, a cross on the
 * tile a wall kept the walker out of, and a question mark above a step that turns on the dice or the player. Turns,
 * waits and settings draw nothing, and neither does a step that wraps around a looping map, which would otherwise
 * draw a line across the whole of it.
 * @param {OverlayPainter} painter Where to draw.
 * @param {WalkStep} step The step.
 * @param {number} tileSize The tile size.
 */
const drawStep = (painter: OverlayPainter, step: WalkStep, tileSize: number): void =>
{
  const from = middleOf(step.from, tileSize);
  const to = middleOf(step.to, tileSize);
  if (step.blocked !== null)
  {
    drawStopped(painter, step.blocked, tileSize);
    return;
  }

  switch (step.kind)
  {
    case 'jump':
      drawLeap(painter, from, to, tileSize);
      return;
    case 'guess':
      painter.text(from.x - tileSize * 0.08, from.y - tileSize * 0.7, '?', { fill: RouteColour.guess });
      return;
    case 'move':
    {
      const neighbour = Math.abs(step.to.x - step.from.x) <= 1 && Math.abs(step.to.y - step.from.y) <= 1;
      if (neighbour)
      {
        painter.line(from.x, from.y, to.x, to.y, PATH);
        arrowhead(painter, from, to, tileSize);
      }

      return;
    }
    default:
      return;
  }
};

/**
 * Draws a route's walk over the map: every step it takes, in order, then a ring where it ends, so a route that comes
 * back across itself still shows where it stops. A walk that takes no steps draws nothing at all.
 * @param {OverlayPainter} painter Where to draw.
 * @param {RouteWalk} walk The walk.
 * @param {number} tileSize The tile size.
 */
const drawRouteWalk = (painter: OverlayPainter, walk: RouteWalk, tileSize: number): void =>
{
  if (walk.steps.length === 0)
  {
    return;
  }

  walk.steps.forEach(step => drawStep(painter, step, tileSize));
  const end = middleOf(walk.end, tileSize);
  painter.circle(end.x, end.y, tileSize * 0.18, { stroke: RouteColour.path, strokeWidth: 3 });
};

export { drawRouteWalk, RouteColour };
