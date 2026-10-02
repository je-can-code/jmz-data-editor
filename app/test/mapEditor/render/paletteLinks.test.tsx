/**
 * @vitest-environment jsdom
 */
import React, { useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, render } from '@testing-library/react';
import { cellInspector } from '../../../src/mapEditor/core/palette/cellInspector.ts';
import { PaintSelection } from '../../../src/mapEditor/core/palette/paintSelection.ts';
import { PaletteModeStore } from '../../../src/mapEditor/core/palette/paletteMode.ts';
import { GAME_LOOK } from '../../../src/mapEditor/core/renderer/MapRenderer.ts';
import type { MapViewSettings } from '../../../src/mapEditor/render/mapViewSettings.ts';
import { highlightForChoice, usePaletteLinks, withOverlay, type CellFinder } from '../../../src/mapEditor/render/paletteLinks.ts';

/*
 * A map view's links to its window's palette and layer strip, and to the stack view. The view is handed its window's
 * choices and palette mode, so a torn-out map follows its own palette and never the main window's.
 *
 * Painting should never need a trip to the strip, so over a map Shift and the wheel step the layer strip (and must not
 * also zoom), the cell under the pointer feeds the stack view, and a middle click holds a cell there. While the strip
 * paints one layer, the view highlights that layer and dims the rest, and automatic layering stops highlighting; while
 * the passability editor is open the view shows the passability overlay, and takes it away afterwards only if the
 * editor put it there. Each helper leaves the settings object untouched when nothing changes, so React skips the
 * render.
 */
const start = (): MapViewSettings => ({ visibility: GAME_LOOK, overlays: new Set([ 'selection', 'hover', 'ghost' ]) });

describe('highlightForChoice', () =>
{
  it('highlights the layer the strip paints, and switches the dimming on with it', () =>
  {
    // Arrange.
    const settings = start();

    // Act.
    const next = highlightForChoice(settings, 2);

    // Assert.
    expect([ next.visibility.highlighted, next.overlays.has('layer-highlight'), next.overlays.has('hover') ])
      .toStrictEqual([ 'tiles3', true, true ]);
  });

  it('stops highlighting for automatic layering', () =>
  {
    // Arrange.
    const settings = highlightForChoice(start(), 0);

    // Act.
    const next = highlightForChoice(settings, 'auto');

    // Assert.
    expect([ next.visibility.highlighted, next.overlays.has('layer-highlight') ])
      .toStrictEqual([ null, false ]);
  });

  it('hands back the same settings when the highlight already matches', () =>
  {
    // Arrange.
    const settings = highlightForChoice(start(), 1);

    // Act.
    const same = [ highlightForChoice(settings, 1), highlightForChoice(start(), 'auto') ];

    // Assert.
    expect([ same[0] === settings, same[1].visibility.highlighted ])
      .toStrictEqual([ true, null ]);
  });
});

describe('withOverlay', () =>
{
  it('switches one overlay on and off, leaving the rest', () =>
  {
    // Arrange.
    const settings = start();

    // Act.
    const on = withOverlay(settings, 'passability', true);
    const off = withOverlay(on, 'passability', false);

    // Assert.
    expect([ [ ...on.overlays ].sort(), [ ...off.overlays ].sort() ])
      .toStrictEqual([ [ 'ghost', 'hover', 'passability', 'selection' ], [ 'ghost', 'hover', 'selection' ] ]);
  });

  it('hands back the same settings when the overlay already is as asked', () =>
  {
    // Arrange.
    const settings = start();

    // Act.
    const same = withOverlay(settings, 'hover', true);

    // Assert.
    expect(same)
      .toBe(settings);
  });
});

