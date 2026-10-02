/**
 * @vitest-environment jsdom
 */
import type { Container } from 'pixi.js';
import { afterEach, describe, expect, it } from 'vitest';
import { MapDocument } from '../../../src/mapEditor/core/model/MapDocument.ts';
import { GAME_LOOK } from '../../../src/mapEditor/core/renderer/MapRenderer.ts';
import { PixiMapRenderer } from '../../../src/mapEditor/render/PixiMapRenderer.ts';
import { buildMapJson } from '../support/fixtures.ts';

/*
 * Some of the pixi renderer's promises can be kept without a GPU. The selection draws over the pointer's marks, so an
 * event shows as selected while the pointer still rests on it after the click that picked it, rather than hidden under
 * the hover's outline on the very same tile. The wheel zooms about the pointer's own spot: Chromium reports a wheel turn
 * in whole pixels, up to two off the pointer at a device pixel ratio of 1.5, so zooming about the wheel's spot would
 * slide the map under a still pointer a little with every notch. A view mounted off screen makes no GPU context, which
 * is what lets a page without WebGL hold one.
 *
 * The markers of events that draw no picture sit over every event, the tiles above characters and the lighting, so
 * nothing of the game hides them, and under the dimming and the editor's other overlays; they show only while the
 * events do and the markers overlay is on, which keeps them out of anything drawn as the game would draw it.
 */
describe('PixiMapRenderer', () =>
{
  const built: PixiMapRenderer[] = [];

  afterEach(() =>
  {
    built.splice(0).forEach(renderer => renderer.destroy());
    document.body.innerHTML = '';
  });

  it('draws the selection over the ghosts and the pointer\'s marks, under only the hover\'s words', () =>
  {
    // Arrange.
    const renderer = new PixiMapRenderer();
    built.push(renderer);
    const { slots } = renderer;
    const world = slots.selection.parent as Container;

    // Act: the world's top four layers, bottom first.
    const top = world.children.slice(-4);

    // Assert.
    expect(top)
      .toStrictEqual([ slots.ghosts, slots.pointer, slots.selection, slots.pointerLabel ]);
  });

  it('draws the markers over the lighting and every event, under the dimming and the editor\'s other overlays', () =>
  {
    // Arrange.
    const renderer = new PixiMapRenderer();
    built.push(renderer);
    const { slots } = renderer;
    const world = slots.markers.parent as Container;

    // Act: the three layers from the lighting up, and what the markers' slot holds.
    const at = world.children.indexOf(slots.lighting);
    const layers = world.children.slice(at, at + 3);

    // Assert: the slot holds the event layer's markers, one group.
    expect([ layers, slots.markers.children.length ])
      .toStrictEqual([ [ slots.lighting, slots.markers, slots.dim ], 1 ]);
  });

  it('shows the markers only while the events show and the markers overlay is on', () =>
  {
    // Arrange: the event layer's markers, inside their slot.
    const renderer = new PixiMapRenderer();
    built.push(renderer);
    const [ markers ] = renderer.slots.markers.children;
    const shown: boolean[] = [];

    // Act: the overlay on with the events, the overlay off, then the overlay on with the events hidden.
    renderer.setOverlays({ enabled: new Set([ 'markers' ]), definitions: [] });
    shown.push(markers.visible);
    renderer.setOverlays({ enabled: new Set([ 'grid' ]), definitions: [] });
    shown.push(markers.visible);
    renderer.setOverlays({ enabled: new Set([ 'markers' ]), definitions: [] });
    renderer.setLayerVisibility({ ...GAME_LOOK, layers: { ...GAME_LOOK.layers, events: false } });
    shown.push(markers.visible);

    // Assert.
    expect(shown)
      .toStrictEqual([ true, false, false ]);
  });

  it('zooms about the pointer\'s own spot when the wheel reports a whole-pixel spot beside it', () =>
  {
    // Arrange: a view mounted off screen at zoom 1 over a map; the pointer moved to 100.67, 50.33, and the wheel turned
    // one notch in there reports 100, 49, as Chromium cuts it at 1.5.
    const host = document.createElement('div');
    document.body.appendChild(host);
    const renderer = new PixiMapRenderer();
    built.push(renderer);
    renderer.setVisible(false);
    renderer.mount(host);
    renderer.setDocument(MapDocument.fromJson('map:1', buildMapJson()));
    renderer.setCamera({ x: 0, y: 0, zoom: 1 });
    const canvas = renderer.canvas as HTMLCanvasElement;
    const move = new MouseEvent('pointermove', { bubbles: true });
    Object.defineProperties(move, { offsetX: { value: 100.66666666666667 }, offsetY: { value: 50.333333333333336 } });
    const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100 });
    Object.defineProperties(wheel, { offsetX: { value: 100 }, offsetY: { value: 49 } });

    // Act.
    canvas.dispatchEvent(move);
    canvas.dispatchEvent(wheel);

    // Assert: the world point under 100.67, 50.33 is still 100.67, 50.33 at the new zoom.
    const { x, y, zoom } = renderer.camera;
    expect([ x + 100.66666666666667 / zoom, y + 50.333333333333336 / zoom, zoom ].map(value => Number(value.toFixed(6))))
      .toStrictEqual([ 100.666667, 50.333333, 1.161834 ]);
  });
});
