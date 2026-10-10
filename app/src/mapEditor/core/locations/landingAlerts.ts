import type { TransferSpot } from '../eventKinds/transferKind.ts';
import type { OverlayDefinition, OverlayPainter } from '../renderer/MapRenderer.ts';
import { landingWords, type LandingProblem } from './landingCheck.ts';
import type { MapLocation } from './LocationPicks.ts';
import type { TransferLandings } from './TransferLandings.ts';

/**
 * The red every mark of a failing landing is drawn in.
 */
const ALERT_RED = 0xe53935;

/**
 * How big a failing landing's badge is, as a share of its tile: its radius.
 */
const BADGE_SHARE = 0.21;

/**
 * Draws the mark of a transfer whose landing fails, on the tile it leaves from: a red frame round the tile, and in its top
 * right corner a red badge holding an exclamation mark, over the event's marker or its picture alike.
 * @param {OverlayPainter} painter Draws in world pixels.
 * @param {number} x The tile's column.
 * @param {number} y The tile's row.
 * @param {number} tileSize How big a tile is, in world pixels.
 */
const drawLandingAlert = (painter: OverlayPainter, x: number, y: number, tileSize: number): void =>
{
  const left = x * tileSize;
  const top = y * tileSize;
  painter.rect(left + 2, top + 2, tileSize - 4, tileSize - 4, { stroke: ALERT_RED, strokeWidth: 3 });

  // the badge sits inside the corner, so a neighbour's mark never covers it.
  const radius = tileSize * BADGE_SHARE;
  const centreX = left + tileSize - radius - 1;
  const centreY = top + radius + 1;
  painter.circle(centreX, centreY, radius, { fill: ALERT_RED, stroke: 0xffffff, strokeWidth: 1.5 });

  // the exclamation mark: a bar, then a dot beneath it.
  const bar = radius * 0.28;
  painter.rect(centreX - bar / 2, centreY - radius * 0.62, bar, radius * 0.78, { fill: 0xffffff });
  painter.circle(centreX, centreY + radius * 0.48, bar * 0.62, { fill: 0xffffff });
};

/**
 * The overlay marking, on every map, the transfers whose landings fail, once each however many of an event's transfers
 * fail. It draws what the landings know when it draws; a map view draws it again whenever they hear more.
 * @param {TransferLandings} landings The window's landings.
 * @returns {OverlayDefinition} The overlay, on from the start.
 */
const landingAlertsOverlay = (landings: TransferLandings): OverlayDefinition =>
{
  return {
    id: 'core.landings',
    title: 'Landings',
    defaultOn: true,
    draw: (painter, context) =>
    {
      const marked = new Set<number>();
      landings.failingOn(context.document).forEach(failing =>
      {
        if (marked.has(failing.eventId) === false)
        {
          marked.add(failing.eventId);
          drawLandingAlert(painter, failing.x, failing.y, context.tileSize);
        }
      });
    },
  };
};

/**
 * Says where a transfer lands and why the player cannot land there, for its quick panel.
 * @param {MapLocation} location Where it lands.
 * @param {LandingProblem} problem Why the player cannot.
 * @returns {string} The words.
 */
const transferLandingWords = (location: MapLocation, problem: LandingProblem): string =>
{
  const { mapId, x, y } = location;
  switch (problem.kind)
  {
    case 'no-map':
      return `Lands on Map ${mapId}, which does not exist.`;
    case 'off-map':
      return `Lands on ${x}, ${y}, off the edge of Map ${mapId}, which is ${problem.width} by ${problem.height} tiles.`;
    default:
      return `Lands on ${x}, ${y} of Map ${mapId}, where the player cannot stand. ${landingWords(problem)}`;
  }
};

/**
 * One line a transfer's quick panel shows for a landing that fails: which transfer, when that needs saying, and why.
 */
type LandingLine = {
  readonly key: string;
  readonly text: string;
};

/**
 * Lists what a transfer's quick panel says about the landings of the events it shows: one line for each transfer whose
 * landing fails, naming its page when its event has more than one transfer, and its event when the panel shows several.
 * Landings on maps still being read say nothing until they land.
 * @param {TransferLandings} landings The window's landings.
 * @param {readonly { id: number, name: string, transfers: readonly TransferSpot[] }[]} events The events shown, with their
 * transfers.
 * @returns {LandingLine[]} The lines, in event and page order.
 */
const landingLines = (
  landings: TransferLandings,
  events: readonly { readonly id: number; readonly name: string; readonly transfers: readonly TransferSpot[] }[]): LandingLine[] =>
{
  const severalEvents = events.length > 1;
  return events.flatMap(event =>
  {
    const severalTransfers = event.transfers.length > 1;
    return event.transfers.flatMap(spot =>
    {
      const { mapId, x, y } = spot.model;
      const location = { mapId, x, y };
      const problem = landings.problemOf(location);
      if (problem === undefined || problem === null)
      {
        return [];
      }

      // which transfer it is, when the panel shows more than one: its event, then its page.
      const name = event.name === '' ? `Event ${event.id}` : event.name;
      const which = [ ...(severalEvents ? [ name ] : []), ...(severalTransfers ? [ `Page ${spot.pageIndex + 1}` ] : []) ];
      const lead = which.length === 0 ? '' : `${which.join(', ')}: `;
      return [ { key: `${event.id}:${spot.pageIndex}`, text: `${lead}${transferLandingWords(location, problem)}` } ];
    });
  });
};

export { drawLandingAlert, landingAlertsOverlay, landingLines, transferLandingWords };
export type { LandingLine };
