/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { singleTileBrush } from '../../../../src/mapEditor/core/tools/brush.ts';
import { PaintState } from '../../../../src/mapEditor/core/tools/PaintState.ts';
import { PaintToolBar } from '../../../../src/mapEditor/render/tools/PaintToolBar.tsx';

/*
 * The painting tools' bar.
 *
 * One button per tool, always one of them in hand; a readout of the brush; and, until the palette and the layer strip
 * are wired to the tools, a stand-in for picking a brush (a tile id or region id typed in, the region and shadow pens)
 * and the layer strip's choice. Whatever it sets goes to the window's painting settings, which every map view paints
 * with, and it follows those settings however they change, the eyedropper included.
 */
describe('PaintToolBar', () =>
{
  it('takes up the tool clicked, and keeps a tool in hand when the one in hand is clicked again', () =>
  {
    // Arrange.
    const painting = new PaintState();
    render(<PaintToolBar painting={painting}/>);

    // Act.
    fireEvent.click(screen.getByLabelText('Fill: paints the whole area you click'));
    const afterFill = painting.settings.tool;
    fireEvent.click(screen.getByLabelText('Fill: paints the whole area you click'));

    // Assert.
    expect([ afterFill, painting.settings.tool ])
      .toEqual([ 'fill', 'fill' ]);
  });

  it('offers the events first, in hand from the start, and takes them back up when clicked', () =>
  {
    // Arrange: a fresh window, then the pen taken up.
    const painting = new PaintState();
    render(<PaintToolBar painting={painting}/>);
    const eventsButton = screen.getByLabelText('Events: select, move and open the events on the map');
    const pressedAtStart = eventsButton.getAttribute('aria-pressed');
    fireEvent.click(screen.getByLabelText('Pen: paints as you drag'));
    const afterPen = painting.settings.tool;

    // Act.
    fireEvent.click(eventsButton);

    // Assert.
    expect([ pressedAtStart, afterPen, painting.settings.tool ])
      .toEqual([ 'true', 'pen', 'events' ]);
  });

  it('makes a tile id typed in the brush, and leaves the brush alone for anything else', () =>
  {
    // Arrange.
    const painting = new PaintState();
    render(<PaintToolBar painting={painting}/>);
    const field = screen.getByLabelText('Tile to paint with');
    field.focus();

    // Act.
    fireEvent.change(field, { target: { value: 'grass' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    const afterWords = painting.settings.brush;
    fireEvent.change(field, { target: { value: '2864' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    // Assert: the field also lets go of the keys, so the space bar over the map paints rather than types.
    expect([ afterWords, painting.settings.brush, screen.getByTestId('paint-brush').textContent, document.activeElement === field ])
      .toEqual([ null, singleTileBrush(2864), 'Tile 2864', false ]);
  });

  it('takes up the region pen with the region typed, and the shadow pen', () =>
  {
    // Arrange: the fill in hand.
    const painting = new PaintState();
    painting.setTool('fill');
    render(<PaintToolBar painting={painting}/>);

    // Act.
    fireEvent.change(screen.getByLabelText('Region to paint'), { target: { value: '7' } });
    fireEvent.click(screen.getByLabelText('Region pen'));
    const region = { brush: painting.settings.brush, tool: painting.settings.tool };
    fireEvent.click(screen.getByLabelText('Shadow pen'));

    // Assert.
    expect([ region, painting.settings.brush?.kind, painting.settings.tool ])
      .toEqual([ { brush: { kind: 'regions', width: 1, height: 1, cells: [ 7 ] }, tool: 'pen' }, 'shadows', 'pen' ]);
  });

  it('sets the layer strip, and names the layer the space bar paints', () =>
  {
    // Arrange.
    const painting = new PaintState();
    render(<PaintToolBar painting={painting}/>);

    // Act: layer 2 picked, then back to automatic.
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Auto' }));

    // Assert.
    expect([ painting.settings.strip, screen.getByText('Shift: exact tiles · Space: paint layer 2') !== null ])
      .toEqual([ 'auto', true ]);
  });

  it('follows the settings however they change', () =>
  {
    // Arrange.
    const painting = new PaintState();
    render(<PaintToolBar painting={painting}/>);

    // Act: a brush picked elsewhere, as the eyedropper does.
    act(() => painting.setBrush(singleTileBrush(10)));

    // Assert.
    expect(screen.getByTestId('paint-brush').textContent)
      .toBe('Tile 10');
  });
});
