import { describe, expect, it } from 'vitest';
import { createEventPage, createMapEvent } from '../../../src/mapEditor/core/model/eventModel.ts';
import type { RmmzEventImage, RmmzMapEvent } from '../../../src/mapEditor/core/model/rmmzTypes.ts';
import type { TextureImage } from '../../../src/mapEditor/core/renderer/MapRenderer.ts';
import { TileId } from '../../../src/mapEditor/core/tiles/tileIds.ts';
import {
  drawStampThumbnail,
  MAX_THUMBNAIL_CELL,
  THUMBNAIL_BOX,
  thumbnailCharacters,
  thumbnailLayout,
  type ThumbnailContext,
} from '../../../src/mapEditor/render/stampThumbnail.ts';
import { stampOf } from '../support/stampFixtures.ts';

/*
 * A stamp's picture in the Stamps panel: small enough that two sit side by side in the panel at its narrowest, keeping
 * the stamp's shape, and never blowing a stamp of one event up past the game's own scale. It shows the tiles on the four
 * tile layers, bottom to top, each in the shape it was copied in, and then the events, each as its first page shows it:
 * a tile image on its cell, a character standing on its cell's bottom edge, centred across it, and a dot for one drawing
 * no picture, or one whose sheet has not loaded yet. The shadows and regions draw nothing, and no tile draws while the
 * tileset's sheets are loading.
 *
 * The stand-in sheets are 576 by 384, the size of a normal character sheet: a cell of it is 48 by 48.
 */
describe('stampThumbnail', () =>
{
  /**
   * A stand-in image of a size, named so a drawing can be told which it came from.
   * @param {string} name The name.
   * @returns {TextureImage} The image.
   */
  const sheet = (name: string): TextureImage => ({ name, width: 576, height: 384 } as unknown as TextureImage);

  /**
   * A context that records what is drawn: each image drawn, by its name, with where it was cut from and where it went,
   * and each dot.
   * @returns {{ context: ThumbnailContext, drawn: string[] }} The context and the record.
   */
  const recording = () =>
  {
    const drawn: string[] = [];
    const context = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      drawImage: (image: { name: string }, ...numbers: number[]) => drawn.push(`${image.name} ${numbers.join(',')}`),
      beginPath: () => undefined,
      arc: (x: number, y: number, radius: number) => drawn.push(`dot ${x},${y} r${radius}`),
      fill: () => undefined,
      stroke: () => undefined,
    };
    return { context: context as unknown as ThumbnailContext, drawn };
  };

  /**
   * Builds an event on a cell with one page showing a picture, or with no pages at all.
   * @param {number} id The id.
   * @param {number} x The column inside the stamp.
   * @param {number} y The row.
   * @param {RmmzEventImage | null} image The picture, or null for no pages.
   * @returns {RmmzMapEvent} The event.
   */
  const showing = (id: number, x: number, y: number, image: RmmzEventImage | null): RmmzMapEvent =>
  {
    return { ...createMapEvent(id, x, y), pages: image === null ? [] : [ { ...createEventPage(), image } ] };
  };

  /**
   * Builds a character picture.
   * @param {string} characterName The sheet.
   * @returns {RmmzEventImage} The picture.
   */
  const character = (characterName: string): RmmzEventImage => ({ tileId: 0, characterName, direction: 2, pattern: 1, characterIndex: 0 });

  it('lays a stamp out as large as fits the box, keeping its shape, and never past the game\'s own scale', () =>
  {
    // Arrange: a wide piece, one event, and a 2 by 1 pair.
    const sizes = [ { width: 20, height: 15 }, { width: 1, height: 1 }, { width: 2, height: 1 } ];

    // Act.
    const layouts = sizes.map(size => thumbnailLayout(size));

    // Assert.
    expect([ THUMBNAIL_BOX, MAX_THUMBNAIL_CELL, layouts.map(layout => [ Number(layout.cell.toFixed(3)), Number(layout.width.toFixed(1)), layout.height ]) ])
      .toStrictEqual([ { width: 132, height: 88 }, 48, [ [ 5.867, 117.3, 88 ], [ 48, 48, 48 ], [ 48, 96, 48 ] ] ]);
  });

  it('lists the character sheets the events\' first pages show, each once, and none for tile images or no picture', () =>
  {
    // Arrange.
    const stamp = stampOf({
      width: 5,
      events: [
        showing(1, 0, 0, character('Actor1')),
        showing(2, 1, 0, character('Actor1')),
        showing(3, 2, 0, character('!Door')),
        showing(4, 3, 0, { ...character(''), tileId: TileId.B + 4 }),
        showing(5, 4, 0, null),
      ],
    });

    // Act.
    const names = thumbnailCharacters(stamp);

    // Assert.
    expect(names)
      .toStrictEqual([ 'Actor1', '!Door' ]);
  });

  it('draws the tiles bottom layer first, then each event as its first page shows it, at the cell size asked', () =>
  {
    // Arrange: a 2 by 1 stamp, a B tile on layer 4 over its left cell and a shadow and region under its right; a
    // character on its left cell, a tile image on its right, and an event with no pages there too.
    const tileSheets = [ null, null, null, null, null, sheet('B'), null, null, null ];
    const stamp = stampOf({
      width: 2,
      tiles: { layers: [ 0, 3, 4, 5 ], values: [ 0, 0, TileId.B + 1, 0, 0, 0b1111, 0, 9 ], calledFor: new Array(8).fill(-1) },
      events: [ showing(1, 0, 0, character('Actor1')), showing(2, 1, 0, { ...character(''), tileId: TileId.B + 2 }) ],
    });
    const { context, drawn } = recording();

    // Act: cells of 24 canvas pixels.
    drawStampThumbnail(context, stamp, { sheets: tileSheets, characters: new Map([ [ 'Actor1', sheet('Actor1') ] ]) }, 24);

    // Assert: the B tile whole from its sheet; the character's walking frame, half size, feet on the cell's bottom
    // edge; the tile image on its cell.
    expect(drawn)
      .toStrictEqual([ 'B 48,0,48,48,0,0,24,24', 'Actor1 48,0,48,48,0,0,24,24', 'B 96,0,48,48,24,0,24,24' ]);
  });

  it('draws a dot for an event with no picture, or one whose sheet has not loaded, and no tiles while the sheets load', () =>
  {
    // Arrange: grass under both cells; a character still loading on the left, an event with no pages on the right.
    const stamp = stampOf({
      width: 2,
      tiles: { layers: [ 0 ], values: [ TileId.A2, TileId.A2 ], calledFor: [ 0, 0 ] },
      events: [ showing(1, 0, 0, character('Actor1')), showing(2, 1, 0, null) ],
    });
    const { context, drawn } = recording();

    // Act.
    drawStampThumbnail(context, stamp, { sheets: null, characters: new Map([ [ 'Actor1', null ] ]) }, 24);

    // Assert.
    expect(drawn)
      .toStrictEqual([ 'dot 12,12 r7.199999999999999', 'dot 36,12 r7.199999999999999' ]);
  });
});
