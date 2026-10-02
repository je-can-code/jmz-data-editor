import { describe, expect, it } from 'vitest';
import {
  blueprintHistoryKey,
  commonEventHistoryKey,
  documentHistoryKey,
  eventHistoryKey,
  homeDocumentOf,
  mapHistoryKey,
  outsideChangeHistories,
  TREE_HISTORY_KEY,
} from '../../../../src/mapEditor/core/history/historyKeys.ts';
import type { Patch } from '../../../../src/mapEditor/core/model/patches.ts';

/*
 * History follows the thing, not the window: a map, an event window and a blueprint each keep their own. Each
 * history is homed on the document its thing lives in, and that home is what decides which windows hold it and
 * which snapshot carries it to a torn-out panel. An event's history must therefore live on its map, never on a
 * neighbouring map with a similar number, and a blueprint's on the blueprints document. A file changed outside the
 * editor is recorded in the history of whatever the change touched, so undo reaches it from wherever the person works
 * on that thing, and never lands in the history of a common event it left alone.
 */
describe('historyKeys', () =>
{
  it('names each kind of history distinctly', () =>
  {
    // Arrange: one of each kind.

    // Act.
    const keys = [
      mapHistoryKey(12),
      eventHistoryKey(12, 5),
      blueprintHistoryKey('slime-camp'),
      documentHistoryKey('tilesets'),
      TREE_HISTORY_KEY,
    ];

    // Assert.
    expect(keys)
      .toStrictEqual([ 'map:12', 'event:12:5', 'blueprint:slime-camp', 'tilesets', 'tree' ]);
  });

  it('homes every history on the document its thing lives in', () =>
  {
    // Arrange: an event on map 12 beside an event on map 1, a near miss by prefix.

    // Act.
    const homes = [
      homeDocumentOf(mapHistoryKey(12)),
      homeDocumentOf(eventHistoryKey(12, 5)),
      homeDocumentOf(eventHistoryKey(1, 25)),
      homeDocumentOf(blueprintHistoryKey('slime-camp')),
      homeDocumentOf(TREE_HISTORY_KEY),
      homeDocumentOf(documentHistoryKey('editor-data:layouts')),
    ];

    // Assert.
    expect(homes)
      .toStrictEqual([ 'map:12', 'map:12', 'map:1', 'editor-data:blueprints', 'mapinfos', 'editor-data:layouts' ]);
  });

  it('names each common event\'s history apart, and homes it on the common events', () =>
  {
    // Arrange: two common events, and the common events document's own history beside them.

    // Act.
    const keys = [ commonEventHistoryKey(3), commonEventHistoryKey(31), documentHistoryKey('common-events') ];
    const homes = keys.map(homeDocumentOf);

    // Assert.
    expect([ keys, homes ])
      .toStrictEqual([ [ 'common-event:3', 'common-event:31', 'common-events' ], [ 'common-events', 'common-events', 'common-events' ] ]);
  });

  it('refuses a common event id no common event can have', () =>
  {
    // Arrange: slot 0 is never a common event.

    // Act.
    const names = [ () => commonEventHistoryKey(0), () => commonEventHistoryKey(1.5) ];

    // Assert.
    names.forEach(name => expect(name)
      .toThrow(/positive integer/u));
  });

  it('refuses an event id no event can have, and a blueprint without an id', () =>
  {
    // Arrange: slot 0 is never an event.

    // Act.
    const attempts = [ () => eventHistoryKey(3, 0), () => eventHistoryKey(3, 1.5), () => blueprintHistoryKey('') ];

    // Assert.
    expect(attempts[0])
      .toThrow(/positive integer/u);
    expect(attempts[1])
      .toThrow(/positive integer/u);
    expect(attempts[2])
      .toThrow(/needs an id/u);
  });

  describe('outsideChangeHistories', () =>
  {
    it('records an outside change where its thing keeps its history: the map\'s own, the tree\'s, or the document\'s', () =>
    {
      // Arrange: one change of one value to each kind of document.
      const change: Patch[] = [ { kind: 'set', path: [ 1, 'name' ], before: 'a', after: 'b' } ];

      // Act.
      const histories = [
        outsideChangeHistories('map:12', change),
        outsideChangeHistories('mapinfos', change),
        outsideChangeHistories('tilesets', change),
        outsideChangeHistories('editor-data:layouts', change),
      ];

      // Assert.
      expect(histories)
        .toStrictEqual([ [ 'map:12' ], [ 'tree' ], [ 'tilesets' ], [ 'editor-data:layouts' ] ]);
    });

    it('records an outside change to the common events in the history of each one it reached, and of no other', () =>
    {
      // Arrange: a change inside common event 7, one that adds 12 and 13 at the end, and the same event reached twice.
      const change: Patch[] = [
        { kind: 'set', path: [ 7, 'list', 0, 'code' ], before: 101, after: 102 },
        { kind: 'splice', path: [], index: 12, removed: [], inserted: [ null, null ] },
        { kind: 'set', path: [ 7, 'name' ], before: 'a', after: 'b' },
      ];

      // Act.
      const histories = outsideChangeHistories('common-events', change);

      // Assert.
      expect(histories)
        .toStrictEqual([ 'common-event:7', 'common-event:12', 'common-event:13' ]);
    });

    it('records a change that reached no common event in the common events\' own history', () =>
    {
      // Arrange: only slot 0, which is never a common event, changed; a splice starting there reaches one after it; and
      // a tiles patch, which has no path at all, reaches none.
      const slotZero: Patch[] = [ { kind: 'set', path: [ 0 ], before: null, after: 'stray' } ];
      const fromZero: Patch[] = [ { kind: 'splice', path: [], index: 0, removed: [ null ], inserted: [ 'x', 'y' ] } ];
      const pathless: Patch[] = [ { kind: 'tiles', indices: [ 0 ], before: [ 0 ], after: [ 1 ] } ];

      // Act.
      const histories = [ slotZero, fromZero, pathless ].map(patches => outsideChangeHistories('common-events', patches));

      // Assert.
      expect(histories)
        .toStrictEqual([ [ 'common-events' ], [ 'common-event:1' ], [ 'common-events' ] ]);
    });
  });
});
