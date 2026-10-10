import { describe, expect, it } from 'vitest';
import type { TransferSpot } from '../../../../src/mapEditor/core/eventKinds/transferKind.ts';
import type { LandingProblem } from '../../../../src/mapEditor/core/locations/landingCheck.ts';
import {
  drawLandingAlert,
  landingAlertsOverlay,
  landingLines,
  transferLandingWords,
} from '../../../../src/mapEditor/core/locations/landingAlerts.ts';
import type { MapLocation } from '../../../../src/mapEditor/core/locations/LocationPicks.ts';
import type { FailingLanding, TransferLandings } from '../../../../src/mapEditor/core/locations/TransferLandings.ts';
import type { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { OverlayPainter, OverlayStyle } from '../../../../src/mapEditor/core/renderer/MapRenderer.ts';

/*
 * A transfer whose landing fails is marked on the map it leaves from, over its marker or its picture alike, once however
 * many of its transfers fail, and its quick panel says, for each failing transfer, where it lands, naming the map as the
 * map tree shows it, and why the player cannot stand there: naming the transfer's page when its event has several, and
 * the event when the panel shows several. A landing still being judged, or one that is fine, says nothing.
 */

/**
 * Records every shape a painter is asked for, as the kind of shape, its numbers and its style.
 */
class RecordingPainter implements OverlayPainter
{
  shapes: [ string, number[], OverlayStyle ][] = [];

  circle(x: number, y: number, radius: number, style: OverlayStyle): void
  {
    this.shapes.push([ 'circle', [ x, y, radius ], style ]);
  }

  rect(x: number, y: number, width: number, height: number, style: OverlayStyle): void
  {
    this.shapes.push([ 'rect', [ x, y, width, height ], style ]);
  }

  line(x1: number, y1: number, x2: number, y2: number, style: OverlayStyle): void
  {
    this.shapes.push([ 'line', [ x1, y1, x2, y2 ], style ]);
  }

  text(x: number, y: number, text: string, style: OverlayStyle): void
  {
    this.shapes.push([ `text ${text}`, [ x, y ], style ]);
  }
}

/**
 * Builds a transfer on a page, sending the player to a place.
 * @param {number} pageIndex The page.
 * @param {MapLocation} location Where it sends the player.
 * @returns {TransferSpot} The transfer.
 */
const spotOn = (pageIndex: number, location: MapLocation): TransferSpot =>
{
  return { pageIndex, listIndex: 1, model: { designation: 0, ...location, direction: 2, fade: 0 } } as TransferSpot;
};

/**
 * Builds landings answering from a table of problems, by {@code "mapId x y"}: undefined for a landing not in it, as one
 * still being judged.
 * @param {Readonly<Record<string, LandingProblem | null>>} problems The problems.
 * @param {FailingLanding[]} failing What a map's failing transfers are.
 * @returns {TransferLandings} The landings.
 */
const landingsOf = (problems: Readonly<Record<string, LandingProblem | null>>, failing: FailingLanding[] = []): TransferLandings =>
{
  return {
    problemOf: (location: MapLocation) => problems[`${location.mapId} ${location.x} ${location.y}`],
    failingOn: () => failing,
  } as unknown as TransferLandings;
};

describe('drawLandingAlert', () =>
{
  it('frames the tile in red and puts a red badge holding an exclamation mark in its top right corner', () =>
  {
    // Arrange.
    const painter = new RecordingPainter();

    // Act: the tile at 2, 1, at the game's tile size.
    drawLandingAlert(painter, 2, 1, 48);

    // Assert: a frame inside the tile, a disc in its corner, and the mark's bar and dot.
    const red = 0xe53935;
    const [ frame, badge, bar, dot ] = painter.shapes;
    expect([ painter.shapes.length, frame, badge[0], badge[2], bar[0], bar[2], dot[0], dot[2] ])
      .toStrictEqual([
        4,
        [ 'rect', [ 98, 50, 44, 44 ], { stroke: red, strokeWidth: 3 } ],
        'circle',
        { fill: red, stroke: 0xffffff, strokeWidth: 1.5 },
        'rect',
        { fill: 0xffffff },
        'circle',
        { fill: 0xffffff },
      ]);
  });

  it('puts the badge in the tile\'s top right corner, inside the tile', () =>
  {
    // Arrange.
    const painter = new RecordingPainter();

    // Act.
    drawLandingAlert(painter, 2, 1, 48);

    // Assert: the badge's disc lies wholly within the tile from 96, 48 to 144, 96.
    const [ , [ , [ x, y, radius ] ] ] = painter.shapes;
    expect([ x + radius <= 144, y - radius >= 48, x - radius > 120, y + radius < 72 ])
      .toStrictEqual([ true, true, true, true ]);
  });
});

describe('landingAlertsOverlay', () =>
{
  it('marks each event whose landings fail once, however many of its transfers fail, where it stands', () =>
  {
    // Arrange: event 2 at 2, 1 with two failing transfers, and event 4 at 0, 0 with one.
    const failing: FailingLanding[] = [
      { eventId: 2, x: 2, y: 1, spot: spotOn(0, { mapId: 5, x: 1, y: 0 }), problem: { kind: 'blocked' } },
      { eventId: 2, x: 2, y: 1, spot: spotOn(1, { mapId: 9, x: 0, y: 0 }), problem: { kind: 'no-map', mapId: 9 } },
      { eventId: 4, x: 0, y: 0, spot: spotOn(0, { mapId: 5, x: 3, y: 9 }), problem: { kind: 'stuck' } },
    ];
    const overlay = landingAlertsOverlay(landingsOf({}, failing));
    const painter = new RecordingPainter();

    // Act.
    overlay.draw(painter, { document: { mapId: 1 } as MapDocument, tileSize: 48, selection: [] });

    // Assert: two marks of four shapes each, their frames on their tiles.
    const frames = painter.shapes.filter(([ , , style ]) => style.strokeWidth === 3).map(([ , numbers ]) => numbers);
    expect([ overlay.id, overlay.defaultOn, painter.shapes.length, frames ])
      .toStrictEqual([ 'core.landings', true, 8, [ [ 98, 50, 44, 44 ], [ 2, 2, 44, 44 ] ] ]);
  });

  it('marks nothing on a map whose transfers all land well', () =>
  {
    // Arrange.
    const overlay = landingAlertsOverlay(landingsOf({}, []));
    const painter = new RecordingPainter();

    // Act.
    overlay.draw(painter, { document: { mapId: 1 } as MapDocument, tileSize: 48, selection: [] });

    // Assert.
    expect(painter.shapes)
      .toStrictEqual([]);
  });
});

/**
 * Names a map as a window's map tree would: map 181 as Chef Adventure's tree does, and any other by its label.
 * @param {number} mapId The map.
 * @returns {string} Its name.
 */
const treeName = (mapId: number): string => (mapId === 181 ? 'Passage - 9' : `Map ${mapId}`);

describe('transferLandingWords', () =>
{
  it('says where a transfer lands and why the player cannot stand there, for every reason, naming the map as the tree does', () =>
  {
    // Arrange: one of each, landing at 23, 7 of map 181, which the tree calls Passage - 9.
    const at: MapLocation = { mapId: 181, x: 23, y: 7 };
    const problems: LandingProblem[] = [
      { kind: 'no-map', mapId: 181 },
      { kind: 'off-map', width: 10, height: 15 },
      { kind: 'blocked' },
      { kind: 'occupied', eventId: 4, name: 'Guard' },
    ];

    // Act.
    const words = problems.map(problem => transferLandingWords(at, problem, treeName));

    // Assert.
    expect(words)
      .toStrictEqual([
        'Lands on Passage - 9, which does not exist.',
        'Lands on 23, 7, off the edge of Passage - 9, which is 10 by 15 tiles.',
        'Lands on 23, 7 in Passage - 9, where the player cannot stand. The tiles there let no one through.',
        'Lands on 23, 7 in Passage - 9, where the player cannot stand. Guard (event 4) stands there, and the player cannot share its tile.',
      ]);
  });
});

describe('landingLines', () =>
{
  it('says nothing more than where it lands and why, for one transfer on one event', () =>
  {
    // Arrange.
    const landings = landingsOf({ '181 23 7': { kind: 'blocked' } });

    // Act.
    const lines = landingLines(landings, [ { id: 18, name: 'teleport to previous', transfers: [ spotOn(0, { mapId: 181, x: 23, y: 7 }) ] } ], treeName);

    // Assert.
    expect(lines)
      .toStrictEqual([ { key: '18:0', text: 'Lands on 23, 7 in Passage - 9, where the player cannot stand. The tiles there let no one through.' } ]);
  });

  it('names the page of each failing transfer on an event with several, and says nothing of one that lands well', () =>
  {
    // Arrange: page 1 lands well, page 2 on a map that does not exist.
    const landings = landingsOf({ '5 1 1': null, '9 0 0': { kind: 'no-map', mapId: 9 } });
    const transfers = [ spotOn(0, { mapId: 5, x: 1, y: 1 }), spotOn(1, { mapId: 9, x: 0, y: 0 }) ];

    // Act.
    const lines = landingLines(landings, [ { id: 3, name: 'Door', transfers } ], treeName);

    // Assert.
    expect(lines)
      .toStrictEqual([ { key: '3:1', text: 'Page 2: Lands on Map 9, which does not exist.' } ]);
  });

  it('names the event of each failing transfer when the panel shows several, by its id when it has no name', () =>
  {
    // Arrange: a named door and an unnamed one, each with one failing transfer and the second with two.
    const landings = landingsOf({ '9 0 0': { kind: 'no-map', mapId: 9 } });
    const events = [
      { id: 3, name: 'Door', transfers: [ spotOn(0, { mapId: 9, x: 0, y: 0 }) ] },
      { id: 4, name: '', transfers: [ spotOn(0, { mapId: 9, x: 0, y: 0 }), spotOn(2, { mapId: 9, x: 0, y: 0 }) ] },
    ];

    // Act.
    const lines = landingLines(landings, events, treeName);

    // Assert.
    expect(lines.map(line => line.text))
      .toStrictEqual([
        'Door: Lands on Map 9, which does not exist.',
        'Event 4, Page 1: Lands on Map 9, which does not exist.',
        'Event 4, Page 3: Lands on Map 9, which does not exist.',
      ]);
  });

  it('says nothing of a landing still being judged', () =>
  {
    // Arrange: nothing known of map 5 yet.
    const landings = landingsOf({});

    // Act.
    const lines = landingLines(landings, [ { id: 3, name: 'Door', transfers: [ spotOn(0, { mapId: 5, x: 1, y: 1 }) ] } ], treeName);

    // Assert.
    expect(lines)
      .toStrictEqual([]);
  });
});
