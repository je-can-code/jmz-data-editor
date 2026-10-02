import React from 'react';
import { MARKER_STYLES, type EventMarkerSymbol } from '../core/eventKinds/eventMarkers.ts';
import { GLYPH_BOX, MARKER_GLYPHS } from '../core/eventKinds/markerGlyphs.ts';

/**
 * How much of the square the symbol fills, as on the map's own markers.
 */
const GLYPH_SHARE = 0.62;

/**
 * Where the symbol starts inside the square, so it sits in the middle.
 */
const GLYPH_OFFSET = (GLYPH_BOX * (1 - GLYPH_SHARE)) / 2;

/**
 * One event marker drawn small, as the events list shows it beside an event: the same coloured square and white symbol
 * the map draws for an event that shows no picture, so the list and the map read alike. It names what it stands for, so
 * a screen reader says "Battler" or "Autorun" rather than nothing.
 * @param {{ symbol: EventMarkerSymbol, size?: number }} props The symbol, and how big to draw it in pixels (16 unless
 * told otherwise).
 * @returns {React.JSX.Element} The icon.
 */
const MarkerIcon = (props: { readonly symbol: EventMarkerSymbol; readonly size?: number }) =>
{
  const { symbol, size = 16 } = props;
  const style = MARKER_STYLES[symbol];
  return (
    <svg
      viewBox={`0 0 ${GLYPH_BOX} ${GLYPH_BOX}`}
      width={size}
      height={size}
      role={'img'}
      aria-label={style.label}
      data-marker={symbol}
      style={{ display: 'block', flexShrink: 0 }}
    >
      <rect x={1} y={1} width={GLYPH_BOX - 2} height={GLYPH_BOX - 2} rx={5} fill={style.colour} stroke={'rgba(0, 0, 0, 0.72)'} strokeWidth={1.5}/>
      <path
        d={MARKER_GLYPHS[symbol]}
        fill={'#ffffff'}
        fillRule={'evenodd'}
        transform={`translate(${GLYPH_OFFSET} ${GLYPH_OFFSET}) scale(${GLYPH_SHARE})`}
      />
    </svg>
  );
};

export { MarkerIcon };
