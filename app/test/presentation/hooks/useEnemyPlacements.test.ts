/**
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { EnemyPlacement } from '@services/placements/EnemyPlacementsReader.ts';
import { groupPlacementsByMap } from '@services/placements/EnemyPlacementsList.ts';
import { type PlacementsReader, useEnemyPlacements } from '@presentation/hooks/useEnemyPlacements.ts';

/**
 * `useEnemyPlacements` decides which answer the Enemies board shows under an enemy's name. It owes the board three
 * things. It asks about each enemy as it comes on screen, and again whenever the board reloads. It shows only the
 * answer to the latest question: running down the list with the arrow keys asks about every enemy in turn, and an
 * earlier answer that arrives late must never land under a later enemy's name. And when the answer cannot be had,
 * it says why, instead of showing an empty list that would claim the enemy is placed nowhere.
 */
describe('useEnemyPlacements', () =>
{
  /**
   * A question the test answers when it chooses to.
   */
  type Pending = {
    readonly promise: Promise<EnemyPlacement[]>;
    readonly resolve: (placements: EnemyPlacement[]) => void;
    readonly reject: (error: unknown) => void;
  };

  /**
   * Makes a question that stays unanswered until the test answers it.
   * @returns {Pending} The question, and the means to answer it.
   */
  const pending = (): Pending =>
  {
    let resolve: (placements: EnemyPlacement[]) => void = () => {};
    let reject: (error: unknown) => void = () => {};
    const promise = new Promise<EnemyPlacement[]>((onResolve, onReject) =>
    {
      resolve = onResolve;
      reject = onReject;
    });

    return { promise, resolve, reject };
  };

  /**
   * Builds a placement of an enemy on a map.
   * @param {number} mapId The map.
   * @param {string} eventName The event's name.
   * @returns {EnemyPlacement} The placement.
   */
  const placementOf = (mapId: number, eventName: string): EnemyPlacement => (
    {
      mapId,
      mapName: `Field ${mapId}`,
      eventId: 1,
      eventName,
      x: 0,
      y: 0,
      pageIndexes: [ 0 ],
      pageCount: 1,
    }
  );

  /**
   * Renders the hook for an enemy, reading placements through the given stand-in.
   * @param {number | null} enemyId The enemy on screen at first.
   * @param {PlacementsReader} read The stand-in for the server.
   * @returns The rendered hook.
   */
  const renderFor = (enemyId: number | null, read: PlacementsReader) =>
  {
    return renderHook(
      (props: { enemyId: number | null }) => useEnemyPlacements(props.enemyId, read),
      { initialProps: { enemyId } },
    );
  };

  it('asks nothing while no enemy is on screen', () =>
  {
    // Arrange
    const read = vi.fn<PlacementsReader>();

    // Act
    const { result } = renderFor(null, read);

    // Assert
    expect(result.current.state)
      .toEqual({ status: 'idle' });
    expect(read)
      .not
      .toHaveBeenCalled();
  });

  it('shows the answer is on its way until it arrives', () =>
  {
    // Arrange
    const question = pending();
    const read = vi.fn<PlacementsReader>(() => question.promise);

    // Act
    const { result } = renderFor(5, read);

    // Assert
    expect(result.current.state)
      .toEqual({ status: 'loading' });
    expect(read)
      .toHaveBeenCalledWith(5);
  });

  it('shows the enemy\'s placements grouped by map, with a line summing them up', async () =>
  {
    // Arrange
    const question = pending();
    const read = vi.fn<PlacementsReader>(() => question.promise);
    const placements = [ placementOf(2, 'Slime'), placementOf(4, 'Bat') ];
    const { result } = renderFor(5, read);

    // Act
    await act(async () =>
    {
      question.resolve(placements);
      await question.promise;
    });

    // Assert
    expect(result.current.state)
      .toEqual({
        status: 'loaded',
        groups: [
          { mapId: 2, title: 'Field 2', caption: 'Map 2, 1 event', placements: [ placements[ 0 ] ] },
          { mapId: 4, title: 'Field 4', caption: 'Map 4, 1 event', placements: [ placements[ 1 ] ] },
        ],
        summary: 'Placed 2 times across 2 maps.',
      });
  });

  it('asks about the next enemy as soon as it comes on screen', async () =>
  {
    // Arrange
    const read = vi.fn<PlacementsReader>(async (enemyId) => [ placementOf(enemyId, `Enemy ${enemyId}`) ]);
    const { result, rerender } = renderFor(5, read);
    await act(async () => {});

    // Act
    rerender({ enemyId: 6 });
    await act(async () => {});

    // Assert
    expect(read)
      .toHaveBeenLastCalledWith(6);
    expect(result.current.state)
      .toEqual({ status: 'loaded', groups: groupPlacementsByMap([ placementOf(6, 'Enemy 6') ]), summary: 'Placed once.' });
  });

  it('drops a late answer about an enemy no longer on screen', async () =>
  {
    // Arrange- the question about enemy 5 is still out when enemy 6 comes on screen and is answered.
    const aboutFive = pending();
    const aboutSix = pending();
    const read = vi.fn<PlacementsReader>((enemyId) => (enemyId === 5 ? aboutFive.promise : aboutSix.promise));
    const { result, rerender } = renderFor(5, read);
    rerender({ enemyId: 6 });
    await act(async () =>
    {
      aboutSix.resolve([ placementOf(6, 'Bat') ]);
      await aboutSix.promise;
    });

    // Act- enemy 5's answer finally arrives.
    await act(async () =>
    {
      aboutFive.resolve([ placementOf(5, 'Slime') ]);
      await aboutFive.promise;
    });

    // Assert- enemy 6's placements stand.
    expect(result.current.state)
      .toEqual({ status: 'loaded', groups: groupPlacementsByMap([ placementOf(6, 'Bat') ]), summary: 'Placed once.' });
  });

  it('drops a late failure about an enemy no longer on screen', async () =>
  {
    // Arrange
    const aboutFive = pending();
    const aboutSix = pending();
    const read = vi.fn<PlacementsReader>((enemyId) => (enemyId === 5 ? aboutFive.promise : aboutSix.promise));
    const { result, rerender } = renderFor(5, read);
    rerender({ enemyId: 6 });
    await act(async () =>
    {
      aboutSix.resolve([]);
      await aboutSix.promise;
    });

    // Act
    await act(async () =>
    {
      aboutFive.reject(new Error('the server went away'));
      await aboutFive.promise.catch(() => {});
    });

    // Assert
    expect(result.current.state)
      .toEqual({ status: 'loaded', groups: [], summary: 'Not placed on any map.' });
  });

  it('says why the placements could not be found', async () =>
  {
    // Arrange
    const question = pending();
    const read = vi.fn<PlacementsReader>(() => question.promise);
    const { result } = renderFor(5, read);

    // Act
    await act(async () =>
    {
      question.reject(new Error('decoding Map002.json: unknown field "sparkle"'));
      await question.promise.catch(() => {});
    });

    // Assert
    expect(result.current.state)
      .toEqual({ status: 'failed', message: 'decoding Map002.json: unknown field "sparkle"' });
  });

  it('says why even when what failed is not an error', async () =>
  {
    // Arrange
    const question = pending();
    const read = vi.fn<PlacementsReader>(() => question.promise);
    const { result } = renderFor(5, read);

    // Act
    await act(async () =>
    {
      question.reject('offline');
      await question.promise.catch(() => {});
    });

    // Assert
    expect(result.current.state)
      .toEqual({ status: 'failed', message: 'offline' });
  });

  it('asks again about the same enemy when the board reloads', async () =>
  {
    // Arrange- the first answer is from before a map changed, the second from after.
    const answers = [ [ placementOf(2, 'Slime') ], [ placementOf(2, 'Slime'), placementOf(3, 'Slime') ] ];
    let asked = 0;
    const read = vi.fn<PlacementsReader>(async () =>
    {
      asked += 1;
      return answers[ asked - 1 ];
    });
    const { result } = renderFor(5, read);
    await act(async () => {});

    // Act
    await act(async () =>
    {
      result.current.reload();
    });

    // Assert
    expect(read.mock.calls)
      .toEqual([ [ 5 ], [ 5 ] ]);
    expect(result.current.state)
      .toEqual({ status: 'loaded', groups: groupPlacementsByMap(answers[ 1 ]), summary: 'Placed 2 times across 2 maps.' });
  });

  it('forgets the last enemy\'s placements once no enemy is on screen', async () =>
  {
    // Arrange
    const read = vi.fn<PlacementsReader>(async () => [ placementOf(2, 'Slime') ]);
    const { result, rerender } = renderFor(5, read);
    await act(async () => {});

    // Act
    rerender({ enemyId: null });

    // Assert
    expect(result.current.state)
      .toEqual({ status: 'idle' });
    expect(read)
      .toHaveBeenCalledTimes(1);
  });
});
