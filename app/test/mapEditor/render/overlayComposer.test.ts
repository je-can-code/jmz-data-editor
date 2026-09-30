import { describe, expect, it } from 'vitest';
import type { OverlayState } from '../../../src/mapEditor/core/renderer/MapRenderer.ts';
import { OverlayComposer } from '../../../src/mapEditor/render/overlayComposer.ts';

/*
 * The overlay a map view shows is put together from parts: the picked event's selection, and the painting tools'
 * cursor, ghosts and selected area. Each owner changes only its own fields, and the renderer hears only of a real
 * change, compared by value, so a pointer moving inside one cell (which rebuilds the tools' part afresh) redraws
 * nothing. The first update always reaches the renderer, so its state is known to match from then on.
 */
describe('OverlayComposer', () =>
{
  /**
   * Builds a composer over a renderer that records every state it is told.
   * @returns {{ composer: OverlayComposer, told: OverlayState[] }} The composer and the record.
   */
  const recorded = () =>
  {
    const told: OverlayState[] = [];
    const composer = new OverlayComposer({ setOverlayState: state => told.push(state) });
    return { composer, told };
  };

  it('keeps each owner\'s fields when another updates its own', () =>
  {
    // Arrange.
    const { composer, told } = recorded();

    // Act: the picked event, then the tools' cursor.
    composer.update({ selectedEvents: [ 3 ] });
    composer.update({ hover: { x: 1, y: 2, width: 1, height: 1 }, hoverLabel: 'Auto: layer 1' });

    // Assert.
    expect([ told.length, told[1].selectedEvents, told[1].hover, told[1].hoverLabel ])
      .toEqual([ 2, [ 3 ], { x: 1, y: 2, width: 1, height: 1 }, 'Auto: layer 1' ]);
  });

  it('tells the renderer nothing when an update rebuilds the same overlay afresh', () =>
  {
    // Arrange: a cursor and a ghost already shown.
    const { composer, told } = recorded();
    composer.update({ hover: { x: 1, y: 1, width: 1, height: 1 }, ghostTiles: [ { x: 1, y: 1, layer: 0, tileId: 2816 } ] });

    // Act: the same again, in new objects, and then a ghost on another layer.
    composer.update({ hover: { x: 1, y: 1, width: 1, height: 1 }, ghostTiles: [ { x: 1, y: 1, layer: 0, tileId: 2816 } ], selectedEvents: [] });
    const quiet = told.length;
    composer.update({ ghostTiles: [ { x: 1, y: 1, layer: 1, tileId: 2816 } ] });

    // Assert.
    expect([ quiet, told.length ])
      .toEqual([ 1, 2 ]);
  });

  it('always tells the renderer the first update, even one that changes nothing', () =>
  {
    // Arrange.
    const { composer, told } = recorded();

    // Act: nothing selected, which is where the overlay starts.
    composer.update({ selectedEvents: [] });

    // Assert.
    expect([ told.length, composer.state.selectedEvents ])
      .toEqual([ 1, [] ]);
  });
});
