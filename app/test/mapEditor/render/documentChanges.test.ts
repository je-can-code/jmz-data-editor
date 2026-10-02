import { describe, expect, it } from 'vitest';
import type { DocumentChange } from '../../../src/mapEditor/core/model/EditorDocument.ts';
import type { Patch } from '../../../src/mapEditor/core/model/patches.ts';
import { changeEffect, loopsOf } from '../../../src/mapEditor/render/documentChanges.ts';

/*
 * The renderer redraws only what an edit touched, and this is where it decides what that is: a swapped file, a new
 * size, new loop settings or a new parallax rebuild everything; a tiles patch redraws its cells' chunks; a change
 * inside one event redraws that event, and a change to the event list redraws them all; anything else only the
 * overlays. Too little here and an edit never shows; too much and every keystroke rebuilds the map.
 */

/**
 * Wraps a patch as the change a document announces.
 * @param {Patch} patch The patch.
 * @returns {DocumentChange} The change.
 */
const patched = (patch: Patch): DocumentChange => ({ kind: 'patched', key: 'map:1', patch, revision: 1 });

/**
 * Builds a set patch at a path.
 * @param {(string | number)[]} path The path.
 * @returns {Patch} The patch.
 */
const set = (path: (string | number)[]): Patch => ({ kind: 'set', path, before: 0, after: 1 });

describe('documentChanges', () =>
{
  describe('changeEffect', () =>
  {
    it('rebuilds for a swapped file, a new size, new loop settings and each parallax field', () =>
    {
      // Arrange.
      const changes: DocumentChange[] = [
        { kind: 'replaced', key: 'map:1', revision: 2 },
        patched({ kind: 'resize', before: { width: 1, height: 1, data: [] }, after: { width: 2, height: 1, data: [] } }),
        patched(set([ 'scrollType' ])),
        ...[ 'parallaxName', 'parallaxLoopX', 'parallaxLoopY', 'parallaxSx', 'parallaxSy' ].map(field => patched(set([ field ]))),
      ];

      // Act.
      const effects = changes.map(change => changeEffect(change).kind);

      // Assert.
      expect(effects)
        .toStrictEqual(Array(8).fill('rebuild'));
    });

    it('redraws a tiles patch\'s cells', () =>
    {
      // Arrange.
      const change = patched({ kind: 'tiles', indices: [ 4, 9 ], before: [ 0, 0 ], after: [ 1, 1 ] });

      // Act.
      const effect = changeEffect(change);

      // Assert.
      expect(effect)
        .toStrictEqual({ kind: 'tiles', indices: [ 4, 9 ] });
    });

    it('redraws one event for a change inside it, and every event for a change to the list', () =>
    {
      // Arrange: a page's trigger on event 5, event 5 replaced whole, a splice growing the list, and the list replaced.
      const changes = [
        patched(set([ 'events', 5, 'pages', 0, 'trigger' ])),
        patched(set([ 'events', 5 ])),
        patched({ kind: 'splice', path: [ 'events' ], index: 7, removed: [], inserted: [ null ] }),
        patched(set([ 'events' ])),
      ];

      // Act.
      const effects = changes.map(changeEffect);

      // Assert.
      expect(effects)
        .toStrictEqual([ { kind: 'event', id: 5 }, { kind: 'event', id: 5 }, { kind: 'events' }, { kind: 'events' } ]);
    });

    it('redraws only the overlays for a property nothing else draws', () =>
    {
      // Arrange.
      const changes = [ patched(set([ 'displayName' ])), patched(set([ 'note' ])) ];

      // Act.
      const effects = changes.map(change => changeEffect(change).kind);

      // Assert.
      expect(effects)
        .toStrictEqual([ 'overlays', 'overlays' ]);
    });
  });

  describe('loopsOf', () =>
  {
    it('reads the scroll type as MZ does: 1 loops down, 2 across, 3 both', () =>
    {
      // Arrange.
      const types = [ 0, 1, 2, 3 ];

      // Act.
      const loops = types.map(loopsOf);

      // Assert.
      expect(loops)
        .toStrictEqual([
          { horizontal: false, vertical: false },
          { horizontal: false, vertical: true },
          { horizontal: true, vertical: false },
          { horizontal: true, vertical: true },
        ]);
    });
  });
});
