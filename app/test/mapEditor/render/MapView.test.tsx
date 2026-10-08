/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { WindowShell, type OpenBrowserWindow } from '../../../src/core/infrastructure/shell/WindowShell.ts';
import { apiDocumentStore } from '../../../src/mapEditor/core/api/apiDocumentStore.ts';
import type { MapEditorApi } from '../../../src/mapEditor/core/api/MapEditorApi.ts';
import { EventSelection } from '../../../src/mapEditor/core/events/EventSelection.ts';
import { DocumentHub } from '../../../src/mapEditor/core/history/DocumentHub.ts';
import { LocationPicks } from '../../../src/mapEditor/core/locations/LocationPicks.ts';
import type { DocumentKey } from '../../../src/mapEditor/core/model/documentKeys.ts';
import { createEventPage, createMapEvent } from '../../../src/mapEditor/core/model/eventModel.ts';
import type { JsonValue } from '../../../src/mapEditor/core/model/json.ts';
import { MapDocument } from '../../../src/mapEditor/core/model/MapDocument.ts';
import type { RmmzMapEvent } from '../../../src/mapEditor/core/model/rmmzTypes.ts';
import { marksOf, TILESET_MARKS_DOCUMENT } from '../../../src/mapEditor/core/palette/tilesetMarkEdits.ts';
import { CommandCatalog } from '../../../src/mapEditor/core/commands/CommandCatalog.ts';
import { PluginModuleRegistry } from '../../../src/mapEditor/core/modules/PluginModuleRegistry.ts';
import type { PageRule } from '../../../src/mapEditor/core/pageRule/pageRule.ts';
import { WindowPageRule } from '../../../src/mapEditor/core/pageRule/WindowPageRule.ts';
import { GamePreview } from '../../../src/mapEditor/core/preview/GamePreview.ts';
import { WindowPreview } from '../../../src/mapEditor/core/preview/WindowPreview.ts';
import type { MapCell } from '../../../src/mapEditor/core/renderer/camera.ts';
import type { LightingLayerDefinition } from '../../../src/mapEditor/core/renderer/lightingLayer.ts';
import type { LayerVisibility, MarkerClassifier, OverlaySet, OverlayState } from '../../../src/mapEditor/core/renderer/MapRenderer.ts';
import type { WeatherLayerDefinition } from '../../../src/mapEditor/core/renderer/weatherLayer.ts';
import { WindowClock } from '../../../src/mapEditor/core/time/WindowClock.ts';
import { SHIPPED_MODULES } from '../../../src/mapEditor/services/pluginModules.ts';
import type { PluginsJsEntry } from '../../../src/services/plugins/PluginsJsReader.ts';
import { WindowPaints } from '../../../src/mapEditor/core/tools/WindowPaint.ts';
import { MapEditorApp } from '../../../src/mapEditor/MapEditorApp.tsx';
import { MapView, mapIdFromQuery } from '../../../src/mapEditor/render/MapView.tsx';
import type { MapEditorServices } from '../../../src/mapEditor/services/MapEditorServices.ts';
import { MapEditorServicesProvider } from '../../../src/mapEditor/services/MapEditorServicesContext.tsx';
import { buildMapJson } from '../support/fixtures.ts';

/**
 * What the stand-in renderers and controllers record and answer: every renderer made, what each was asked to show
 * and where to look, the overlay switches, layer visibilities, lighting and weather layers, marker classifiers and page
 * rules it was handed, what it was told of the view being on screen (with "mount" where it was mounted), ways to change
 * its draw state and its zoom, and the maps an open lands on.
 */
const stand = vi.hoisted(() => ({
  renderers: [] as {
    overlays: OverlayState[];
    looks: { cell: MapCell; zoom: number }[];
    overlaySets: OverlaySet[];
    visibilities: LayerVisibility[];
    lighting: (readonly LightingLayerDefinition[])[];
    weather: (readonly WeatherLayerDefinition[])[];
    classifiers: MarkerClassifier[];
    pageRules: PageRule[];
    shown: (boolean | 'mount')[];
    times: number[];
    previews: GamePreview[];
    announce: (state: string) => void;
    zoomTo: (zoom: number) => void;
  }[],
  maps: new Map<number, unknown>(),
}));

