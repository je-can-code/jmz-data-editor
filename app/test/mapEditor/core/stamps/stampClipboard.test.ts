import { describe, expect, it } from 'vitest';
import { mapDocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import { captureAreaStamp, type Stamp } from '../../../../src/mapEditor/core/stamps/stamp.ts';
import {
  decodeStampClipboard,
  encodeStampClipboard,
  STAMP_CLIPBOARD_MARKER,
  STAMP_CLIPBOARD_VERSION,
} from '../../../../src/mapEditor/core/stamps/stampClipboard.ts';
import { TilesetMode } from '../../../../src/mapEditor/core/tiles/autotileShapes.ts';
import { makeAutotileId } from '../../../../src/mapEditor/core/tiles/tileIds.ts';
import { stampOf, tiledMap } from '../../support/stampFixtures.ts';
import { fill } from '../tiles/support/tileGridBuilder.ts';

/*
 * A stamp travels to another window on the system clipboard, as JSON carrying a marker, so a paste there can tell a
 * stamp from whatever else was copied last. What is written reads back as the very stamp, field for field, so a window
 * knows by its id whether it holds it already and keeps it once. Anything else reads as nothing, a paste of it changing
 * nothing: plain text, other JSON, a stamp in a shape this editor does not write, or one whose tiles do not fill it,
 * whose layers repeat or run backwards, whose values no map can hold, whose events stand outside it or on one cell
 * twice, or that holds nothing at all.
 */
describe('stampClipboard', () =>
{
  /**
   * Captures a stamp of a 2 by 2 piece of grass on every layer, with an event on it, off a 4x3 map.
   * @returns {Stamp} The stamp.
   */
  const captured = (): Stamp =>
  {
    const map = MapDocument.fromJson(mapDocumentKey(5), tiledMap(4, 3, grid => fill(grid, 0, 0, 1, 1, 0, makeAutotileId(16, 0)), [ null, [ 1, 1 ] ]));
    return captureAreaStamp(map, { x: 0, y: 0, width: 2, height: 2 }, 'auto', TilesetMode.area, 'window-a:3') as Stamp;
  };

  /**
   * Writes a stamp with some of its fields changed, as a clipboard's text.
   * @param {Record<string, unknown>} fields The fields to change.
   * @returns {string} The text.
   */
  const withFields = (fields: Record<string, unknown>): string =>
  {
    return encodeStampClipboard({ ...captured(), ...fields } as unknown as Stamp);
  };

  it('reads back exactly the stamp written, carrying the marker and the shape\'s version', () =>
  {
    // Arrange.
    const stamp = captured();

    // Act.
    const text = encodeStampClipboard(stamp);
    const parsed = JSON.parse(text) as Record<string, unknown>;

    // Assert.
    expect([ parsed['marker'], parsed['version'], decodeStampClipboard(text) ])
      .toStrictEqual([ STAMP_CLIPBOARD_MARKER, STAMP_CLIPBOARD_VERSION, stamp ]);
  });

  it('reads a stamp of events alone, and one of tiles alone', () =>
  {
    // Arrange.
    const events = stampOf();
    const tiles = { ...captured(), events: [] };

    // Act.
    const read = [ decodeStampClipboard(encodeStampClipboard(events)), decodeStampClipboard(encodeStampClipboard(tiles)) ];

    // Assert.
    expect(read)
      .toStrictEqual([ events, tiles ]);
  });

  it('reads anything but a whole stamp as nothing', () =>
  {
    // Arrange: plain text, a list, another marker or version, and stamps broken one field at a time.
    const valid = JSON.parse(encodeStampClipboard(captured())) as Record<string, unknown>;
    const stamp = captured();
    const tiles = stamp.tiles as NonNullable<Stamp['tiles']>;
    const texts = [
      'Welcome to Nimbus!',
      '[1, 2, 3]',
      JSON.stringify({ ...valid, marker: 'jmz-map-editor/events' }),
      JSON.stringify({ ...valid, version: 2 }),
      JSON.stringify({ ...valid, stamp: 'a stamp' }),
      withFields({ id: '' }),
      withFields({ mapId: 0 }),
      withFields({ tilesetId: -1 }),
      withFields({ origin: { x: -1, y: 0 } }),
      withFields({ origin: null }),
      withFields({ width: 0 }),
      withFields({ height: 1.5 }),
      withFields({ tiles: 'tiles' }),
      withFields({ tiles: { ...tiles, layers: [] } }),
      withFields({ tiles: { ...tiles, layers: [ 1, 0, 2, 3, 4, 5 ] } }),
      withFields({ tiles: { ...tiles, layers: [ 0, 1, 2, 3, 4, 6 ] } }),
      withFields({ tiles: { ...tiles, values: tiles.values.slice(1) } }),
      withFields({ tiles: { ...tiles, values: [ 70000, ...tiles.values.slice(1) ] } }),
      withFields({ tiles: { ...tiles, calledFor: [ 48, ...tiles.calledFor.slice(1) ] } }),
      withFields({ events: 'events' }),
      withFields({ events: [ 5 ] }),
      withFields({ events: [ { ...stamp.events[0], x: 2 } ] }),
      withFields({ events: [ { ...stamp.events[0], pages: null } ] }),
      withFields({ events: [ stamp.events[0], { ...stamp.events[0], id: 9 } ] }),
      withFields({ events: [ stamp.events[0], { ...stamp.events[0], x: 0 } ] }),
      withFields({ tiles: null, events: [] }),
    ];

    // Act.
    const read = texts.map(decodeStampClipboard);

    // Assert.
    expect(read)
      .toStrictEqual(texts.map(() => null));
  });
});
