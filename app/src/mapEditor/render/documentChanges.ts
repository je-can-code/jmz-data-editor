import type { DocumentChange } from '../core/model/EditorDocument.ts';

/**
 * What a change to a map document asks of the renderer:
 * - rebuild everything, for a swapped file, a new size, new loop settings or a new parallax;
 * - redraw the chunks some cells fall in;
 * - redraw one event, or every event when the list itself changed;
 * - or only redraw the overlays, for a property nothing else draws.
 */
type ChangeEffect =
  | { readonly kind: 'rebuild' }
  | { readonly kind: 'tiles'; readonly indices: readonly number[] }
  | { readonly kind: 'event'; readonly id: number }
  | { readonly kind: 'events' }
  | { readonly kind: 'overlays' };

/**
 * The map properties whose change rebuilds the drawing: the loop settings change how the edges read, and the
 * parallax fields change the parallax.
 */
const REBUILDING_FIELDS: ReadonlySet<string> = new Set([
  'scrollType',
  'parallaxName',
  'parallaxLoopX',
  'parallaxLoopY',
  'parallaxSx',
  'parallaxSy',
]);

/**
 * Reads a map's loop settings, as Game_Map#isLoopHorizontal and #isLoopVertical.
 * @param {number} scrollType The map's scroll type: 0 none, 1 loops down, 2 loops across, 3 both.
 * @returns {{ horizontal: boolean, vertical: boolean }} Which ways it loops.
 */
const loopsOf = (scrollType: number): { horizontal: boolean; vertical: boolean } =>
{
  return { horizontal: scrollType === 2 || scrollType === 3, vertical: scrollType === 1 || scrollType === 3 };
};

/**
 * Works out what a change to a map document asks of the renderer.
 * @param {DocumentChange} change The change.
 * @returns {ChangeEffect} What to redraw.
 */
const changeEffect = (change: DocumentChange): ChangeEffect =>
{
  if (change.kind === 'replaced' || change.patch.kind === 'resize')
  {
    return { kind: 'rebuild' };
  }

  const { patch } = change;
  if (patch.kind === 'tiles')
  {
    return { kind: 'tiles', indices: patch.indices };
  }

  const [ field, id ] = patch.path;
  if (field === 'events')
  {
    // a change inside one event redraws it; a change to the list itself redraws them all.
    return patch.path.length >= 2 && typeof id === 'number'
      ? { kind: 'event', id }
      : { kind: 'events' };
  }

  return REBUILDING_FIELDS.has(String(field))
    ? { kind: 'rebuild' }
    : { kind: 'overlays' };
};

export { changeEffect, loopsOf };
export type { ChangeEffect };
