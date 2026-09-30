import { describe, expect, it } from 'vitest';
import {
  blueprintHistoryKey,
  documentHistoryKey,
  eventHistoryKey,
  homeDocumentOf,
  mapHistoryKey,
  TREE_HISTORY_KEY,
} from '../../../../src/mapEditor/core/history/historyKeys.ts';

/*
 * History follows the thing, not the window: a map, an event window and a blueprint each keep their own. Each
 * history is homed on the document its thing lives in, and that home is what decides which windows hold it and
 * which snapshot carries it to a torn-out panel. An event's history must therefore live on its map, never on a
 * neighbouring map with a similar number, and a blueprint's on the blueprints document.
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
});
