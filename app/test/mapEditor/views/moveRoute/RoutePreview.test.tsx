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
import { createMapEvent } from '../../../../src/mapEditor/core/model/eventModel.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { RmmzEventCommand, RmmzMoveCommand, RmmzTileset } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import type { RouteSetting } from '../../../../src/mapEditor/core/moveRoutes/routeStart.ts';
import type { MapCell } from '../../../../src/mapEditor/core/renderer/camera.ts';
import type { OverlayPainter, OverlaySet, OverlayState, TilesetTextures } from '../../../../src/mapEditor/core/renderer/MapRenderer.ts';
import type { MapEditorServices } from '../../../../src/mapEditor/services/MapEditorServices.ts';
import { MapEditorServicesProvider } from '../../../../src/mapEditor/services/MapEditorServicesContext.tsx';
import { RoutePreview, type RoutePreviewProps } from '../../../../src/mapEditor/views/moveRoute/RoutePreview.tsx';
import { buildMapJson } from '../../support/fixtures.ts';

/**
 * What the stand-in renderers record and answer: every renderer made, with what it was handed and asked, and the tile
 * every renderer finds under any point.
 */
const stand = vi.hoisted(() => ({
  renderers: [] as {
    documents: number[];
    looks: { cell: MapCell; zoom: number }[];
    overlays: OverlayState[];
    overlaySets: OverlaySet[];
    refreshes: number;
  }[],
  cell: null as MapCell | null,
}));

