import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box } from '@mui/material';
import { cellAtPoint, edgeAtPoint, isOnBadge, paletteCellSize } from '../../../core/palette/paletteGeometry.ts';
import { PALETTE_COLUMNS, rectBetween, type PaletteLayout, type PaletteRect } from '../../../core/palette/paletteLayout.ts';
import type { FlagClick, FlagMode } from '../../../core/palette/passabilityEdits.ts';
import type { TextureImage } from '../../../core/renderer/MapRenderer.ts';
import type { TilesetMarks } from '../../../core/tiles/tilesetMarks.ts';
import { isASheetTile } from '../../../core/tiles/tileRoles.ts';
import { drawPalette, drawPaletteBase } from './paletteDrawing.ts';
import { CHECKERBOARD } from './TileThumb.tsx';

/**
 * The cell under the pointer, and where it sits on screen, for the painted patch shown beside it.
 */
type PaletteHover = {
  readonly column: number;
  readonly row: number;
  readonly id: number;
  readonly onBadge: boolean;
  readonly screen: { readonly left: number; readonly top: number; readonly width: number; readonly height: number };
};

/**
 * What the palette's canvas shows, and what it tells its panel.
 */
type PaletteCanvasProps = {
  readonly layout: PaletteLayout;
  readonly sheets: readonly (TextureImage | null)[] | null;

  /**
   * The rectangle to show chosen on this tab, or null.
   */
  readonly selection: PaletteRect | null;

  /**
   * The tileset's "goes on top" marks, shown as badges that a click toggles; null where they do not apply.
   */
  readonly marks: TilesetMarks | null;

  /**
   * The tileset's flags and the flags shown, while the passability editor is open; null while picking tiles.
   */
  readonly passability: { readonly flags: ArrayLike<number>; readonly mode: FlagMode } | null;

  readonly onSelect: (rect: PaletteRect) => void;
  readonly onToggleMark: (tileId: number) => void;
  readonly onFlagClick: (tileId: number, click: FlagClick) => void;
  readonly onHover: (hover: PaletteHover | null) => void;
};

/**
 * Works out what a click in the passability editor asks for, from its mode, where it landed and how.
 * @param {FlagMode} mode The flags shown.
 * @param {number} x The point across, from the palette's left edge.
 * @param {number} y The point down.
 * @param {number} size The cell size.
 * @param {boolean} backwards Whether the click counts down: a right click, or Shift held.
 * @returns {FlagClick} The click.
 */
const flagClickAt = (mode: FlagMode, x: number, y: number, size: number, backwards: boolean): FlagClick =>
{
  switch (mode)
  {
    case 'directions':
      return { mode, direction: edgeAtPoint(x, y, size) };
    case 'terrain':
      return { mode, delta: backwards ? -1 : 1 };
    default:
      return { mode };
  }
};

/**
 * The palette's cells, drawn on a canvas eight across at whatever width the panel gives, with a drag picking a
 * rectangle, a click on a tile's corner badge (or a right click) toggling its "goes on top" mark, and, while the
 * passability editor is open, clicks editing the flags it shows instead. The tiles are drawn once per tab; hovering and
 * picking only redraw the marks over them.
 * @param {PaletteCanvasProps} props What to show, and where to report.
 * @returns {React.JSX.Element} The canvas, in a box that scrolls.
 */
