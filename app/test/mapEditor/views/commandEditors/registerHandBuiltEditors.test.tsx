/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { CommandCatalogEntry } from '../../../../src/mapEditor/core/commands/catalogTypes.ts';
import { CommandEditorRegistry, type CommandBlockEdit } from '../../../../src/mapEditor/core/commands/CommandEditorRegistry.ts';
import { PluginHeaderStore } from '../../../../src/mapEditor/core/commands/pluginHeaders/PluginHeaderLibrary.ts';
import type { RmmzEventCommand } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { registerHandBuiltEditors } from '../../../../src/mapEditor/views/commandEditors/registerHandBuiltEditors.tsx';

/*
 * The command list opens a command's editor by asking the registry for it, so registering the hand-built editors
 * owes the list one editor for each of the eight codes and nothing for any other, each able to open the real
 * shapes of its command and hand back exactly what the author changed. The editors that change a block's
 * structure (Show Choices, Conditional Branch) hand back the whole block; the rest hand back the command and its
 * lines. A command an editor cannot read opens as a notice and is never handed back changed.
 */
describe('registerHandBuiltEditors', () =>
{
  /**
   * Builds a command.
   * @param {number} code The code.
   * @param {unknown[]} parameters The parameters.
   * @param {number} indent The indent.
   * @returns {RmmzEventCommand} The command.
   */
  const command = (code: number, parameters: unknown[] = [], indent = 0): RmmzEventCommand => ({ code, indent, parameters: parameters as never });

  /**
   * Builds the entry the list would resolve a command to.
   * @param {number} code The code.
   * @returns {CommandCatalogEntry} The entry.
   */
  const entry = (code: number): CommandCatalogEntry => ({ id: `core:${code}`, code, name: `Command ${code}`, category: 'Other', keywords: [], fields: [], sentence: 'x' });

  /**
   * Registers the editors into a fresh registry.
   * @param {PluginHeaderStore} headers The plugin headers.
   * @returns {CommandEditorRegistry} The registry.
   */
  const registered = (headers = new PluginHeaderStore()): CommandEditorRegistry =>
  {
    const registry = new CommandEditorRegistry();
    registerHandBuiltEditors(registry, { api: null, headers });
    return registry;
  };

  /**
   * Renders the editor registered for a command, as the list would.
   * @param {RmmzEventCommand} opened The command.
   * @param {readonly RmmzEventCommand[]} continuation Its lines.
   * @param {object} options The block, when the editor gets one, and the headers.
   * @returns {{ onChange: ReturnType<typeof vi.fn> }} What the editor handed back.
   */
  const open = (opened: RmmzEventCommand, continuation: readonly RmmzEventCommand[] = [], options: { block?: CommandBlockEdit; headers?: PluginHeaderStore } = {}) =>
  {
    const Editor = registered(options.headers).editorFor(entry(opened.code));
    if (Editor === null)
    {
      throw new Error(`no editor for ${opened.code}`);
    }

    const onChange = vi.fn();
    render(<Editor entry={entry(opened.code)} command={opened} continuation={continuation} onChange={onChange} block={options.block}/>);
    return { onChange };
  };

  it('registers an editor for each of the eight codes, and for nothing else', () =>
  {
    // Arrange.
    const registry = registered();

    // Act.
    const found = [ 101, 102, 111, 122, 201, 205, 355, 357, 121, 401 ].map(code => registry.editorFor(entry(code)) !== null);

    // Assert.
    expect(found)
      .toStrictEqual([ true, true, true, true, true, true, true, true, false, false ]);
  });

  it('refuses to register twice into one registry', () =>
  {
    // Arrange.
    const registry = registered();

    // Act.
    const again = () => registerHandBuiltEditors(registry, { api: null, headers: new PluginHeaderStore() });

    // Assert.
    expect(again)
      .toThrow('code 101 already has an editor');
  });

  it('hands back Show Text with its new lines, past four', () =>
  {
    // Arrange.
    const { onChange } = open(command(101, [ '', 0, 0, 2, 'Chef' ]), [ command(401, [ 'Hello' ]) ]);

    // Act.
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'one\ntwo\nthree\nfour\nfive' } });

    // Assert.
    expect(onChange.mock.calls.at(-1))
      .toStrictEqual([ command(101, [ '', 0, 0, 2, 'Chef' ]), [ 'one', 'two', 'three', 'four', 'five' ].map(text => command(401, [ text ])) ]);
  });

  it('hands back a script split into its first line and the rest', () =>
  {
    // Arrange.
    const { onChange } = open(command(355, [ 'a();' ]));

    // Act.
    fireEvent.change(screen.getByLabelText('Script'), { target: { value: 'a();\nb();' } });

    // Assert.
    expect(onChange.mock.calls.at(-1))
      .toStrictEqual([ command(355, [ 'a();' ]), [ command(655, [ 'b();' ]) ] ]);
  });

  it('hands back a transfer\'s new landing tile', () =>
  {
    // Arrange.
    const { onChange } = open(command(201, [ 0, 5, 3, 4, 2, 0 ]));

    // Act.
    fireEvent.change(screen.getByLabelText('X'), { target: { value: '9' } });

    // Assert.
    expect(onChange.mock.calls.at(-1))
      .toStrictEqual([ command(201, [ 0, 5, 9, 4, 2, 0 ]), [] ]);
  });

  it('hands back a Control Variables constant', () =>
  {
    // Arrange.
    const { onChange } = open(command(122, [ 3, 3, 0, 0, 1 ]));

    // Act.
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: '42' } });

    // Assert.
    expect(onChange.mock.calls.at(-1))
      .toStrictEqual([ command(122, [ 3, 3, 0, 0, 42 ]), [] ]);
  });

  it('hands back the whole branch block with an Else added', () =>
  {
    // Arrange.
    const commands = [ command(111, [ 0, 1, 0 ]), command(0, [], 1), command(412) ];
    const onBlock = vi.fn();
    open(commands[0], [], { block: { commands, onChange: onBlock } });

    // Act.
    fireEvent.click(screen.getByLabelText('Else branch'));

    // Assert.
    expect(onBlock.mock.calls.at(-1))
      .toStrictEqual([ [ commands[0], commands[1], command(411), command(0, [], 1), commands[2] ] ]);
  });

  it('hands back a whole Show Choices list with a choice renamed in its command and its branch line', () =>
  {
    // Arrange.
    const commands = [
      command(102, [ [ 'Yes', 'No' ], 1, 0, 2, 0 ]),
      command(402, [ 0, 'Yes' ]),
      command(0, [], 1),
      command(402, [ 1, 'No' ]),
      command(0, [], 1),
      command(404),
    ];
    const onBlock = vi.fn();
    open(commands[0], [], { block: { commands, onChange: onBlock } });

    // Act.
    fireEvent.change(screen.getByLabelText('Choice 2'), { target: { value: 'Never' } });

    // Assert.
    expect(onBlock.mock.calls.at(-1))
      .toStrictEqual([ [ command(102, [ [ 'Yes', 'Never' ], 1, 0, 2, 0 ]), commands[1], commands[2], command(402, [ 1, 'Never' ]), commands[4], commands[5] ] ]);
  });

  it('lists a Show Choices list\'s choices without editing them when the list hands over no block', () =>
  {
    // Arrange: the editor opened without its block.

    // Act.
    open(command(102, [ [ 'Yes', 'No' ], 1, 0, 2, 0 ]));

    // Assert.
    expect([ screen.getByText('Choice 2: No'), screen.queryByLabelText('Choice 2') ])
      .toStrictEqual([ expect.anything(), null ]);
  });

  it('hands back a route with a new step and the line repeating it', () =>
  {
    // Arrange.
    const route = { list: [ { code: 0 } ], repeat: false, skippable: false, wait: true };
    const { onChange } = open(command(205, [ -1, route ]));

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Move Down' }));

    // Assert.
    expect(onChange.mock.calls.at(-1))
      .toStrictEqual([
        command(205, [ -1, { list: [ { code: 1, indent: null }, { code: 0 } ], repeat: false, skippable: false, wait: true } ]),
        [ command(505, [ { code: 1, indent: null } ]) ],
      ]);
  });

  it('hands back a plugin command\'s argument from a form its header built, with its lines rebuilt', () =>
  {
    // Arrange.
    const headers = new PluginHeaderStore();
    headers.set([ {
      plugin: 'j/omni/ext/J-OMNI-Quests',
      description: '',
      commands: [ { plugin: 'j/omni/ext/J-OMNI-Quests', command: 'progress-quest', text: 'Progress Quest', args: [ { name: 'key', type: 'string', description: 'The quest.' } ] } ],
      structs: [],
    } ]);
    const opened = command(357, [ 'j/omni/ext/J-OMNI-Quests', 'progress-quest', 'Progress Quest', { key: 'main-001' } ]);
    const { onChange } = open(opened, [ command(657, [ 'key = main-001' ]) ], { headers });

    // Act.
    fireEvent.change(screen.getByLabelText('key'), { target: { value: 'side-004' } });

    // Assert.
    expect(onChange.mock.calls.at(-1))
      .toStrictEqual([
        command(357, [ 'j/omni/ext/J-OMNI-Quests', 'progress-quest', 'Progress Quest', { key: 'side-004' } ]),
        [ command(657, [ 'key = side-004' ]) ],
      ]);
  });

  it('opens a plugin command its plugin does not list, keeping every value editable as text', () =>
  {
    // Arrange: J-JAFTING's header, which no longer lists "Unlock Category".
    const headers = new PluginHeaderStore();
    headers.set([ {
      plugin: 'j/jafting/J-JAFTING',
      description: '',
      commands: [ { plugin: 'j/jafting/J-JAFTING', command: 'call-menu', args: [] } ],
      structs: [],
    } ]);
    const opened = command(357, [ 'j/jafting/J-JAFTING', 'Unlock Category', 'Unlock new category', { categoryKeys: '["COOK_ERO"]' } ]);

    // Act.
    open(opened, [ command(657, [ 'Category Keys = ["COOK_ERO"]' ]) ], { headers });

    // Assert.
    expect([ screen.getByText('This plugin does not list this command, so its values are shown as plain text.'), screen.getByLabelText('categoryKeys') ])
      .toStrictEqual([ expect.anything(), expect.anything() ]);
    expect(screen.getByLabelText('categoryKeys'))
      .toHaveValue('["COOK_ERO"]');
  });

  it('opens a command it cannot read as a notice, and hands nothing back', () =>
  {
    // Arrange: a transfer with a parameter missing.
    const { onChange } = open(command(201, [ 0, 5, 3 ]));

    // Act: nothing to change.

    // Assert.
    expect([ screen.getByText('This command is written in a way this editor does not recognise, so it is kept exactly as it is.'), onChange.mock.calls.length ])
      .toStrictEqual([ expect.anything(), 0 ]);
  });
});
