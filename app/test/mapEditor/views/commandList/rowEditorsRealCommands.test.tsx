/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { CommandCatalog } from '../../../../src/mapEditor/core/commands/CommandCatalog.ts';
import { CommandEditorRegistry } from '../../../../src/mapEditor/core/commands/CommandEditorRegistry.ts';
import { registerBuiltInCommands } from '../../../../src/mapEditor/core/commands/builtin/builtInCommands.ts';
import type { CommandDraft } from '../../../../src/mapEditor/core/commands/fieldValues.ts';
import { catalogStructure, headEnd, locateCommands, readCommandTree } from '../../../../src/mapEditor/core/commandList/commandTree.ts';
import { buildListRows } from '../../../../src/mapEditor/core/commandList/listRows.ts';
import { CommandRowEditor } from '../../../../src/mapEditor/views/commandList/CommandRowEditor.tsx';
import { locateGameProject } from '../../../support/gameProject.ts';
import { readRealCommandLists } from '../../support/realCommandLists.ts';

/*
 * The round trip over the shipped lists proves every command's editor reads it and writes it back exactly; this proves
 * every editor also draws. It opens the editor of one command of each shape the game holds (each entry, with each
 * pattern of parameter kinds it appears with), since a control that throws on a real value would take the whole list
 * down with it, and that is exactly the kind of failure a hand-made fixture never contains.
 *
 * It runs against the project JMZ_PROJECT_ROOT names, or the sibling checkout, and skips when neither is there.
 */
const project = locateGameProject();

describe.skipIf(project === null)('every shipped command shape, drawn', () =>
{
  it('opens the editor of one command of every shape the game holds, without a failure', () =>
  {
    // Arrange: one command per entry and parameter shape.
    const catalog = new CommandCatalog();
    registerBuiltInCommands(catalog);
    const structure = catalogStructure(catalog);
    const shapes = new Map<string, { where: string; draft: CommandDraft }>();
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
            shapes.set(key, { where: `${where}@${row.index}`, draft });
          }
        });
    });
    const heard: string[] = [];
    const quiet = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => heard.push(String(args[0])));
    const failures: string[] = [];

    // Act.
    shapes.forEach(({ where, draft }, key) =>
    {
      try
      {
        const { container } = render(
          <CommandRowEditor
            entry={catalog.resolve(draft.command)}
            draft={draft}
            onChange={() => undefined}
            block={undefined}
            elseBranch={null}
            registry={new CommandEditorRegistry()}
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

    // Assert: well over a hundred shapes (134 today), every one drawn, and React never complained about any.
    expect([ shapes.size > 100, failures, heard ])
      .toStrictEqual([ true, [], [] ]);
  });
});
