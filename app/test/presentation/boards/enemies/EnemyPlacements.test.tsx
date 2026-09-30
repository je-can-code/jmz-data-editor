/**
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { EnemyPlacements } from '@presentation/boards/enemies/EnemyPlacements.tsx';
import type { EnemyPlacementsState } from '@presentation/hooks/useEnemyPlacements.ts';
import type { EnemyPlacement } from '@services/placements/EnemyPlacementsReader.ts';
import { groupPlacementsByMap } from '@services/placements/EnemyPlacementsList.ts';

/**
 * The placements card only draws what the search found and routes a click on an event; every word in it is decided
 * by the placements services, which are tested on their own. It owes the Enemies board a card for each stage of the
 * search, a list that puts every event under its map, and rows that open their event when, and only when, the board
 * has given it a way to.
 */
describe('EnemyPlacements', () =>
{
  /**
   * A slime on the meadow, on its only page.
   */
  const slime: EnemyPlacement = {
    mapId: 2,
    mapName: 'Meadow',
    eventId: 12,
    eventName: 'Slime',
    x: 10,
    y: 12,
    pageIndexes: [ 0 ],
    pageCount: 1,
  };

  /**
   * An ambusher in the cave, the enemy only on its second page.
   */
  const ambush: EnemyPlacement = {
    mapId: 9,
    mapName: 'Cave',
    eventId: 3,
    eventName: 'Ambush',
    x: 4,
    y: 8,
    pageIndexes: [ 1 ],
    pageCount: 2,
  };

  /**
   * The search's state once it has found the given placements.
   * @param {EnemyPlacement[]} placements The placements.
   * @returns {EnemyPlacementsState} The loaded state.
   */
  const loadedWith = (placements: EnemyPlacement[]): EnemyPlacementsState => (
    {
      status: 'loaded',
      groups: groupPlacementsByMap(placements),
      summary: 'Placed 2 times across 2 maps.',
    }
  );

  it('lists every event under its map, with where it starts and which pages make it the enemy', () =>
  {
    // Arrange
    const state = loadedWith([ slime, ambush ]);

    // Act
    render(<EnemyPlacements state={state}/>);

    // Assert
    expect(screen.getByText('Where it appears'))
      .toBeInTheDocument();
    expect(screen.getByText('Placed 2 times across 2 maps.'))
      .toBeInTheDocument();
    expect(screen.getByText('Meadow'))
      .toBeInTheDocument();
    expect(screen.getByText('Map 9, 1 event'))
      .toBeInTheDocument();
    expect(screen.getByText('Event 3: Ambush'))
      .toBeInTheDocument();
    expect(screen.getByText('(4, 8), page 2 of 2'))
      .toBeInTheDocument();
  });

  it('opens an event when its row is clicked', () =>
  {
    // Arrange
    const onOpenEvent = vi.fn();
    render(<EnemyPlacements state={loadedWith([ slime, ambush ])} onOpenEvent={onOpenEvent}/>);

    // Act
    fireEvent.click(screen.getByText('Event 3: Ambush'));

    // Assert- the ambusher, and not the slime listed above it, from a row that is a button.
    expect(onOpenEvent)
      .toHaveBeenCalledTimes(1);
    expect(onOpenEvent)
      .toHaveBeenCalledWith(ambush);
    expect(screen.getByText('Event 3: Ambush').closest('[role="button"]'))
      .not
      .toBeNull();
  });

  it('draws the rows as plain text when nothing can open them', () =>
  {
    // Arrange- no way to open an event.
    const state = loadedWith([ slime, ambush ]);

    // Act
    render(<EnemyPlacements state={state}/>);

    // Assert
    expect(screen.getByText('Event 3: Ambush').closest('[role="button"]'))
      .toBeNull();
  });

  it('draws no list for an enemy placed nowhere', () =>
  {
    // Arrange
    const state: EnemyPlacementsState = { status: 'loaded', groups: [], summary: 'Not placed on any map.' };

    // Act
    render(<EnemyPlacements state={state}/>);

    // Assert
    expect(screen.getByText('Not placed on any map.'))
      .toBeInTheDocument();
    expect(screen.queryByRole('list'))
      .not
      .toBeInTheDocument();
  });

  it('shows the search under way', () =>
  {
    // Arrange
    const state: EnemyPlacementsState = { status: 'loading' };

    // Act
    render(<EnemyPlacements state={state}/>);

    // Assert
    expect(screen.getByText('Looking through the maps...'))
      .toBeInTheDocument();
    expect(screen.getByRole('progressbar'))
      .toBeInTheDocument();
  });

  it('says why the placements could not be found', () =>
  {
    // Arrange
    const state: EnemyPlacementsState = { status: 'failed', message: 'decoding Map002.json: unknown field "sparkle"' };

    // Act
    render(<EnemyPlacements state={state}/>);

    // Assert
    expect(screen.getByText('Could not look through the maps.'))
      .toBeInTheDocument();
    expect(screen.getByText('decoding Map002.json: unknown field "sparkle"'))
      .toBeInTheDocument();
  });

  it('draws nothing while no enemy is on screen', () =>
  {
    // Arrange
    const state: EnemyPlacementsState = { status: 'idle' };

    // Act
    const { container } = render(<EnemyPlacements state={state}/>);

    // Assert
    expect(container)
      .toBeEmptyDOMElement();
  });
});
