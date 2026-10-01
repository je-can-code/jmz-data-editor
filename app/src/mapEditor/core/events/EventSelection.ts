/**
 * Which events are selected: the map they are on, and their ids in the order they were picked, so the last id is the
 * event picked most recently. Nothing selected reads {@code { mapId: null, eventIds: [] }}.
 */
type SelectedEvents = {
  readonly mapId: number | null;
  readonly eventIds: readonly number[];
};

/**
 * Hears every change to a selection.
 */
type SelectionListener = () => void;

/**
 * No events: one shared list, so anything comparing lists by identity sees nothing change while nothing is selected.
 */
const NO_EVENTS: readonly number[] = Object.freeze([]);

/**
 * Nothing selected, anywhere.
 */
const NOTHING_SELECTED: SelectedEvents = { mapId: null, eventIds: NO_EVENTS };

/**
 * Reports whether two id lists hold the same ids in the same order.
 * @param {readonly number[]} left One list.
 * @param {readonly number[]} right The other.
 * @returns {boolean} True when they match.
 */
const sameIds = (left: readonly number[], right: readonly number[]): boolean =>
{
  return left.length === right.length && left.every((id, index) => id === right[index]);
};

/**
 * The events selected in one window. There is one selection for the whole window, on one map at a time: the map views
 * draw it and act on it, and the quick panel reads it to show the picked events' settings. Selecting on another map
 * replaces it, just as a click in another map's view would.
 *
 * - {@link get} returns the current selection. It is the same object until the selection changes, so it can be handed
 *   straight to React's {@code useSyncExternalStore} along with {@link subscribe}.
 * - {@link subscribe} hears every change, and returns the call that stops listening.
 * - {@link select} replaces the selection with events on one map; {@link clear} empties it.
 *
 * It holds ids only. The events themselves live in the map's document, which is what changes when they are edited, so
 * a panel showing their settings reads them there and listens to the document for edits.
 */
class EventSelection
{
  #current: SelectedEvents = NOTHING_SELECTED;

  #listeners = new Set<SelectionListener>();

  /**
   * Reads the current selection.
   * @returns {SelectedEvents} The selection; replaced, never changed, whenever it changes.
   */
  get = (): SelectedEvents =>
  {
    return this.#current;
  };

  /**
   * Listens for changes to the selection.
   * @param {SelectionListener} listener Called after every change.
   * @returns {() => void} Stops listening.
   */
  subscribe = (listener: SelectionListener): (() => void) =>
  {
    this.#listeners.add(listener);
    return () =>
    {
      this.#listeners.delete(listener);
    };
  };

  /**
   * Selects events on one map, replacing whatever was selected before, on this map or another. Each id counts once, at
   * its first place in the list; an empty list selects nothing at all.
   * @param {number} mapId The map the events are on.
   * @param {readonly number[]} eventIds The events, in the order they were picked.
   */
  select(mapId: number, eventIds: readonly number[]): void
  {
    const unique = [ ...new Set(eventIds) ];
    this.#replace(unique.length === 0 ? NOTHING_SELECTED : { mapId, eventIds: unique });
  }

  /**
   * Selects nothing.
   */
  clear(): void
  {
    this.#replace(NOTHING_SELECTED);
  }

  /**
   * Reads the events selected on one map. The list is the selection's own, the same object until the selection changes,
   * and one shared empty list whenever nothing is selected there.
   * @param {number} mapId The map.
   * @returns {readonly number[]} The selected ids, or none when the selection is on another map or empty.
   */
  eventsOn(mapId: number): readonly number[]
  {
    return this.#current.mapId === mapId
      ? this.#current.eventIds
      : NO_EVENTS;
  }

  /**
   * Drops events that are gone from a map, such as a pasted event whose paste was undone, keeping the rest selected in
   * their order.
   * @param {number} mapId The map.
   * @param {(eventId: number) => boolean} exists Reports whether the map still holds an event.
   */
  keepExisting(mapId: number, exists: (eventId: number) => boolean): void
  {
    const current = this.eventsOn(mapId);
    const kept = current.filter(exists);
    if (kept.length !== current.length)
    {
      this.select(mapId, kept);
    }
  }

  /**
   * Makes a selection current and tells every listener, unless it matches the one already current, which keeps its
   * object so nobody re-renders for nothing.
   * @param {SelectedEvents} next The selection.
   */
  #replace(next: SelectedEvents): void
  {
    if (next.mapId === this.#current.mapId && sameIds(next.eventIds, this.#current.eventIds))
    {
      return;
    }

    this.#current = next;
    [ ...this.#listeners ].forEach(listener => listener());
  }
}

export { EventSelection, NO_EVENTS, NOTHING_SELECTED };
export type { SelectedEvents, SelectionListener };