// a page under test has no GPU, so with a project server behind it the view draws through a stand-in renderer that
// records what it was asked, and opens maps through a stand-in controller that hands back the map the test set.
vi.mock('../../../src/mapEditor/render/PixiMapRenderer.ts', () =>
{
  /**
   * Stands in for the renderer, recording the overlay states and the cells it is asked to show.
   */
  class PixiMapRenderer
  {
    record = {
      overlays: [] as OverlayState[],
      looks: [] as { cell: MapCell; zoom: number }[],
      overlaySets: [] as OverlaySet[],
      visibilities: [] as LayerVisibility[],
      lighting: [] as (readonly LightingLayerDefinition[])[],
      weather: [] as (readonly WeatherLayerDefinition[])[],
      classifiers: [] as MarkerClassifier[],
      pageRules: [] as PageRule[],
      shown: [] as (boolean | 'mount')[],
      times: [] as number[],
      previews: [] as GamePreview[],
      announce: (state: string) =>
      {
        this.drawListeners.forEach(listener => listener(state));
      },
      zoomTo: (zoom: number) =>
      {
        this.camera = { ...this.camera, zoom };
      },
    };

    drawListeners = new Set<(state: string) => void>();

    // no canvas, so the event tools listen for no pointer here; picking still selects through them.
    canvas = null;

    camera = { x: 0, y: 0, zoom: 1 };

    constructor()
    {
      stand.renderers.push(this.record);
    }

    eventAt(): null
    {
      return null;
    }

    onContextMenu(): () => void
    {
      return () => undefined;
    }

    mount(): void
    {
      this.record.shown.push('mount');
    }

    setVisible(visible: boolean): void
    {
      this.record.shown.push(visible);
    }

    onDrawStateChange(listener: (state: string) => void): () => void
    {
      this.drawListeners.add(listener);
      return () => this.drawListeners.delete(listener);
    }

    onCameraChange(): () => void
    {
      return () => undefined;
    }

    onFrame(): () => void
    {
      return () => undefined;
    }

    stats(): { loadingImages: number }
    {
      return { loadingImages: 0 };
    }

    whenReady(): Promise<void>
    {
      return Promise.resolve();
    }

    rendererInfo(): null
    {
      return null;
    }

    cellAt(): null
    {
      return null;
    }

    setLayerVisibility(visibility: LayerVisibility): void
    {
      this.record.visibilities.push(visibility);
    }

    setLightingLayers(definitions: readonly LightingLayerDefinition[]): void
    {
      this.record.lighting.push(definitions);
    }

    setWeatherLayers(definitions: readonly WeatherLayerDefinition[]): void
    {
      this.record.weather.push(definitions);
    }

    setTimeOfDay(minutes: number): void
    {
      this.record.times.push(minutes);
    }

    setPageRule(rule: PageRule): void
    {
      this.record.pageRules.push(rule);
    }

    setPreview(preview: GamePreview): void
    {
      this.record.previews.push(preview);
    }

    setOverlays(overlays: OverlaySet): void
    {
      this.record.overlaySets.push(overlays);
    }

    setPassabilityRules(): void
    {
      // the switches are not what these tests look at.
    }

    setEventMarkers(classify: MarkerClassifier): void
    {
      this.record.classifiers.push(classify);
    }

    setOverlayState(state: OverlayState): void
    {
      this.record.overlays.push(state);
    }

    lookAt(cell: MapCell, zoom: number): void
    {
      this.record.looks.push({ cell, zoom });
    }

    destroy(): void
    {
      // nothing to let go of.
    }
  }

  return { PixiMapRenderer };
});

vi.mock('../../../src/mapEditor/render/MapViewController.ts', () =>
{
  /**
   * Stands in for the controller, opening the maps the test set and holding the one it opened last.
   */
  class MapViewController
  {
    map: unknown = null;

    async open(mapId: number): Promise<unknown>
    {
      this.map = stand.maps.get(mapId) ?? null;
      return this.map;
    }

    close(): void
    {
      // nothing to stop following.
    }
  }

  return { MapViewController };
});

/*
 * A map view is what the workspace mounts in each map panel, and the map editor page also opens one alone across the
 * whole window for ?map=102, in place of the workspace, which is the view the speed script and the parity check
 * measure. The view offers the switches for the overlays and the game look and a status line; without a project server
 * it says there is no map to show rather than failing. An event it is asked to pick out, such as the battler the data
 * editor asked to see, shows selected once the map is open, with the view centred on it, and so does each event picked
 * after it; with nothing picked, nothing is selected and the view stays put. An event revealed from the events list is
 * centred at the zoom the view already has, so browsing the list never zooms the map, and only by the views of its own
 * map. The drawing itself happens on the GPU and is proved by the speed script and the parity check, not here.
 *
 * A view behind another tab lets its GPU context go, so the renderer hears whether the view is on screen before it is
 * mounted (a view mounted behind a tab must make no context at all) and each time that changes. And a map that cannot
 * draw says why over the canvas, in plain words, rather than leaving it blank: every context the window may keep is
 * taken by maps on screen, the graphics card let go of it for a moment, or the window cannot draw at all. Whatever the
 * plugin modules say, such as a config one could not read, shows along the top of the map, drawing or not.
 *
 * The tiles marked to go on top decide where the painting tools lay tiles, so a view holds the marks from the start,
 * through the same open as the palette: a project that never saved marks is seeded from its own maps first. Holding an
 * empty set in the seed's place would paint every marked tile as ground, and the first mark toggled would save over
 * the seed for good.
 *
 * Events that draw no picture show markers from the start, picking their symbol by the kind the window's registry makes
 * of them, or by their trigger when no kind claims them; the registry reads events differently once the plugin modules
 * switch on, after js/plugins.js is read, so the renderer is handed the classifier again then and redraws the markers.
 *
 * What the modules draw into the lighting layer is handed to the renderer from the start and again as they switch on,
 * and the bar offers its Lighting switch, after Shadows, only while some module draws there: a project without such a
 * plugin never sees a switch that does nothing. That one switch shows and hides the whole lighting layer. The weather
 * layer is handed over and offered the same way, its Weather switch after Lighting, which with the modules the editor
 * ships means only while J-Weather is enabled; the switch hides the weather and nothing else, and the Animate switch
 * holds the weather still with everything else that moves.
 *
 * The bar shows the window's clock only while a module offers one, naming the time and the part of the day as the
 * module names it, and the renderer is handed the clock's time from the start and every time it moves, wherever it was
 * moved from, so every view of the window draws the sky at the same hour. With every module the editor ships on, the one
 * clock is J-TIME's, J-Lighting-Time casting its sky by it, and the bar shows one chip.
 *
 * The renderer is handed the window's page rule from the start, and again whenever it changes, as the modules switch
 * on or the new game is read, so every event shows the page a fresh save would show at the clock's time; and the
 * window's preview from the start and every time it changes, so every view shows the switches and variables set. Beside
 * the clock, a chip says what the preview sets, "Fresh save" while nothing, so a preview is never on unnoticed, naming
 * each kind a module adds as the module names it once the module is on, and a click on it opens the Switches & Variables
 * window, saying so when the window was blocked.
 */
