/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { MapEditorApi } from '../../../../src/mapEditor/core/api/MapEditorApi.ts';
import { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import type { DocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { RmmzTileset } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import type { MapCell, ScreenPoint } from '../../../../src/mapEditor/core/renderer/camera.ts';
import type { MarkerClassifier, OverlayDefinition, OverlaySet, OverlayState, TilesetTextures } from '../../../../src/mapEditor/core/renderer/MapRenderer.ts';
import type { MapEditorServices } from '../../../../src/mapEditor/services/MapEditorServices.ts';
import { MapEditorServicesProvider } from '../../../../src/mapEditor/services/MapEditorServicesContext.tsx';
import { LocationPickerMap, type LocationPickerMapProps } from '../../../../src/mapEditor/views/locationPicker/LocationPickerMap.tsx';
import { buildMapJson } from '../../support/fixtures.ts';

/**
 * What the stand-in renderers record and answer: every renderer made, with the maps and tilesets it was handed, where
 * it was asked to look, every overlay state, overlay set and marker classifier, every point it was asked about and
 * whether it was let go; and the tile every renderer finds under any point.
 */
const stand = vi.hoisted(() => ({
  renderers: [] as {
    documents: number[];
    tilesets: number[];
    looks: { cell: MapCell; zoom: number }[];
    overlays: OverlayState[];
    overlaySets: OverlaySet[];
    classifiers: MarkerClassifier[];
    points: ScreenPoint[];
    destroyed: boolean;
  }[],
  cell: null as MapCell | null,
}));

// a page under test has no GPU, so the picker draws through a stand-in renderer that records what it was asked; the
// controller opening maps into it is the real one, reading through the real look at documents.
vi.mock('../../../../src/mapEditor/render/PixiMapRenderer.ts', () =>
{
  /**
   * Stands in for the renderer, recording what it is handed and answering the tile the test set.
   */
  class PixiMapRenderer
  {
    record = {
      documents: [] as number[],
      tilesets: [] as number[],
      looks: [] as { cell: MapCell; zoom: number }[],
      overlays: [] as OverlayState[],
      overlaySets: [] as OverlaySet[],
      classifiers: [] as MarkerClassifier[],
      points: [] as ScreenPoint[],
      destroyed: false,
    };

    constructor()
    {
      stand.renderers.push(this.record);
    }

    mount(): void
    {
      // nothing draws here.
    }

    setTextureSource(): void
    {
      // the pictures are not what these tests look at.
    }

    setTileset(textures: TilesetTextures): void
    {
      this.record.tilesets.push(textures.tileset.id);
    }

    setDocument(document: MapDocument): void
    {
      this.record.documents.push(document.mapId);
    }

    setEventMarkers(classify: MarkerClassifier): void
    {
      this.record.classifiers.push(classify);
    }

    setLayerVisibility(): void
    {
      // the game look is not what these tests look at.
    }

    setOverlays(overlays: OverlaySet): void
    {
      this.record.overlaySets.push(overlays);
    }

    setOverlayState(state: OverlayState): void
    {
      this.record.overlays.push(state);
    }

    cellAt(point: ScreenPoint): MapCell | null
    {
      this.record.points.push(point);
      return stand.cell;
    }

    lookAt(cell: MapCell, zoom: number): void
    {
      this.record.looks.push({ cell, zoom });
    }

    destroy(): void
    {
      this.record.destroyed = true;
    }
  }

  return { PixiMapRenderer };
});

/*
 * The picker's map is the real renderer showing a map to click a tile on, and it owes the picker four things. It opens
 * whichever map it is asked for with that map's tileset, holding neither (a picker in an event window must never count
 * as keeping a copy of a map it cannot save), and centres on the tile the transfer lands on now when that tile is on the
 * map, at the game's own scale, or else shows the whole map. Its left button picks the tile under the pointer and a
 * double-click picks and finishes, while the right button stays the renderer's own for panning; nothing is picked off
 * the map, or while the map drawn is still the one before the map asked for. The tile under the pointer is drawn with
 * its coordinates beside it, and the tile picked is outlined, as one rectangle for as long as it stays the same tile.
 * And a map that cannot be opened says why in place of the canvas, unless the picker has already moved on from it.
 */
describe('LocationPickerMap', () =>
{
  beforeEach(() =>
  {
    stand.renderers.splice(0);
    stand.cell = { x: 2, y: 1 };
  });

  /**
   * Builds a tileset row with no sheets to load.
   * @param {number} id The tileset id.
   * @returns {RmmzTileset} The row.
   */
  const tilesetRow = (id: number): RmmzTileset => ({ id, flags: [ id ], mode: 1, name: `Set ${id}`, note: '', tilesetNames: [ '', '', '', '', '', '', '', '', '' ] });

  /**
   * Builds a 3x2 map file drawn with a tileset.
   * @param {number} tilesetId The tileset.
   * @returns {JsonValue} The map file.
   */
  const mapFile = (tilesetId: number): JsonValue =>
  {
    return { ...buildMapJson(), tilesetId } as unknown as JsonValue;
  };

  /**
   * The window's plugin modules: none switched on, no overlays, and nothing that will ever change.
   */
  const NO_MODULES = { overlays: () => [], kindOf: () => null, subscribe: () => () => undefined };

  /**
   * Builds a window's services over files on disk: map 5 drawn with tileset 4 and map 6 with tileset 5, where any read
   * can wait on a gate the test opens, and map 9, whose file cannot be read. No other window holds anything.
   * @param {ReadonlyMap<DocumentKey, Promise<void>>} gates What each file's read waits for.
   * @param {object} instead The plugin modules to use, and a server, or null for none.
   * @returns {{ services: MapEditorServices, hub: DocumentHub }} The services, and the window's hub.
   */
  const buildServices = (gates: ReadonlyMap<DocumentKey, Promise<void>> = new Map(), instead: { modules?: object; api?: null } = {}) =>
  {
    const files = new Map<DocumentKey, JsonValue>([
      [ 'map:5', mapFile(4) ],
      [ 'map:6', mapFile(5) ],
      [ 'tilesets', [ null, null, null, null, tilesetRow(4), tilesetRow(5) ] as unknown as JsonValue ],
    ]);
    const hub = new DocumentHub({
      clientId: 'window-a',
      store: {
        load: async (key: DocumentKey) =>
        {
          await gates.get(key);
          if (files.has(key) === false)
          {
            throw new Error(`${key} cannot be read`);
          }

          return files.get(key) as JsonValue;
        },
        save: async () => undefined,
      },
    });
    const sync = { whenHeldOrDiscovered: async () => undefined, holders: () => [], requestSnapshot: async () => null };
    const { modules = NO_MODULES } = instead;
    const api = instead.api === null ? null : { loadImage: async () => null } as unknown as MapEditorApi;
    return { services: { api, hub, sync, modules } as unknown as MapEditorServices, hub };
  };

  /**
   * Makes a gate a read can wait on.
   * @returns {{ gate: Promise<void>, open: () => void }} The gate, and how to open it.
   */
  const buildGate = () =>
  {
    let open = () => undefined as void;
    const gate = new Promise<void>(resolve =>
    {
      open = resolve;
    });
    return { gate, open };
  };

  /**
   * Lets every read and open in flight land.
   * @returns {Promise<void>} Settles once they have.
   */
  const landed = () => act(async () =>
  {
    await new Promise(resolve =>
    {
      setTimeout(resolve, 0);
    });
  });

  /**
   * Renders the picker's map over services, showing map 5 with nothing picked and no focus unless told otherwise.
   * @param {MapEditorServices} services The services.
   * @param {Partial<LocationPickerMapProps>} props What to show instead.
   * @returns {object} Who heard the clicks, the canvas's host, and ways to show something else and to close.
   */
  const renderMap = (services: MapEditorServices, props: Partial<LocationPickerMapProps> = {}) =>
  {
    const onPick = vi.fn();
    const onConfirm = vi.fn();
    const shown: LocationPickerMapProps = { mapId: 5, picked: null, focus: null, onPick, onConfirm, ...props };
    const view = render(
      <MapEditorServicesProvider services={services}>
        <LocationPickerMap {...shown}/>
      </MapEditorServicesProvider>
    );
    const show = (next: Partial<LocationPickerMapProps>) => view.rerender(
      <MapEditorServicesProvider services={services}>
        <LocationPickerMap {...shown} {...next}/>
      </MapEditorServicesProvider>
    );
    return { onPick, onConfirm, show, unmount: view.unmount, host: screen.getByTestId('location-picker-map') };
  };

  it('opens the map asked for with its tileset, holding neither, and centres on the focus tile at the game\'s scale', async () =>
  {
    // Arrange.
    const { services, hub } = buildServices();

    // Act.
    renderMap(services, { focus: { x: 2, y: 1 } });
    await landed();

    // Assert.
    const [ renderer ] = stand.renderers;
    expect([ renderer.documents, renderer.tilesets, renderer.looks, hub.documentKeys() ])
      .toStrictEqual([ [ 5 ], [ 4 ], [ { cell: { x: 2, y: 1 }, zoom: 1 } ], [] ]);
  });

  it('draws the grid, the picked and pointed tiles, and the markers of events showing no picture', async () =>
  {
    // Arrange.
    const { services } = buildServices();

    // Act.
    renderMap(services);
    await landed();

    // Assert.
    const [ renderer ] = stand.renderers;
    expect([ ...renderer.overlaySets[0].enabled ])
      .toStrictEqual([ 'grid', 'selection', 'hover', 'markers' ]);
  });

  it('draws the plugin modules\' overlays that start on, and not the ones that start off', async () =>
  {
    // Arrange: two module overlays, one starting on and one off.
    const lights: OverlayDefinition = { id: 'lighting.lights', title: 'Lights', defaultOn: true, draw: () => undefined };
    const sight: OverlayDefinition = { id: 'jabs.sight', title: 'Sight', defaultOn: false, draw: () => undefined };
    const { services } = buildServices(new Map(), { modules: { ...NO_MODULES, overlays: () => [ lights, sight ] } });

    // Act.
    renderMap(services);
    await landed();

    // Assert: both definitions are handed over, and only the one starting on is switched on.
    const [ set ] = stand.renderers[0].overlaySets;
    expect([ [ ...set.enabled ], set.definitions ])
      .toStrictEqual([ [ 'grid', 'selection', 'hover', 'markers', 'lighting.lights' ], [ lights, sight ] ]);
  });

  it('marks the events drawing no picture again when the window\'s plugin modules switch on', async () =>
  {
    // Arrange: plugin modules that switch on once the picker is open.
    const listeners: (() => void)[] = [];
    const subscribe = (listener: () => void) =>
    {
      listeners.push(listener);
      return () => undefined;
    };
    const { services } = buildServices(new Map(), { modules: { ...NO_MODULES, subscribe } });
    renderMap(services);
    await landed();

    // Act.
    listeners.forEach(listener => listener());

    // Assert: the classifier, reading the modules as they now stand, is handed over again so the markers redraw.
    const [ { classifiers } ] = stand.renderers;
    expect([ classifiers.length, classifiers[1] === classifiers[0] ])
      .toStrictEqual([ 2, true ]);
  });

  it('draws nothing without a project server', async () =>
  {
    // Arrange.
    const { services } = buildServices(new Map(), { api: null });

    // Act.
    renderMap(services);
    await landed();

    // Assert: no renderer was made, and the canvas's host stays empty.
    expect([ stand.renderers.length, screen.getByTestId('location-picker-map').childElementCount ])
      .toStrictEqual([ 0, 0 ]);
  });

  it('shows the whole map when the focus tile is not on it', async () =>
  {
    // Arrange: map 5 is three tiles wide and two high.
    const { services } = buildServices();

    // Act.
    renderMap(services, { focus: { x: 3, y: 1 } });
    await landed();

    // Assert: the map opened, and nothing moved the view.
    const [ renderer ] = stand.renderers;
    expect([ renderer.documents, renderer.looks ])
      .toStrictEqual([ [ 5 ], [] ]);
  });

  it('shows the whole map when there is no focus', async () =>
  {
    // Arrange.
    const { services } = buildServices();

    // Act.
    renderMap(services, { focus: null });
    await landed();

    // Assert: the map opened, and nothing moved the view.
    const [ renderer ] = stand.renderers;
    expect([ renderer.documents, renderer.looks ])
      .toStrictEqual([ [ 5 ], [] ]);
  });

  it('opens another map when asked, and an open that one overtook moves nothing when it lands late', async () =>
  {
    // Arrange: map 5's file is slow, and both maps hold the focus tile.
    const slow = buildGate();
    const { services } = buildServices(new Map([ [ 'map:5', slow.gate ] ]));
    const { show } = renderMap(services, { focus: { x: 1, y: 1 } });

    // Act: map 6 is asked for and opens; then map 5's file arrives.
    show({ mapId: 6 });
    await landed();
    slow.open();
    await landed();

    // Assert.
    const [ renderer ] = stand.renderers;
    expect([ renderer.documents, renderer.tilesets, renderer.looks ])
      .toStrictEqual([ [ 6 ], [ 5 ], [ { cell: { x: 1, y: 1 }, zoom: 1 } ] ]);
  });

  it('picks the tile under the left button, read from where the pointer sits in the map', async () =>
  {
    // Arrange: the map sits 100 pixels across and 50 down the page.
    const { services } = buildServices();
    const { onPick, host } = renderMap(services);
    await landed();
    host.getBoundingClientRect = () => ({ left: 100, top: 50 }) as DOMRect;

    // Act.
    fireEvent.pointerDown(host, { button: 0, clientX: 130, clientY: 95 });

    // Assert.
    const [ renderer ] = stand.renderers;
    expect([ onPick.mock.calls, renderer.points ])
      .toStrictEqual([ [ [ { x: 2, y: 1 } ] ], [ { x: 30, y: 45 } ] ]);
  });

  it('picks nothing with the right button, which pans the map', async () =>
  {
    // Arrange.
    const { services } = buildServices();
    const { onPick, host } = renderMap(services);
    await landed();

    // Act.
    fireEvent.pointerDown(host, { button: 2 });

    // Assert.
    expect(onPick)
      .not.toHaveBeenCalled();
    expect(stand.renderers[0].documents)
      .toStrictEqual([ 5 ]);
  });

  it('picks nothing off the map', async () =>
  {
    // Arrange: no tile lies under the pointer.
    const { services } = buildServices();
    const { onPick, host } = renderMap(services);
    await landed();
    stand.cell = null;

    // Act.
    fireEvent.pointerDown(host, { button: 0 });

    // Assert: the renderer was asked, and found nothing.
    expect([ onPick.mock.calls, stand.renderers[0].points.length ])
      .toStrictEqual([ [], 1 ]);
  });

  it('picks the tile and finishes on a double-click', async () =>
  {
    // Arrange.
    const { services } = buildServices();
    const { onConfirm, host } = renderMap(services);
    await landed();

    // Act.
    fireEvent.doubleClick(host);

    // Assert.
    expect(onConfirm.mock.calls)
      .toStrictEqual([ [ { x: 2, y: 1 } ] ]);
  });

  it('finishes nothing on a double-click off the map', async () =>
  {
    // Arrange.
    const { services } = buildServices();
    const { onConfirm, host } = renderMap(services);
    await landed();
    stand.cell = null;

    // Act.
    fireEvent.doubleClick(host);

    // Assert: the renderer was asked, and found nothing.
    expect([ onConfirm.mock.calls, stand.renderers[0].points.length ])
      .toStrictEqual([ [], 1 ]);
  });

  it('picks nothing before the first map has opened', async () =>
  {
    // Arrange: map 5's file has not arrived.
    const slow = buildGate();
    const { services } = buildServices(new Map([ [ 'map:5', slow.gate ] ]));
    const { onPick, host } = renderMap(services);

    // Act.
    fireEvent.pointerDown(host, { button: 0 });
    slow.open();
    await landed();

    // Assert: nothing was picked, though the map has opened since.
    expect([ onPick.mock.calls, stand.renderers[0].documents ])
      .toStrictEqual([ [], [ 5 ] ]);
  });

  it('picks nothing while the map drawn is still the one before the map asked for, and picks once it opens', async () =>
  {
    // Arrange: map 5 is open, and map 6's file is slow.
    const slow = buildGate();
    const { services } = buildServices(new Map([ [ 'map:6', slow.gate ] ]));
    const { onPick, host, show } = renderMap(services);
    await landed();
    show({ mapId: 6 });

    // Act: a click while map 5 is still drawn, then another once map 6 has opened.
    fireEvent.pointerDown(host, { button: 0 });
    const early = onPick.mock.calls.length;
    slow.open();
    await landed();
    fireEvent.pointerDown(host, { button: 0 });

    // Assert.
    expect([ early, onPick.mock.calls ])
      .toStrictEqual([ 0, [ [ { x: 2, y: 1 } ] ] ]);
  });

  it('draws the tile under the pointer with its coordinates, once per tile, and drops it when the pointer leaves', async () =>
  {
    // Arrange.
    const { services } = buildServices();
    const { host } = renderMap(services);
    await landed();
    const [ renderer ] = stand.renderers;
    const before = renderer.overlays.length;

    // Act: two moves inside one tile, then the pointer leaves the map.
    fireEvent.pointerMove(host);
    fireEvent.pointerMove(host);
    const pointed = renderer.overlays[renderer.overlays.length - 1];
    fireEvent.pointerLeave(host);
    const left = renderer.overlays[renderer.overlays.length - 1];

    // Assert.
    expect([ renderer.overlays.length - before, pointed.hover, pointed.hoverLabel, left.hover, left.hoverLabel ])
      .toStrictEqual([ 2, { x: 2, y: 1, width: 1, height: 1 }, '2, 1', null, null ]);
  });

  it('outlines the tile picked as one rectangle while it stays the same, and drops it once none is', async () =>
  {
    // Arrange.
    const { services } = buildServices();
    const { host, show } = renderMap(services, { picked: { x: 1, y: 0 } });
    await landed();
    const [ renderer ] = stand.renderers;
    const outlined = renderer.overlays[renderer.overlays.length - 1].selectedCells;

    // Act: the pointer moves, then the pick goes.
    fireEvent.pointerMove(host);
    const whilePointing = renderer.overlays[renderer.overlays.length - 1].selectedCells;
    show({ picked: null });
    const afterwards = renderer.overlays[renderer.overlays.length - 1].selectedCells;

    // Assert.
    expect([ outlined, whilePointing === outlined, afterwards ])
      .toStrictEqual([ { x: 1, y: 0, width: 1, height: 1 }, true, null ]);
  });

  it('says why a map cannot be opened in place of the canvas, and stops once another map is asked for', async () =>
  {
    // Arrange: map 9 has no file.
    const { services } = buildServices();
    const { show } = renderMap(services, { mapId: 9 });
    await landed();
    const said = screen.queryByText(/^Map 9 could not be opened: Error: map:9 cannot be read$/u) !== null;

    // Act.
    show({ mapId: 5 });
    await landed();

    // Assert.
    expect([ said, screen.queryByText(/could not be opened/u), stand.renderers[0].documents ])
      .toStrictEqual([ true, null, [ 5 ] ]);
  });

  it('says nothing about a map the picker moved on from before it failed', async () =>
  {
    // Arrange: map 9's read is slow, and fails when it lands.
    const slow = buildGate();
    const { services } = buildServices(new Map([ [ 'map:9', slow.gate ] ]));
    const { show } = renderMap(services, { mapId: 9 });

    // Act: map 5 is asked for, and then map 9's read fails.
    show({ mapId: 5 });
    await landed();
    slow.open();
    await landed();

    // Assert.
    expect([ screen.queryByText(/could not be opened/u), stand.renderers[0].documents ])
      .toStrictEqual([ null, [ 5 ] ]);
  });

  it('lets the renderer go, and stops following the plugin modules, when the picker closes', async () =>
  {
    // Arrange.
    const listening = new Set<() => void>();
    const subscribe = (listener: () => void) =>
    {
      listening.add(listener);
      return () =>
      {
        listening.delete(listener);
      };
    };
    const { services } = buildServices(new Map(), { modules: { ...NO_MODULES, subscribe } });
    const { unmount } = renderMap(services);
    await landed();
    const before = listening.size;

    // Act.
    unmount();

    // Assert.
    expect([ before, listening.size, stand.renderers.map(renderer => renderer.destroyed) ])
      .toStrictEqual([ 1, 0, [ true ] ]);
  });
});
