import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Box, Chip, Divider, Stack, Typography } from '@mui/material';
import { linkGateFor } from '../core/blueprints/blueprintPlacement.ts';
import { BLUEPRINTS_DOCUMENT } from '../core/blueprints/blueprints.ts';
import { footprintReaderFor } from '../core/eventKinds/eventFootprints.ts';
import { markerSymbolFor } from '../core/eventKinds/eventMarkers.ts';
import { EventSelection } from '../core/events/EventSelection.ts';
import { isBlueprintMapId } from '../core/model/documentKeys.ts';
import type { MapDocument } from '../core/model/MapDocument.ts';
import type { RmmzEventPage, RmmzMapEvent } from '../core/model/rmmzTypes.ts';
import type { ModuleNotice } from '../core/modules/PluginModule.ts';
import type { PluginModuleRegistry } from '../core/modules/PluginModuleRegistry.ts';
import { previewNouns } from '../core/preview/previewWords.ts';
import type { Camera, MapCell } from '../core/renderer/camera.ts';
import { GAME_LOOK, type MarkerClassifier, type OverlayId } from '../core/renderer/MapRenderer.ts';
import { openTilesetMarks } from '../core/palette/tilesetMarkEdits.ts';
import { STAMP_CLIPBOARD_MARKER } from '../core/stamps/stampClipboard.ts';
import { TilesetLayeringSource } from '../core/tools/tilesetLayering.ts';
import type { WindowPaint } from '../core/tools/WindowPaint.ts';
import { MAP_VIEW_ATTRIBUTE } from '../core/workspace/mapKeys.ts';
import { EventMenu } from '../events/EventMenu.tsx';
import { MapEventTools, type EventMenuRequest, type EventNoticeSeverity, type EventToolsRenderer } from '../events/MapEventTools.ts';
import { useMapEditorServices } from '../services/MapEditorServicesContext.tsx';
import { MapStampTools } from '../stamps/MapStampTools.ts';
import { openEventWindow, openSwitchesVariablesWindow } from '../views/mapEditorViews.ts';
import { useTransferPlacer } from '../views/transferPairs/useTransferPlacer.tsx';
import { ClockChip } from './ClockChip.tsx';
import type { DrawState } from './ContextKeeper.ts';
import {
  flipSwitch,
  isSwitchOn,
  shownSwitches,
  TILE_LAYERS,
  toggleHighlight,
  type MapViewSettings,
} from './mapViewSettings.ts';
import { MapViewController } from './MapViewController.ts';
import { whenMapDrawn } from './openTiming.ts';
import { OverlayComposer } from './overlayComposer.ts';
import { usePaletteLinks } from './paletteLinks.ts';
import { PixiMapRenderer } from './PixiMapRenderer.ts';
import { PreviewChip } from './PreviewChip.tsx';
import { projectImagesFor } from './projectImages.ts';
import { SkyChip } from './SkyChip.tsx';
import { followSky } from './skyFollower.ts';
import { installSpeedHooks, wantsSpeedHooks } from './speedHooks.ts';
import { followToolInHand } from './tools/leftButton.ts';
import { PaintController } from './tools/PaintController.ts';
import { PaintToolBar } from './tools/PaintToolBar.tsx';

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

  /**
   * The number of the ask that named the event to pick out. A new number picks the same event out again, selecting it
   * and centring on it, as a second click on the same link in the data editor asks. Left out, each event is picked out
   * once.
   */
  readonly pickRequest?: number;

  /**
   * The cell to centre on once the map is open, such as the middle of a blueprint's placement the Blueprints section
   * asked to see. Null, or left out, centres on nothing.
   */
  readonly lookAtCell?: MapCell | null;

  /**
   * The number of the ask that named the cell; a new number centres on the same cell again. Left out, each cell is
   * centred on once.
   */
  readonly lookRequest?: number;

  /**
   * Whether the view is on screen; false while its panel is a tab behind another. A view off screen lets its GPU
   * context go and draws again, as it was, when it shows. Left out, the view is on screen.
   */
  readonly visible?: boolean;

  /**
   * The window's event selection, which every map view and the quick panel share. Left out, as on a page showing one
   * map alone, the view keeps a selection of its own.
   */
  readonly selection?: EventSelection;

  /**
   * Tells the author something, such as why a drop was refused. Left out, the view says it in its status line.
   */
  readonly onNotice?: (text: string, severity: EventNoticeSeverity) => void;

  /**
   * What the view paints with: its window's paint, which the window's palette and layer strip choose. Left out, the
   * page's own.
   */
  readonly paint?: WindowPaint;

  /**
   * The number of the ask to give the view the keyboard, as bringing its tab forward asks, so a paste or a copy acts on
   * this map at once; a new number gives it the keys again. Left out, or 0, the view takes the keys only when clicked.
   */
  readonly keysRequest?: number;
};

