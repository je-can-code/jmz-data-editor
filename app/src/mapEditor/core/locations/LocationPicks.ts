import type { MapCell } from '../renderer/camera.ts';

/**
 * A place on a map: which map, and the tile.
 */
type MapLocation = {
  readonly mapId: number;
  readonly x: number;
  readonly y: number;
};

/**
 * What a pick is for.
 */
type PickOptions = {
  /**
   * Whether the player lands on the place picked, as on a transfer's destination: the picker then marks the tiles the
   * player cannot stand on and refuses them, saying why. A place for anything else, such as a ship's, which stands on
   * water the player never could, is judged by nothing.
   */
  readonly landing: boolean;
};

/**
 * Lets the author pick a place by clicking it on a map, starting from where a transfer goes now. It settles on
 * the place picked, or null when the author gives up.
 */
type LocationPicker = (current: MapLocation, options?: PickOptions) => Promise<MapLocation | null>;

/**
 * One ask to pick a place: its number, which tells it from every ask before and after it, where the picker starts, and
 * whether the player lands there.
 */
type LocationPickRequest = {
  readonly id: number;
  readonly start: MapLocation;
  readonly landing: boolean;
};

/**
 * A pick for anything but the player's landing, which the picker judges by nothing.
 */
const ANY_PLACE: PickOptions = { landing: false };

/**
 * Hears every ask opened and every ask settled.
 */
type PickListener = () => void;

/**
 * An open ask, and how to answer the editor waiting on it.
 */
type OpenPick = {
  readonly request: LocationPickRequest;
  readonly answer: (location: MapLocation | null) => void;
};

/**
 * Finds the tile a picker starts with on a map it shows: on the map the transfer goes to now, the tile it lands on;
 * on any other map, none yet, since the same numbers name an unrelated spot there. Showing the first map again brings
 * its tile back.
 * @param {MapLocation} start Where the picker started.
 * @param {number} mapId The map shown.
 * @returns {MapCell | null} The tile, or null on any other map.
 */
const startingCell = (start: MapLocation, mapId: number): MapCell | null =>
{
  return mapId === start.mapId
    ? { x: start.x, y: start.y }
    : null;
};

/**
 * The asks to pick a place on a map in one window: an editor asks through {@link pick} and waits, the window's
 * picker shows whatever {@link current} holds, and settling the ask answers the editor that made it.
 *
 * At most one ask is open at a time, since a window shows one picker. A second ask takes over from the first, whose
 * editor hears that nothing was picked, so no editor is ever left waiting on a picker that is no longer showing. An
 * ask is settled by its number, so a picker closing after another ask took over can never answer the new one.
 *
 * - {@link current} returns the open ask, the same object until another opens or it is settled, so it can be handed
 *   straight to React's {@code useSyncExternalStore} along with {@link subscribe}.
 * - {@link pick} is the picker the command editors are handed, as it is.
 */
class LocationPicks
{
  #count = 0;

  #open: OpenPick | null = null;

  #listeners = new Set<PickListener>();

  /**
   * Reads the open ask.
   * @returns {LocationPickRequest | null} The ask, or null when none is open.
   */
  current = (): LocationPickRequest | null =>
  {
    return this.#open === null
      ? null
      : this.#open.request;
  };

  /**
   * Listens for asks opening and settling.
   * @param {PickListener} listener Called after every change.
   * @returns {() => void} Stops listening.
   */
  subscribe = (listener: PickListener): (() => void) =>
  {
    this.#listeners.add(listener);
    return () =>
    {
      this.#listeners.delete(listener);
    };
  };

  /**
   * Asks for a place to be picked, starting from one, taking over from any ask still open.
   * @param {MapLocation} start Where the picker starts: where the transfer goes now.
   * @param {PickOptions} options What the pick is for; anything but the player's landing unless said.
   * @returns {Promise<MapLocation | null>} The place picked, or null when the author gave up or another ask took over.
   */
  pick = (start: MapLocation, options: PickOptions = ANY_PLACE): Promise<MapLocation | null> =>
  {
    const previous = this.#open;
    this.#count += 1;
    const request: LocationPickRequest = { id: this.#count, start, landing: options.landing };
    const answered = new Promise<MapLocation | null>(answer =>
    {
      this.#open = { request, answer };
    });

    // the ask this one takes over from hears that nothing was picked, so its editor stops waiting.
    if (previous !== null)
    {
      previous.answer(null);
    }

    this.#notify();
    return answered;
  };

  /**
   * Settles an ask with what the author did: the place they picked, or null when they gave up. An ask that is no
   * longer open, settled already or taken over, is left alone.
   * @param {number} id The ask's number.
   * @param {MapLocation | null} location The place picked, or null.
   */
  settle(id: number, location: MapLocation | null): void
  {
    const open = this.#open;
    if (open === null || open.request.id !== id)
    {
      return;
    }

    this.#open = null;
    open.answer(location);
    this.#notify();
  }

  /**
   * Tells every listener something changed.
   */
  #notify(): void
  {
    [ ...this.#listeners ].forEach(listener => listener());
  }
}

export { LocationPicks, startingCell };
export type { LocationPicker, LocationPickRequest, MapLocation, PickOptions };
