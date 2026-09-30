/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { CommandCatalog } from '../../../../src/mapEditor/core/commands/CommandCatalog.ts';
import { CommandEditorRegistry } from '../../../../src/mapEditor/core/commands/CommandEditorRegistry.ts';
import { registerBuiltInCommands } from '../../../../src/mapEditor/core/commands/builtin/builtInCommands.ts';
import { blockSpanAt } from '../../../../src/mapEditor/core/commands/editors/blockSpan.ts';
import type { CommandDraft } from '../../../../src/mapEditor/core/commands/fieldValues.ts';
import { PluginHeaderStore } from '../../../../src/mapEditor/core/commands/pluginHeaders/PluginHeaderLibrary.ts';
import { catalogStructure, headEnd, locateCommands, readCommandTree } from '../../../../src/mapEditor/core/commandList/commandTree.ts';
import { buildListRows } from '../../../../src/mapEditor/core/commandList/listRows.ts';
import type { RmmzEventCommand } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { registerHandBuiltEditors } from '../../../../src/mapEditor/views/commandEditors/registerHandBuiltEditors.tsx';
import { CommandRowEditor } from '../../../../src/mapEditor/views/commandList/CommandRowEditor.tsx';
import { locateGameProject } from '../../../support/gameProject.ts';
import { readRealCommandLists } from '../../support/realCommandLists.ts';

/*
 * The round trip over the shipped lists proves every command's editor reads it and writes it back exactly; this proves
 * every editor also draws. It opens the editor of one command of each shape the game holds (each entry, with each
 * pattern of parameter kinds it appears with), since a control that throws on a real value would take the whole list
 * down with it, and that is exactly the kind of failure a hand-made fixture never contains. It does so twice: with
 * the generated forms alone, and with the hand-built editors registered as a window registers them, Show Choices and
 * Conditional Branch handed their whole block the way the list hands it.
 *
 * It runs against the project JMZ_PROJECT_ROOT names, or the sibling checkout, and skips when neither is there.
 */
const project = locateGameProject();

/**
 * One command of one shape, and where it came from.
 */
type Shape = {
  readonly where: string;
  readonly draft: CommandDraft;
  readonly block: readonly RmmzEventCommand[] | null;
};

/**
 * Collects one command of each entry and parameter shape across the game's lists, with its whole block when it
 * opens one that a hand-built editor reshapes.
 * @param {CommandCatalog} catalog The catalog.
 * @returns {Map<string, Shape>} The commands, by entry and shape.
 */
const collectShapes = (catalog: CommandCatalog): Map<string, Shape> =>
{
  const structure = catalogStructure(catalog);
  const shapes = new Map<string, Shape>();
  readRealCommandLists(project as string).forEach(({ where, list }) =>
  {
    const tree = readCommandTree(list, structure);
    const locations = locateCommands(tree);
    buildListRows(tree, () => false)
      .filter(row => row.kind === 'line' || row.kind === 'opener')
      .forEach(row =>
      {
        const command = list[row.index];
        const shape = JSON.stringify(command.parameters.map(value => (Array.isArray(value) ? 'list' : typeof value)));
        const key = `${catalog.resolve(command).id} ${shape}`;
        if (shapes.has(key) === false)
        {
          const draft = { command, continuation: list.slice(row.index + 1, headEnd(locations.get(row.index)!, row.index)) };
          const span = row.kind === 'opener' ? blockSpanAt(list, row.index) : null;
          shapes.set(key, { where: `${where}@${row.index}`, draft, block: span === null ? null : list.slice(span.start, span.end) });
        }
      });
  });

  return shapes;
};

/**
 * Draws every shape's editor, noting any that throws, draws nothing, or makes React complain.
 * @param {CommandCatalog} catalog The catalog.
 * @param {CommandEditorRegistry} registry The hand-built editors, or an empty registry for the generated forms alone.
 * @returns {{ count: number, failures: string[], heard: string[] }} How many were drawn, and what went wrong.
 */
const drawEveryShape = (catalog: CommandCatalog, registry: CommandEditorRegistry) =>
{
  const shapes = collectShapes(catalog);
  const heard: string[] = [];
  const quiet = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => heard.push(String(args[0])));
  const failures: string[] = [];
  shapes.forEach(({ where, draft, block }, key) =>
  {
    try
    {
      const { container } = render(
        <CommandRowEditor
          entry={catalog.resolve(draft.command)}
          draft={draft}
          onChange={() => undefined}
          block={block === null ? undefined : { commands: block, onChange: () => undefined }}
          elseBranch={null}
          registry={registry}
          names={null}
          api={null}
          playSound={() => undefined}
        />
      );
      if (container.textContent === '')
      {
        failures.push(`${key} at ${where}: drew nothing`);
      }
    }
    catch (error)
    {
      failures.push(`${key} at ${where}: ${(error as Error).message}`);
    }
    finally
    {
      cleanup();
    }
  });
  quiet.mockRestore();

  return { count: shapes.size, failures, heard };
};

describe.skipIf(project === null)('every shipped command shape, drawn', () =>
{
  it('opens the generated editor of one command of every shape the game holds, without a failure', () =>
  {
    // Arrange: the built-in catalog, and no hand-built editors.
    const catalog = new CommandCatalog();
    registerBuiltInCommands(catalog);

    // Act.
    const { count, failures, heard } = drawEveryShape(catalog, new CommandEditorRegistry());

    // Assert: well over a hundred shapes (134 today), every one drawn, and React never complained about any.
    expect([ count > 100, failures, heard ])
      .toStrictEqual([ true, [], [] ]);
  });

  it('opens every shape with the hand-built editors registered, block editors given their blocks, without a failure', () =>
  {
    // Arrange: the editors registered as a window registers them, with no server behind them.
    const catalog = new CommandCatalog();
    registerBuiltInCommands(catalog);
    const registry = new CommandEditorRegistry();
    registerHandBuiltEditors(registry, { api: null, headers: new PluginHeaderStore() });

    // Act.
    const { count, failures, heard } = drawEveryShape(catalog, registry);

    // Assert.
    expect([ count > 100, failures, heard ])
      .toStrictEqual([ true, [], [] ]);
  });
});
