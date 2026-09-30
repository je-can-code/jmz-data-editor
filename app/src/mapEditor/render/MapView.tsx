import React, { useEffect, useRef, useState } from 'react';
import { Box, Typography } from '@mui/material';
import type { Camera } from '../core/renderer/camera.ts';
import { useMapEditorServices } from '../services/MapEditorServicesContext.tsx';
import { MapViewController } from './MapViewController.ts';
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
};

/**
 * What the status line under the map says.
 */
type MapViewStatus = {
  readonly gpu: string;
  readonly zoom: number;
  readonly problem: string | null;
};

/**
 * Reads the map to open from a page's query string: the map editor page opens one straight away with {@code ?map=102},
 * so maps can be seen before the workspace shell mounts map views in its panels.
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
 * component mounts a renderer, opens the map into it, and shows a status line with the zoom and the GPU drawing it.
 * @param {MapViewProps} props The map to show.
 * @returns {React.JSX.Element} The view.
 */
const MapView = (props: MapViewProps) =>
{
  const { mapId } = props;
  const services = useMapEditorServices();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<MapViewController | null>(null);
  const [ status, setStatus ] = useState<MapViewStatus>({ gpu: '', zoom: 1, problem: null });

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
    const controller = new MapViewController(renderer, services, projectImagesFor(api));
    controllerRef.current = controller;
    const stops: (() => void)[] = [];
    stops.push(renderer.onCameraChange((camera: Camera) =>
    {
      setStatus(current => (current.zoom === camera.zoom ? current : { ...current, zoom: camera.zoom }));
    }));

    // the first frame that drew a map is when the page's first open finished, which is what a cold open times.
    const stopFirstFrame = renderer.onFrame(report =>
    {
      if (report.rebuiltChunks > 0)
      {
        speedTimings['firstFrameAt'] ??= performance.now();
        stopFirstFrame();
      }
    });
    stops.push(stopFirstFrame);
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
        if (map === null)
        {
          return;
        }

        setStatus(current => ({ ...current, problem: null }));
      })
      .catch((error: unknown) =>
      {
        setStatus(current => ({ ...current, problem: `Map ${mapId} could not be opened: ${String(error)}` }));
      });
  }, [ mapId ]);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
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
 * The page's open timings, shared with the speed hooks: when the first open began, landed, and first drew.
 */
const speedTimings: Record<string, number> = {};

export { MapView, mapIdFromQuery, speedTimings };
