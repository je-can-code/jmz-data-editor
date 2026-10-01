/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';
import { makeAutotileId, TileId } from '../../../../src/mapEditor/core/tiles/tileIds.ts';
import { singleTileBrush } from '../../../../src/mapEditor/core/tools/brush.ts';
import { INITIAL_PAINT_SETTINGS, PaintState, type PaintSettings } from '../../../../src/mapEditor/core/tools/PaintState.ts';
import type { ToolOverlay } from '../../../../src/mapEditor/core/tools/ToolSession.ts';
import { PaintController } from '../../../../src/mapEditor/render/tools/PaintController.ts';
import { fill, put } from '../../core/tiles/support/tileGridBuilder.ts';
import { benchWith, layeringWith, stackAt, type PaintBench } from '../../core/tools/support/paintFixtures.ts';

/*
 * The page's side of painting.
 *
 * The controller turns the pointer on a map's canvas and the keys held into what the tools do: the left button
 * paints (the right stays the renderer's, for panning), Shift held with the pointer lays tiles exactly, the space bar
 * held over the map paints one stroke on the override's layer (and is kept from the page, which would otherwise
 * scroll or press a button), Escape takes back what is in progress, and a stroke is ended, keeping what it painted,
 * when a Ctrl shortcut arrives mid-stroke or the window loses focus, so an undo never finds a stroke still open. The
 * view is told what to show after every change, and nothing more happens once the controller lets go.
 */
const GRASS = 16;
const ROCK = TileId.A5 + 97;

/**
 * A controller over a canvas, with the bench it paints on, the settings it reads, and every overlay it handed over.
 */
type ControllerBench = PaintBench & {
  readonly canvas: HTMLCanvasElement;
  readonly painting: PaintState;
  readonly controller: PaintController;
  readonly overlays: ToolOverlay[];
  readonly detach: () => void;
};

/**
 * The canvases made by the test in hand, and the controllers listening on them, let go of after it: a controller
 * left listening on the window would hear the next test's keys.
 */
const canvases: HTMLCanvasElement[] = [];
const detachers: (() => void)[] = [];

afterEach(() =>
{
  detachers.splice(0).forEach(detach => detach());
  canvases.splice(0).forEach(canvas => canvas.remove());
});

/**
 * Builds a controller painting a 4x3 map of grass through a canvas with one cell every 48 pixels.
 * @param {Partial<PaintSettings>} settings The settings to start from.
 * @returns {ControllerBench} The controller and everything around it.
 */
const controllerWith = (settings: Partial<PaintSettings>): ControllerBench =>
{
  const bench = benchWith(4, 3, grid => fill(grid, 0, 0, 3, 2, 0, makeAutotileId(GRASS, 0)));
  const canvas = document.createElement('canvas');
  canvas.setPointerCapture = () => undefined;
  canvas.releasePointerCapture = () => undefined;
  canvas.hasPointerCapture = () => true;
  document.body.appendChild(canvas);
  canvases.push(canvas);
  const painting = new PaintState({ ...INITIAL_PAINT_SETTINGS, ...settings });
  const overlays: ToolOverlay[] = [];
  const controller = new PaintController({
    surface: {
      canvas,
      camera: { x: 0, y: 0, zoom: 1 },
      cellAt: point =>
      {
        const x = Math.floor(point.x / 48);
        const y = Math.floor(point.y / 48);
        return x >= 0 && y >= 0 && x < 4 && y < 3 ? { x, y } : null;
      },
    },
    hub: bench.hub,
    map: () => bench.map,
    layering: () => layeringWith(),
    painting,
    overlay: overlay => overlays.push(overlay),
  });
  const detach = controller.attach();
  detachers.push(detach);
  return { ...bench, canvas, painting, controller, overlays, detach };
};

/**
 * Sends the canvas a pointer event over a cell's middle.
 * @param {HTMLCanvasElement} canvas The canvas.
 * @param {string} type The event type.
 * @param {number} x The cell's column.
 * @param {number} y The cell's row.
 * @param {PointerEventInit} init Anything else about the event: the button, the keys.
 */