const PaletteCanvas = (props: PaletteCanvasProps) =>
{
  const { layout, sheets, selection, marks, passability, onSelect, onToggleMark, onFlagClick, onHover } = props;
  const boxRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragFrom = useRef<{ column: number; row: number } | null>(null);
  const [ width, setWidth ] = useState(0);
  const [ hover, setHover ] = useState<{ column: number; row: number; onBadge: boolean } | null>(null);
  const size = paletteCellSize(width);

  // follow the box's width, with an observer from the window the panel is in now.
  useEffect(() =>
  {
    const box = boxRef.current;
    const Observer = box?.ownerDocument.defaultView?.ResizeObserver ?? null;
    if (box === null || Observer === null)
    {
      return undefined;
    }

    setWidth(box.clientWidth);
    const observer = new Observer(() => setWidth(box.clientWidth));
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  // the tab's tiles, drawn once at the sheets' size for as long as the tab and the sheets stay the same.
  const base = useMemo(() =>
  {
    const document = boxRef.current?.ownerDocument ?? globalThis.document;
    return drawPaletteBase(document, layout, sheets);
  }, [ layout, sheets ]);

  useEffect(() =>
  {
    const canvas = canvasRef.current;
    if (canvas === null)
    {
      return;
    }

    const scale = canvas.ownerDocument.defaultView?.devicePixelRatio ?? 1;
    drawPalette(canvas, base, layout, size, scale, { selection, hover, marks, passability });
  }, [ base, layout, size, selection, hover, marks, passability ]);

  /**
   * Reads where a pointer event landed on the palette.
   * @param {React.PointerEvent | React.MouseEvent} event The event.
   * @returns {{ x: number, y: number, left: number, top: number }} The point on the palette, and the canvas's screen
   * position.
   */
  const pointOf = (event: React.PointerEvent | React.MouseEvent) =>
  {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top, left: bounds.left, top: bounds.top };
  };

  /**
   * Follows the pointer over the cells, reporting each new cell once.
   * @param {React.PointerEvent<HTMLCanvasElement>} event The move.
   */
  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) =>
  {
    const { x, y, left, top } = pointOf(event);
    const from = dragFrom.current;
    if (from !== null)
    {
      onSelect(rectBetween(layout, from, { column: Math.floor(x / size), row: Math.floor(y / size) }));
      return;
    }

    const cell = cellAtPoint(layout, x, y, size);
    if (cell === null && hover === null)
    {
      return;
    }

    const id = cell === null ? -1 : layout.cells[cell.row * PALETTE_COLUMNS + cell.column].id;
    const onBadge = cell !== null && marks !== null && passability === null && isASheetTile(id) && isOnBadge(x, y, size);
    if (cell !== null && hover !== null && cell.column === hover.column && cell.row === hover.row && onBadge === hover.onBadge)
    {
      return;
    }

    setHover(cell === null ? null : { ...cell, onBadge });
    onHover(cell === null
      ? null
      : { ...cell, id, onBadge, screen: { left: left + cell.column * size, top: top + cell.row * size, width: size, height: size } });
  };

  /**
   * Starts a pick, toggles a mark, or edits a flag, by where the button went down.
   * @param {React.PointerEvent<HTMLCanvasElement>} event The press.
   */
  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) =>
  {
    if (event.button !== 0)
    {
      return;
    }

    const { x, y } = pointOf(event);
    const cell = cellAtPoint(layout, x, y, size);
    if (cell === null)
    {
      return;
    }

    const { id } = layout.cells[cell.row * PALETTE_COLUMNS + cell.column];
    if (passability !== null)
    {
      onFlagClick(id, flagClickAt(passability.mode, x, y, size, event.shiftKey));
      return;
    }

    if (marks !== null && isASheetTile(id) && isOnBadge(x, y, size))
    {
      onToggleMark(id);
      return;
    }

    // a pick follows the pointer until the button comes up, even past the palette's edge.
    dragFrom.current = cell;
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelect({ ...cell, columns: 1, rows: 1 });
  };

  /**
   * Ends a pick.
   */
  const onPointerUp = () =>
  {
    dragFrom.current = null;
  };

  /**
   * Forgets the cell under the pointer as it leaves, unless a pick is still following it.
   */
  const onPointerLeave = () =>
  {
    if (dragFrom.current === null)
    {
      setHover(null);
      onHover(null);
    }
  };

  /**
   * Toggles a tile's mark on a right click while picking tiles, or counts a terrain tag down in the passability editor;
   * the browser's own menu never opens over the palette.
   * @param {React.MouseEvent<HTMLCanvasElement>} event The right click.
   */
  const onContextMenu = (event: React.MouseEvent<HTMLCanvasElement>) =>
  {
    event.preventDefault();
    const { x, y } = pointOf(event);
    const cell = cellAtPoint(layout, x, y, size);
    if (cell === null)
    {
      return;
    }

    const { id } = layout.cells[cell.row * PALETTE_COLUMNS + cell.column];
    if (passability !== null)
    {
      if (passability.mode === 'terrain')
      {
        onFlagClick(id, flagClickAt(passability.mode, x, y, size, true));
      }

      return;
    }

    if (marks !== null && isASheetTile(id))
    {
      onToggleMark(id);
    }
  };

  return (
    <Box ref={boxRef} sx={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }} data-testid={'palette-cells'}>
      <Box
        component={'canvas'}
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onPointerLeave}
        onContextMenu={onContextMenu}
        sx={{
          display: 'block',
          width: PALETTE_COLUMNS * size,
          height: layout.rows * size,
          background: CHECKERBOARD,
          cursor: hover?.onBadge === true ? 'pointer' : 'default',
          touchAction: 'none',
        }}
      />
    </Box>
  );
};

export { flagClickAt, PaletteCanvas };
export type { PaletteCanvasProps, PaletteHover };
