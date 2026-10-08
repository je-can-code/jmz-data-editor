/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createMapEvent } from '../../../../src/mapEditor/core/model/eventModel.ts';
import { singleTileBrush } from '../../../../src/mapEditor/core/tools/brush.ts';
import { PaintState } from '../../../../src/mapEditor/core/tools/PaintState.ts';
import { PaintToolBar } from '../../../../src/mapEditor/render/tools/PaintToolBar.tsx';
import { stampOf } from '../../support/stampFixtures.ts';

/*
 * The painting tools' bar.
 *
 * One button per tool, the events first and the stamp last, always one of them in hand; a readout of the brush, or of
 * the stamp while it is in hand, or of a blueprint by its name; and a line naming what Shift and the space bar do, the
 * space bar's layer following the layer strip, or Esc with the stamp or the blueprint. The bar picks no brush, layer or stamp of its own: those come from the
 * palette, the eyedropper, the layer strip and the Stamps panel, through the window's painting settings, which it
 * follows however they change, the stamp's button waiting until a stamp is picked.
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
      .toEqual([ 0, 10 ]);
  });

  it('holds the stamp\'s button back until a stamp is picked, and then names the stamp and Esc while it is in hand', () =>
  {
    // Arrange.
    const painting = new PaintState();
    render(<PaintToolBar painting={painting}/>);
    const stampButton = screen.getByLabelText('Stamp: places the stamp picked in the Stamps panel with each click');
    const disabledAtStart = (stampButton as HTMLButtonElement).disabled;

    // Act: a stamp of three events picked in the Stamps panel.
    act(() => painting.takeUpStamp(stampOf({ width: 3, events: [ 1, 2, 3 ].map(id => createMapEvent(id, id - 1, 0)) })));

    // Assert.
    expect([
      disabledAtStart,
      (stampButton as HTMLButtonElement).disabled,
      stampButton.getAttribute('aria-pressed'),
      screen.getByTestId('paint-brush').textContent,
      screen.queryByText('Shift: exact tiles · Esc: put the stamp down') !== null,
    ])
      .toEqual([ true, false, 'true', 'Stamp: 3 events', true ]);
  });

  it('names a blueprint in hand by its name, and Esc as putting the blueprint down, its new name once renamed', () =>
  {
    // Arrange.
    const painting = new PaintState();
    render(<PaintToolBar painting={painting}/>);

    // Act: the blueprint "Goblin camp" picked in the Stamps panel, then renamed there.
    act(() => painting.takeUpBlueprint({ id: 'k3x9q2mf', name: 'Goblin camp', stamp: stampOf() }));
    const picked = screen.getByTestId('paint-brush').textContent;
    act(() => painting.renameBlueprint('k3x9q2mf', 'Goblin den'));

    // Assert.
    expect([ picked, screen.getByTestId('paint-brush').textContent, screen.queryByText('Shift: exact tiles · Esc: put the blueprint down') !== null ])
      .toEqual([ 'Blueprint: Goblin camp', 'Blueprint: Goblin den', true ]);
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