const pointer = (canvas: HTMLCanvasElement, type: string, x: number, y: number, init: PointerEventInit = {}): void =>
{
  const event = new PointerEvent(type, { bubbles: true, button: 0, pointerId: 1, ...init });
  Object.defineProperty(event, 'offsetX', { value: x * 48 + 24 });
  Object.defineProperty(event, 'offsetY', { value: y * 48 + 24 });
  canvas.dispatchEvent(event);
};

/**
 * Sends the window a key going down or up.
 * @param {string} type keydown or keyup.
 * @param {KeyboardEventInit} init The key.
 * @returns {KeyboardEvent} The event, to read whether it was kept from the page.
 */
const key = (type: 'keydown' | 'keyup', init: KeyboardEventInit): KeyboardEvent =>
{
  const event = new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init });
  window.dispatchEvent(event);
  return event;
};

describe('PaintController', () =>
{
  it('paints a stroke from the left button\'s press to its release as one step, counting the moves that painted', () =>
  {
    // Arrange.
    const bench = controllerWith({ tool: 'pen', brush: singleTileBrush(ROCK) });

    // Act: across the middle row.
    pointer(bench.canvas, 'pointerdown', 0, 1);
    pointer(bench.canvas, 'pointermove', 2, 1);
    pointer(bench.canvas, 'pointerup', 2, 1);

    // Assert.
    expect([ [ 0, 1, 2 ].map(x => bench.map.cellAt(x, 1, 0)), bench.hub.history(bench.history).rows.map(row => row.label), bench.controller.paintedInputs ])
      .toEqual([ [ ROCK, ROCK, ROCK ], [ 'Paint tiles' ], 2 ]);
  });

  it('leaves the right button to the renderer', () =>
  {
    // Arrange.
    const bench = controllerWith({ tool: 'pen', brush: singleTileBrush(ROCK) });

    // Act.
    pointer(bench.canvas, 'pointerdown', 0, 1, { button: 2 });
    pointer(bench.canvas, 'pointerup', 0, 1, { button: 2 });

    // Assert.
    expect(bench.hub.history(bench.history).rows)
      .toEqual([]);
  });

  it('paints on the override\'s layer while the space bar is held over the map, keeping the key from the page', () =>
  {
    // Arrange: the pointer over the map.
    const bench = controllerWith({ tool: 'pen', brush: singleTileBrush(ROCK), overrideLayer: 2 });
    pointer(bench.canvas, 'pointerenter', 1, 1);

    // Act.
    const down = key('keydown', { key: ' ', code: 'Space' });
    pointer(bench.canvas, 'pointerdown', 1, 1);
    pointer(bench.canvas, 'pointerup', 1, 1);
    key('keyup', { key: ' ', code: 'Space' });
    pointer(bench.canvas, 'pointerdown', 2, 1);
    pointer(bench.canvas, 'pointerup', 2, 1);

    // Assert: layer 3 while held, the ground once let go.
    expect([ down.defaultPrevented, stackAt(bench.map, 1, 1), stackAt(bench.map, 2, 1) ])
      .toEqual([ true, [ 'k16', 0, ROCK, 0 ], [ ROCK, 0, 0, 0 ] ]);
  });

  it('leaves the space bar to the page while the pointer is elsewhere', () =>
  {
    // Arrange: the pointer has left the map.
    const bench = controllerWith({ tool: 'pen', brush: singleTileBrush(ROCK) });
    pointer(bench.canvas, 'pointerenter', 1, 1);
    pointer(bench.canvas, 'pointerleave', 1, 1);

    // Act.
    const down = key('keydown', { key: ' ', code: 'Space' });

    // Assert.
    expect(down.defaultPrevented)
      .toBe(false);
  });

  it('lets the override go when the space bar comes up away from the map, and never takes it up there', () =>
  {
    // Arrange: the space bar pressed over the map, then the pointer wandering off.
    const bench = controllerWith({ tool: 'pen', brush: singleTileBrush(ROCK), overrideLayer: 2 });
    pointer(bench.canvas, 'pointerenter', 1, 1);
    key('keydown', { key: ' ', code: 'Space' });
    pointer(bench.canvas, 'pointerleave', 1, 1);

    // Act: released away from the map, pressed again there, then a stroke back on the map.
    key('keyup', { key: ' ', code: 'Space' });
    key('keydown', { key: ' ', code: 'Space' });
    pointer(bench.canvas, 'pointerenter', 1, 1);
    pointer(bench.canvas, 'pointerdown', 1, 1);
    pointer(bench.canvas, 'pointerup', 1, 1);

    // Assert: the stroke paints automatically, on the ground.
    expect(stackAt(bench.map, 1, 1))
      .toEqual([ ROCK, 0, 0, 0 ]);
  });

  it('takes the keys from a text field at a press on the map, while the space bar typed into the field never overrides', () =>
  {
    // Arrange: a text field with the keys, and the pointer over the map.
    const bench = controllerWith({ tool: 'pen', brush: singleTileBrush(ROCK), overrideLayer: 2 });
    const field = document.createElement('input');
    document.body.appendChild(field);
    field.focus();
    pointer(bench.canvas, 'pointerenter', 1, 1);

    // Act: the space bar into the field, a stroke, then the space bar again with the keys now the map's.
    const typed = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: ' ', code: 'Space' });
    field.dispatchEvent(typed);
    pointer(bench.canvas, 'pointerdown', 1, 1);
    pointer(bench.canvas, 'pointerup', 1, 1);
    const focused = document.activeElement;
    key('keydown', { key: ' ', code: 'Space' });
    pointer(bench.canvas, 'pointerdown', 2, 1);
    pointer(bench.canvas, 'pointerup', 2, 1);
    field.remove();

    // Assert: the first stroke paints automatically, the second on the override's layer.
    expect([ typed.defaultPrevented, focused === bench.canvas, stackAt(bench.map, 1, 1), stackAt(bench.map, 2, 1) ])
      .toEqual([ false, true, [ ROCK, 0, 0, 0 ], [ 'k16', 0, ROCK, 0 ] ]);
  });

  it('lays tiles exactly with Shift held on the press', () =>
  {
    // Arrange.
    const bench = controllerWith({ tool: 'pen', brush: singleTileBrush(makeAutotileId(18, 9)) });

    // Act.
    pointer(bench.canvas, 'pointerdown', 1, 1, { shiftKey: true });
    pointer(bench.canvas, 'pointerup', 1, 1, { shiftKey: true });

    // Assert: dirt in shape 9, and its neighbour still joined all round.
    expect([ bench.map.cellAt(1, 1, 0), bench.map.cellAt(2, 1, 0) ])
      .toEqual([ makeAutotileId(18, 9), makeAutotileId(GRASS, 0) ]);
  });

  it('takes a stroke back on Escape', () =>
  {
    // Arrange.
    const bench = controllerWith({ tool: 'pen', brush: singleTileBrush(ROCK) });
    pointer(bench.canvas, 'pointerdown', 0, 0);
    pointer(bench.canvas, 'pointermove', 3, 0);

    // Act.
    const escape = key('keydown', { key: 'Escape' });

    // Assert.
    expect([ escape.defaultPrevented, bench.map.cellAt(1, 0, 0), bench.hub.history(bench.history).rows ])
      .toEqual([ true, makeAutotileId(GRASS, 0), [] ]);
  });

  it('ends a stroke when a Ctrl shortcut arrives mid-stroke, so an undo finds it finished', () =>
  {
    // Arrange.
    const bench = controllerWith({ tool: 'pen', brush: singleTileBrush(ROCK) });
    pointer(bench.canvas, 'pointerdown', 0, 0);
    pointer(bench.canvas, 'pointermove', 1, 0);

    // Act: Ctrl+Z, then the undo it asks for.
    key('keydown', { key: 'z', ctrlKey: true });
    const undone = bench.hub.undo(bench.history);

    // Assert.
    expect([ undone.ok, bench.map.cellAt(0, 0, 0), bench.controller.session.isActive ])
      .toEqual([ true, makeAutotileId(GRASS, 0), false ]);
  });

  it('ends a stroke, keeping what it painted, when the window loses focus', () =>
  {
    // Arrange.
    const bench = controllerWith({ tool: 'pen', brush: singleTileBrush(ROCK) });
    pointer(bench.canvas, 'pointerdown', 0, 2);

    // Act.
    window.dispatchEvent(new Event('blur'));

    // Assert.
    expect([ bench.map.cellAt(0, 2, 0), bench.hub.history(bench.history).rows.map(row => row.label), bench.controller.session.isActive ])
      .toEqual([ ROCK, [ 'Paint tiles' ], false ]);
  });

  it('shows the cursor under the pointer and clears it when the pointer leaves', () =>
  {
    // Arrange.
    const bench = controllerWith({ tool: 'pen', brush: singleTileBrush(ROCK) });

    // Act.
    pointer(bench.canvas, 'pointermove', 3, 2);
    const shown = bench.overlays.at(-1);
    pointer(bench.canvas, 'pointerleave', 3, 2);

    // Assert.
    expect([ shown?.hover, shown?.hoverLabel, bench.overlays.at(-1)?.hover ])
      .toEqual([ { x: 3, y: 2, width: 1, height: 1 }, 'Auto: layer 1', null ]);
  });

  it('leaves the left button and the space bar to the event tools while the events are in hand', () =>
  {
    // Arrange: the events in hand with a brush picked, and the pointer over the map.
    const bench = controllerWith({ tool: 'events', brush: singleTileBrush(ROCK), overrideLayer: 2 });
    pointer(bench.canvas, 'pointerenter', 1, 1);

    // Act: the space bar held through a click.
    const space = key('keydown', { key: ' ', code: 'Space' });
    pointer(bench.canvas, 'pointerdown', 1, 1);
    pointer(bench.canvas, 'pointerup', 1, 1);
    key('keyup', { key: ' ', code: 'Space' });

    // Assert: nothing painted, the canvas never took the keys from the view, and the space bar reached the page.
    expect([ bench.hub.history(bench.history).rows, document.activeElement === bench.canvas, space.defaultPrevented ])
      .toEqual([ [], false, false ]);
  });

  it('shows a new tool at once, and nothing more once it has let go', () =>
  {
    // Arrange.
    const bench = controllerWith({ tool: 'pen', brush: singleTileBrush(ROCK) });
    pointer(bench.canvas, 'pointermove', 1, 1);

    // Act: the eraser taken up, then the controller let go and a press sent.
    bench.painting.setTool('eraser');
    const label = bench.overlays.at(-1)?.hoverLabel;
    bench.detach();
    pointer(bench.canvas, 'pointerdown', 1, 1);

    // Assert.
    expect([ label, bench.hub.history(bench.history).rows ])
      .toEqual([ 'Erase layers 3 and 4', [] ]);
  });
});

describe('PaintController without a canvas', () =>
{
  it('listens to nothing, and letting go does nothing', () =>
  {
    // Arrange: a renderer that has not mounted yet.
    const bench = benchWith(2, 2, grid => put(grid, 0, 0, 0, ROCK));
    const controller = new PaintController({
      surface: { canvas: null, camera: { x: 0, y: 0, zoom: 1 }, cellAt: () => null },
      hub: bench.hub,
      map: () => bench.map,
      layering: () => layeringWith(),
      painting: new PaintState(),
      overlay: () => undefined,
    });

    // Act.
    const detach = controller.attach();

    // Assert.
    expect(() => detach())
      .not.toThrow();
  });
});
