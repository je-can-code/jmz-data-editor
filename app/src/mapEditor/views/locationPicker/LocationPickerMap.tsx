import React, { useEffect, useRef } from 'react';
import type { MapCell } from '../../core/renderer/camera.ts';
import { NO_OVERLAY_STATE, type CellRect, type MapRenderer, type OverlayId } from '../../core/renderer/MapRenderer.ts';
import { MapGlanceSurface, tileRect, useGlancePointer, useMapGlance } from '../../render/useMapGlance.tsx';

/**
 * What a location picker's map shows, and whom it tells about clicks.
 */
type LocationPickerMapProps = {
  /**
   * The map to show.
   */
  readonly mapId: number;

  /**
   * The tile picked on that map, outlined, or null while none is.
   */
  readonly picked: MapCell | null;

  /**
   * The tile to centre on once the map opens, at the game's own scale, or null to show the whole map.
   */
  readonly focus: MapCell | null;

  /**
   * Hears a tile clicked.
   * @param {MapCell} cell The tile.
   */
  readonly onPick: (cell: MapCell) => void;

  /**
   * Hears a tile double-clicked, which picks it and finishes.
   * @param {MapCell} cell The tile.
   */
  readonly onConfirm: (cell: MapCell) => void;
};

/**
 * The overlays a picker's map shows: the grid, so every tile reads as a tile; the tile picked and the one under the
 * pointer; and the markers of events that draw no picture, such as doors, so the spots beside them can be found.
 */
const PICKER_OVERLAYS: readonly OverlayId[] = [ 'grid', 'selection', 'hover', 'markers' ];

/**
 * Hands a renderer what a picker draws over the map: the tile under the pointer with its coordinates beside it, and
 * the tile picked. The picked tile is handed over as the same rectangle until it changes, so the pointer moving never
 * redraws it.
 * @param {MapRenderer | null} renderer The renderer, or null while there is none.
 * @param {MapCell | null} hover The tile under the pointer, or null.
 * @param {CellRect | null} picked The tile picked, or null.
 */
const showPickerOverlay = (renderer: MapRenderer | null, hover: MapCell | null, picked: CellRect | null): void =>
{
  renderer?.setOverlayState({
    ...NO_OVERLAY_STATE,
    hover: hover === null ? null : tileRect(hover),
    hoverLabel: hover === null ? null : `${hover.x}, ${hover.y}`,
    selectedCells: picked,
  });
};

/**
 * One map to pick a tile on, drawn by the real renderer as the game draws it, events and all, with the grid over it.
 * The wheel zooms and the right button pans, as in every map view; the left button picks the tile under it, and a
 * double-click picks it and finishes. The tile under the pointer shows its coordinates beside it.
 *
 * The map is only looked at, never held ({@link useMapGlance}). Each map opened centres on the focus tile when it has
 * one on that map, and otherwise shows the whole map. Until the map asked for has opened, the pointer picks nothing; a
 * map that cannot be opened says why in place of the canvas, and so does a window that cannot draw one more map just
 * now, as every map view does.
 * @param {LocationPickerMapProps} props The map, the tile picked, where to centre, and who hears the clicks.
 * @returns {React.JSX.Element} The map.
 */
const LocationPickerMap = (props: LocationPickerMapProps) =>
{
  const { mapId, picked, focus, onPick, onConfirm } = props;
  const host = useRef<HTMLDivElement | null>(null);
  const glance = useMapGlance({ host, mapId, focus, overlays: PICKER_OVERLAYS });
  const { renderer } = glance;
  const hoverRef = useRef<MapCell | null>(null);
  const pickedRef = useRef<CellRect | null>(null);

  // the tile under the pointer is drawn with its coordinates; the left button picks, a double-click finishes.
  useGlancePointer(host, glance, {
    onHover: cell =>
    {
      hoverRef.current = cell;
      showPickerOverlay(renderer.current, cell, pickedRef.current);
    },
    onPress: onPick,
    onDoublePress: onConfirm,
  });

  // outline the tile picked, keeping one rectangle for as long as the tile stays the same.
  useEffect(() =>
  {
    pickedRef.current = picked === null ? null : tileRect(picked);
    showPickerOverlay(renderer.current, hoverRef.current, pickedRef.current);
  }, [ renderer, picked ]);

  return <MapGlanceSurface host={host} glance={glance} testId={'location-picker-map'} cursor={'crosshair'}/>;
};

export { LocationPickerMap };
export type { LocationPickerMapProps };
