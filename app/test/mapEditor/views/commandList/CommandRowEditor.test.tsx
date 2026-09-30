/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { CommandCatalogEntry } from '../../../../src/mapEditor/core/commands/catalogTypes.ts';
import { CommandEditorRegistry, type CommandEditorProps } from '../../../../src/mapEditor/core/commands/CommandEditorRegistry.ts';
import { BUILT_IN_ENTRIES } from '../../../../src/mapEditor/core/commands/builtin/builtInCommands.ts';
import type { CommandDraft } from '../../../../src/mapEditor/core/commands/fieldValues.ts';
import { CommandRowEditor, type ElseBranchControl } from '../../../../src/mapEditor/views/commandList/CommandRowEditor.tsx';
import { cmd } from '../../support/commandFixtures.ts';

/*
 * A row unfolds into exactly one editor: the hand-built one registered for its command (handed the whole block when
 * the list gives one), its generated form, its parameters as JSON when nothing describes it, or a note that there is
 * nothing to set. Any command with an editor opens as JSON too, and the raw editor saves nothing until Apply, refusing
 * text that is not a command. A conditional branch's else is offered beside its form, since MZ keeps it in the list.
 */
describe('CommandRowEditor', () =>
{
  /**
   * Finds a built-in entry by code.
   * @param {number} code The code.
   * @returns {CommandCatalogEntry} The entry.
   */
  const entryOf = (code: number): CommandCatalogEntry => BUILT_IN_ENTRIES.find(entry => entry.code === code) as CommandCatalogEntry;

  /**
   * Renders a row's editor.
   * @param {CommandCatalogEntry} entry The command's entry.
   * @param {CommandDraft} draft The command.
   * @param {object} options The registry, the block and the else.
   * @returns {ReturnType<typeof vi.fn>} What the editor handed over.
   */
  const renderEditor = (
    entry: CommandCatalogEntry,
    draft: CommandDraft,
    options: { registry?: CommandEditorRegistry; elseBranch?: ElseBranchControl | null; block?: CommandEditorProps['block'] } = {},
  ) =>
  {
    const onChange = vi.fn<(draft: CommandDraft) => void>();
    render(
      <CommandRowEditor
        entry={entry}
        draft={draft}
        onChange={onChange}
        block={options.block}
        elseBranch={options.elseBranch ?? null}
        registry={options.registry ?? new CommandEditorRegistry()}
        names={null}
        api={null}
        playSound={vi.fn()}
      />
    );
    return onChange;
  };

  it('opens the hand-built editor registered for the command, handing it the command, its lines and its block', () =>
  {
    // Arrange.
    const registry = new CommandEditorRegistry();
    const seen: CommandEditorProps[] = [];
    registry.registerForCode(101, (props: CommandEditorProps) =>
    {
      seen.push(props);
      return <button type={'button'} onClick={() => props.onChange(cmd(101, 0, [ '', 0, 0, 2, 'Anna' ]), [])}>hand-built</button>;
    });
    const draft: CommandDraft = { command: cmd(101, 0, [ '', 0, 0, 2, '' ]), continuation: [ cmd(401, 0, [ 'Hi.' ]) ] };
    const block = { commands: [], onChange: vi.fn() };

    // Act.
    const onChange = renderEditor(entryOf(101), draft, { registry, block });
    fireEvent.click(screen.getByRole('button', { name: 'hand-built' }));

    // Assert.
    expect([ seen[0].command, seen[0].continuation, seen[0].block === block, onChange.mock.calls ])
      .toStrictEqual([ draft.command, draft.continuation, true, [ [ { command: cmd(101, 0, [ '', 0, 0, 2, 'Anna' ]), continuation: [] } ] ] ]);
  });

  it('opens the generated form for a command its entry describes', () =>
  {
    // Arrange.
    const draft: CommandDraft = { command: cmd(230, 0, [ 30 ]), continuation: [] };

    // Act.
    renderEditor(entryOf(230), draft);

    // Assert.
    expect(screen.getByLabelText('Frames'))
      .toHaveValue(30);
  });

  it('says there is nothing to set for a command with no inputs', () =>
  {
    // Arrange.
    const draft: CommandDraft = { command: cmd(214, 0), continuation: [] };

    // Act.
    renderEditor(entryOf(214), draft);

    // Assert.
    expect([ screen.queryByText('Nothing to set for this command.') !== null, screen.queryByRole('button', { name: 'Edit as JSON' }) ])
      .toStrictEqual([ true, null ]);
  });

  it('opens any command with an editor as JSON, and back', () =>
  {
    // Arrange.
    renderEditor(entryOf(230), { command: cmd(230, 0, [ 30 ]), continuation: [] });

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Edit as JSON' }));
    const asJson = screen.queryByLabelText('Parameters and lines, as JSON') !== null;
    fireEvent.click(screen.getByRole('button', { name: 'Back to the form' }));

    // Assert.
    expect([ asJson, screen.queryByLabelText('Frames') !== null ])
      .toStrictEqual([ true, true ]);
  });

  it('edits a command nothing describes as JSON, saving on Apply and refusing what is not a command', () =>
  {
    // Arrange: a plugin command whose header was never read.
    const entry: CommandCatalogEntry = { id: 'plugin:p:c', code: 357, name: 'Plugin: p c', category: 'Plugin', keywords: [], fields: [], sentence: 'p c', continuation: 657 };
    const draft: CommandDraft = { command: cmd(357, 0, [ 'p', 'c', 'C', {} ]), continuation: [] };
    const onChange = renderEditor(entry, draft);
    const text = screen.getByLabelText('Parameters and lines, as JSON');

    // Act.
    fireEvent.change(text, { target: { value: '{ "parameters": 5 }' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    const refused = screen.queryByText('Give the parameters as a list under "parameters".') !== null;
    fireEvent.change(text, { target: { value: '{ "parameters": [ "p", "c", "C", { "a": "1" } ], "lines": [ [ "a = 1" ] ] }' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    // Assert.
    expect([ refused, onChange.mock.calls ])
      .toStrictEqual([ true, [ [ { command: cmd(357, 0, [ 'p', 'c', 'C', { a: '1' } ]), continuation: [ cmd(657, 0, [ 'a = 1' ]) ] } ] ] ]);
  });

  it('puts the raw text back on Revert', () =>
  {
    // Arrange.
    const entry: CommandCatalogEntry = { id: 'unknown:999', code: 999, name: 'Command 999', category: 'Other', keywords: [], fields: [], sentence: 'Command 999' };
    renderEditor(entry, { command: cmd(999, 0, [ 1 ]), continuation: [] });
    const text = screen.getByLabelText('Parameters and lines, as JSON') as HTMLTextAreaElement;
    const shown = text.value;

    // Act.
    fireEvent.change(text, { target: { value: 'nonsense' } });
    fireEvent.click(screen.getByRole('button', { name: 'Revert' }));

    // Assert.
    expect(text.value)
      .toBe(shown);
  });

  it('offers a conditional branch\'s else beside its form', () =>
  {
    // Arrange.
    const set = vi.fn();
    renderEditor(entryOf(111), { command: cmd(111, 0, [ 0, 1, 0 ]), continuation: [] }, { elseBranch: { present: true, set } });

    // Act.
    fireEvent.click(screen.getByLabelText('With an else branch'));

    // Assert.
    expect(set.mock.calls)
      .toStrictEqual([ [ false ] ]);
  });

  it('leaves the else to a hand-built editor that offers it itself', () =>
  {
    // Arrange.
    const registry = new CommandEditorRegistry();
    registry.registerForCode(111, () => <span>branch editor</span>);

    // Act.
    renderEditor(entryOf(111), { command: cmd(111, 0, [ 0, 1, 0 ]), continuation: [] }, { registry, elseBranch: { present: false, set: vi.fn() } });

    // Assert.
    expect(screen.queryByLabelText('With an else branch'))
      .toBeNull();
  });

  it('edits a shop\'s further goods row by row, adding and taking them away', () =>
  {
    // Arrange.
    const draft: CommandDraft = { command: cmd(302, 0, [ 0, 1, 0, 0, false ]), continuation: [ cmd(605, 0, [ 0, 2, 1, 50 ]) ] };
    const onChange = renderEditor(entryOf(302), draft);

    // Act.
    const prices = screen.getAllByLabelText('Price', { selector: 'input[type="number"]' });
    fireEvent.change(prices[0], { target: { value: '75' } });
    fireEvent.blur(prices[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Add an item' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove item 2' }));

    // Assert.
    expect(onChange.mock.calls.map(([ changed ]) => changed.continuation.map(line => line.parameters)))
      .toStrictEqual([ [ [ 0, 2, 1, 75 ] ], [ [ 0, 2, 1, 50 ], [ 0, 1, 0, 0 ] ], [] ]);
  });
});
