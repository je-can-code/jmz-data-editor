import { describe, expect, it } from 'vitest';
import { EventListSource } from '../../../../src/mapEditor/core/eventList/EventListSource.ts';
import type { RowKind } from '../../../../src/mapEditor/core/eventList/eventRows.ts';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { buildMapJson } from '../../support/fixtures.ts';

/*
 * The events list is rebuilt from its source, which owes it two things. The rows stay the very same list until
 * something that can change them happens (an edit to the events, a swapped file, a resize, or the window's kinds
 * switching on), so a brush stroke or a renamed map never rebuilds hundreds of rows; and a change marks them stale
 * without building them, so a drop moving hundreds of events builds them once, the next time they are read. An edit
 * made after the rows were first built but before anyone listened still marks them stale on subscribing, so the list
 * never shows a map as it was.
 *
 * The map is the shared 3x2 fixture: the door, event 1, at 0, 0, and the chest, event 3, at 2, 1.
 */
describe('EventListSource', () =>
{
  /**
   * Builds the window's kinds as the source reads them: a claim for each event, and a way to switch them on, which
   * counts the activation and tells every listener.
   * @param {(event: RmmzMapEvent) => RowKind | null} claim What each event is.
   * @returns {object} The kinds, with how to activate them.
   */
  const kindsClaiming = (claim: (event: RmmzMapEvent) => RowKind | null) =>
  {
    const listeners = new Set<() => void>();
    const kinds = {
      revision: 0,
      kindOf: (event: RmmzMapEvent) => claim(event),
      subscribe: (listener: () => void) =>
      {
        listeners.add(listener);
        return () =>
        {
          listeners.delete(listener);
        };
      },
      activate: () =>
      {
        kinds.revision += 1;
        listeners.forEach(listener => listener());
      },
    };
    return kinds;
  };

  /**
   * Builds the fixture map's document.
   * @returns {MapDocument} The document.
   */
  const fixtureMap = (): MapDocument =>
  {
    return MapDocument.fromJson('map:1', buildMapJson());
  };

  it('builds a row per event the first time, and hands back the very same list until something marks it stale', () =>
  {
    // Arrange.
    const source = new EventListSource(fixtureMap(), kindsClaiming(() => null));

    // Act.
    const first = source.rows();
    const second = source.rows();

    // Assert.
    expect([ first.map(row => [ row.id, row.name ]), second === first, source.getVersion() ])
      .toStrictEqual([ [ [ 1, 'Door' ], [ 3, 'Chest' ] ], true, 0 ]);
  });

  it('marks the rows stale for a moved event, telling the listener, and builds them afresh with the move', () =>
  {
    // Arrange: a listener, and the rows built once.
    const map = fixtureMap();
    const source = new EventListSource(map, kindsClaiming(() => null));
    const heard: number[] = [];
    source.subscribe(() => heard.push(source.getVersion()));
    const before = source.rows();

    // Act: the door moves across.
    map.apply({ kind: 'set', path: [ 'events', 1, 'x' ], before: 0, after: 2 });

    // Assert.
    const after = source.rows();
    expect([ heard, after === before, after[0].x ])
      .toStrictEqual([ [ 1 ], false, 2 ]);
  });

  it('leaves the rows as they are for painted tiles and the map\'s other settings', () =>
  {
    // Arrange.
    const map = fixtureMap();
    const source = new EventListSource(map, kindsClaiming(() => null));
    const heard: number[] = [];
    source.subscribe(() => heard.push(source.getVersion()));
    const before = source.rows();

    // Act: a tile painted, and the map renamed for the player.
    map.apply({ kind: 'tiles', indices: [ 0 ], before: [ 1 ], after: [ 5 ] });
    map.apply({ kind: 'set', path: [ 'displayName' ], before: 'Test Town', after: 'Harbour' });

    // Assert: proof the changes landed, with the rows untouched.
    expect([ map.cellAt(0, 0, 0), map.property('displayName'), heard, source.rows() === before ])
      .toStrictEqual([ 5, 'Harbour', [], true ]);
  });

  it('marks every row stale once the window\'s kinds switch on, reading the events by the new kinds', () =>
  {
    // Arrange: kinds that claim nothing until they switch on, then call the chest a chest.
    const chest: RowKind = { id: 'core.chest', title: 'Chest', marker: 'chest' };
    const kinds = kindsClaiming(event => (kinds.revision > 0 && event.name === 'Chest' ? chest : null));
    const source = new EventListSource(fixtureMap(), kinds);
    const heard: number[] = [];
    source.subscribe(() => heard.push(source.getVersion()));
    const before = source.rows().map(row => row.kindId);

    // Act.
    kinds.activate();

    // Assert.
    expect([ before, heard, source.rows().map(row => row.kindId) ])
      .toStrictEqual([ [ null, null ], [ 1 ], [ null, 'core.chest' ] ]);
  });

  it('marks rows built before anyone listened stale on subscribing, when the map moved on since', () =>
  {
    // Arrange: the rows built, then the door moved before anything listened.
    const map = fixtureMap();
    const source = new EventListSource(map, kindsClaiming(() => null));
    const before = source.rows();
    map.apply({ kind: 'set', path: [ 'events', 1, 'x' ], before: 0, after: 2 });

    // Act.
    source.subscribe(() => undefined);

    // Assert: the version moved, so React reads again, and the rows show the move.
    expect([ source.getVersion(), source.rows() === before, source.rows()[0].x ])
      .toStrictEqual([ 1, false, 2 ]);
  });

  it('keeps rows built before anyone listened when nothing moved on since, and builds afresh when only the kinds did', () =>
  {
    // Arrange: two sources over their own maps, one left alone and one whose kinds switched on after its rows were built.
    const still = new EventListSource(fixtureMap(), kindsClaiming(() => null));
    const kinds = kindsClaiming(() => null);
    const switched = new EventListSource(fixtureMap(), kinds);
    const stillRows = still.rows();
    const switchedRows = switched.rows();
    kinds.revision += 1;

    // Act.
    still.subscribe(() => undefined);
    switched.subscribe(() => undefined);

    // Assert: the quiet one keeps its rows, and the one whose kinds moved builds afresh.
    expect([ still.getVersion(), still.rows() === stillRows, switched.getVersion(), switched.rows() === switchedRows ])
      .toStrictEqual([ 0, true, 1, false ]);
  });

  it('stops telling a listener once it stops listening', () =>
  {
    // Arrange.
    const map = fixtureMap();
    const source = new EventListSource(map, kindsClaiming(() => null));
    const heard: number[] = [];
    const stop = source.subscribe(() => heard.push(source.getVersion()));

    // Act.
    stop();
    map.apply({ kind: 'set', path: [ 'events', 1, 'x' ], before: 0, after: 2 });

    // Assert.
    expect(heard)
      .toStrictEqual([]);
  });
});
