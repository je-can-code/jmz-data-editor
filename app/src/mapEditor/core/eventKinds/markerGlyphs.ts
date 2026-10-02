import type { EventMarkerSymbol } from './eventMarkers.ts';

/**
 * The size of the square every glyph is drawn in, as an SVG view box would name it: 24 by 24.
 */
const GLYPH_BOX = 24;

/**
 * One point of a glyph, across then down, inside the glyph's box.
 */
type GlyphPoint = readonly [ number, number ];

/**
 * Writes a number for path data: at most two decimals, and no trailing zeros.
 * @param {number} value The number.
 * @returns {string} The number as path data carries it.
 */
const pathNumber = (value: number): string =>
{
  return String(Math.round(value * 100) / 100);
};

/**
 * Writes a closed polygon through some points as path data.
 * @param {readonly GlyphPoint[]} points The corners, in order.
 * @returns {string} The path.
 */
const polygon = (points: readonly GlyphPoint[]): string =>
{
  const corners = points.map(([ x, y ]) => `${pathNumber(x)} ${pathNumber(y)}`);
  return `M${corners.join('L')}Z`;
};

/**
 * Writes a circle as path data, as two half turns.
 * @param {number} cx The centre, across.
 * @param {number} cy The centre, down.
 * @param {number} radius The radius.
 * @returns {string} The path.
 */
const circle = (cx: number, cy: number, radius: number): string =>
{
  const left = `${pathNumber(cx - radius)} ${pathNumber(cy)}`;
  const right = `${pathNumber(cx + radius)} ${pathNumber(cy)}`;
  const turn = `${pathNumber(radius)} ${pathNumber(radius)} 0 1 0`;
  return `M${left}A${turn} ${right}A${turn} ${left}Z`;
};

/**
 * Turns points about the middle of the box, clockwise on screen.
 * @param {readonly GlyphPoint[]} points The points.
 * @param {number} degrees How far to turn them.
 * @returns {GlyphPoint[]} The turned points.
 */
const turned = (points: readonly GlyphPoint[], degrees: number): GlyphPoint[] =>
{
  const middle = GLYPH_BOX / 2;
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return points.map(([ x, y ]) =>
  {
    const dx = x - middle;
    const dy = y - middle;
    return [ middle + dx * cos - dy * sin, middle + dx * sin + dy * cos ];
  });
};

/**
 * Builds an arrow pointing right along a row of the box: a shaft, then a head.
 * @param {number} fromX Where the shaft starts.
 * @param {number} headX Where the head starts.
 * @param {number} tipX Where the tip is.
 * @param {number} y The row it points along.
 * @param {number} shaft Half the shaft's thickness.
 * @param {number} head Half the head's height.
 * @returns {GlyphPoint[]} The arrow's corners.
 */
const rightArrow = (fromX: number, headX: number, tipX: number, y: number, shaft: number, head: number): GlyphPoint[] =>
{
  return [ [ fromX, y - shaft ], [ headX, y - shaft ], [ headX, y - head ], [ tipX, y ], [ headX, y + head ], [ headX, y + shaft ], [ fromX, y + shaft ] ];
};

/**
 * Mirrors points across the box, left for right.
 * @param {readonly GlyphPoint[]} points The points.
 * @returns {GlyphPoint[]} The mirrored points.
 */
const mirrored = (points: readonly GlyphPoint[]): GlyphPoint[] =>
{
  return points.map(([ x, y ]) => [ GLYPH_BOX - x, y ]);
};

/**
 * A sword standing upright in the box, point up: blade, cross-guard and grip as one outline.
 */
const UPRIGHT_SWORD: readonly GlyphPoint[] = [
  [ 12, 2 ],
  [ 13.6, 4.2 ],
  [ 13.6, 14.6 ],
  [ 17, 14.6 ],
  [ 17, 16.8 ],
  [ 13.2, 16.8 ],
  [ 13.2, 20.6 ],
  [ 10.8, 20.6 ],
  [ 10.8, 16.8 ],
  [ 7, 16.8 ],
  [ 7, 14.6 ],
  [ 10.4, 14.6 ],
  [ 10.4, 4.2 ],
];

