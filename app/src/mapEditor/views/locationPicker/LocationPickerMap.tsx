import React, { useEffect, useRef, useState } from 'react';
import { Box, Typography } from '@mui/material';
import type { MapDocument } from '../../core/model/MapDocument.ts';
import type { MapCell } from '../../core/renderer/camera.ts';
import { GAME_LOOK, NO_OVERLAY_STATE, type CellRect, type MapRenderer, type OverlayId } from '../../core/renderer/MapRenderer.ts';
import { lookAtDocument } from '../../core/sync/lookAtDocument.ts';
import type { DrawState } from '../../render/ContextKeeper.ts';
import { DrawNotice, markerClassifierFor } from '../../render/MapView.tsx';
import { MapViewController } from '../../render/MapViewController.ts';
import { PixiMapRenderer } from '../../render/PixiMapRenderer.ts';
import { projectImagesFor } from '../../render/projectImages.ts';
import { useMapEditorServices } from '../../services/MapEditorServicesContext.tsx';

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
 * How far in the map sits when it centres on the tile a transfer lands on now: the game's own scale.
 */
const FOCUS_ZOOM = 1;

/**
 * Makes one tile into a rectangle of cells, for the overlay.
 * @param {MapCell} cell The tile.
 * @returns {CellRect} The tile, one cell wide and high.
 */
const tileRect = (cell: MapCell): CellRect =>
{
  return { x: cell.x, y: cell.y, width: 1, height: 1 };
};

/**
 * Reports whether a tile lies on a map.
 * @param {MapCell} cell The tile.
 * @param {MapDocument} map The map.
 * @returns {boolean} True when the map holds the tile.
 */
const isOnMap = (cell: MapCell, map: MapDocument): boolean =>
{
  return cell.x >= 0 && cell.y >= 0 && cell.x < map.width && cell.y < map.height;
};

/**
 * Hands a renderer what a picker draws over the map: the tile under the pointer with its coordinates beside it, and
 * the tile picked. The picked tile is handed over as the same rectangle until it changes, so the pointer moving never
 * redraws it.
 * @param {MapRenderer} renderer The renderer.
 * @param {MapCell | null} hover The tile under the pointer, or null.
 * @param {CellRect | null} picked The tile picked, or null.
 */
