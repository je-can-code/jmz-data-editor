import React, { useEffect, useRef, useState } from 'react';
import { Box, Chip, Divider, Typography } from '@mui/material';
import type { MapDocument } from '../core/model/MapDocument.ts';
import type { Camera, MapCell } from '../core/renderer/camera.ts';
import { GAME_LOOK, type OverlayId } from '../core/renderer/MapRenderer.ts';
import { useMapEditorServices } from '../services/MapEditorServicesContext.tsx';
import {
  flipSwitch,
  isSwitchOn,
  SETTING_SWITCHES,
  TILE_LAYERS,
  toggleHighlight,
  type MapViewSettings,
} from './mapViewSettings.ts';
import { MapViewController } from './MapViewController.ts';
import { whenMapDrawn } from './openTiming.ts';
import { pickEvent } from './pickedEvent.ts';
import { PixiMapRenderer } from './PixiMapRenderer.ts';
import { projectImagesFor } from './projectImages.ts';
import { installSpeedHooks, wantsSpeedHooks } from './speedHooks.ts';

/**
 * What a map view shows.
 */
type MapViewProps = {
  /**
   * The map to show.
   */
  readonly mapId: number;

  /**
   * The event to pick out once the map is open, such as the battler the data editor asked to see: it shows selected,
   * and the view centres on it. Null, or left out, picks out nothing.
   */
  readonly pickedEventId?: number | null;
};

/**
 * How far in the view sits when it centres on a picked event: the game's own scale.
 */
const PICKED_EVENT_ZOOM = 1;

/**
 * What the status line under the map says.
 */
type MapViewStatus = {
  readonly gpu: string;
  readonly zoom: number;
  readonly cell: MapCell | null;
  readonly problem: string | null;
};

/**
 * The overlays the tools draw into, on from the start: they draw nothing until a tool gives them something.
 */
const TOOL_OVERLAYS: readonly OverlayId[] = [ 'selection', 'hover', 'ghost' ];

/**
 * Reads the map to open from a page's query string: the map editor page opens one straight away with {@code ?map=102},
 * alone across the whole window in place of the workspace, which is the view the speed script and the parity check
 * measure.
 * @param {string} search The query string.
 * @returns {number | null} The map id, or null when none is asked for.
 */
const mapIdFromQuery = (search: string): number | null =>
{
  const value = new URLSearchParams(search).get('map');
  if (value === null || /^\d+$/u.test(value) === false)
  {
    return null;
  }

  const mapId = Number.parseInt(value, 10);
  return mapId > 0
    ? mapId
    : null;
};

/**
 * Words a zoom for the status line.
 * @param {number} zoom The zoom.
 * @returns {string} The zoom as a percentage.
 */
const zoomLabel = (zoom: number): string =>
{
  return `${Math.round(zoom * 100)}%`;
};

/**
 * One map, drawn as the game draws it, in whatever element hosts it. The drawing never goes through React: this
 * component mounts a renderer, opens the map into it, and offers a bar of switches for the overlays and the game look,
 * with a status line naming the zoom, the tile under the pointer and the GPU drawing it. An event picked out is shown
 * selected, with the view centred on it.
 * @param {MapViewProps} props The map to show, and the event to pick out.
 * @returns {React.JSX.Element} The view.
 */
