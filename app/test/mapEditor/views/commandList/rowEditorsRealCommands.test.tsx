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
 * Mounting and tearing down a live React tree per shape is real work, and the game holds well over a hundred shapes
 * (134 today), so each pass draws its shapes in fixed-size groups rather than one test covering all of them: a single
 * test that grows with the catalog eventually outgrows vitest's default per-test timeout once the rest of the suite
 * is competing for the CPU, where a group of a bounded size does not.
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
 * How many shapes one test draws, keeping a single test's render pass well inside vitest's default timeout even
 * while the rest of the suite is competing for the CPU.
 */
const SHAPES_PER_GROUP = 20;

/**
 * Splits a map's entries into fixed-size groups, in collection order.
 * @param {Map<string, Shape>} shapes Every shape to draw.
 * @param {number} size How many shapes belong to one group.
 * @returns {Map<string, Shape>[]} The shapes, grouped; a single empty group when there is nothing to draw.
 */
const grouped = (shapes: Map<string, Shape>, size: number): Map<string, Shape>[] =>
{
  const entries = [ ...shapes.entries() ];
  if (entries.length === 0)
  {
    return [ new Map() ];
  }

  const groups: Map<string, Shape>[] = [];
  for (let start = 0; start < entries.length; start += size)
  {
    groups.push(new Map(entries.slice(start, start + size)));
  }

  return groups;
};

/**
 * Draws every shape in one group, noting any that throws, draws nothing, or makes React complain.
 * @param {CommandCatalog} catalog The catalog.
 * @param {CommandEditorRegistry} registry The hand-built editors, or an empty registry for the generated forms alone.
 * @param {Map<string, Shape>} shapes The group to draw.
 * @returns {{ failures: string[], heard: string[] }} What went wrong, if anything.
 */
const drawShapes = (catalog: CommandCatalog, registry: CommandEditorRegistry, shapes: Map<string, Shape>) =>
{
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

  return { failures, heard };
};

describe.skipIf(project === null)('every shipped command shape, drawn', () =>
{
  // the catalog never reads the project, so it builds the same whether or not one is configured; only the shapes
  // below need the guard, since collecting them reads the shipped lists from disk.
  const catalog = new CommandCatalog();
  registerBuiltInCommands(catalog);
  const shapes = project === null ? new Map<string, Shape>() : collectShapes(catalog);
  const groups = grouped(shapes, SHAPES_PER_GROUP);

  it('collects well over a hundred shapes', () =>
  {
    // Arrange: every shape the game's shipped lists hold, collected above.
    // Act: nothing further; the count is what collectShapes already found.
    // Assert: well over a hundred shapes (134 today).
    expect(shapes.size > 100)
      .toBe(true);
  });

  describe('opens the generated editor of every shape', () =>
  {
    // Arrange: the built-in catalog, and no hand-built editors.
    const registry = new CommandEditorRegistry();

    groups.forEach((group, index) =>
    {
      it(`draws group ${index + 1} of ${groups.length}, without a failure`, () =>
      {
        // Arrange: nothing further; the catalog and registry above are shared by every group in this pass.
        // Act.
        const { failures, heard } = drawShapes(catalog, registry, group);

        // Assert: every shape in this group drew, and React never complained about any.
        expect([ failures, heard ])
          .toStrictEqual([ [], [] ]);
      });
    });
  });

  describe('opens every shape with the hand-built editors registered, block editors given their blocks', () =>
  {
    // Arrange: the editors registered as a window registers them, with no server behind them.
    const registry = new CommandEditorRegistry();
    registerHandBuiltEditors(registry, { api: null, headers: new PluginHeaderStore() });

    groups.forEach((group, index) =>
    {
      it(`draws group ${index + 1} of ${groups.length}, without a failure`, () =>
      {
        // Arrange: nothing further; the catalog and registry above are shared by every group in this pass.
        // Act.
        const { failures, heard } = drawShapes(catalog, registry, group);

        // Assert: every shape in this group drew, and React never complained about any.
        expect([ failures, heard ])
          .toStrictEqual([ [], [] ]);
      });
    });
  });
});