describe('MapView', () =>
{
  beforeEach(() =>
  {
    stand.renderers.splice(0);
    stand.maps.clear();
  });

  afterEach(() =>
  {
    window.history.replaceState(null, '', '/');
  });

  /**
   * A window's plugin modules with none switched on: no kind claims any event, nothing draws into the lighting or the
   * weather layer, the preview sets nothing beyond switches and variables, and nothing ever switches on.
   */
  const NO_MODULES = {
    overlays: () => [],
    passabilityRules: () => [],
    kindOf: () => null,
    subscribe: () => () => undefined,
    revision: 0,
    lightingLayers: () => [],
    weatherLayers: () => [],
    notices: () => [],
    clockOffer: () => null,
    pageConditions: () => [],
    previewKinds: () => [],
  };

  /**
   * Builds services with no project server behind them.
   * @returns {MapEditorServices} The services.
   */
  const serverless = (): MapEditorServices =>
  {
    const openWindow = vi.fn<OpenBrowserWindow>(() => null);
    const shell = new WindowShell({ channel: null, origin: 'http://127.0.0.1:3000', openWindow });
    const hub = new DocumentHub({ clientId: 'window-a' });
    const openDocument = vi.fn(() => Promise.reject(new Error('no documents in this test')));
    const paints = new WindowPaints(window);
    const locationPicks = new LocationPicks();
    const clock = new WindowClock(840);
    const pages = new WindowPageRule(NO_MODULES);
    const preview = new WindowPreview();
    const services = { view: { kind: 'workspace' }, api: null, shell, hub, openDocument, paints, locationPicks, modules: NO_MODULES, clock, pages, preview };
    return { ...services, resolveConflict: vi.fn(() => true) } as unknown as MapEditorServices;
  };

  /**
   * Builds services with a project server behind them, and no plugin modules.
   * @returns {MapEditorServices} The services.
   */
  const served = (): MapEditorServices =>
  {
    return { ...serverless(), api: {} as MapEditorApi } as unknown as MapEditorServices;
  };

  /**
   * A window's plugin modules that switch on when the test says, and from then on light the map with one lighting
   * layer, as J-Lighting's module does.
   * @returns {{ modules: object, light: LightingLayerDefinition, switchOn: () => void }} The modules, what they draw
   * once on, and the switch.
   */
  const lightingModules = () =>
  {
    const listeners = new Set<() => void>();
    const light: LightingLayerDefinition = {
      id: 'lighting.rings',
      title: 'Light rings',
      create: () => ({ draw: () => undefined, tick: () => false, destroy: () => undefined }),
    };
    const modules = {
      ...NO_MODULES,
      layers: [] as LightingLayerDefinition[],
      lightingLayers()
      {
        return this.layers;
      },
      subscribe: (listener: () => void) =>
      {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    const switchOn = () =>
    {
      modules.layers = [ light ];
      modules.revision += 1;
      listeners.forEach(listener => listener());
    };
    return { modules, light, switchOn };
  };

  /**
   * A window's plugin modules that switch on when the test says, and from then on draw a map's weather with one weather
   * layer, as J-Weather's module does.
   * @returns {{ modules: object, rain: WeatherLayerDefinition, switchOn: () => void }} The modules, what they draw once
   * on, and the switch.
   */
  const weatherModules = () =>
  {
    const listeners = new Set<() => void>();
    const rain: WeatherLayerDefinition = {
      id: 'weather.map',
      title: 'Weather',
      create: () => ({ draw: () => undefined, tick: () => false, destroy: () => undefined }),
    };
    const modules = {
      ...NO_MODULES,
      layers: [] as WeatherLayerDefinition[],
      weatherLayers()
      {
        return this.layers;
      },
      subscribe: (listener: () => void) =>
      {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    const switchOn = () =>
    {
      modules.layers = [ rain ];
      modules.revision += 1;
      listeners.forEach(listener => listener());
    };
    return { modules, rain, switchOn };
  };

  describe('mapIdFromQuery', () =>
  {
    it('reads a positive whole map id, and nothing else', () =>
    {
      // Arrange.
      const searches = [ '?map=102', '?map=7&speed=1', '?map=0', '?map=-3', '?map=12a', '?view=event', '' ];

      // Act.
      const ids = searches.map(mapIdFromQuery);

      // Assert.
      expect(ids)
        .toStrictEqual([ 102, 7, null, null, null, null, null ]);
    });
  });

  it('offers the switches and says there is no map to show without a project server', () =>
  {
    // Arrange.
    const services = serverless();

    // Act.
    render(
      <MapEditorServicesProvider services={services}>
        <MapView mapId={102}/>
      </MapEditorServicesProvider>
    );

    // Assert.
    const switches = [ 'Grid', 'Regions', 'Passability', 'Animate', 'Parallax', 'Events', 'Shadows', 'Highlight layer' ];
    expect([ ...switches.map(label => screen.getByText(label) !== null), screen.getByText('No project server is running, so there is no map to show.') !== null ])
      .toStrictEqual([ ...switches.map(() => true), true ]);
  });

  it('opens the map the page asks for alone across the window, in place of the workspace', () =>
  {
    // Arrange.
    window.history.replaceState(null, '', '/map.html?map=102');

    // Act.
    render(
      <MapEditorServicesProvider services={serverless()}>
        <MapEditorApp/>
      </MapEditorServicesProvider>
    );

    // Assert.
    expect([ screen.getByTestId('map-view') !== null, screen.getByText('Map 102') !== null, screen.queryByTestId('map-editor-workspace') ])
      .toStrictEqual([ true, true, null ]);
  });

  it('picks out the event asked for once the map is open, and each event picked after it, into the window\'s selection', async () =>
  {
    // Arrange: the map holds the door at 0, 0 and the chest at 2, 1; the selection is the window's, shared with the quick panel.
    stand.maps.set(5, MapDocument.fromJson('map:5', buildMapJson()));
    const services = served();
    const selection = new EventSelection();
    const { rerender } = render(
      <MapEditorServicesProvider services={services}>
        <MapView mapId={5} pickedEventId={3} selection={selection}/>
      </MapEditorServicesProvider>
    );
    await waitFor(() => expect(stand.renderers[0]?.looks.length)
      .toBe(1));

    // Act.
    rerender(
      <MapEditorServicesProvider services={services}>
        <MapView mapId={5} pickedEventId={1} selection={selection}/>
      </MapEditorServicesProvider>
    );

    // Assert: the map arrives with nothing selected, then each pick selects its event alone and centres on it.
    await waitFor(() => expect(stand.renderers[0]?.looks.length)
      .toBe(2));
    const [ renderer ] = stand.renderers;
    expect([ stand.renderers.length, renderer.overlays.map(state => state.selectedEvents), renderer.looks, selection.get() ])
      .toStrictEqual([
        1,
        [ [], [ 3 ], [ 1 ] ],
        [ { cell: { x: 2, y: 1 }, zoom: 1 }, { cell: { x: 0, y: 0 }, zoom: 1 } ],
        { mapId: 5, eventIds: [ 1 ] },
      ]);
  });

  it('picks out the same event again when it is asked for again, after other events were picked', async () =>
  {
    // Arrange: the chest is asked for, then the person picks the door instead.
    stand.maps.set(5, MapDocument.fromJson('map:5', buildMapJson()));
    const services = served();
    const selection = new EventSelection();
    const { rerender } = render(
      <MapEditorServicesProvider services={services}>
        <MapView mapId={5} pickedEventId={3} pickRequest={1} selection={selection}/>
      </MapEditorServicesProvider>
    );
    await waitFor(() => expect(stand.renderers[0]?.looks.length)
      .toBe(1));
    act(() => selection.select(5, [ 1 ]));

    // Act: the same link clicked again asks for the chest again.
    rerender(
      <MapEditorServicesProvider services={services}>
        <MapView mapId={5} pickedEventId={3} pickRequest={2} selection={selection}/>
      </MapEditorServicesProvider>
    );

    // Assert.
    await waitFor(() => expect(stand.renderers[0]?.looks.length)
      .toBe(2));
    expect([ selection.get(), stand.renderers[0].looks ])
      .toStrictEqual([ { mapId: 5, eventIds: [ 3 ] }, [ { cell: { x: 2, y: 1 }, zoom: 1 }, { cell: { x: 2, y: 1 }, zoom: 1 } ] ]);
  });

  it('centres on an event revealed from a list at the zoom the view has, and only for an event its own map holds', async () =>
  {
    // Arrange: map 5 open, holding the door at 0, 0 and the chest at 2, 1, with the view zoomed out to a quarter.
    stand.maps.set(5, MapDocument.fromJson('map:5', buildMapJson()));
    const selection = new EventSelection();
    render(
      <MapEditorServicesProvider services={served()}>
        <MapView mapId={5} selection={selection}/>
      </MapEditorServicesProvider>
    );
    await waitFor(() => expect(stand.renderers[0]?.overlays.length)
      .toBe(1));
    stand.renderers[0].zoomTo(0.25);

    // Act: the chest on another map, the chest here, then a slot this map leaves empty.
    act(() =>
    {
      selection.reveal(9, 3);
      selection.reveal(5, 3);
      selection.reveal(5, 2);
    });

    // Assert: one look, at the chest, keeping the quarter zoom.
    expect(stand.renderers[0].looks)
      .toStrictEqual([ { cell: { x: 2, y: 1 }, zoom: 0.25 } ]);
  });

  it('counts the events selected on its map in the status line, and none selected on another map', async () =>
  {
    // Arrange: the chest is picked on map 5.
    stand.maps.set(5, MapDocument.fromJson('map:5', buildMapJson()));
    const selection = new EventSelection();
    render(
      <MapEditorServicesProvider services={served()}>
        <MapView mapId={5} pickedEventId={3} selection={selection}/>
      </MapEditorServicesProvider>
    );
    await waitFor(() => expect(screen.getByTestId('map-selection-count').textContent)
      .toBe('1 event selected'));

    // Act: two events on map 5, then one on another map.
    act(() => selection.select(5, [ 1, 3 ]));
    const two = screen.getByTestId('map-selection-count').textContent;
    act(() => selection.select(9, [ 2 ]));

    // Assert.
    expect([ two, screen.getByTestId('map-selection-count').textContent ])
      .toStrictEqual([ '2 events selected', '' ]);
  });

  it('tells the renderer whether the view is on screen before mounting it, and again each time that changes', () =>
  {
    // Arrange: a view that opens behind another tab.
    const services = served();
    const { rerender } = render(
      <MapEditorServicesProvider services={services}>
        <MapView mapId={5} visible={false}/>
      </MapEditorServicesProvider>
    );

    // Act.
    rerender(
      <MapEditorServicesProvider services={services}>
        <MapView mapId={5} visible={true}/>
      </MapEditorServicesProvider>
    );

    // Assert: off screen before the mount, and one renderer throughout.
    expect([ stand.renderers.length, stand.renderers[0].shown.slice(0, 2), stand.renderers[0].shown.at(-1) ])
      .toStrictEqual([ 1, [ false, 'mount' ], true ]);
  });

  it('says over the map why it is not drawing, and nothing once it draws', () =>
  {
    // Arrange.
    render(
      <MapEditorServicesProvider services={served()}>
        <MapView mapId={5}/>
      </MapEditorServicesProvider>
    );
    const [ renderer ] = stand.renderers;

    /**
     * Moves the renderer to a draw state and reads what the view says over the map.
     * @param {string} state The draw state.
     * @returns {string | null} The words, or null when it says nothing.
     */
    const noticeFor = (state: string): string | null =>
    {
      act(() => renderer.announce(state));
      return screen.queryByTestId('map-draw-notice')?.textContent ?? null;
    };

    // Act.
    const notices = [ 'waiting', 'drawing', 'recovering', 'starting', 'failed' ].map(noticeFor);

    // Assert.
    expect(notices)
      .toStrictEqual([
        'Too many maps are on screen at once to draw this one.Close a map, or stack it behind another tab, and this one draws.',
        null,
        'The graphics card let go of this map for a moment.Drawing it again…',
        null,
        'This window cannot draw maps with the graphics card.Restarting the editor may bring it back.',
      ]);
  });

  it('says what the modules say along the top of a map that draws, for as long as they say it', () =>
  {
    // Arrange: a module that could not read its config, and a map drawing.
    const notice = { id: 'lighting.config', title: 'Lights draw in white.', detail: 'The file is missing.' };
    const services = { ...served(), modules: { ...NO_MODULES, notices: () => [ notice ] } } as unknown as MapEditorServices;

    // Act.
    render(
      <MapEditorServicesProvider services={services}>
        <MapView mapId={5}/>
      </MapEditorServicesProvider>
    );
    act(() => stand.renderers[0].announce('drawing'));

    // Assert: the map is drawing, so nothing says why it is not.
    expect([ screen.getByRole('status').textContent, screen.queryByTestId('map-draw-notice') ])
      .toStrictEqual([ 'Lights draw in white.The file is missing.', null ]);
  });

  it('says what the modules say beside why the map is not drawing', () =>
  {
    // Arrange.
    const notice = { id: 'lighting.config', title: 'Lights draw in white.', detail: 'The file is missing.' };
    const services = { ...served(), modules: { ...NO_MODULES, notices: () => [ notice ] } } as unknown as MapEditorServices;

    // Act.
    render(
      <MapEditorServicesProvider services={services}>
        <MapView mapId={5}/>
      </MapEditorServicesProvider>
    );
    act(() => stand.renderers[0].announce('failed'));

    // Assert.
    expect([ screen.getByTestId('map-module-notices').textContent, screen.getByTestId('map-draw-notice').textContent ])
      .toStrictEqual([
        'Lights draw in white.The file is missing.',
        'This window cannot draw maps with the graphics card.Restarting the editor may bring it back.',
      ]);
  });

  it('selects nothing and leaves the view where it is when no event is picked', async () =>
  {
    // Arrange.
    stand.maps.set(5, MapDocument.fromJson('map:5', buildMapJson()));

    // Act.
    render(
      <MapEditorServicesProvider services={served()}>
        <MapView mapId={5}/>
      </MapEditorServicesProvider>
    );

    // Assert: the map opened and the view was told to select nothing, and never where to look.
    await waitFor(() => expect(stand.renderers[0]?.overlays.length)
      .toBe(1));
    expect([ stand.renderers[0].overlays.map(state => state.selectedEvents), stand.renderers[0].looks ])
      .toStrictEqual([ [ [] ], [] ]);
  });

  it('shows the markers of events that draw no picture from the start, beside the tools\' own overlays', () =>
  {
    // Arrange: a view over a project, its switches as they start.

    // Act.
    render(
      <MapEditorServicesProvider services={served()}>
        <MapView mapId={5}/>
      </MapEditorServicesProvider>
    );

    // Assert: the first overlays the renderer hears of switch the markers on, and the grid stays off until asked for.
    const [ first ] = stand.renderers[0].overlaySets;
    expect([ [ ...first.enabled ].sort(), first.enabled.has('grid') ])
      .toStrictEqual([ [ 'ghost', 'hover', 'markers', 'selection' ], false ]);
  });

  it('picks each marker\'s symbol by the kind the window makes of its event, and again once the modules switch on', () =>
  {
    // Arrange: a registry claiming event 1 as a kind with the chest's symbol, the rest for nobody, whose activation the
    // test raises; event 2 starts on autorun, and event 3 on a player's touch.
    const activations = new Set<() => void>();
    const modules = {
      ...NO_MODULES,
      kindOf: (event: RmmzMapEvent) => (event.id === 1 ? { marker: 'chest' } : null),
      subscribe: (listener: () => void) =>
      {
        activations.add(listener);
        return () => activations.delete(listener);
      },
    };
    const services = { ...served(), modules } as unknown as MapEditorServices;
    render(
      <MapEditorServicesProvider services={services}>
        <MapView mapId={5}/>
      </MapEditorServicesProvider>
    );
    const events = [ 1, 2, 3 ].map(id => ({ ...createMapEvent(id, 0, 0), pages: [ { ...createEventPage(), trigger: id === 2 ? 3 : 1 } ] }));

    // Act: the modules switch on once the renderer holds the first classifier.
    activations.forEach(listener => listener());

    // Assert: handed over twice, and both read the claimed event by its kind and the others by their triggers; one handed
    // the page an event shows reads that page's trigger, a parallel page here, unless a kind claims the event.
    const [ { classifiers } ] = stand.renderers;
    const parallelPage = { ...createEventPage(), trigger: 4 };
    expect([ classifiers.length, classifiers.map(classify => events.map(event => classify(event, 5))), events.map(event => classifiers[1](event, 5, parallelPage)) ])
      .toStrictEqual([ 2, [ [ 'chest', 'autorun', 'player-touch' ], [ 'chest', 'autorun', 'player-touch' ] ], [ 'chest', 'parallel', 'parallel' ] ]);
  });

  it('hands the renderer the window\'s page rule from the start, and again whenever it changes', () =>
  {
    // Arrange: a view over a project, whose new game is not read yet.
    const services = served();
    render(
      <MapEditorServicesProvider services={services}>
        <MapView mapId={5}/>
      </MapEditorServicesProvider>
    );

    // Act: the new game is read, seating Jerald and Rupert.
    act(() => services.pages.setSave({ party: [ 1, 2 ] }));

    // Assert: seating nobody from the start, then the party read.
    expect(stand.renderers[0].pageRules.map(rule => [ rule.save.party, rule.conditions ]))
      .toStrictEqual([ [ [], [] ], [ [ 1, 2 ], [] ] ]);
  });

  it('holds the tiles that go on top from the start, seeded from the maps when the project never saved any', async () =>
  {
    // Arrange: a project that never saved its marks, whose one map lays the cliff corner on layer 2 by hand.
    const cliffCorner = 1536 + 122;
    const data = new Array<number>(2 * 6).fill(0);
    data[2] = cliffCorner;
    const saves: JsonValue[] = [];
    let stored: JsonValue | null = null;
    const api = {
      clientId: 'window-a',
      loadMapInfos: async () => [ null, { id: 1, expanded: false, name: 'Map 1', order: 1, parentId: 0, scrollX: 0, scrollY: 0 } ],
      loadTilesets: async () => [ null, { id: 1, mode: 1 } ],
      loadMap: async () => ({ width: 2, height: 1, tilesetId: 1, data }),
      loadEditorData: async () => stored,
      saveEditorData: async (_key: string, document: JsonValue) =>
      {
        stored = document;
        saves.push(document);
      },
    } as unknown as MapEditorApi;
    const hub = new DocumentHub({ clientId: 'window-a', store: apiDocumentStore(api) });
    const openDocument = (key: DocumentKey) => (hub.has(key) ? Promise.resolve(hub.document(key)) : hub.load(key));
    const services = { ...served(), api, hub, openDocument } as unknown as MapEditorServices;

    // Act.
    render(
      <MapEditorServicesProvider services={services}>
        <MapView mapId={5}/>
      </MapEditorServicesProvider>
    );
    await waitFor(() => expect(hub.has(TILESET_MARKS_DOCUMENT))
      .toBe(true));

    // Assert: the seed saved, and held as the very marks the painting tools read, never an empty set in its place.
    const seed = { tilesets: { '1': { tiles: [ cliffCorner ], kinds: [] } } };
    expect([ saves, marksOf(hub.document(TILESET_MARKS_DOCUMENT)) ])
      .toStrictEqual([ [ { schemaVersion: 1, data: seed } ], seed ]);
  });

  it('offers Lighting after Shadows once a module lights the map, and hands the renderer what it draws there', () =>
  {
    // Arrange: a view over a project whose lighting module switches on after the view first drew.
    const { modules, light, switchOn } = lightingModules();
    const services = { ...served(), modules } as unknown as MapEditorServices;
    render(
      <MapEditorServicesProvider services={services}>
        <MapView mapId={5}/>
      </MapEditorServicesProvider>
    );
    const before = screen.queryByText('Lighting');

    // Act.
    act(() => switchOn());

    // Assert: no switch before, the switch right after Shadows once on, and the renderer handed nothing, then the light.
    const labels = screen.getAllByRole('button').map(chip => chip.textContent);
    expect([ before, labels.slice(labels.indexOf('Shadows'), labels.indexOf('Shadows') + 2), stand.renderers[0].lighting ])
      .toStrictEqual([ null, [ 'Shadows', 'Lighting' ], [ [], [ light ] ] ]);
  });

  it('hides the whole lighting layer with the Lighting switch', () =>
  {
    // Arrange: a view whose lighting module is already on.
    const { modules, switchOn } = lightingModules();
    switchOn();
    const services = { ...served(), modules } as unknown as MapEditorServices;
    render(
      <MapEditorServicesProvider services={services}>
        <MapView mapId={5}/>
      </MapEditorServicesProvider>
    );

    // Act.
    act(() => screen.getByText('Lighting').click());

    // Assert: the layer showed from the start, and the switch hid it.
    const [ { visibilities } ] = stand.renderers;
    expect([ visibilities[0].layers.lighting, visibilities.at(-1)?.layers.lighting ])
      .toStrictEqual([ true, false ]);
  });

  it('offers Weather once a module draws a map\'s weather, and hands the renderer what it draws there', () =>
  {
    // Arrange: a view over a project whose weather module switches on after the view first drew.
    const { modules, rain, switchOn } = weatherModules();
    const services = { ...served(), modules } as unknown as MapEditorServices;
    render(
      <MapEditorServicesProvider services={services}>
        <MapView mapId={5}/>
      </MapEditorServicesProvider>
    );
    const before = screen.queryByText('Weather');

    // Act.
    act(() => switchOn());

    // Assert: no switch before, the switch right after Shadows once on (no module lights this map), and the renderer
    // handed nothing, then the weather.
    const labels = screen.getAllByRole('button').map(chip => chip.textContent);
    expect([ before, labels.slice(labels.indexOf('Shadows'), labels.indexOf('Shadows') + 2), stand.renderers[0].weather ])
      .toStrictEqual([ null, [ 'Shadows', 'Weather' ], [ [], [ rain ] ] ]);
  });

  it('hides the whole weather layer with the Weather switch, and leaves the animation running', () =>
  {
    // Arrange: a view whose weather module is already on.
    const { modules, switchOn } = weatherModules();
    switchOn();
    const services = { ...served(), modules } as unknown as MapEditorServices;
    render(
      <MapEditorServicesProvider services={services}>
        <MapView mapId={5}/>
      </MapEditorServicesProvider>
    );

    // Act.
    act(() => screen.getByText('Weather').click());

    // Assert: the layer showed from the start, and the switch hid it and nothing else.
    const [ { visibilities } ] = stand.renderers;
    const last = visibilities.at(-1) as LayerVisibility;
    expect([ visibilities[0].layers.weather, last.layers.weather, last.animate ])
      .toStrictEqual([ true, false, true ]);
  });

  it('holds the weather still with the Animate switch, as it holds the water and the lights', () =>
  {
    // Arrange: a view whose weather module is already on.
    const { modules, switchOn } = weatherModules();
    switchOn();
    const services = { ...served(), modules } as unknown as MapEditorServices;
    render(
      <MapEditorServicesProvider services={services}>
        <MapView mapId={5}/>
      </MapEditorServicesProvider>
    );

    // Act.
    act(() => screen.getByText('Animate').click());

    // Assert: the weather still shows, and nothing in the game look moves.
    const [ { visibilities } ] = stand.renderers;
    const last = visibilities.at(-1) as LayerVisibility;
    expect([ last.layers.weather, last.animate ])
      .toStrictEqual([ true, false ]);
  });

  it('offers Weather with the modules the editor ships only while J-Weather is enabled', () =>
  {
    // Arrange: one window whose plugins enable J-Weather, and one whose plugins list it switched off.
    const plugin = (name: string, status: boolean): PluginsJsEntry => ({ name, status, description: '', parameters: {} });
    const enabled = new PluginModuleRegistry(new CommandCatalog());
    enabled.activate(SHIPPED_MODULES, [ plugin('j/weather/J-Weather', true) ]);
    const disabled = new PluginModuleRegistry(new CommandCatalog());
    disabled.activate(SHIPPED_MODULES, [ plugin('j/weather/J-Weather', false) ]);
    const labelsWith = (modules: PluginModuleRegistry): (string | null)[] =>
    {
      const services = { ...served(), modules, pages: new WindowPageRule(modules) } as unknown as MapEditorServices;
      const view = render(
        <MapEditorServicesProvider services={services}>
          <MapView mapId={5}/>
        </MapEditorServicesProvider>
      );
      const labels = screen.getAllByRole('button').map(chip => chip.textContent);
      view.unmount();
      return labels;
    };

    // Act.
    const on = labelsWith(enabled);
    const off = labelsWith(disabled);

    // Assert.
    expect([ on.includes('Weather'), off.includes('Weather') ])
      .toStrictEqual([ true, false ]);
  });

  it('shows the window\'s clock once a module offers one, naming the time and the part of the day as it names them', () =>
  {
    // Arrange: a view whose modules offer a clock once they switch on, naming every hour after 20:00 Night.
    const listeners = new Set<() => void>();
    const modules = {
      ...NO_MODULES,
      offer: null as { startsAt: number; partOfDay: (minutes: number) => string } | null,
      clockOffer()
      {
        return this.offer;
      },
      subscribe: (listener: () => void) =>
      {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    const services = { ...served(), modules } as unknown as MapEditorServices;
    render(
      <MapEditorServicesProvider services={services}>
        <MapView mapId={5}/>
      </MapEditorServicesProvider>
    );
    const before = screen.queryByTestId('map-clock');

    // Act: the modules switch on, and the window's clock moves to 22:00.
    act(() =>
    {
      modules.offer = { startsAt: 840, partOfDay: minutes => (minutes >= 1200 ? 'Night' : 'Afternoon') };
      modules.revision += 1;
      listeners.forEach(listener => listener());
    });
    const shown = screen.getByTestId('map-clock').textContent;
    act(() => services.clock.set(1320));

    // Assert.
    expect([ before, shown, screen.getByTestId('map-clock').textContent ])
      .toStrictEqual([ null, '14:00 Afternoon', '22:00 Night' ]);
  });

  it('shows one clock, J-TIME\'s, with J-Lighting and J-Lighting-Time on beside it, its pages joining the page rule', () =>
  {
    // Arrange: the modules the editor ships, switched on over J-Lighting, J-Lighting-Time and J-TIME, the game starting
    // at 14:00.
    const plugin = (name: string, parameters: Record<string, string> = {}): PluginsJsEntry => ({ name, status: true, description: '', parameters });
    const modules = new PluginModuleRegistry(new CommandCatalog());
    modules.activate(SHIPPED_MODULES, [
      plugin('j/lighting/J-Lighting'),
      plugin('j/lighting/ext/J-Lighting-Time'),
      plugin('j/time/J-TIME', { useRealTime: 'false', startingHour: '14', startingMinute: '0' }),
    ]);
    const services = { ...served(), modules, pages: new WindowPageRule(modules) } as unknown as MapEditorServices;

    // Act.
    render(
      <MapEditorServicesProvider services={services}>
        <MapView mapId={5}/>
      </MapEditorServicesProvider>
    );

    // Assert.
    expect([ screen.getAllByTestId('map-clock').map(chip => chip.textContent), stand.renderers[0].pageRules[0].conditions.map(condition => condition.id) ])
      .toStrictEqual([ [ '14:00 Afternoon' ], [ 'time.pages' ] ]);
  });

  it('hands the renderer the clock\'s time from the start and each time it moves, wherever it was moved from', () =>
  {
    // Arrange: two views of one window, as a map docked and a map torn out.
    const services = served();
    render(
      <MapEditorServicesProvider services={services}>
        <MapView mapId={5}/>
        <MapView mapId={6}/>
      </MapEditorServicesProvider>
    );

    // Act: the clock moved twice, as a slider in either view moves it.
    act(() => services.clock.set(1320));
    act(() => services.clock.set(120));

    // Assert.
    expect(stand.renderers.map(renderer => renderer.times))
      .toStrictEqual([ [ 840, 1320, 120 ], [ 840, 1320, 120 ] ]);
  });

  it('hands every view the window\'s preview from the start and each time it changes, wherever it was changed', () =>
  {
    // Arrange: two views of one window.
    const services = served();
    render(
      <MapEditorServicesProvider services={services}>
        <MapView mapId={5}/>
        <MapView mapId={6}/>
      </MapEditorServicesProvider>
    );

    // Act: switch 147 on, then variable 74 at 99.
    act(() => services.preview.setSwitch(147, true));
    act(() => services.preview.setVariable(74, 99));

    // Assert.
    expect(stand.renderers.map(renderer => renderer.previews.map(preview => preview.toJson())))
      .toStrictEqual([
        [ {}, { switch: { 147: true } }, { switch: { 147: true }, variable: { 74: 99 } } ],
        [ {}, { switch: { 147: true } }, { switch: { 147: true }, variable: { 74: 99 } } ],
      ]);
  });

  it('says a fresh save beside the clock while nothing is set, and what is set once it is', () =>
  {
    // Arrange: a view over a project.
    const services = served();
    render(
      <MapEditorServicesProvider services={services}>
        <MapView mapId={5}/>
      </MapEditorServicesProvider>
    );
    const fresh = screen.getByTestId('map-preview').textContent;

    // Act: two switches on and a variable set, from the Switches & Variables window.
    act(() => services.preview.set(GamePreview.FRESH.withSwitch(24, true).withSwitch(147, true).withVariable(74, 99)));

    // Assert.
    expect([ fresh, screen.getByTestId('map-preview').textContent ])
      .toStrictEqual([ 'Fresh save', '2 switches on, 1 variable set' ]);
  });

  it('names in the chip each kind of state the modules let the preview set, once they switch on after the view drew', () =>
  {
    // Arrange: a view over a project, a quest set from the start, and J-OMNI-Quests' module not yet on.
    const modules = new PluginModuleRegistry(new CommandCatalog());
    const services = { ...served(), modules } as unknown as MapEditorServices;
    services.preview.setValue('quest.states', 'cecil-001', { state: 'completed' });
    render(
      <MapEditorServicesProvider services={services}>
        <MapView mapId={5}/>
      </MapEditorServicesProvider>
    );
    const before = screen.getByTestId('map-preview').textContent;

    // Act: the modules the editor ships switch on over J-OMNI-Quests, and a switch is turned on.
    act(() =>
    {
      modules.activate(SHIPPED_MODULES, [ { name: 'j/omni/ext/J-OMNI-Quests', status: true, description: '', parameters: {} } ]);
    });
    act(() => services.preview.setSwitch(74, true));

    // Assert.
    expect([ before, screen.getByTestId('map-preview').textContent ])
      .toStrictEqual([ '1 more set', '1 switch on, 1 quest set' ]);
  });

  it('opens the Switches & Variables window from the preview chip, and says so when the window was blocked', () =>
  {
    // Arrange: a view whose window's pop-ups are blocked.
    const services = served();
    const opened = vi.spyOn(services.shell, 'open').mockReturnValueOnce('opened')
      .mockReturnValueOnce('blocked');
    render(
      <MapEditorServicesProvider services={services}>
        <MapView mapId={5}/>
      </MapEditorServicesProvider>
    );

    // Act: the chip clicked twice, the second time blocked.
    act(() => screen.getByTestId('map-preview').click());
    const quiet = screen.queryByText(/was blocked/u);
    act(() => screen.getByTestId('map-preview').click());

    // Assert.
    expect([ opened.mock.calls.map(([ request ]) => request.path), quiet, screen.getByText(/was blocked/u).textContent ])
      .toStrictEqual([
        [ '/map.html?view=switches-variables', '/map.html?view=switches-variables' ],
        null,
        'The Switches & Variables window was blocked; allow pop-ups for the editor to open it.',
      ]);
  });
});