/**
 * What the view says over the map when it cannot draw it, by draw state; the states not named draw, or are about to.
 */
const DRAW_NOTICES: Partial<Record<DrawState, { readonly title: string; readonly detail: string }>> = {
  waiting: {
    title: 'Too many maps are on screen at once to draw this one.',
    detail: 'Close a map, or stack it behind another tab, and this one draws.',
  },
  recovering: {
    title: 'The graphics card let go of this map for a moment.',
    detail: 'Drawing it again…',
  },
  failed: {
    title: 'This window cannot draw maps with the graphics card.',
    detail: 'Restarting the editor may bring it back.',
  },
};

/**
 * How far in the view sits when it centres on a picked event: the game's own scale.
 */
const PICKED_EVENT_ZOOM = 1;

/**
 * What the status line under the map says: the GPU, the zoom, the tile under the pointer, why the map is missing, and
 * the last thing the event tools said, when nobody else hears them.
 */
type MapViewStatus = {
  readonly gpu: string;
  readonly zoom: number;
  readonly cell: MapCell | null;
  readonly problem: string | null;
  readonly note: string;
};

/**
 * The overlays on from the start: the ones the tools draw into, which draw nothing until a tool gives them something,
 * and the markers of events that draw no picture, which show for as long as the events do.
 */
const STARTING_OVERLAYS: readonly OverlayId[] = [ 'selection', 'hover', 'ghost', 'markers' ];

/**
 * Builds how a view's markers pick their symbol: by the kind the window's registry makes of each event on its map, a
 * kind's own symbol, or the trigger of the page the event shows when no kind claims it or the kind names none.
 * @param {PluginModuleRegistry} modules The window's kinds.
 * @returns {MarkerClassifier} The classifier.
 */
const markerClassifierFor = (modules: PluginModuleRegistry): MarkerClassifier =>
{
  return (event: RmmzMapEvent, mapId: number, page?: RmmzEventPage) => markerSymbolFor(event, modules.kindOf(event, mapId), page);
};

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
 * Names what the view shows, for the status line: the map by its number, or a blueprint opened as a map, whose number is
 * no map's.
 * @param {number} mapId The map, or the id a blueprint opened as a map takes.
 * @returns {string} Such as "Map 12", or "Blueprint".
 */