// a page under test has no GPU, so the preview draws through a stand-in renderer recording what it is handed; the
// controller and the look at documents behind it are the real ones.
vi.mock('../../../../src/mapEditor/render/PixiMapRenderer.ts', () =>
{
  /**
   * Stands in for the renderer.
   */
  class PixiMapRenderer
  {
    record = {
      documents: [] as number[],
      looks: [] as { cell: MapCell; zoom: number }[],
      overlays: [] as OverlayState[],
      overlaySets: [] as OverlaySet[],
      refreshes: 0,
    };

    camera = { x: 0, y: 0, zoom: 0.5 };

    constructor()
    {
      stand.renderers.push(this.record);
    }

    onDrawStateChange(): () => void
    {
      return () => undefined;
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
      // the tileset arrives before the map, as the controller hands it over.
      this.record.documents.push(-textures.tileset.id);
    }

    setDocument(document: MapDocument): void
    {
      this.record.documents.push(document.mapId);
    }

    setEventMarkers(): void
    {
      // the markers are not what these tests look at.
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

    refreshOverlays(): void
    {
      this.record.refreshes += 1;
    }

    cellAt(): MapCell | null
    {
      return stand.cell;
    }

    lookAt(cell: MapCell, zoom: number): void
    {
      this.record.looks.push({ cell: { x: cell.x, y: cell.y }, zoom });
    }

    destroy(): void
    {
      // nothing to let go of.
    }
  }

  return { PixiMapRenderer };
});

/*
 * The preview shows where a route goes, on the map it runs on, and owes the author four things. It starts the walker
 * where the moves before it on the page leave it, says so, and centres on it as the map opens, holding the map no
 * more than any look does. It walks the route through the map's own walls, drawing the path and where a wall holds it
 * for good, redrawing with every change. It draws the walker as its page's picture where the chosen step leaves it,
 * facing as it does then, and follows it there; a walker the map cannot picture, such as the player, still shows its
 * tile. And a click on the map starts the walker there, with the line beneath saying where it starts and how the editor
 * knows, and putting it back.
 */
describe('RoutePreview', () =>
{
  beforeEach(() =>
  {
    stand.renderers.splice(0);
    stand.cell = { x: 3, y: 3 };
  });

  /**
   * The tile size the overlays are drawn at.
   */
  const TILE = 48;

  /**
   * Builds map 7: 6x6 of open ground with a wall at 4, 1; event 1 at 1, 1 wearing Actor1's first character, and event
   * 2 at 4, 4. Tile 0 is a star, as in MZ's tilesets, so the empty layers above the ground never decide passage.
   * @returns {JsonValue} The map file.
   */
  const mapFile = (): JsonValue =>
  {
    const width = 6;
    const height = 6;
    const data = new Array(width * height * 6).fill(0);
    for (let cell = 0; cell < width * height; cell++)
    {
      data[cell] = cell === 1 * width + 4 ? 3 : 2;
    }

    const runner = createMapEvent(1, 1, 1);
    runner.pages[0].image = { tileId: 0, characterName: 'Actor1', direction: 2, pattern: 1, characterIndex: 0 };
    return { ...buildMapJson(), width, height, data, tilesetId: 4, events: [ null, runner, createMapEvent(2, 4, 4) ] } as unknown as JsonValue;
  };

  /**
   * Builds tileset 4: tile 0 a star, tile 2 open ground, tile 3 a wall.
   * @returns {RmmzTileset} The tileset.
   */
  const tilesetRow = (): RmmzTileset =>
  {
    const flags = new Array(8).fill(0);
    flags[0] = 0x10;
    flags[3] = 0x0f;
    return { id: 4, flags, mode: 1, name: 'Ground', note: '', tilesetNames: [ '', '', '', '', '', '', '', '', '' ] };
  };

  /**
   * Builds a window's services over map 7 and its tileset on disk; no other window holds anything.
   * @param {Promise<void>} gate What the map's read waits for.
   * @returns {{ services: MapEditorServices, hub: DocumentHub }} The services, and the window's hub.
   */
  const buildServices = (gate: Promise<void> = Promise.resolve()) =>
  {
    const files = new Map<DocumentKey, JsonValue>([
      [ 'map:7', mapFile() ],
      [ 'tilesets', [ null, null, null, null, tilesetRow() ] as unknown as JsonValue ],
    ]);
    const hub = new DocumentHub({
      clientId: 'window-a',
      store: {
        load: async (key: DocumentKey) =>
        {
          if (key === 'map:7')
          {
            await gate;
          }

          return files.get(key) as JsonValue;
        },
        save: async () => undefined,
      },
    });
    const sync = { whenHeldOrDiscovered: async () => undefined, holders: () => [], requestSnapshot: async () => null };
    const modules = { overlays: () => [], kindOf: () => null, subscribe: () => () => undefined, passabilityRules: () => [] };
    const api = { loadImage: async () => null } as unknown as MapEditorApi;
    return { services: { api, hub, sync, modules } as unknown as MapEditorServices, hub };
  };

  /**
   * Builds a Set Movement Route for event 1, by its steps.
   * @param {readonly number[]} codes The steps.
   * @returns {RmmzEventCommand} The command.
   */
  const routeOf = (codes: readonly number[]): RmmzEventCommand => ({
    code: 205,
    indent: 0,
    parameters: [ 0, { list: [ ...codes.map(code => ({ code })), { code: 0 } ], repeat: false, skippable: false, wait: true } ] as JsonValue[],
  });

  /**
   * Builds a route's steps from their codes.
   * @param {readonly number[]} codes The codes.
   * @returns {RmmzMoveCommand[]} The steps.
   */
  const stepsOf = (codes: readonly number[]): RmmzMoveCommand[] => codes.map(code => ({ code }));

  /**
   * Builds a setting on event 1's first page of map 7, for a walker, after the commands before it.
   * @param {number} characterId Who walks it.
   * @param {readonly RmmzEventCommand[]} before The commands before it.
   * @returns {RouteSetting} The setting.
   */
  const onEventOne = (characterId: number, before: readonly RmmzEventCommand[] = []): RouteSetting => ({
    mapId: 7,
    page: { eventId: 1, pageIndex: 0 },
    before,
    characterId,
  });

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
   * Renders a preview and lets its map open.
   * @param {MapEditorServices} services The services.
   * @param {Partial<RoutePreviewProps>} props What to show; event 1 walking nothing from where it stands, unless told.
   * @returns {Promise<object>} Who heard the clicks, ways to show something else, and the canvas's host.
   */
  const renderPreview = async (services: MapEditorServices, props: Partial<RoutePreviewProps> = {}) =>
  {
    const onStartAt = vi.fn();
    const shown: RoutePreviewProps = { setting: onEventOne(0), steps: [], skippable: false, startAt: null, shownStep: null, onStartAt, ...props };
    const view = render(
      <MapEditorServicesProvider services={services}>
        <RoutePreview {...shown}/>
      </MapEditorServicesProvider>
    );
    await landed();
    const show = (next: Partial<RoutePreviewProps>) => view.rerender(
      <MapEditorServicesProvider services={services}>
        <RoutePreview {...shown} {...next}/>
      </MapEditorServicesProvider>
    );
    return { onStartAt, show, host: screen.getByTestId('route-preview-map') };
  };

  /**
   * Reads the line beneath the map.
   * @returns {string | null} What it says.
   */
  const startLine = (): string | null => screen.getByTestId('route-preview-start').textContent;

  /**
   * Draws the route's overlay as the renderer would, into a painter recording each shape's kind.
   * @returns {string[]} The shapes drawn, by kind.
   */
  const drawRoute = (): string[] =>
  {
    const [ renderer ] = stand.renderers;
    const route = renderer.overlaySets[0].definitions.find(definition => definition.id === 'route.walk');
    const drawn: string[] = [];
    const painter: OverlayPainter = {
      circle: () => drawn.push('circle'),
      rect: () => drawn.push('rect'),
      line: (_x1, _y1, _x2, _y2, style) => drawn.push(style.stroke === 0xef5350 ? 'cross' : 'line'),
      text: (_x, _y, text) => drawn.push(`text ${text}`),
    };
    route?.draw(painter, { document: MapDocument.fromJson('map:7', mapFile() as never), tileSize: TILE, selection: [] });
    return drawn;
  };

  it('starts the walker where the moves before it leave it, says so, centres on it, and holds nothing', async () =>
  {
    // Arrange: an earlier route moves event 1 a step right, to 2, 1.
    const { services, hub } = buildServices();

    // Act.
    await renderPreview(services, { setting: onEventOne(0, [ routeOf([ 3 ]) ]) });

    // Assert.
    const [ renderer ] = stand.renderers;
    const last = renderer.overlays[renderer.overlays.length - 1];
    expect([ startLine(), last.selectedCells, renderer.looks, hub.documentKeys(), renderer.documents ])
      .toStrictEqual([
        'Starts at 2, 1, where the moves before it on this page leave it. Click the map to start it elsewhere.',
        { x: 2, y: 1, width: 1, height: 1 },
        [ { cell: { x: 2, y: 1 }, zoom: 1 } ],
        [],
        [ -4, 7 ],
      ]);
  });

  it('draws the walker as its page\'s picture where it starts, facing as it does', async () =>
  {
    // Arrange: an earlier route moves event 1 right, so it faces right.
    const { services } = buildServices();

    // Act.
    await renderPreview(services, { setting: onEventOne(0, [ routeOf([ 3 ]) ]) });

    // Assert.
    const [ renderer ] = stand.renderers;
    expect(renderer.overlays[renderer.overlays.length - 1].ghostEvents)
      .toStrictEqual([ { x: 2, y: 1, image: { tileId: 0, characterName: 'Actor1', direction: 6, pattern: 1, characterIndex: 0 }, priorityType: 1 } ]);
  });

  it('says where an event starts when nothing before it moves it', async () =>
  {
    // Arrange.
    const { services } = buildServices();

    // Act.
    await renderPreview(services);

    // Assert.
    expect(startLine())
      .toBe('Starts at 1, 1, where it stands on the map. Click the map to start it elsewhere.');
  });

  it('starts the player on the event running the route, drawing only its tile, since the map has no picture of it', async () =>
  {
    // Arrange.
    const { services } = buildServices();

    // Act.
    await renderPreview(services, { setting: onEventOne(-1) });

    // Assert.
    const [ renderer ] = stand.renderers;
    const [ ghost ] = renderer.overlays[renderer.overlays.length - 1].ghostEvents;
    expect([ startLine(), ghost.image.characterName ])
      .toStrictEqual([ 'Starts at 1, 1, on the event running it, since the player sets it off from beside it. Click the map to start it elsewhere.', '' ]);
  });

  it('starts in the middle of the map when nothing says where the walker stands', async () =>
  {
    // Arrange: a common event's "this event", shown on map 7.
    const { services } = buildServices();

    // Act.
    await renderPreview(services, { setting: { mapId: 7, page: null, before: [], characterId: 0 } });

    // Assert.
    expect(startLine())
      .toBe('Starts in the middle of the map, since nothing here says where it stands. Click the map to start it elsewhere.');
  });

  it('draws the route through the map\'s walls, and says where a wall holds it for good', async () =>
  {
    // Arrange: three steps right from 1, 1; the wall at 4, 1 stops the third.
    const { services } = buildServices();

    // Act.
    await renderPreview(services, { steps: stepsOf([ 3, 3, 3 ]) });

    // Assert: two steps drawn as lines with arrowheads, the cross on the wall, the ring where it stops.
    expect([ drawRoute(), startLine() ])
      .toStrictEqual([
        [ 'line', 'line', 'line', 'line', 'line', 'line', 'cross', 'cross', 'circle' ],
        'Starts at 1, 1, where it stands on the map. It stops for good at step 3: something is in the way, and the route does not skip what it cannot do. Click the map to start it elsewhere.',
      ]);
  });

  it('redraws the route whenever the walk changes', async () =>
  {
    // Arrange.
    const { services } = buildServices();
    const { show } = await renderPreview(services, { steps: stepsOf([ 3 ]) });
    const [ renderer ] = stand.renderers;
    const before = renderer.refreshes;

    // Act.
    show({ steps: stepsOf([ 1 ]) });

    // Assert.
    expect(renderer.refreshes)
      .toBe(before + 1);
  });

  it('shows the walker where the chosen step leaves it, facing as it does then, and follows it there', async () =>
  {
    // Arrange: down twice from 1, 1.
    const { services } = buildServices();
    const { show } = await renderPreview(services, { steps: stepsOf([ 1, 1 ]) });

    // Act.
    show({ steps: stepsOf([ 1, 1 ]), shownStep: 0 });

    // Assert: at 1, 2 facing down, brought into sight at the zoom the view has.
    const [ renderer ] = stand.renderers;
    const [ ghost ] = renderer.overlays[renderer.overlays.length - 1].ghostEvents;
    expect([ ghost.x, ghost.y, ghost.image.direction, renderer.looks.at(-1) ])
      .toStrictEqual([ 1, 2, 2, { cell: { x: 1, y: 2 }, zoom: 0.5 } ]);
  });

  it('shows the walker where a route held for good leaves it, for a step it never reaches', async () =>
  {
    // Arrange: right three times from 1, 1, held at 3, 1 by the wall; the step shown is past the walk.
    const { services } = buildServices();

    // Act.
    await renderPreview(services, { steps: stepsOf([ 3, 3, 3, 1 ]), shownStep: 3 });

    // Assert.
    const [ renderer ] = stand.renderers;
    const [ ghost ] = renderer.overlays[renderer.overlays.length - 1].ghostEvents;
    expect([ ghost.x, ghost.y ])
      .toStrictEqual([ 3, 1 ]);
  });

  it('starts the walker where the author put it, says so, and puts it back', async () =>
  {
    // Arrange.
    const { services } = buildServices();
    const { onStartAt } = await renderPreview(services, { startAt: { x: 4, y: 4 } });
    const said = startLine();

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Put it back' }));

    // Assert.
    expect([ said, onStartAt.mock.calls ])
      .toStrictEqual([ 'Starts at 4, 4, where you put it. Click the map to start it elsewhere.', [ [ null ] ] ]);
  });

  it('offers nothing to put back while the editor works out the start', async () =>
  {
    // Arrange: nothing beyond the preview, its start worked out.
    const { services } = buildServices();

    // Act.
    await renderPreview(services);

    // Assert.
    expect(screen.queryByRole('button', { name: 'Put it back' }))
      .toBeNull();
  });

  it('starts the walker on the tile clicked', async () =>
  {
    // Arrange.
    const { services } = buildServices();
    const { onStartAt, host } = await renderPreview(services);

    // Act.
    fireEvent.pointerDown(host, { button: 0 });

    // Assert.
    expect(onStartAt.mock.calls)
      .toStrictEqual([ [ { x: 3, y: 3 } ] ]);
  });

  it('draws the tile under the pointer with its coordinates', async () =>
  {
    // Arrange.
    const { services } = buildServices();
    const { host } = await renderPreview(services);

    // Act.
    fireEvent.pointerMove(host);

    // Assert.
    const [ renderer ] = stand.renderers;
    const last = renderer.overlays[renderer.overlays.length - 1];
    expect([ last.hover, last.hoverLabel ])
      .toStrictEqual([ { x: 3, y: 3, width: 1, height: 1 }, '3, 3' ]);
  });

  it('says nothing and draws no walker until the map has opened', async () =>
  {
    // Arrange: map 7's file has not arrived.
    let open = () => undefined as void;
    const gate = new Promise<void>(resolve =>
    {
      open = resolve;
    });
    const { services } = buildServices(gate);

    // Act.
    await renderPreview(services, { steps: stepsOf([ 1 ]) });
    const said = startLine();
    const [ renderer ] = stand.renderers;
    const ghosts = renderer.overlays.flatMap(state => state.ghostEvents);
    const route = drawRoute();
    open();
    await landed();

    // Assert: nothing said, pictured or drawn before it opened; the walker once it had.
    expect([ said, ghosts, route, startLine() ])
      .toStrictEqual([ '', [], [], 'Starts at 1, 1, where it stands on the map. Click the map to start it elsewhere.' ]);
  });
});
