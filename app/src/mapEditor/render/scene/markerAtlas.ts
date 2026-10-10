import { ImageSource, type TextureSource } from 'pixi.js';
import { MARKER_STYLES, MARKER_SYMBOLS, type EventMarkerSymbol } from '../../core/eventKinds/eventMarkers.ts';
import { GLYPH_BOX, MARKER_GLYPHS } from '../../core/eventKinds/markerGlyphs.ts';

/**
 * How many atlas pixels each marker's picture takes, across and down, clear gutter included.
 */
const MARKER_CELL = 128;

/**
 * How many atlas pixels the marker's square takes inside its picture. The clear gutter around it keeps a marker drawn
 * small, from a smaller copy of the atlas, from picking up the colour of the marker beside it.
 */
const MARKER_SQUARE = 112;

/**
 * How many markers each atlas row holds, and how many rows there are: room for sixteen symbols in a square atlas.
 */
const MARKER_COLUMNS = 4;
const MARKER_ROWS = 4;

/**
 * How big a marker's square is on the map at the game's own scale, in world pixels: a little smaller than its 48-pixel
 * tile, so the tiles around it still show.
 */
const MARKER_WORLD_SIZE = 40;

/**
 * The smallest a marker's square shows on screen, in CSS pixels, however far out the map is zoomed: below it, the
 * symbol inside could not be read, so a marker zoomed further out keeps this size and spills past its tile.
 */
const MARKER_MIN_SCREEN = 20;

/**
 * How the square is drawn, in atlas pixels: its corner radius and the width of the dark rim that keeps neighbouring
 * markers apart where every tile holds one.
 */
const MARKER_RADIUS = 20;
const MARKER_RIM = 7;

/**
 * How much of the square the symbol fills, and the width of the dark outline under it, in atlas pixels, which keeps a
 * white symbol readable over the lightest colours.
 */
const GLYPH_SHARE = 0.62;
const GLYPH_HALO = 5;

/**
 * Where one marker's picture is in the atlas.
 */
type MarkerFrame = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

/**
 * Finds where a symbol's marker sits in the atlas: the symbols in their own order, a row of four at a time.
 * @param {EventMarkerSymbol} symbol The symbol.
 * @returns {MarkerFrame} Its picture's place, gutter included.
 */
const markerFrame = (symbol: EventMarkerSymbol): MarkerFrame =>
{
  const index = MARKER_SYMBOLS.indexOf(symbol);
  return {
    x: (index % MARKER_COLUMNS) * MARKER_CELL,
    y: Math.floor(index / MARKER_COLUMNS) * MARKER_CELL,
    width: MARKER_CELL,
    height: MARKER_CELL,
  };
};

/**
 * Works out how much bigger than its own size a marker draws at a zoom, so its square never shows smaller on screen than
 * {@link MARKER_MIN_SCREEN}: 1 from 50% zoom in, and growing as the map zooms out past that.
 * @param {number} zoom The zoom the map is drawn at.
 * @returns {number} The factor, never below 1.
 */
const markerScale = (zoom: number): number =>
{
  return Math.max(1, MARKER_MIN_SCREEN / (MARKER_WORLD_SIZE * zoom));
};

/**
 * Works out the scale a marker sprite draws at, cut from the atlas, for its square to be the size it shows at a zoom.
 * @param {number} scale How much bigger than its own size the marker draws (see {@link markerScale}).
 * @returns {number} The sprite's scale.
 */
const markerSpriteScale = (scale: number): number =>
{
  return (MARKER_WORLD_SIZE / MARKER_SQUARE) * scale;
};

/**
 * Draws one marker into its place in the atlas: a rounded square in the symbol's colour with a dark rim, holding the
 * symbol in white over a dark outline.
 * @param {CanvasRenderingContext2D} context The atlas's canvas.
 * @param {EventMarkerSymbol} symbol The symbol.
 */
const drawMarker = (context: CanvasRenderingContext2D, symbol: EventMarkerSymbol): void =>
{
  const frame = markerFrame(symbol);
  const gutter = (MARKER_CELL - MARKER_SQUARE) / 2;

  // the square, drawn inside its edge by half the rim, so the rim's outer edge is the square's.
  const edge = MARKER_RIM / 2;
  context.beginPath();
  context.roundRect(frame.x + gutter + edge, frame.y + gutter + edge, MARKER_SQUARE - MARKER_RIM, MARKER_SQUARE - MARKER_RIM, MARKER_RADIUS);
  context.fillStyle = MARKER_STYLES[symbol].colour;
  context.fill();
  context.lineWidth = MARKER_RIM;
  context.strokeStyle = 'rgba(0, 0, 0, 0.72)';
  context.stroke();

  // the symbol, scaled from its own box into the middle of the square.
  const size = MARKER_SQUARE * GLYPH_SHARE;
  const scale = size / GLYPH_BOX;
  const path = new Path2D(MARKER_GLYPHS[symbol]);
  context.save();
  context.translate(frame.x + (MARKER_CELL - size) / 2, frame.y + (MARKER_CELL - size) / 2);
  context.scale(scale, scale);
  context.lineJoin = 'round';
  context.lineWidth = GLYPH_HALO / scale;
  context.strokeStyle = 'rgba(0, 0, 0, 0.5)';
  context.stroke(path);
  context.fillStyle = '#ffffff';
  context.fill(path, 'evenodd');
  context.restore();
};

/**
 * Draws the marker atlas: every symbol's marker, a row of four at a time, on a canvas in the renderer's own document.
 * @param {Document} document The document to make the canvas in.
 * @returns {HTMLCanvasElement} The atlas; see {@link markerFrame} for where each marker sits.
 */
const drawMarkerAtlas = (document: Document): HTMLCanvasElement =>
{
  const canvas = document.createElement('canvas');
  canvas.width = MARKER_COLUMNS * MARKER_CELL;
  canvas.height = MARKER_ROWS * MARKER_CELL;
  const context = canvas.getContext('2d');
  if (context === null)
  {
    throw new Error('the event markers need a 2D canvas to draw on');
  }

  MARKER_SYMBOLS.forEach(symbol => drawMarker(context, symbol));
  return canvas;
};

/**
 * Makes the texture markers are cut from: the atlas, sampled smoothly and with smaller copies made of it, so a marker
 * drawn at a sixth of its size, zoomed far out, stays a clean square with a readable symbol rather than a shimmer of
 * pixels.
 * @param {Document} document The document to draw the atlas in.
 * @returns {TextureSource} The texture's source.
 */
const markerAtlasSource = (document: Document): TextureSource =>
{
  return new ImageSource({
    resource: drawMarkerAtlas(document),
    scaleMode: 'linear',
    autoGenerateMipmaps: true,
    alphaMode: 'premultiply-alpha-on-upload',
  });
};

export {
  drawMarkerAtlas,
  MARKER_CELL,
  MARKER_COLUMNS,
  MARKER_MIN_SCREEN,
  MARKER_RADIUS,
  MARKER_ROWS,
  MARKER_SQUARE,
  MARKER_WORLD_SIZE,
  markerAtlasSource,
  markerFrame,
  markerScale,
  markerSpriteScale,
};
export type { MarkerFrame };
