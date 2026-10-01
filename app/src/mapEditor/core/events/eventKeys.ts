import { isTextEntry, shortcutFor, type KeyPress, type KeyTarget } from '../workspace/shortcuts.ts';

/**
 * What a key pressed over a map asks of its events.
 *
 * - {@code nudge}: move the selection one tile.
 * - {@code select-all}: select every event on the map.
 * - {@code duplicate}, {@code delete}: act on the selection.
 * - {@code open}: open the event picked last in its own window.
 * - {@code escape}: drop a drag or box on show, or else select nothing.
 *
 * Copy, cut and paste arrive as the browser's own clipboard events instead, which is what lets them read and write the
 * system clipboard with no permission asked; undo, redo and save belong to the workspace, whatever has focus.
 */
type EventKeyAction =
  | { readonly kind: 'nudge'; readonly dx: number; readonly dy: number }
  | { readonly kind: 'select-all' | 'duplicate' | 'delete' | 'open' | 'escape' };

/**
 * The arrow keys, and the tile each nudges the selection by.
 */
const NUDGES: Readonly<Record<string, { readonly dx: number; readonly dy: number }>> = {
  ArrowLeft: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
  ArrowUp: { dx: 0, dy: -1 },
  ArrowDown: { dx: 0, dy: 1 },
};

/**
 * Works out what a key pressed over a map asks of its events: a bare arrow nudges, Ctrl+A selects everything, and
 * Ctrl+D, Delete, Enter and Esc do what they do everywhere in the editor. A key typed into a text field is the field's.
 * @param {KeyPress} press The key press.
 * @param {KeyTarget | null} target Where it was pressed.
 * @returns {EventKeyAction | null} The action, or null when the key is not the map's.
 */
const eventKeyFor = (press: KeyPress, target: KeyTarget | null): EventKeyAction | null =>
{
  if (isTextEntry(target))
  {
    return null;
  }

  const nudge = NUDGES[press.key];
  if (nudge !== undefined)
  {
    return press.ctrlKey || press.metaKey || press.altKey || press.shiftKey
      ? null
      : { kind: 'nudge', ...nudge };
  }

  if ((press.ctrlKey || press.metaKey) && press.shiftKey === false && press.altKey === false && press.key.toLowerCase() === 'a')
  {
    return { kind: 'select-all' };
  }

  const command = shortcutFor(press);
  switch (command)
  {
    case 'duplicate':
    case 'delete':
    case 'open':
    case 'escape':
      return { kind: command };
    default:
      return null;
  }
};

export { eventKeyFor };
export type { EventKeyAction };
