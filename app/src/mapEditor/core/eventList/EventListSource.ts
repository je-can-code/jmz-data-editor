import type { MapDocument } from '../model/MapDocument.ts';
import type { RmmzMapEvent } from '../model/rmmzTypes.ts';
import { changesEventList, eventRowsFor, type EventRow, type RowKind } from './eventRows.ts';

/**
 * What the list reads kinds from: the window's kinds, which say what each event is, count their activations, and
 * announce each one, since the kinds may read events differently once the plugin modules switch on.
 */
type ListKinds = {
  readonly revision: number;
  kindOf(event: RmmzMapEvent, mapId: number): RowKind | null;
  subscribe(listener: () => void): () => void;
};

/**
 * Keeps one map's events list for whoever shows it. The rows are built the first time they are asked for and kept
 * until something that can change them happens: an edit to the events, a file swapped in or a resize, or the window's
 * kinds switching on. A drop moving hundreds of events arrives as hundreds of changes, and each one only marks the rows
 * stale, so they are built again once, the next time they are read; painting tiles never marks them at all.
 *
 * - {@link subscribe} hears every change that marks the rows stale, and returns the call that stops listening. Rows
 *   built before anyone listened are marked stale on subscribing when the map or the kinds moved on since, so an edit
 *   made between the list's first drawing and its listening is never missed.
 * - {@link getVersion} counts the times the rows went stale, so React's {@code useSyncExternalStore} can take it with
 *   {@link subscribe}.
 * - {@link rows} hands back the rows, built afresh only when stale, and otherwise the very same list.
 */
class EventListSource
{
  #map: MapDocument;

  #kinds: ListKinds;

  #rows: readonly EventRow[] | null = null;

  /**
   * The map's revision and the kinds' when the rows were last built.
   */
  #builtFrom = { map: -1, kinds: -1 };

  #version = 0;

  /**
   * @param {MapDocument} map The map whose events are listed.
   * @param {ListKinds} kinds The window's kinds.
   */
  constructor(map: MapDocument, kinds: ListKinds)
  {
    this.#map = map;
    this.#kinds = kinds;
  }

  /**
   * Listens for every change that marks the rows stale.
   * @param {() => void} listener Called once the rows are stale.
   * @returns {() => void} Stops listening.
   */
  subscribe = (listener: () => void): (() => void) =>
  {
    // rows built from an older map or older kinds than now are stale already.
    if (this.#rows !== null && (this.#builtFrom.map !== this.#map.revision || this.#builtFrom.kinds !== this.#kinds.revision))
    {
      this.#markStale();
    }

    const stale = () =>
    {
      this.#markStale();
      listener();
    };

    const stops = [
      this.#map.subscribe(change =>
      {
        if (changesEventList(change))
        {
          stale();
        }
      }),
      this.#kinds.subscribe(stale),
    ];
    return () => stops.forEach(stop => stop());
  };

  /**
   * Counts the times the rows went stale so far.
   * @returns {number} The count.
   */
  getVersion = (): number =>
  {
    return this.#version;
  };

  /**
   * Hands back a row for every event on the map, in id order, built afresh only when stale.
   * @returns {readonly EventRow[]} The rows; the same list until they go stale.
   */
  rows(): readonly EventRow[]
  {
    if (this.#rows === null)
    {
      const { mapId } = this.#map;
      this.#rows = eventRowsFor(this.#map.events, event => this.#kinds.kindOf(event, mapId));
      this.#builtFrom = { map: this.#map.revision, kinds: this.#kinds.revision };
    }

    return this.#rows;
  }

  /**
   * Drops the rows, to be built again the next time they are read, and counts the change.
   */
  #markStale(): void
  {
    this.#rows = null;
    this.#version += 1;
  }
}

export { EventListSource };
export type { ListKinds };
