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
 * One button per tool, the events first, always one of them in hand; a readout of the brush; and a line naming what
 * Shift and the space bar do, the space bar's layer following the layer strip. The bar picks no brush and no layer of
 * its own: those come from the palette, the eyedropper and the layer strip, through the window's painting settings,
 * which it follows however they change.
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

  it('offers nothing to type a brush or a layer into, since the palette and the layer strip pick them', () =>
  {
    // Arrange: nothing beyond the bar.
    const painting = new PaintState();

    // Act.
    render(<PaintToolBar painting={painting}/>);

    // Assert: no text field at all, and every button a tool's.
    expect([ screen.queryAllByRole('textbox').length, screen.getAllByRole('button').length ])
      .toEqual([ 0, 9 ]);
  });

  it('follows the brush and the space bar\'s layer however they change', () =>
  {
    // Arrange.
    const painting = new PaintState();
    render(<PaintToolBar painting={painting}/>);

    // Act: a brush picked elsewhere, as the eyedropper does, and layer 2 picked on the strip.
    act(() =>
    {
      painting.setBrush(singleTileBrush(10));
      painting.setStrip(1);
    });

    // Assert: the tree named as the palette names it.
    expect([ screen.getByTestId('paint-brush').textContent, screen.queryByText('Shift: exact tiles · Space: paint layer 2') !== null ])
      .toEqual([ 'B tile 11', true ]);
  });
});