const mapLabel = (mapId: number): string =>
{
  return isBlueprintMapId(mapId)
    ? 'Blueprint'
    : `Map ${mapId}`;
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
 * Says over the map what keeps it from drawing as the game would, in plain words. Why it is not drawing at all (every
 * context the window may keep is taken by maps on screen, the graphics card let go of it for a moment, or the window
 * cannot draw) is centred over the empty canvas. What the plugin modules say, such as a config one could not read and
 * what it draws differently because of it, sits in a strip along the top for as long as they say it, over the map
 * without hiding it, and lets the pointer through to the map beneath.
 * @param {{ state: DrawState, notices?: readonly ModuleNotice[] }} props Where the drawing stands, and what the modules
 * say; nothing, when left out.
 * @returns {React.JSX.Element | null} The notices, or nothing while the map draws and no module has anything to say.
 */
const DrawNotice = (props: { state: DrawState; notices?: readonly ModuleNotice[] }) =>
{
  const { state, notices = [] } = props;
  const notice = DRAW_NOTICES[state];
  if (notice === undefined && notices.length === 0)
  {
    return null;
  }

  return (
    <>
      {notice !== undefined && (
        <Box
          data-testid={'map-draw-notice'}
          sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', p: 2, textAlign: 'center', pointerEvents: 'none' }}
        >
          <Box>
            <Typography variant={'body1'} color={'text.secondary'}>
              {notice.title}
            </Typography>
            <Typography variant={'body2'} color={'text.disabled'}>
              {notice.detail}
            </Typography>
          </Box>
        </Box>
      )}
      {notices.length > 0 && (
        <Stack
          data-testid={'map-module-notices'}
          spacing={0.75}
          sx={{ position: 'absolute', top: 8, left: 8, right: 8, alignItems: 'flex-start', pointerEvents: 'none' }}
        >
          {notices.map(each => (
            <Box
              key={each.id}
              role={'status'}
              sx={{ maxWidth: 720, px: 1.5, py: 0.75, bgcolor: 'background.paper', borderLeft: 4, borderColor: 'warning.main', borderRadius: 1, boxShadow: 4 }}
            >
              <Typography variant={'body2'}>
                {each.title}
              </Typography>
              <Typography variant={'caption'} color={'text.secondary'}>
                {each.detail}
              </Typography>
            </Box>
          ))}
        </Stack>
      )}
    </>
  );
};

/**
 * One map, drawn as the game draws it, in whatever element hosts it. The drawing never goes through React: this
 * component mounts a renderer, opens the map into it, and offers a bar of switches for the overlays and the game look
 * (Lighting among them while a plugin module lights the map, Weather while one draws its weather, the window's one
 * clock while a module offers a time of day, the sky drawn and each event's page shown at its hour and in its season,
 * and the sky's weather picked beside it while a module offers a sky, every outdoor map drawn under it at that moment),
 * the window's preview beside it, saying how far along the story the maps show the game, the painting tools, and a
 * status line naming the zoom, the tile under the pointer, how many events are selected and the GPU drawing it. Each
 * event shows the page the game would at the clock's time and date, with the preview's switches and variables set and a
 * fresh save's everything else, by the window's page rule, and the area that page covers, joined to its marker, while a
 * plugin module reads areas, as J-Pixelistics' does; the areas show and hide with the Events switch.
 *
 * The view paints with its window's paint: the page's own for a map docked in the main window, and a torn-out window's
 * own for a map torn out, so each window's palette, layer strip and tools go together and no further.
 *
 * The tool in hand decides what the left button does. With the events in hand, the map's events are selected, moved,
 * created and deleted with the mouse, the keys and a right-click menu, through {@link MapEventTools}, into the window's
 * selection; with any painting tool in hand the left button paints, previewed before each click, and the event tools
 * stand down; with the stamp in hand each click places it. Whatever tool is in hand, Ctrl+C and Ctrl+X make a stamp of
 * the select tool's area or of the events selected, and Ctrl+V places the newest stamp, through {@link MapStampTools}.
 * An event picked out, such as the battler the data editor asked to see, becomes the selection, with the view centred
 * on it at the game's scale; an event picked from the events list is centred at the zoom the view already has. A cell
 * asked for, such as the middle of a blueprint's placement, is centred on at the game's scale.
 *
 * A view off screen, behind another tab, lets its GPU context go and draws again, camera and all, when it shows; a map
 * that cannot draw says why over the canvas rather than leaving it blank, and whatever the plugin modules say, such as
 * a config they could not read, shows along the top of the map for as long as they say it.
 * @param {MapViewProps} props The map to show, the event to pick out, the cell to centre on, whether the view is on
 * screen, the selection, where notices go, and what it paints with.
 * @returns {React.JSX.Element} The view.
 */
const MapView = (props: MapViewProps) =>
{
  const { mapId, pickedEventId = null, pickRequest = 0, lookAtCell = null, lookRequest = 0, visible = true, onNotice, keysRequest = 0 } = props;
  const services = useMapEditorServices();
  const paint = props.paint ?? services.paints.main;
  const { painting } = paint;
  const hostRef = useRef<HTMLDivElement | null>(null);

  // each new ask hands the view the keyboard, without scrolling anything to bring it into sight.
  useEffect(() =>
  {
    if (keysRequest > 0)
    {
      hostRef.current?.focus({ preventScroll: true });
    }
  }, [ keysRequest ]);
  const rendererRef = useRef<PixiMapRenderer | null>(null);
  const controllerRef = useRef<MapViewController | null>(null);
  const toolsRef = useRef<MapEventTools | null>(null);
  const stampToolsRef = useRef<MapStampTools | null>(null);
  const visibleRef = useRef(visible);
  const [ ownSelection ] = useState(() => new EventSelection());
  const selection = props.selection ?? ownSelection;
  const selected = useSyncExternalStore(selection.subscribe, selection.get);

  // the plugin modules switch on once js/plugins.js is read, which can be after the bar first drew; whether any of them
  // lights the map decides whether the bar offers its Lighting switch, whether any draws weather its Weather switch,
  // whether one offers a clock, its clock, whether one offers a sky, its sky, and the kinds of state they let the preview
  // set, what the preview chip calls them; and the overlays and passability rules they add reach the renderer then.
  const moduleRevision = useSyncExternalStore(services.modules.subscribe, () => services.modules.revision);

  // what the modules say over the map can change while they are on, such as a config read only once a map needed it.
  useSyncExternalStore(services.modules.subscribeNotices, () => services.modules.noticesRevision);
  const switches = shownSwitches(services.modules.lightingLayers().length > 0, services.modules.weatherLayers().length > 0);
  const clockOffer = services.modules.clockOffer();
  const skyOffer = services.modules.skyOffer();
  const nouns = previewNouns(services.modules.previewKinds());
  const [ openMap, setOpenMap ] = useState<MapDocument | null>(null);
  const [ status, setStatus ] = useState<MapViewStatus>({ gpu: '', zoom: 1, cell: null, problem: null, note: '' });
  const [ settings, setSettings ] = useState<MapViewSettings>({ visibility: GAME_LOOK, overlays: new Set(STARTING_OVERLAYS) });
  const [ drawState, setDrawState ] = useState<DrawState>('hidden');
  const [ menu, setMenu ] = useState<EventMenuRequest | null>(null);

  // the event tools outlive any one render, so they tell the author through whoever listens now.
  const notifyRef = useRef<(text: string, severity: EventNoticeSeverity) => void>(() => undefined);
  notifyRef.current = onNotice ?? ((text: string) => setStatus(current => ({ ...current, note: text })));

  // the transfer placer the menu opens from a tile, which tells the author what it placed.
  const placer = useTransferPlacer(mapId, text => notifyRef.current(text, 'info'));

  // keep up with whether the view is on screen, for a renderer mounted after this, which must know before it mounts:
  // a view mounted behind another tab makes no GPU context until it shows.
  useEffect(() =>
  {
    visibleRef.current = visible;
  }, [ visible ]);

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
    const stops: (() => void)[] = [ renderer.onDrawStateChange(setDrawState) ];
    renderer.setVisible(visibleRef.current);
    renderer.mount(host);
    rendererRef.current = renderer;
    const controller = new MapViewController(renderer, services, projectImagesFor(api));
    controllerRef.current = controller;

    // events that draw no picture show markers by their kind, which reads differently once the plugin modules switch on;
    // so do the areas events' pages cover, which the modules read, each shown joined to its marker.
    const classify = markerClassifierFor(services.modules);
    renderer.setEventMarkers(classify);
    stops.push(services.modules.subscribe(() => renderer.setEventMarkers(classify)));
    const footprints = footprintReaderFor(services.modules);
    renderer.setEventFootprints(footprints);
    stops.push(services.modules.subscribe(() => renderer.setEventFootprints(footprints)));

    // the lighting layer holds what the plugin modules draw there, which changes as they switch on and off, and draws the
    // sky at the hour the window's clock shows, which every view in the window follows as it moves; each event shows the
    // page the window's page rule picks at that hour, the rule changing as the modules switch on and the new game is read.
    renderer.setLightingLayers(services.modules.lightingLayers());
    stops.push(services.modules.subscribe(() => renderer.setLightingLayers(services.modules.lightingLayers())));

    // the weather layer likewise holds what the modules draw there, the map's own weather falling over it.
    renderer.setWeatherLayers(services.modules.weatherLayers());
    stops.push(services.modules.subscribe(() => renderer.setWeatherLayers(services.modules.weatherLayers())));
    renderer.setPageRule(services.pages.rule());
    stops.push(services.pages.subscribe(() => renderer.setPageRule(services.pages.rule())));

    // the clock's season moves the date the page rule reads, so it goes to the renderer with the time, each untouched
    // when the other moves.
    const followClock = () =>
    {
      renderer.setTimeOfDay(services.clock.time());
      renderer.setSeason(services.clock.season());
    };
    followClock();
    stops.push(services.clock.subscribe(followClock));

    // the sky's weather follows the clock too, while a module offers a sky and the author has picked one; with none
    // picked, the renderer is told nothing and nothing is read for it.
    stops.push(followSky(renderer, services.clock, services.modules));

    // the marks on transfers whose landings fail are drawn again whenever the landings learn more, such as a map they
    // land on having been read.
    stops.push(services.landings.subscribe(() => renderer.refreshOverlays()));

    // the pages are judged at the window's preview too, the switches and variables set in place of a fresh save's, and a
    // change to it draws again only the events whose pages read what changed.
    renderer.setPreview(services.preview.preview());
    stops.push(services.preview.subscribe(() => renderer.setPreview(services.preview.preview())));
    stops.push(renderer.onCameraChange((camera: Camera) =>
    {
      setStatus(current => (current.zoom === camera.zoom ? current : { ...current, zoom: camera.zoom }));
    }));

    // the event tools and the painting tools each hand the renderer their part of the overlay. Neither places a copy of a
    // blueprint on a map whose events a plugin copies while the game runs, which the plugin modules say.
    const overlays = new OverlayComposer(renderer);
    const layering = new TilesetLayeringSource(services.hub);
    const linkRefusal = linkGateFor(services.modules);
    const painter = new PaintController({
      surface: renderer,
      hub: services.hub,
      map: () => controller.map,
      layering: map => layering.layeringFor(map),
      painting,
      overlay: part => overlays.update('tools', part),
      onStamped: outcome => stampTools.settle(outcome),
      onTold: (message, refused) => notifyRef.current(message, refused ? 'error' : 'info'),
      linkRefusal,
    });
    stops.push(painter.attach());

    // the "goes on top" marks decide where painted tiles land, so they are held from the start, through the same open
    // the palette uses: a project that never saved marks is seeded from its maps first, where opening the document
    // straight away would hold an empty set in the seed's place, and the first mark toggled would save over the seed.
    openTilesetMarks(services).catch(() => undefined);

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

    // a window that cannot draw says so over the map, through the draw state.
    renderer.whenReady()
      .then(() => setStatus(current => ({ ...current, gpu: renderer.rendererInfo()?.renderer ?? '' })))
      .catch(() => undefined);

    // the events on the map answer the mouse, the keys and the clipboard through the tools, never through React; what
    // they show goes through the composer, beside the painting tools' part.
    const eventRenderer: EventToolsRenderer = {
      get canvas()
      {
        return renderer.canvas;
      },
      get camera()
      {
        return renderer.camera;
      },
      eventAt: point => renderer.eventAt(point),
      setOverlayState: state => overlays.update('events', state),
      onContextMenu: listener => renderer.onContextMenu(listener),
      onCameraChange: listener => renderer.onCameraChange(listener),
    };
    const tools = new MapEventTools({
      renderer: eventRenderer,
      host,
      hub: services.hub,
      selection,
      openEvent: (openedMapId: number, eventId: number) =>
      {
        if (openEventWindow(services.shell, openedMapId, eventId) === 'blocked')
        {
          notifyRef.current('The event\'s window was blocked; allow pop-ups for the editor to open it.', 'error');
        }
      },
      notify: (text: string, severity: EventNoticeSeverity) => notifyRef.current(text, severity),
      openMenu: setMenu,
      linkRefusal,
    });
    toolsRef.current = tools;

    // copying, cutting and pasting go through stamps, whichever tool is in hand: the select tool's area or the events
    // selected become a stamp, and a paste places the newest one, waiting while a drag, a box or a stroke is in hand.
    const stampTools = new MapStampTools({
      renderer: eventRenderer,
      host,
      hub: services.hub,
      stamps: services.stamps,
      selection,
      painting,
      tileArea: () => painter.session.selection,
      busy: () => painter.session.isActive || tools.busy,
      tilesetMode: map => layering.layeringFor(map).mode,
      readClipboard: () => services.shell.readClipboard(STAMP_CLIPBOARD_MARKER),
      notify: (text: string, severity: EventNoticeSeverity) => notifyRef.current(text, severity),
      linkRefusal,
      openBlueprints: () => services.openDocument(BLUEPRINTS_DOCUMENT),
    });
    stampToolsRef.current = stampTools;

    // the left button is the event tools' only while the events are in hand; a painting tool stands them down.
    stops.push(followToolInHand(painting, tools));

    // an event picked from a list comes into sight, centred at the zoom the view has, so browsing the list row by row
    // walks the map without zooming it in and out.
    stops.push(selection.onReveal(request =>
    {
      const shown = controller.map;
      const event = shown === null || shown.mapId !== request.mapId ? null : shown.event(request.eventId);
      if (event !== null)
      {
        renderer.lookAt({ x: event.x, y: event.y }, renderer.camera.zoom);
      }
    }));

    const view = host.ownerDocument.defaultView;
    if (view !== null && wantsSpeedHooks(view.location.search))
    {
      stops.push(installSpeedHooks(view, {
        renderer,
        hub: services.hub,
        painter,
        painting,
        tools,
        selection,
        map: () => controller.map,
        openMap: async (next: number) =>
        {
          const opened = await controller.open(next);
          if (opened !== null)
          {
            tools.setMap(opened);
            stampTools.setMap(opened);
          }
        },
        timings: speedTimings,
        lightingLayers: () => services.modules.lightingLayers(),
        weatherLayers: () => services.modules.weatherLayers(),
        mapProperties: () => services.modules.mapPropertiesSections(),
        clock: services.clock,
      }));
    }

    return () =>
    {
      stops.forEach(stop => stop());
      tools.destroy();
      toolsRef.current = null;
      stampTools.destroy();
      stampToolsRef.current = null;
      controller.close();
      controllerRef.current = null;
      rendererRef.current = null;
      renderer.destroy();
    };
  }, [ services, selection, painting ]);

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
          toolsRef.current?.setMap(map);
          stampToolsRef.current?.setMap(map);
          setOpenMap(map);
          setStatus(current => ({ ...current, problem: null }));
        }
      })
      .catch((error: unknown) =>
      {
        setStatus(current => ({ ...current, problem: `${mapLabel(mapId)} could not be opened: ${String(error)}` }));
      });
  }, [ mapId ]);

  // pick out the event asked for once the map is open, and again whenever another is asked for, or the same one is
  // asked for again: it becomes the selection, and the view centres on it. Only a new ask moves the view, so panning
  // away afterwards is never undone.
  useEffect(() =>
  {
    const renderer = rendererRef.current;
    const tools = toolsRef.current;
    if (renderer === null || tools === null || openMap === null || pickedEventId === null)
    {
      return;
    }

    const cell = tools.pick(pickedEventId);
    if (cell !== null)
    {
      renderer.lookAt(cell, PICKED_EVENT_ZOOM);
    }
  }, [ openMap, pickedEventId, pickRequest ]);

  // centre on the cell asked for once the map is open, and again whenever another is asked for, or the same one again;
  // like a picked event, only a new ask moves the view, so the cell is followed by its column and row, whatever object
  // carries them.
  const lookX = lookAtCell === null ? null : lookAtCell.x;
  const lookY = lookAtCell === null ? null : lookAtCell.y;
  useEffect(() =>
  {
    const renderer = rendererRef.current;
    if (renderer !== null && openMap !== null && lookX !== null && lookY !== null)
    {
      renderer.lookAt({ x: lookX, y: lookY }, PICKED_EVENT_ZOOM);
    }
  }, [ openMap, lookX, lookY, lookRequest ]);

  // hand the renderer the switches, the modules' overlays and their passability rules, again whenever the modules switch
  // on, which can be after the map first drew.
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
  }, [ services, settings, moduleRevision ]);

  // tell the renderer as the view goes behind another tab and comes back.
  useEffect(() =>
  {
    rendererRef.current?.setVisible(visible);
  }, [ visible ]);

  // the window's layer strip and passability editor, and the stack view, followed from this view.
  usePaletteLinks({ host: hostRef, renderer: rendererRef, mapId, settings, setSettings, selection: paint.selection, mode: paint.mode });

  /**
   * Opens the Switches & Variables window, where the preview is changed, saying so when the window was blocked.
   */
  const openPreview = () =>
  {
    if (openSwitchesVariablesWindow(services.shell) === 'blocked')
    {
      notifyRef.current('The Switches & Variables window was blocked; allow pop-ups for the editor to open it.', 'error');
    }
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.5, px: 1, py: 0.5, borderBottom: 1, borderColor: 'divider' }}>
        {switches.map(setting => (
          <Chip
            color={isSwitchOn(settings, setting) ? 'primary' : 'default'}
            key={setting.label}
            label={setting.label}
            onClick={() => setSettings(current => flipSwitch(current, setting))}
            size={'small'}
            variant={isSwitchOn(settings, setting) ? 'filled' : 'outlined'}
          />
        ))}
        {clockOffer !== null && (
          <ClockChip clock={services.clock} partOfDay={clockOffer.partOfDay} seasons={clockOffer.seasons}/>
        )}
        {skyOffer !== null && (
          <SkyChip clock={services.clock} offer={skyOffer}/>
        )}
        <PreviewChip preview={services.preview} nouns={nouns} onOpen={() => openPreview()}/>
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
      <PaintToolBar painting={painting}/>
      <Box sx={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <Box
          data-testid={'map-view'}
          {...{ [MAP_VIEW_ATTRIBUTE]: true }}
          ref={hostRef}
          tabIndex={0}
          sx={{ position: 'absolute', inset: 0, overflow: 'hidden', backgroundColor: '#121212', outline: 'none' }}
        />
        <DrawNotice state={drawState} notices={services.modules.notices()}/>
      </Box>
      <Box sx={{ display: 'flex', gap: 2, px: 1, py: 0.25, borderTop: 1, borderColor: 'divider' }}>
        <Typography variant={'caption'} color={'text.secondary'}>
          {mapLabel(mapId)}
        </Typography>
        <Typography variant={'caption'} color={'text.secondary'}>
          {zoomLabel(status.zoom)}
        </Typography>
        <Typography variant={'caption'} color={'text.secondary'}>
          {status.cell === null ? '' : `${status.cell.x}, ${status.cell.y}`}
        </Typography>
        <Typography variant={'caption'} color={'text.secondary'} data-testid={'map-selection-count'}>
          {selectedLabel(selected.mapId === mapId ? selected.eventIds.length : 0)}
        </Typography>
        <Typography variant={'caption'} color={status.problem === null ? 'text.secondary' : 'error'} sx={{ flex: 1 }}>
          {status.problem ?? status.note}
        </Typography>
        <Typography variant={'caption'} color={'text.secondary'} title={'The graphics card drawing this map'}>
          {status.gpu}
        </Typography>
      </Box>
      <EventMenu
        request={menu}
        selectedCount={selected.mapId === mapId ? selected.eventIds.length : 0}
        tools={toolsRef.current}
        stampTools={stampToolsRef.current}
        onClose={() => setMenu(null)}
        onNewTransfer={placer.open}
      />
      {placer.dialog}
    </Box>
  );
};

/**
 * Words how many events are selected on the map, for the status line.
 * @param {number} count How many.
 * @returns {string} The words, or nothing with none selected.
 */
const selectedLabel = (count: number): string =>
{
  if (count === 0)
  {
    return '';
  }

  return count === 1
    ? '1 event selected'
    : `${count} events selected`;
};

/**
 * The page's open timings, shared with the speed hooks: when the first open began, landed, and first drew the map
 * complete (drawnAt).
 */
const speedTimings: Record<string, number> = {};

export { DrawNotice, MapView, mapIdFromQuery, mapLabel, markerClassifierFor, speedTimings };