/**
 * One of a sun's rays, pointing straight up from its middle: a narrow wedge.
 */
const UPRIGHT_RAY: readonly GlyphPoint[] = [ [ 10.4, 5.4 ], [ 12, 1.6 ], [ 13.6, 5.4 ] ];

/**
 * Builds a sun: a disc with eight rays around it, what a light gives off.
 * @returns {string} The path.
 */
const sunPath = (): string =>
{
  const rays = [ 0, 45, 90, 135, 180, 225, 270, 315 ].map(degrees => polygon(turned(UPRIGHT_RAY, degrees)));
  return [ circle(12, 12, 4.6), ...rays ].join('');
};

/**
 * Every symbol's glyph, as SVG path data in a 24 by 24 box, filled white with the even-odd rule, so a shape drawn inside
 * another cuts a hole in it (a chest's latch, a speech bubble's dots, a button's ring). The map's markers and the events
 * list draw the same shapes from here, so a symbol always looks the same wherever it shows.
 *
 * - chest: a box with a rounded lid and a latch across the seam;
 * - transfer: an arrow going in through a doorway;
 * - dialogue: a speech bubble holding three dots;
 * - decor: a four-pointed sparkle;
 * - battler: a sword, point up and to the right;
 * - light: a sun;
 * - action button: a button, a ring around a dot;
 * - player touch: a person;
 * - event touch: two arrows meeting at a line;
 * - autorun: a play triangle, since it runs by itself;
 * - parallel: two arrows side by side, since it runs alongside everything else.
 */
const MARKER_GLYPHS: Readonly<Record<EventMarkerSymbol, string>> = {
  'chest': [
    'M6 5h12a2 2 0 0 1 2 2v4H4V7a2 2 0 0 1 2-2Z',
    'M4 12h16v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z',
    polygon([ [ 10.5, 9 ], [ 13.5, 9 ], [ 13.5, 14 ], [ 10.5, 14 ] ]),
  ].join(''),
  'transfer': [
    polygon([ [ 12, 3 ], [ 20, 3 ], [ 20, 21 ], [ 12, 21 ], [ 12, 19 ], [ 18, 19 ], [ 18, 5 ], [ 12, 5 ] ]),
    polygon(rightArrow(3, 10, 15.5, 12, 1.5, 5.5)),
  ].join(''),
  'dialogue': [
    'M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-8l-5 4v-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
    circle(8, 10.5, 1.5),
    circle(12, 10.5, 1.5),
    circle(16, 10.5, 1.5),
  ].join(''),
  'decor': polygon([ [ 12, 2 ], [ 14.4, 9.6 ], [ 22, 12 ], [ 14.4, 14.4 ], [ 12, 22 ], [ 9.6, 14.4 ], [ 2, 12 ], [ 9.6, 9.6 ] ]),
  'battler': polygon(turned(UPRIGHT_SWORD, 45)),
  'light': sunPath(),
  'action-button': [ circle(12, 12, 9.5), circle(12, 12, 7), circle(12, 12, 3.8) ].join(''),
  'player-touch': [
    circle(12, 7, 3.6),
    'M5 21v-1.5a5.5 5.5 0 0 1 5.5-5.5h3a5.5 5.5 0 0 1 5.5 5.5V21Z',
  ].join(''),
  'event-touch': [
    polygon(rightArrow(2, 6.5, 10.8, 12, 1.2, 5)),
    polygon(mirrored(rightArrow(2, 6.5, 10.8, 12, 1.2, 5))),
    polygon([ [ 11.3, 5 ], [ 12.7, 5 ], [ 12.7, 19 ], [ 11.3, 19 ] ]),
  ].join(''),
  'autorun': polygon([ [ 7, 4 ], [ 20, 12 ], [ 7, 20 ] ]),
  'parallel': [
    polygon(rightArrow(3, 12, 21, 7, 1.4, 4.5)),
    polygon(rightArrow(3, 12, 21, 17, 1.4, 4.5)),
  ].join(''),
};

export { GLYPH_BOX, MARKER_GLYPHS };
