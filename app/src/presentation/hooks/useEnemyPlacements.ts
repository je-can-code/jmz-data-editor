import { useCallback, useEffect, useRef, useState } from 'react';
import { type EnemyPlacement, readEnemyPlacements } from '@services/placements/EnemyPlacementsReader.ts';
import { groupPlacementsByMap, type MapPlacements, summarizePlacements } from '@services/placements/EnemyPlacementsList.ts';

/**
 * How far the board has got in finding where the enemy on screen is placed.
 */
type EnemyPlacementsState =
  | {
    /**
     * No enemy is on screen, so there is nothing to find.
     */
    readonly status: 'idle';
  }
  | {
    /**
     * The server has been asked and has not answered yet.
     */
    readonly status: 'loading';
  }
  | {
    /**
     * The placements are in, grouped by map, with a line summing them up.
     */
    readonly status: 'loaded';
    readonly groups: readonly MapPlacements[];
    readonly summary: string;
  }
  | {
    /**
     * The placements could not be found, and why.
     */
    readonly status: 'failed';
    readonly message: string;
  };

/**
 * Reads one enemy's placements: {@link readEnemyPlacements}, or a stand-in.
 */
type PlacementsReader = (enemyId: number) => Promise<EnemyPlacement[]>;

/**
 * What the hook hands the board.
 */
type EnemyPlacementsHandle = {
  /**
   * Where the search stands.
   */
  readonly state: EnemyPlacementsState;

  /**
   * Asks the server again about the enemy on screen, as the board's Reload button does.
   */
  readonly reload: () => void;
};

/**
 * Turns whatever a failed read threw into a line the board can show.
 * @param {unknown} error What the read threw.
 * @returns {string} Its message.
 */
const messageOf = (error: unknown): string =>
{
  return error instanceof Error
    ? error.message
    : String(error);
};

/**
 * Finds where the enemy on screen is placed, asking the server again whenever another enemy is shown, and whenever
 * the board asks it to. The server answers from what it keeps of the maps, so asking often is cheap.
 *
 * Answers can arrive out of order, since running down the enemy list with the arrow keys asks about each enemy in
 * turn. An answer is only shown while it is the answer to the latest question, so an earlier one arriving late can
 * never put one enemy's placements under another's name.
 * @param {number | null} enemyId The enemy on screen, or null when there is none.
 * @param {PlacementsReader} read Reads an enemy's placements; the server by default.
 * @returns {EnemyPlacementsHandle} Where the search stands, and a way to search again.
 */
const useEnemyPlacements = (enemyId: number | null, read: PlacementsReader = readEnemyPlacements): EnemyPlacementsHandle =>
{
  const [ state, setState ] = useState<EnemyPlacementsState>({ status: 'idle' });

  // counts questions, so an answer can tell whether a later question has replaced its own.
  const latestQuestion = useRef(0);

  // the enemy on screen as of the latest render, for a reload the board kept hold of from an earlier one.
  const enemyOnScreen = useRef(enemyId);
  enemyOnScreen.current = enemyId;

  const search = useCallback((id: number | null) =>
  {
    latestQuestion.current += 1;
    const question = latestQuestion.current;

    // with no enemy on screen there is nothing to ask about.
    if (id === null)
    {
      setState({ status: 'idle' });
      return;
    }

    setState({ status: 'loading' });
    read(id)
      .then(
        placements =>
        {
          // a later question has made this answer stale.
          if (question !== latestQuestion.current)
          {
            return;
          }

          const groups = groupPlacementsByMap(placements);
          setState({ status: 'loaded', groups, summary: summarizePlacements(groups) });
        },
        (error: unknown) =>
        {
          // a later question has made this failure stale too.
          if (question !== latestQuestion.current)
          {
            return;
          }

          setState({ status: 'failed', message: messageOf(error) });
        },
      );
  }, [ read ]);

  // ask whenever the enemy on screen changes, and let any answer still on its way go stale once it has.
  useEffect(() =>
  {
    search(enemyId);

    return () =>
    {
      latestQuestion.current += 1;
    };
  }, [ enemyId, search ]);

  // the board calls reload after waiting on its own reload from disk, which can bring another enemy on screen
  // in the meantime; asking about the enemy the reload was handed out with would put its list under the new
  // enemy's name, so ask about whichever enemy is on screen when it runs.
  const reload = useCallback(() => search(enemyOnScreen.current), [ search ]);

  return { state, reload };
};

export type { EnemyPlacementsHandle, EnemyPlacementsState, PlacementsReader };
export { useEnemyPlacements };
