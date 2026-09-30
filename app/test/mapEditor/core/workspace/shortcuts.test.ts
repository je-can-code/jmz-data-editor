import { describe, expect, it } from 'vitest';
import { APP_WIDE_COMMANDS, appShortcutFor, isTextEntry, shortcutFor, type KeyPress } from '../../../../src/mapEditor/core/workspace/shortcuts.ts';

/*
 * The standard shortcuts from the baseline (Ctrl+C, X, V, D, Z and Y, Delete, F2, Enter and Escape, plus Ctrl+S)
 * owe the author exactly what every desktop app has taught them: each key does its one thing, Ctrl+Shift+Z redoes
 * too, Cmd stands in for Ctrl, and nothing held with Alt is a shortcut. Inside a text field every key but save is
 * the field's own, so renaming a map never undoes the tree mid-word. Undo, redo and save are the app-wide ones every
 * window listens for.
 */
describe('shortcuts', () =>
{
  /**
   * Builds a key press.
   * @param {string} key The key.
   * @param {Partial<KeyPress>} modifiers The modifiers held.
   * @returns {KeyPress} The press.
   */
  const press = (key: string, modifiers: Partial<KeyPress> = {}): KeyPress =>
  {
    return { key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...modifiers };
  };

  describe('shortcutFor', () =>
  {
    it('reads every Ctrl shortcut, whatever the case of the key', () =>
    {
      // Arrange.
      const keys = [ 'z', 'y', 's', 'c', 'x', 'v', 'd', 'Z' ];

      // Act.
      const commands = keys.map(key => shortcutFor(press(key, { ctrlKey: true })));

      // Assert.
      expect(commands)
        .toStrictEqual([ 'undo', 'redo', 'save', 'copy', 'cut', 'paste', 'duplicate', 'undo' ]);
    });

    it('redoes on Ctrl+Shift+Z, and takes nothing else with Ctrl and Shift', () =>
    {
      // Arrange.
      const presses = [ press('Z', { ctrlKey: true, shiftKey: true }), press('C', { ctrlKey: true, shiftKey: true }) ];

      // Act.
      const commands = presses.map(shortcutFor);

      // Assert.
      expect(commands)
        .toStrictEqual([ 'redo', null ]);
    });

    it('takes Cmd for Ctrl', () =>
    {
      // Arrange.
      const presses = [ press('z', { metaKey: true }), press('v', { metaKey: true }) ];

      // Act.
      const commands = presses.map(shortcutFor);

      // Assert.
      expect(commands)
        .toStrictEqual([ 'undo', 'paste' ]);
    });

    it('reads the keys of their own, and leaves them alone with Shift held', () =>
    {
      // Arrange.
      const presses = [ press('Delete'), press('F2'), press('Enter'), press('Escape'), press('Delete', { shiftKey: true }) ];

      // Act.
      const commands = presses.map(shortcutFor);

      // Assert.
      expect(commands)
        .toStrictEqual([ 'delete', 'rename', 'open', 'escape', null ]);
    });

    it('takes nothing held with Alt, and nothing that is not a shortcut', () =>
    {
      // Arrange.
      const presses = [ press('z', { ctrlKey: true, altKey: true }), press('q', { ctrlKey: true }), press('a'), press('Backspace') ];

      // Act.
      const commands = presses.map(shortcutFor);

      // Assert.
      expect(commands)
        .toStrictEqual([ null, null, null, null ]);
    });
  });

  describe('isTextEntry', () =>
  {
    it('tells text fields from the controls and elements around them', () =>
    {
      // Arrange.
      const targets = [
        { tagName: 'INPUT', type: 'text' },
        { tagName: 'input' },
        { tagName: 'INPUT', type: 'number' },
        { tagName: 'TEXTAREA' },
        { tagName: 'SELECT' },
        { tagName: 'DIV', isContentEditable: true },
        { tagName: 'INPUT', type: 'checkbox' },
        { tagName: 'BUTTON' },
        { tagName: 'DIV' },
        null,
      ];

      // Act.
      const answers = targets.map(isTextEntry);

      // Assert.
      expect(answers)
        .toStrictEqual([ true, true, true, true, true, true, false, false, false, false ]);
    });
  });

  describe('appShortcutFor', () =>
  {
    it('leaves a text field its own keys, save excepted', () =>
    {
      // Arrange.
      const field = { tagName: 'INPUT', type: 'text' };

      // Act.
      const commands = [
        appShortcutFor(press('z', { ctrlKey: true }), field),
        appShortcutFor(press('Enter'), field),
        appShortcutFor(press('s', { ctrlKey: true }), field),
      ];

      // Assert.
      expect(commands)
        .toStrictEqual([ null, null, 'save' ]);
    });

    it('hands the app its keys anywhere else', () =>
    {
      // Arrange.
      const row = { tagName: 'DIV' };

      // Act.
      const commands = [ appShortcutFor(press('z', { ctrlKey: true }), row), appShortcutFor(press('F2'), row), appShortcutFor(press('a'), row) ];

      // Assert.
      expect(commands)
        .toStrictEqual([ 'undo', 'rename', null ]);
    });
  });

  it('shares undo, redo and save across every window, and nothing else', () =>
  {
    // Arrange: nothing to arrange.

    // Act.
    const shared = [ ...APP_WIDE_COMMANDS ].sort();

    // Assert.
    expect(shared)
      .toStrictEqual([ 'redo', 'save', 'undo' ]);
  });
});
