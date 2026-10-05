import React, { useEffect, useRef, useState, type RefObject } from 'react';
import { Box, Typography } from '@mui/material';
import { TILESETS_KEY, type DocumentKey } from '../core/model/documentKeys.ts';
import type { TilesetsDocument } from '../core/model/JsonDocument.ts';
import type { MapDocument } from '../core/model/MapDocument.ts';
import type { RmmzTileset } from '../core/model/rmmzTypes.ts';
import type { MapCell } from '../core/renderer/camera.ts';
import { GAME_LOOK, type CellRect, type OverlayDefinition, type OverlayId } from '../core/renderer/MapRenderer.ts';
import { lookAtDocument } from '../core/sync/lookAtDocument.ts';
import { useMapEditorServices } from '../services/MapEditorServicesContext.tsx';
import type { DrawState } from './ContextKeeper.ts';
import { DrawNotice, markerClassifierFor } from './MapView.tsx';
import { MapViewController } from './MapViewController.ts';
import { PixiMapRenderer } from './PixiMapRenderer.ts';
import { projectImagesFor } from './projectImages.ts';

/**
 * What a glance at a map shows: where to draw it, which map, where to centre, and which overlays.
 */
type MapGlanceOptions = {
  /**
   * The element the map is drawn into.
   */
  readonly host: RefObject<HTMLDivElement | null>;

  /**
   * The map to show.
   */
  readonly mapId: number;

  /**
   * The tile to centre on as each map opens, at the game's own scale, or null to show the whole map.
   */
  readonly focus: MapCell | null;

  /**
   * The core overlays to draw, beside the plugin modules' overlays that start on.
   */
  readonly overlays: readonly OverlayId[];

  /**
   * Overlays of the caller's own, drawn the way a plugin module's are and always on. Read once, as the view starts, so
   * each should draw from whatever it reads at the time, and the caller asks for a redraw when that changes.
   */
  readonly definitions?: readonly OverlayDefinition[];
};

/**
 * A map open in a glance: the map, and the tileset it draws with.
 */
type GlancedMap = {
  readonly map: MapDocument;
  readonly tileset: RmmzTileset;
};

/**
 * A glance at a map, as its caller drives it: the renderer, for overlays and redraws; the map asked for once it is
 * open; why it is not drawn, when it cannot be; and the tile under a pointer.
 */
type MapGlance = {
  readonly renderer: RefObject<PixiMapRenderer | null>;
  readonly opened: GlancedMap | null;
  readonly problem: string | null;
  readonly drawState: DrawState;

  /**
   * Finds the tile under a pointer, on the map asked for: while the map drawn is still the one before it, there is
   * none.
   * @param {MouseEvent} event The pointer's event.
   * @returns {MapCell | null} The tile, or null off the map or before the map asked for has opened.
   */
  readonly cellUnder: (event: MouseEvent) => MapCell | null;
};

/**
 * How far in the view sits when it centres on its focus: the game's own scale.
 */
const FOCUS_ZOOM = 1;

/**
 * No overlays of the caller's own.
 */
const NO_DEFINITIONS: readonly OverlayDefinition[] = [];

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
 * Shows one map to look at, never to edit, with the real renderer: the game's look, the markers of events that draw
 * no picture, and the overlays asked for. The wheel zooms and the right button pans, as in every map view; what the
 * left button does is the caller's. The map and its tilesets are only looked at ({@link lookAtDocument}), so a glance
 * in an event window never counts as keeping a copy of a map that window cannot save.
 *
 * Each map opened centres on the focus when it is on that map, and otherwise shows the whole map. An open that a
 * later one overtook lands nowhere; a map that cannot be opened says why through {@link MapGlance.problem}, unless the
 * caller has moved on from it.
 * @param {MapGlanceOptions} options Where to draw, which map, where to centre, and which overlays.
 * @returns {MapGlance} The glance.
 */