const showPickerOverlay = (renderer: MapRenderer, hover: MapCell | null, picked: CellRect | null): void =>
{
  renderer.setOverlayState({
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
 * Nothing here edits the map, and nothing holds it: the map and the tilesets are only looked at
 * ({@link lookAtDocument}), so a picker in an event window never counts as keeping a copy of a map it cannot save.
 * Each map opened centres on the focus tile when it has one on that map, and otherwise shows the whole map. Until the
 * map asked for has opened, the map drawn is the one before it, so the pointer picks nothing meanwhile; a map that
 * cannot be opened says why in place of the canvas, and so does a window that cannot draw one more map just now, as
 * every map view does.
 * @param {LocationPickerMapProps} props The map, the tile picked, where to centre, and who hears the clicks.
 * @returns {React.JSX.Element} The map.
 */
const LocationPickerMap = (props: LocationPickerMapProps) =>
{
  const { mapId, picked, focus, onPick, onConfirm } = props;
  const services = useMapEditorServices();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<PixiMapRenderer | null>(null);
  const controllerRef = useRef<MapViewController | null>(null);
  const hoverRef = useRef<MapCell | null>(null);
  const pickedRef = useRef<CellRect | null>(null);
  const [ problem, setProblem ] = useState<string | null>(null);
  const [ drawState, setDrawState ] = useState<DrawState>('hidden');

  // the pointer listeners outlive any one render, so they read the props as they stand now.
  const latest = useRef({ mapId, focus, onPick, onConfirm });
  latest.current = { mapId, focus, onPick, onConfirm };

  // one renderer for the life of the picker, whatever map it shows.
  useEffect(() =>
  {
    const host = hostRef.current;
    const { api, hub, sync, modules } = services;
    if (host === null || api === null)
    {
      return undefined;
    }

    // the window shares its GPU contexts among every map on screen, so the picker's map can wait its turn, and says so.
    const renderer = new PixiMapRenderer();
    const stopDrawState = renderer.onDrawStateChange(setDrawState);
    renderer.mount(host);
    rendererRef.current = renderer;
    const controller = new MapViewController(renderer, { openDocument: key => lookAtDocument({ hub, sync }, key) }, projectImagesFor(api));
    controllerRef.current = controller;

    // the game's own look, with events drawing no picture marked by the kind the window makes of them.
    const classify = markerClassifierFor(modules);
    renderer.setEventMarkers(classify);
    const stopModules = modules.subscribe(() => renderer.setEventMarkers(classify));
    const definitions = modules.overlays();
    const shownByModules = definitions.filter(definition => definition.defaultOn).map(definition => definition.id);
    renderer.setLayerVisibility(GAME_LOOK);
    renderer.setOverlays({ enabled: new Set([ ...PICKER_OVERLAYS, ...shownByModules ]), definitions });
    showPickerOverlay(renderer, null, pickedRef.current);

    /**
     * Finds the tile under the pointer, on the map asked for: while another map is still drawn there is none.
     * @param {MouseEvent} event The pointer's event.
     * @returns {MapCell | null} The tile, or null off the map or before the map asked for has opened.
     */
    const cellUnder = (event: MouseEvent): MapCell | null =>
    {
      const shown = controller.map;
      if (shown === null || shown.mapId !== latest.current.mapId)
      {
        return null;
      }

      const bounds = host.getBoundingClientRect();
      return renderer.cellAt({ x: event.clientX - bounds.left, y: event.clientY - bounds.top });
    };

    // the tile under the pointer is drawn with its coordinates, and drawn again only when the pointer reaches another.
    const onPointerMove = (event: PointerEvent) =>
    {
      const cell = cellUnder(event);
      const hover = hoverRef.current;
      if (cell?.x === hover?.x && cell?.y === hover?.y)
      {
        return;
      }

      hoverRef.current = cell;
      showPickerOverlay(renderer, cell, pickedRef.current);
    };

    const onPointerLeave = () =>
    {
      hoverRef.current = null;
      showPickerOverlay(renderer, null, pickedRef.current);
    };

    // the right button belongs to panning, as on every map; the left one picks.
    const onPointerDown = (event: PointerEvent) =>
    {
      const cell = event.button === 0 ? cellUnder(event) : null;
      if (cell !== null)
      {
        latest.current.onPick(cell);
      }
    };

    const onDoubleClick = (event: MouseEvent) =>
    {
      const cell = cellUnder(event);
      if (cell !== null)
      {
        latest.current.onConfirm(cell);
      }
    };

    host.addEventListener('pointermove', onPointerMove);
    host.addEventListener('pointerleave', onPointerLeave);
    host.addEventListener('pointerdown', onPointerDown);
    host.addEventListener('dblclick', onDoubleClick);

    return () =>
    {
      host.removeEventListener('pointermove', onPointerMove);
      host.removeEventListener('pointerleave', onPointerLeave);
      host.removeEventListener('pointerdown', onPointerDown);
      host.removeEventListener('dblclick', onDoubleClick);
      stopDrawState();
      stopModules();
      controller.close();
      controllerRef.current = null;
      rendererRef.current = null;
      renderer.destroy();
    };
  }, [ services ]);

  // open the map, and open again whenever another is asked for.
  useEffect(() =>
  {
    const controller = controllerRef.current;
    const renderer = rendererRef.current;
    if (controller === null || renderer === null)
    {
      return undefined;
    }

    let live = true;
    setProblem(null);
    controller.open(mapId)
      .then(map =>
      {
        // an open another overtook comes back empty, and moves nothing; a focus off this map leaves the whole map shown.
        const { focus: centre } = latest.current;
        if (map !== null && centre !== null && isOnMap(centre, map))
        {
          renderer.lookAt(centre, FOCUS_ZOOM);
        }
      })
      .catch((error: unknown) =>
      {
        // a map that cannot be opened says so, unless the picker has moved on from it.
        if (live)
        {
          setProblem(`Map ${mapId} could not be opened: ${String(error)}`);
        }
      });

    return () =>
    {
      live = false;
    };
  }, [ mapId ]);

  // outline the tile picked, keeping one rectangle for as long as the tile stays the same.
  useEffect(() =>
  {
    pickedRef.current = picked === null ? null : tileRect(picked);
    const renderer = rendererRef.current;
    if (renderer !== null)
    {
      showPickerOverlay(renderer, hoverRef.current, pickedRef.current);
    }
  }, [ picked ]);

  return (
    <Box sx={{ position: 'absolute', inset: 0 }}>
      <Box
        data-testid={'location-picker-map'}
        ref={hostRef}
        sx={{ position: 'absolute', inset: 0, overflow: 'hidden', backgroundColor: '#121212', cursor: 'crosshair' }}
      />
      <DrawNotice state={drawState}/>
      {problem === null
        ? null
        : (
          <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', p: 2, bgcolor: 'background.default' }}>
            <Typography variant={'body1'} color={'error'}>
              {problem}
            </Typography>
          </Box>
        )}
    </Box>
  );
};

export { LocationPickerMap };
export type { LocationPickerMapProps };
