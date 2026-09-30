import { describe, expect, it } from 'vitest';
import type { CommandCatalogEntry } from '../../../../src/mapEditor/core/commands/catalogTypes.ts';
import { CommandEditorRegistry } from '../../../../src/mapEditor/core/commands/CommandEditorRegistry.ts';
import { BUILT_IN_ENTRIES } from '../../../../src/mapEditor/core/commands/builtin/builtInCommands.ts';
import type { CommandDraft } from '../../../../src/mapEditor/core/commands/fieldValues.ts';
import { chooseRowEditor, rawCommandText, readRawCommandText } from '../../../../src/mapEditor/core/commandList/rowEditors.ts';
import { cmd } from '../../support/commandFixtures.ts';

/*
 * Every row the author can open unfolds into an editor, so no command is ever a dead end: a hand-built editor when
 * one is registered for it, the generated form when its entry has inputs, the raw JSON when it holds anything, and
 * a plain "nothing to set" otherwise. The raw editor is the last resort for commands no entry describes, so it owes
 * a lossless trip: its text read back gives the very command it showed, lines, codes and extra keys included, and
 * text that is not a command is refused with a reason rather than saved.
 */
describe('rowEditors', () =>
{
  /**
   * Finds a built-in entry by code.
   * @param {number} code The code.
   * @returns {CommandCatalogEntry} The entry.
   */
  const entryOf = (code: number): CommandCatalogEntry => BUILT_IN_ENTRIES.find(entry => entry.code === code) as CommandCatalogEntry;

  /**
   * An entry describing nothing, as an unread plugin command's is.
   */
  const blank: CommandCatalogEntry = { id: 'plugin:p:c', code: 357, name: 'Plugin: p c', category: 'Plugin', keywords: [], fields: [], sentence: 'p c', continuation: 657 };

  describe('chooseRowEditor', () =>
  {
    it('prefers a registered editor, then the generated form, then raw JSON, then nothing', () =>
    {
      // Arrange.
      const registry = new CommandEditorRegistry<string>();
      registry.registerForCode(101, 'show text editor');
      const draft = (code: number, parameters: unknown[]): CommandDraft => ({ command: cmd(code, 0, parameters as never), continuation: [] });

      // Act.
      const kinds = [
        chooseRowEditor(registry, entryOf(101), draft(101, [ '', 0, 0, 2, '' ])),
        chooseRowEditor(registry, entryOf(121), draft(121, [ 1, 1, 0 ])),
        chooseRowEditor(registry, entryOf(302), draft(302, [ 0, 1, 0, 0, false ])),
        chooseRowEditor(registry, blank, draft(357, [ 'p', 'c', 'C', {} ])),
        chooseRowEditor(registry, blank, { command: cmd(357, 0, []), continuation: [ cmd(657, 0, [ 'a = 1' ]) ] }),
        chooseRowEditor(registry, entryOf(214), draft(214, [])),
      ];

      // Assert.
      expect(kinds)
        .toStrictEqual([ 'hand-built', 'generated', 'generated', 'raw', 'raw', 'none' ]);
    });

    it('treats an entry with only line inputs as having a generated form', () =>
    {
      // Arrange: a shop whose own inputs were stripped away, leaving the goods rows.
      const registry = new CommandEditorRegistry<string>();
      const entry = { ...entryOf(302), fields: [] };

      // Act.
      const kind = chooseRowEditor(registry, entry, { command: cmd(302, 0, [ 0, 1, 0, 0, false ]), continuation: [] });

      // Assert.
      expect(kind)
        .toBe('generated');
    });
  });

  describe('rawCommandText and readRawCommandText', () =>
  {
    /**
     * A plugin command with two display lines, one carrying an extra key.
     * @returns {CommandDraft} The draft.
     */
    const pluginDraft = (): CommandDraft => ({
      command: { ...cmd(357, 2, [ 'p', 'c', 'C', { a: '1' } ]), collapsed: false },
      continuation: [ cmd(657, 2, [ 'a = 1' ]), { ...cmd(657, 2, [ 'b = 2' ]), collapsed: true } ],
    });

    it('reads back exactly what it wrote', () =>
    {
      // Arrange.
      const draft = pluginDraft();

      // Act.
      const read = readRawCommandText(rawCommandText(draft), draft, 657);

      // Assert.
      expect(read)
        .toStrictEqual({ ok: true, draft });
    });

    it('writes the parameters and each line\'s parameters', () =>
    {
      // Arrange.
      const draft = pluginDraft();

      // Act.
      const text = rawCommandText(draft);

      // Assert.
      expect(JSON.parse(text))
        .toStrictEqual({ parameters: [ 'p', 'c', 'C', { a: '1' } ], lines: [ [ 'a = 1' ], [ 'b = 2' ] ] });
    });

    it('adds lines with the continuation code, and drops lines taken out', () =>
    {
      // Arrange.
      const draft = pluginDraft();

      // Act.
      const grown = readRawCommandText('{ "parameters": [ 1 ], "lines": [ [ "x" ], [ "y" ], [ "z" ] ] }', draft, 657);
      const shrunk = readRawCommandText('{ "parameters": [ 1 ], "lines": [] }', draft, 657);
      const bare = readRawCommandText('{ "parameters": [ 1 ] }', draft, 657);

      // Assert.
      expect([ grown.ok && grown.draft.continuation[2], shrunk.ok && shrunk.draft.continuation, bare.ok && bare.draft.continuation ])
        .toStrictEqual([ cmd(657, 2, [ 'z' ]), [], [] ]);
    });

    it('refuses text that is not JSON, or not shaped like a command', () =>
    {
      // Arrange.
      const draft = pluginDraft();
      const texts = [ '{ nope', '[ 1 ]', '{ "parameters": 5 }', '{ "parameters": [], "lines": [ 5 ] }', '{ "parameters": [], "lines": 5 }' ];

      // Act.
      const reads = texts.map(text => readRawCommandText(text, draft, 657));

      // Assert.
      expect(reads.map(read => (read.ok ? 'ok' : read.message.split(':')[0])))
        .toStrictEqual([
          'That is not valid JSON',
          'Give the parameters as a list under "parameters".',
          'Give the parameters as a list under "parameters".',
          'Give the lines as a list of parameter lists under "lines".',
          'Give the lines as a list of parameter lists under "lines".',
        ]);
    });

    it('refuses more lines than a command without continuation lines can take', () =>
    {
      // Arrange.
      const draft: CommandDraft = { command: cmd(230, 0, [ 5 ]), continuation: [] };

      // Act.
      const read = readRawCommandText('{ "parameters": [ 6 ], "lines": [ [ "x" ] ] }', draft, undefined);

      // Assert.
      expect(read)
        .toStrictEqual({ ok: false, message: 'This command takes no more lines.' });
    });
  });
});
