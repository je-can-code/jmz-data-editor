import { describe, expect, it } from 'vitest';
import type { OverlayState } from '../../../src/mapEditor/core/renderer/MapRenderer.ts';
import { OverlayComposer } from '../../../src/mapEditor/render/overlayComposer.ts';

/*
 * The overlay a map view shows is put together from two owners' parts: the event tools' selection, box, dragged ghosts
 * and refused tiles, and the painting tools' cursor words, ghost tiles and selected area. Each owner decides only its
 * own fields, so neither wipes what the other shows, whatever else it hands over. Both hand over a hover, and only the
 * one in hand shows one: the painting tools' hover wins while they have one, and the event tools' shows otherwise. The
 * renderer hears only of a real change, compared by value, so a pointer moving inside one cell (which rebuilds a part
 * afresh) redraws nothing. The first update always reaches the renderer, so its state is known to match from then on.
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

  it('keeps each owner\'s fields when the other updates its own', () =>
  {
    // Arrange.
    const { composer, told } = recorded();

    // Act: the event tools' selection, then the painting tools' cursor.
    composer.update('events', { selectedEvents: [ 3 ] });
    composer.update('tools', { hover: { x: 1, y: 2, width: 1, height: 1 }, hoverLabel: 'Auto: layer 1' });

    // Assert.
    expect([ told.length, told[1].selectedEvents, told[1].hover, told[1].hoverLabel ])
      .toEqual([ 2, [ 3 ], { x: 1, y: 2, width: 1, height: 1 }, 'Auto: layer 1' ]);
  });

  it('leaves out the fields an owner does not decide, so the event tools never wipe the painting tools\' preview', () =>
  {
    // Arrange: the painting tools show a ghost tile and a selected area.
    const { composer } = recorded();
    const ghost = { x: 1, y: 1, layer: 0, tileId: 2816 };
    composer.update('tools', { ghostTiles: [ ghost ], selectedCells: { x: 0, y: 0, width: 2, height: 2 } });

    // Act: the event tools hand over their whole state, empty ghost tiles and no selected area included, and the painting
    // tools hand over a selected event of their own.
    composer.update('events', { selectedEvents: [ 4 ], ghostTiles: [], selectedCells: null, blockedCells: [ { x: 2, y: 2 } ] });
    composer.update('tools', { selectedEvents: [ 9 ] });

    // Assert: each owner's fields stand as it set them, and nothing else took.
    const { state } = composer;
    expect([ state.ghostTiles, state.selectedCells, state.selectedEvents, state.blockedCells ])
      .toEqual([ [ ghost ], { x: 0, y: 0, width: 2, height: 2 }, [ 4 ], [ { x: 2, y: 2 } ] ]);
  });

  it('shows the painting tools\' hover while they have one, and the event tools\' otherwise', () =>
  {
    // Arrange.
    const { composer } = recorded();
    const eventHover = { x: 5, y: 5, width: 1, height: 1 };
    const brushHover = { x: 2, y: 3, width: 2, height: 2 };

    // Act: the event tools' hover alone, then the painting tools' over it, then the painting tools' taken away.
    composer.update('events', { hover: eventHover });
    const eventsAlone = composer.state.hover;
    composer.update('tools', { hover: brushHover });
    const both = composer.state.hover;
    composer.update('tools', { hover: null });

    // Assert.
    expect([ eventsAlone, both, composer.state.hover ])
      .toEqual([ eventHover, brushHover, eventHover ]);
  });

  it('keeps an owner\'s hover when it updates other fields', () =>
  {
    // Arrange: the event tools hover a tile.
    const { composer } = recorded();
    composer.update('events', { hover: { x: 5, y: 5, width: 1, height: 1 } });

    // Act: the event tools update their selection alone.
    composer.update('events', { selectedEvents: [ 1 ] });

    // Assert.
    expect(composer.state.hover)
      .toEqual({ x: 5, y: 5, width: 1, height: 1 });
  });

  it('tells the renderer nothing when an update rebuilds the same overlay afresh', () =>
  {
    // Arrange: a cursor and a ghost already shown, and a refused tile.
    const { composer, told } = recorded();
    composer.update('tools', { hover: { x: 1, y: 1, width: 1, height: 1 }, ghostTiles: [ { x: 1, y: 1, layer: 0, tileId: 2816 } ] });
    composer.update('events', { blockedCells: [ { x: 3, y: 1 } ] });

    // Act: the same again, in new objects, and then a ghost on another layer and another refused tile.
    composer.update('tools', { hover: { x: 1, y: 1, width: 1, height: 1 }, ghostTiles: [ { x: 1, y: 1, layer: 0, tileId: 2816 } ] });
    composer.update('events', { blockedCells: [ { x: 3, y: 1 } ], selectedEvents: [] });
    const quiet = told.length;
    composer.update('tools', { ghostTiles: [ { x: 1, y: 1, layer: 1, tileId: 2816 } ] });
    composer.update('events', { blockedCells: [ { x: 3, y: 2 } ] });

    // Assert.
    expect([ quiet, told.length ])
      .toEqual([ 2, 4 ]);
  });

  it('always tells the renderer the first update, even one that changes nothing', () =>
  {
    // Arrange.
    const { composer, told } = recorded();

    // Act: nothing selected, which is where the overlay starts.
    composer.update('events', { selectedEvents: [] });

    // Assert.
    expect([ told.length, composer.state.selectedEvents ])
      .toEqual([ 1, [] ]);
  });
});
