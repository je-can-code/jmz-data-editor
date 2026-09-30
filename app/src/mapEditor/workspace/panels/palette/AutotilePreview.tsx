import React, { useEffect, useMemo, useRef } from 'react';
import { Paper, Popper, Typography } from '@mui/material';
import { autotilePatch } from '../../../core/palette/autotilePatch.ts';
import { describeTile } from '../../../core/palette/paletteLayout.ts';
import type { TextureImage } from '../../../core/renderer/MapRenderer.ts';
import { autotileKind, isA3Kind, isA4Kind, makeAutotileId } from '../../../core/tiles/tileIds.ts';
import { drawPatch } from '../../../render/tileCanvas.ts';
import { CHECKERBOARD } from './TileThumb.tsx';

/**
 * How big each cell of the painted patch is drawn, in CSS pixels.
 */
const PATCH_CELL_SIZE = 32;

/**
 * Names what a patch shows: the kind itself, or for an A3 or A4 kind its top and the side beneath it.
 * @param {number} tileId The hovered kind, in any shape.
 * @returns {string} The caption.
 */
const patchCaption = (tileId: number): string =>
{
  const kind = autotileKind(tileId);
  if (isA3Kind(kind) === false && isA4Kind(kind) === false)
  {
    return describeTile(tileId);
  }

  const top = kind % 16 < 8
    ? kind
    : kind - 8;
  return `${describeTile(makeAutotileId(top, 0))} over ${describeTile(makeAutotileId(top + 8, 0))}`;
};

/**
 * What the painted patch needs: which kind, where the hovered cell is on screen, and the pictures.
 */
type AutotilePreviewProps = {
  readonly tileId: number;
  readonly anchor: { readonly left: number; readonly top: number; readonly width: number; readonly height: number };
  readonly sheets: readonly (TextureImage | null)[];
  readonly mode: number;
};

/**
 * Shows a small painted patch of the autotile kind under the pointer beside the palette, with its edges, corners and
 * inside, each shaped as painting would shape it: a clearer picture of a kind than its one ready-made tile. An A4 kind
 * shows its ceiling above its wall face, and an A3 kind its roof above its building wall. It never takes the pointer,
 * so moving on across the palette is never interrupted.
 * @param {AutotilePreviewProps} props The kind, where to show it, and the tileset.
 * @returns {React.JSX.Element} The patch.
 */
const AutotilePreview = (props: AutotilePreviewProps) =>
{
  const { tileId, anchor, sheets, mode } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const patch = useMemo(() => autotilePatch(tileId, mode), [ tileId, mode ]);

  // an element Popper can place itself against: the hovered cell's place on screen.
  const anchorElement = useMemo(() => ({
    getBoundingClientRect: () => new DOMRect(anchor.left, anchor.top, anchor.width, anchor.height),
  }), [ anchor.left, anchor.top, anchor.width, anchor.height ]);

  useEffect(() =>
  {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d') ?? null;
    if (canvas === null || context === null)
    {
      return;
    }

    const scale = canvas.ownerDocument.defaultView?.devicePixelRatio ?? 1;
    const cell = Math.round(PATCH_CELL_SIZE * scale);
    canvas.width = patch.width * cell;
    canvas.height = patch.height * cell;
    context.imageSmoothingEnabled = cell < 48;
    context.imageSmoothingQuality = 'high';
    drawPatch(context, sheets, patch, cell);
  }, [ patch, sheets ]);

  return (
    <Popper open anchorEl={anchorElement} placement={'right-start'} sx={{ pointerEvents: 'none', zIndex: 1300 }} data-testid={'autotile-preview'}>
      <Paper elevation={8} sx={{ p: 1, ml: 1 }}>
        <canvas
          ref={canvasRef}
          style={{ display: 'block', width: patch.width * PATCH_CELL_SIZE, height: patch.height * PATCH_CELL_SIZE, background: CHECKERBOARD }}
        />
        <Typography variant={'caption'} color={'text.secondary'} sx={{ display: 'block', mt: 0.5 }}>
          {patchCaption(tileId)}
        </Typography>
      </Paper>
    </Popper>
  );
};

export { AutotilePreview, patchCaption };
