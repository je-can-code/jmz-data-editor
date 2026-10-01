import React, { useEffect, useRef } from 'react';
import { Box } from '@mui/material';
import type { TextureImage } from '../../../core/renderer/MapRenderer.ts';
import { drawTile } from '../../../render/tileCanvas.ts';

/**
 * The checkerboard shown behind tiles, so a see-through tile reads as see-through rather than as black.
 */
const CHECKERBOARD = 'repeating-conic-gradient(#2b2b2b 0% 25%, #353535 0% 50%) 50% / 12px 12px';

/**
 * Draws one tile, as the engine cuts it, into a canvas of its own: the stack view's pictures of each layer.
 * @param {{ sheets: readonly (TextureImage | null)[] | null, tileId: number, size: number }} props The tileset's
 * sheets (null while they load), the tile, and the size to draw it at in CSS pixels.
 * @returns {React.JSX.Element} The picture.
 */
const TileThumb = (props: { readonly sheets: readonly (TextureImage | null)[] | null; readonly tileId: number; readonly size: number }) =>
{
  const { sheets, tileId, size } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() =>
  {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d') ?? null;
    if (canvas === null || context === null)
    {
      return;
    }

    // drawn at the screen's pixel density, so a small picture stays sharp.
    const scale = canvas.ownerDocument.defaultView?.devicePixelRatio ?? 1;
    canvas.width = Math.round(size * scale);
    canvas.height = Math.round(size * scale);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = size * scale < 48;
    if (sheets !== null && tileId !== 0)
    {
      drawTile(context, sheets, tileId, 0, 0, canvas.width);
    }
  }, [ sheets, tileId, size ]);

  return (
    <Box
      component={'canvas'}
      ref={canvasRef}
      sx={{ width: size, height: size, flex: 'none', display: 'block', background: CHECKERBOARD, borderRadius: 0.5 }}
    />
  );
};

export { CHECKERBOARD, TileThumb };