describe('usePaletteLinks', () =>
{
  /**
   * What the probe's view last had as its settings.
   */
  let shown: MapViewSettings = start();

  /**
   * The probe's window's palette and layer strip choices, and its palette's mode, fresh for every test.
   */
  let selection = new PaintSelection();
  let mode = new PaletteModeStore();

  /**
   * A map view standing in: a host element, a renderer finding cell 3, 4 under any point, and the view's settings.
   * @param {{ initial: MapViewSettings }} props The settings it starts with.
   * @returns {React.JSX.Element} The host.
   */
  const Probe = (props: { initial: MapViewSettings }) =>
  {
    const host = useRef<HTMLDivElement | null>(null);
    const renderer = useRef<CellFinder | null>({ cellAt: () => ({ x: 3, y: 4 }) });
    const [ settings, setSettings ] = useState<MapViewSettings>(props.initial);
    usePaletteLinks({ host, renderer, mapId: 12, settings, setSettings, selection, mode });
    shown = settings;
    return <div data-testid={'host'} ref={host}/>;
  };

  beforeEach(() =>
  {
    selection = new PaintSelection();
    mode = new PaletteModeStore();
    cellInspector.forgetMap(12);
    shown = start();
  });

  afterEach(() =>
  {
    cellInspector.forgetMap(12);
  });

  it('steps the strip on Shift and the wheel, and keeps the wheel from reaching the map beneath', () =>
  {
    // Arrange: a listener standing in for the canvas's own zoom.
    const { getByTestId } = render(<Probe initial={start()}/>);
    const host = getByTestId('host');
    const zoomed: number[] = [];
    const canvas = document.createElement('canvas');
    host.appendChild(canvas);
    canvas.addEventListener('wheel', () => zoomed.push(1));

    // Act: one notch with Shift, then one without.
    act(() =>
    {
      canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, shiftKey: true, bubbles: true, cancelable: true }));
    });
    const afterShift = selection.layer;
    act(() =>
    {
      canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }));
    });

    // Assert: the Shift notch stepped from automatic to layer 1 and never zoomed; the plain notch zoomed only.
    expect([ afterShift, selection.layer, zoomed.length ])
      .toStrictEqual([ 0, 0, 1 ]);
  });

  it('feeds the stack view the cell under the pointer, and holds it on a middle click', () =>
  {
    // Arrange.
    const { getByTestId } = render(<Probe initial={start()}/>);
    const host = getByTestId('host');

    // Act.
    act(() =>
    {
      host.dispatchEvent(new MouseEvent('pointermove', { clientX: 10, clientY: 10, bubbles: true }));
    });
    const followed = cellInspector.getState();
    act(() =>
    {
      host.dispatchEvent(new MouseEvent('pointerdown', { clientX: 10, clientY: 10, button: 1, bubbles: true, cancelable: true }));
    });

    // Assert.
    expect([ followed, cellInspector.getState() ])
      .toStrictEqual([ { cell: { mapId: 12, x: 3, y: 4 }, held: false }, { cell: { mapId: 12, x: 3, y: 4 }, held: true } ]);
  });

  it('leaves a left click to the tools', () =>
  {
    // Arrange.
    const { getByTestId } = render(<Probe initial={start()}/>);
    const host = getByTestId('host');

    // Act.
    act(() =>
    {
      host.dispatchEvent(new MouseEvent('pointerdown', { clientX: 10, clientY: 10, button: 0, bubbles: true, cancelable: true }));
    });

    // Assert: nothing is held.
    expect(cellInspector.getState().held)
      .toBe(false);
  });

  it('highlights the strip\'s layer from the start and follows it, stopping for automatic layering', () =>
  {
    // Arrange: the strip already on layer 2 when the view mounts.
    selection.setLayer(1);
    render(<Probe initial={start()}/>);
    const atMount = shown.visibility.highlighted;

    // Act.
    act(() => selection.setLayer(3));
    const followed = shown.visibility.highlighted;
    act(() => selection.setLayer('auto'));

    // Assert.
    expect([ atMount, followed, shown.visibility.highlighted ])
      .toStrictEqual([ 'tiles2', 'tiles4', null ]);
  });

  it('shows the passability overlay while its editor is open, and takes away only what it put there', () =>
  {
    // Arrange: a view without the overlay.
    render(<Probe initial={start()}/>);

    // Act.
    act(() => mode.setEditing('passability'));
    const whileOpen = shown.overlays.has('passability');
    act(() => mode.setEditing('tiles'));

    // Assert.
    expect([ whileOpen, shown.overlays.has('passability') ])
      .toStrictEqual([ true, false ]);
  });

  it('keeps a passability overlay that was already showing when the editor closes', () =>
  {
    // Arrange.
    render(<Probe initial={withOverlay(start(), 'passability', true)}/>);

    // Act.
    act(() => mode.setEditing('passability'));
    act(() => mode.setEditing('tiles'));

    // Assert.
    expect(shown.overlays.has('passability'))
      .toBe(true);
  });
});
