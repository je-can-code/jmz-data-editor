/**
 * What a shortcut asks for. The shell handles the ones about the map tree and the ones every window shares; the
 * rest (copying events, nudging them) belong to the panels that own them.
 */
type ShortcutCommand =
  | 'undo'
  | 'redo'
  | 'save'
  | 'copy'
  | 'cut'
  | 'paste'
  | 'duplicate'
  | 'delete'
  | 'rename'
  | 'open'
  | 'escape';

/**
 * The part of a key press the shortcuts read.
 */
type KeyPress = {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
};

/**
 * The part of an event target the shortcuts read to tell a text field from anything else.
 */
type KeyTarget = {
  readonly tagName?: string;
  readonly type?: string;
  readonly isContentEditable?: boolean;
};

/**
 * The commands every window acts on whatever panel has focus: undo and redo go to whatever history has focus, and
 * save saves everything. Each popout window listens for these itself, since the main window never hears a key
 * pressed in another window.
 */
const APP_WIDE_COMMANDS: ReadonlySet<ShortcutCommand> = new Set<ShortcutCommand>([ 'undo', 'redo', 'save' ]);

/**
 * The input types that take no typed text, so their keys are the app's.
 */
const NON_TEXT_INPUTS: ReadonlySet<string> = new Set([ 'checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image' ]);

/**
 * The shortcuts held with Ctrl (or Cmd), by key.
 */
const CONTROL_SHORTCUTS: Readonly<Record<string, ShortcutCommand>> = {
  z: 'undo',
  y: 'redo',
  s: 'save',
  c: 'copy',
  x: 'cut',
  v: 'paste',
  d: 'duplicate',
};

/**
 * The shortcuts on a key of their own, by key.
 */
const PLAIN_SHORTCUTS: Readonly<Record<string, ShortcutCommand>> = {
  Delete: 'delete',
  F2: 'rename',
  Enter: 'open',
  Escape: 'escape',
};

/**
 * Works out which command a key press asks for: Ctrl (or Cmd) with Z, Y, S, C, X, V or D, Ctrl+Shift+Z for redo,
 * and Delete, F2, Enter and Escape on their own. Anything held with Alt is never a shortcut.
 * @param {KeyPress} press The key press.
 * @returns {ShortcutCommand | null} The command, or null when the press is not a shortcut.
 */
const shortcutFor = (press: KeyPress): ShortcutCommand | null =>
{
  if (press.altKey)
  {
    return null;
  }

  if (press.ctrlKey || press.metaKey)
  {
    const key = press.key.toLowerCase();
    if (press.shiftKey)
    {
      return key === 'z' ? 'redo' : null;
    }

    return CONTROL_SHORTCUTS[key] ?? null;
  }

  return press.shiftKey
    ? null
    : PLAIN_SHORTCUTS[press.key] ?? null;
};

/**
 * Reports whether a key press lands in a text field, where typing, Ctrl+Z, Ctrl+C and the rest are the field's
 * own, and only saving stays the app's.
 * @param {KeyTarget | null} target Where the key was pressed.
 * @returns {boolean} True for a text input, a text area, a select or editable content.
 */
const isTextEntry = (target: KeyTarget | null): boolean =>
{
  if (target === null)
  {
    return false;
  }

  if (target.isContentEditable === true)
  {
    return true;
  }

  const tag = (target.tagName ?? '').toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT')
  {
    return true;
  }

  return tag === 'INPUT' && NON_TEXT_INPUTS.has((target.type ?? 'text').toLowerCase()) === false;
};

/**
 * Works out which command a key press asks the app for, leaving to a text field everything it types or edits.
 * @param {KeyPress} press The key press.
 * @param {KeyTarget | null} target Where it was pressed.
 * @returns {ShortcutCommand | null} The command, or null when the key is not the app's.
 */
const appShortcutFor = (press: KeyPress, target: KeyTarget | null): ShortcutCommand | null =>
{
  const command = shortcutFor(press);
  if (command === null)
  {
    return null;
  }

  return isTextEntry(target) && command !== 'save'
    ? null
    : command;
};

export { APP_WIDE_COMMANDS, appShortcutFor, isTextEntry, shortcutFor };
export type { KeyPress, KeyTarget, ShortcutCommand };