const useMapGlance = (options: MapGlanceOptions): MapGlance =>
{
  const { host, mapId, focus, overlays, definitions = NO_DEFINITIONS } = options;
  const services = useMapEditorServices();
  const rendererRef = useRef<PixiMapRenderer | null>(null);
  const controllerRef = useRef<MapViewController | null>(null);
  const tilesetsRef = useRef<TilesetsDocument | null>(null);
  const [ opened, setOpened ] = useState<GlancedMap | null>(null);
  const [ problem, setProblem ] = useState<string | null>(null);
  const [ drawState, setDrawState ] = useState<DrawState>('hidden');

  // what the renderer starts with and the opens read is whatever the caller asks for now.
  const latest = useRef({ mapId, focus, overlays, definitions });
  latest.current = { mapId, focus, overlays, definitions };

  // one renderer for the life of the glance, whatever map it shows.
  useEffect(() =>
  {
    const element = host.current;
    const { api, hub, sync, modules } = services;
    if (element === null || api === null)
    {
      return undefined;
    }

    // the window shares its GPU contexts among every map on screen, so this one can wait its turn, and says so.
    const renderer = new PixiMapRenderer();
    const stopDrawState = renderer.onDrawStateChange(setDrawState);
    renderer.mount(element);
    rendererRef.current = renderer;

    // the documents are looked at, never held; the tilesets are kept for the tileset a caller reads passability from.
    const look = async (key: DocumentKey) =>
    {
      const document = await lookAtDocument({ hub, sync }, key);
      if (key === TILESETS_KEY)
      {
        tilesetsRef.current = document as TilesetsDocument;
      }

      return document;
    };
    const controller = new MapViewController(renderer, { openDocument: look }, projectImagesFor(api));
    controllerRef.current = controller;

    // the game's own look, with events drawing no picture marked by the kind the window makes of them.
    const classify = markerClassifierFor(modules);
    renderer.setEventMarkers(classify);
    const stopModules = modules.subscribe(() => renderer.setEventMarkers(classify));
    const moduleDefinitions = modules.overlays();
    const own = latest.current.definitions;
    const shown = [
      ...latest.current.overlays,
      ...moduleDefinitions.filter(definition => definition.defaultOn).map(definition => definition.id),
      ...own.map(definition => definition.id),
    ];
    renderer.setLayerVisibility(GAME_LOOK);
    renderer.setOverlays({ enabled: new Set(shown), definitions: [ ...moduleDefinitions, ...own ] });

    return () =>
    {
      stopDrawState();
      stopModules();
      controller.close();
      controllerRef.current = null;
      rendererRef.current = null;
      renderer.destroy();
    };
  }, [ host, services ]);

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
        // an open another overtook comes back empty, and moves nothing.
        if (map === null)
        {
          return;
        }

        // an open that lands has read the tilesets, and found the map's own there, or it would have failed.
        const tileset = (tilesetsRef.current as TilesetsDocument).tileset(map.tilesetId) as RmmzTileset;
        setOpened({ map, tileset });

        // a focus off this map leaves the whole map shown.
        const { focus: centre } = latest.current;
        if (centre !== null && isOnMap(centre, map))
        {
          renderer.lookAt(centre, FOCUS_ZOOM);
        }
      })
      .catch((error: unknown) =>
      {
        // a map that cannot be opened says so, unless the glance has moved on from it.
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

  // one function for the life of the glance, reading the renderer and the map as they stand when the pointer moves.
  const [ cellUnder ] = useState(() => (event: MouseEvent): MapCell | null =>
  {
    const renderer = rendererRef.current;
    const element = host.current;
    const shown = controllerRef.current === null ? null : controllerRef.current.map;
    if (renderer === null || element === null || shown === null || shown.mapId !== latest.current.mapId)
    {
      return null;
    }

    const bounds = element.getBoundingClientRect();
    return renderer.cellAt({ x: event.clientX - bounds.left, y: event.clientY - bounds.top });
  });

  return {
    renderer: rendererRef,
    opened: opened !== null && opened.map.mapId === mapId ? opened : null,
    problem,
    drawState,
    cellUnder,
  };
};

/**
 * What a glance's caller does with the pointer: hears it reach another tile or leave the map, a press of the left
 * button on a tile, and a double-click on one.
 */
type GlancePointer = {
  readonly onHover: (cell: MapCell | null) => void;
  readonly onPress: (cell: MapCell) => void;
  readonly onDoublePress?: (cell: MapCell) => void;
};

/**
 * Listens to the pointer over a glance's map, on the map asked for: the tile it is over, told only when it reaches
 * another, and null when it leaves; a press of the left button on a tile, since the right one pans; and a double-click
 * on a tile. Nothing is heard off the map, or while the map drawn is still the one before the map asked for.
 * @param {RefObject<HTMLDivElement | null>} host The element the map is drawn into.
 * @param {MapGlance} glance The glance.
 * @param {GlancePointer} pointer What to do with the pointer.
 */
const useGlancePointer = (host: RefObject<HTMLDivElement | null>, glance: MapGlance, pointer: GlancePointer): void =>
{
  const { cellUnder } = glance;

  // the listeners outlive any one render, so they call whatever the caller hands over now.
  const latest = useRef(pointer);
  latest.current = pointer;

  useEffect(() =>
  {
    const element = host.current;
    if (element === null)
    {
      return undefined;
    }

    // the tile under the pointer is told only when the pointer reaches another, however much it moves inside one.
    let over: MapCell | null = null;
    const onPointerMove = (event: PointerEvent) =>
    {
      const cell = cellUnder(event);
      if (cell?.x === over?.x && cell?.y === over?.y)
      {
        return;
      }

      over = cell;
      latest.current.onHover(cell);
    };

    const onPointerLeave = () =>
    {
      over = null;
      latest.current.onHover(null);
    };

    // the right button belongs to panning, as on every map; the left one is the caller's.
    const onPointerDown = (event: PointerEvent) =>
    {
      const cell = event.button === 0 ? cellUnder(event) : null;
      if (cell !== null)
      {
        latest.current.onPress(cell);
      }
    };

    const onDoubleClick = (event: MouseEvent) =>
    {
      const cell = cellUnder(event);
      const { onDoublePress } = latest.current;
      if (cell !== null && onDoublePress !== undefined)
      {
        onDoublePress(cell);
      }
    };

    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerleave', onPointerLeave);
    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('dblclick', onDoubleClick);
    return () =>
    {
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerleave', onPointerLeave);
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('dblclick', onDoubleClick);
    };
  }, [ host, cellUnder ]);
};

/**
 * Makes one tile into a rectangle of cells, for an overlay.
 * @param {MapCell} cell The tile.
 * @returns {CellRect} The tile, one cell wide and high.
 */
const tileRect = (cell: MapCell): CellRect =>
{
  return { x: cell.x, y: cell.y, width: 1, height: 1 };
};

/**
 * Draws a glance: the element its map is drawn into, then over it why the map is not drawn, when it is not. A map
 * that cannot be opened covers the canvas with the reason, so the map before it never shows as though it were this one.
 * @param {{ host: RefObject<HTMLDivElement | null>, glance: MapGlance, testId: string, cursor?: string }} props Where the
 * map is drawn, the glance, the element's test id, and the pointer to show over the map.
 * @returns {React.JSX.Element} The glance's surface.
 */
const MapGlanceSurface = (props: { readonly host: RefObject<HTMLDivElement | null>; readonly glance: MapGlance; readonly testId: string; readonly cursor?: string }) =>
{
  const { host, glance, testId, cursor = 'default' } = props;
  return (
    <Box sx={{ position: 'absolute', inset: 0 }}>
      <Box data-testid={testId} ref={host} sx={{ position: 'absolute', inset: 0, overflow: 'hidden', backgroundColor: '#121212', cursor }}/>
      <DrawNotice state={glance.drawState}/>
      {glance.problem === null
        ? null
        : (
          <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', p: 2, bgcolor: 'background.default' }}>
            <Typography variant={'body1'} color={'error'}>
              {glance.problem}
            </Typography>
          </Box>
        )}
    </Box>
  );
};

export { MapGlanceSurface, tileRect, useGlancePointer, useMapGlance };
export type { GlancedMap, GlancePointer, MapGlance, MapGlanceOptions };