const MapView = (props: MapViewProps) =>
{
  const { mapId, pickedEventId = null } = props;
  const services = useMapEditorServices();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<PixiMapRenderer | null>(null);
  const controllerRef = useRef<MapViewController | null>(null);
  const [ openMap, setOpenMap ] = useState<MapDocument | null>(null);
  const [ status, setStatus ] = useState<MapViewStatus>({ gpu: '', zoom: 1, cell: null, problem: null });
  const [ settings, setSettings ] = useState<MapViewSettings>({ visibility: GAME_LOOK, overlays: new Set(TOOL_OVERLAYS) });

  // one renderer for the life of the view, whatever map it shows.
  useEffect(() =>
  {
    const host = hostRef.current;
    const { api } = services;
    if (host === null || api === null)
    {
      setStatus(current => ({ ...current, problem: 'No project server is running, so there is no map to show.' }));
      return undefined;
    }

    const renderer = new PixiMapRenderer();
    renderer.mount(host);
    rendererRef.current = renderer;
    const controller = new MapViewController(renderer, services, projectImagesFor(api));
    controllerRef.current = controller;
    const stops: (() => void)[] = [];
    stops.push(renderer.onCameraChange((camera: Camera) =>
    {
      setStatus(current => (current.zoom === camera.zoom ? current : { ...current, zoom: camera.zoom }));
    }));

    // the first frame that shows the map complete, sprites and parallax included, ends the page's first open: the cold
    // open the speed script times.
    stops.push(whenMapDrawn(renderer, at =>
    {
      speedTimings['drawnAt'] ??= at;
    }));

    // the tile under the pointer, for the status line; React hears only when it changes.
    const onPointerMove = (event: PointerEvent) =>
    {
      const bounds = host.getBoundingClientRect();
      const cell = renderer.cellAt({ x: event.clientX - bounds.left, y: event.clientY - bounds.top });
      setStatus(current => (current.cell?.x === cell?.x && current.cell?.y === cell?.y ? current : { ...current, cell }));
    };
    host.addEventListener('pointermove', onPointerMove);
    stops.push(() => host.removeEventListener('pointermove', onPointerMove));

    renderer.whenReady()
      .then(() => setStatus(current => ({ ...current, gpu: renderer.rendererInfo()?.renderer ?? '' })))
      .catch(() => setStatus(current => ({ ...current, problem: 'This window cannot draw with the GPU.' })));

    const view = host.ownerDocument.defaultView;
    if (view !== null && wantsSpeedHooks(view.location.search))
    {
      stops.push(installSpeedHooks(view, {
        renderer,
        hub: services.hub,
        map: () => controller.map,
        openMap: async (next: number) =>
        {
          await controller.open(next);
        },
        timings: speedTimings,
      }));
    }

    return () =>
    {
      stops.forEach(stop => stop());
      controller.close();
      controllerRef.current = null;
      rendererRef.current = null;
      renderer.destroy();
    };
  }, [ services ]);

  // open the map, and open again whenever the map asked for changes.
  useEffect(() =>
  {
    const controller = controllerRef.current;
    if (controller === null)
    {
      return;
    }

    speedTimings['openStartAt'] = performance.now();
    controller.open(mapId)
      .then(map =>
      {
        speedTimings['openedAt'] = performance.now();
        if (map !== null)
        {
          setOpenMap(map);
          setStatus(current => ({ ...current, problem: null }));
        }
      })
      .catch((error: unknown) =>
      {
        setStatus(current => ({ ...current, problem: `Map ${mapId} could not be opened: ${String(error)}` }));
      });
  }, [ mapId ]);

  // pick out the event asked for once the map is open, and again whenever another is asked for; only a new pick moves
  // the view, so panning away from it afterwards is never undone.
  useEffect(() =>
  {
    const renderer = rendererRef.current;
    if (renderer === null || openMap === null)
    {
      return;
    }

    const picked = pickEvent(openMap, pickedEventId);
    renderer.setOverlayState(picked.overlay);
    if (picked.cell !== null)
    {
      renderer.lookAt(picked.cell, PICKED_EVENT_ZOOM);
    }
  }, [ openMap, pickedEventId ]);

  // hand the renderer the switches, the modules' overlays and their passability rules.
  useEffect(() =>
  {
    const renderer = rendererRef.current;
    if (renderer === null)
    {
      return;
    }

    const definitions = services.modules.overlays();
    const enabled = new Set<OverlayId>(settings.overlays);
    definitions.filter(definition => definition.defaultOn).forEach(definition => enabled.add(definition.id));
    renderer.setLayerVisibility(settings.visibility);
    renderer.setOverlays({ enabled, definitions });
    renderer.setPassabilityRules(services.modules.passabilityRules());
  }, [ services, settings ]);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.5, px: 1, py: 0.5, borderBottom: 1, borderColor: 'divider' }}>
        {SETTING_SWITCHES.map(setting => (
          <Chip
            color={isSwitchOn(settings, setting) ? 'primary' : 'default'}
            key={setting.label}
            label={setting.label}
            onClick={() => setSettings(current => flipSwitch(current, setting))}
            size={'small'}
            variant={isSwitchOn(settings, setting) ? 'filled' : 'outlined'}
          />
        ))}
        <Divider flexItem orientation={'vertical'} sx={{ mx: 0.5 }}/>
        <Typography variant={'caption'} color={'text.secondary'}>
          Highlight layer
        </Typography>
        {TILE_LAYERS.map((layer, index) => (
          <Chip
            color={settings.visibility.highlighted === layer ? 'primary' : 'default'}
            key={layer}
            label={String(index + 1)}
            onClick={() => setSettings(current => toggleHighlight(current, layer))}
            size={'small'}
            variant={settings.visibility.highlighted === layer ? 'filled' : 'outlined'}
          />
        ))}
      </Box>
      <Box
        data-testid={'map-view'}
        ref={hostRef}
        sx={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden', backgroundColor: '#121212' }}
      />
      <Box sx={{ display: 'flex', gap: 2, px: 1, py: 0.25, borderTop: 1, borderColor: 'divider' }}>
        <Typography variant={'caption'} color={'text.secondary'}>
          {`Map ${mapId}`}
        </Typography>
        <Typography variant={'caption'} color={'text.secondary'}>
          {zoomLabel(status.zoom)}
        </Typography>
        <Typography variant={'caption'} color={'text.secondary'}>
          {status.cell === null ? '' : `${status.cell.x}, ${status.cell.y}`}
        </Typography>
        <Typography variant={'caption'} color={status.problem === null ? 'text.secondary' : 'error'} sx={{ flex: 1 }}>
          {status.problem ?? ''}
        </Typography>
        <Typography variant={'caption'} color={'text.secondary'} title={'The graphics card drawing this map'}>
          {status.gpu}
        </Typography>
      </Box>
    </Box>
  );
};

/**
 * The page's open timings, shared with the speed hooks: when the first open began, landed, and first drew the map
 * complete (drawnAt).
 */
const speedTimings: Record<string, number> = {};

export { MapView, mapIdFromQuery, speedTimings };
