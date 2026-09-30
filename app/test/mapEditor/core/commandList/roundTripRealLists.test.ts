import { describe, expect, it } from 'vitest';
import type { CommandCatalogEntry, CommandField } from '../../../../src/mapEditor/core/commands/catalogTypes.ts';
import { CommandCatalog } from '../../../../src/mapEditor/core/commands/CommandCatalog.ts';
import { CommandEditorRegistry } from '../../../../src/mapEditor/core/commands/CommandEditorRegistry.ts';
import { registerBuiltInCommands } from '../../../../src/mapEditor/core/commands/builtin/builtInCommands.ts';
import { conditionFields, isFieldVisible } from '../../../../src/mapEditor/core/commands/commandFields.ts';
import { applyFieldChange, formValues, type CommandDraft } from '../../../../src/mapEditor/core/commands/fieldValues.ts';
import { renderSentence } from '../../../../src/mapEditor/core/commands/sentence.ts';
import { reconcileBlock } from '../../../../src/mapEditor/core/commandList/blockReconcile.ts';
import { readClipboard, writeClipboard } from '../../../../src/mapEditor/core/commandList/commandClipboard.ts';
import { areaEventTag, joinsChoicesAbove } from '../../../../src/mapEditor/core/commandList/commandGuards.ts';
import {
  catalogStructure,
  headEnd,
  indexesOfTree,
  locateCommands,
  readCommandTree,
} from '../../../../src/mapEditor/core/commandList/commandTree.ts';
import { commandsOfNodes, insertAt, moveNodes } from '../../../../src/mapEditor/core/commandList/listEdits.ts';
import { buildListRows } from '../../../../src/mapEditor/core/commandList/listRows.ts';
import { chooseRowEditor, rawCommandText, readRawCommandText, type RowEditorKind } from '../../../../src/mapEditor/core/commandList/rowEditors.ts';
import { jsonEquals, type JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzEventCommand } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { locateGameProject } from '../../../support/gameProject.ts';
import { MZ_STRUCTURE } from '../../support/commandFixtures.ts';
import { readRealCommandLists, type RealCommandList } from '../../support/realCommandLists.ts';

/*
 * Nothing is lost, command by command.
 *
 * The command list's promise is the one every save depends on: every command in every event page and common event
 * the game ships renders its sentence, opens an editor (a hand-built one, the generated form, or the raw JSON), and
 * saves back with nothing lost. So this walks all of them, not a fixture, because the point is what the game
 * actually holds: every command resolves to an entry that describes it; every row reads as a sentence; every
 * editor opens, and writing an input back (changed, then restored) leaves the command exactly as it was, every
 * other parameter and key untouched; every block reconciles to itself; every list survives a copy and paste, and a
 * move away and back, whole.
 *
 * Two plugins read the list's shape rather than any one command, and both are checked by name. HIME_LargeChoices
 * merges a Show Choices that follows another's end at once (Map001 event 49 and Map221 event 1 hold the game's
 * two), and KMS_AreaEvent reads `<areaEvent:WxH>` only from the comments at the top of a page (480 events).
 *
 * It runs against the project JMZ_PROJECT_ROOT names, or the sibling checkout, and skips when neither is there.
 */
const project = locateGameProject();
const lists: RealCommandList[] = project === null
  ? []
  : readRealCommandLists(project);

describe.skipIf(project === null)('every shipped command, round trip', () =>
{
  const catalog = new CommandCatalog();
  registerBuiltInCommands(catalog);
  const structure = catalogStructure(catalog);
  const registry = new CommandEditorRegistry<unknown>();

  /**
   * Visits every row that edits as a command (a line or a block's opener) of every list, with its entry and draft.
   * @param {(visit: { where: string, list: RmmzEventCommand[], index: number, entry: CommandCatalogEntry, draft: CommandDraft }) => void} each Called per row.
   */
  const forEachEditableRow = (each: (visit: {
    where: string;
    list: RmmzEventCommand[];
    index: number;
    entry: CommandCatalogEntry;
    draft: CommandDraft;
  }) => void): void =>
  {
    lists.forEach(({ where, list }) =>
    {
      const tree = readCommandTree(list, structure);
      const locations = locateCommands(tree);
      buildListRows(tree, () => false)
        .filter(row => row.kind === 'line' || row.kind === 'opener')
        .forEach(row =>
        {
          const location = locations.get(row.index)!;
          const draft = { command: list[row.index], continuation: list.slice(row.index + 1, headEnd(location, row.index)) };
          each({ where: `${where}@${row.index}`, list, index: row.index, entry: catalog.resolve(list[row.index]), draft });
        });
    });
  };

  /**
   * Lists the keys an entry's conditions depend on: changing one of these can reset other inputs, on purpose.
   * @param {CommandCatalogEntry} entry The entry.
   * @returns {Set<string>} The keys.
   */
  const controllingKeys = (entry: CommandCatalogEntry): Set<string> => new Set(entry.fields
    .flatMap(field => (field.visibleWhen === undefined ? [] : conditionFields(field.visibleWhen))));

  /**
   * Makes a different value of the same kind, for an input that can take one.
   * @param {CommandField} field The input.
   * @param {JsonValue | undefined} value Its value.
   * @returns {JsonValue | undefined} Another value, or undefined when the input is not one to perturb.
   */
  const perturbed = (field: CommandField, value: JsonValue | undefined): JsonValue | undefined =>
  {
    if (typeof value === 'number' && field.kind !== 'select')
    {
      return value + 1;
    }

    if (typeof value === 'boolean')
    {
      return value === false;
    }

    // an empty text on lines reads the same with no lines as with one empty line, so it has nothing to restore to.
    if (typeof value === 'string' && (field.kind === 'text' || field.kind === 'multiline') && (field.lines === undefined || value !== ''))
    {
      return field.lines === undefined
        ? `${value} x`
        : `${value}\nx`;
    }

    return undefined;
  };

  it('finds the shipped lists to check', () =>
  {
    // Arrange: the lists read above.

    // Act.
    const commands = lists.reduce((sum, { list }) => sum + list.length, 0);

    // Assert: a wrong folder would otherwise pass by checking nothing.
    expect([ lists.length > 9000, commands > 50000 ])
      .toStrictEqual([ true, true ]);
  });

  it('nests every code the game uses the way MZ does, as the catalog declares it', () =>
  {
    // Arrange.
    const codes = [ ...new Set(lists.flatMap(({ list }) => list.map(command => command.code))) ];

    // Act.
    const disagreeing = codes.filter(code => jsonEquals(structure.blockOf(code), MZ_STRUCTURE.blockOf(code)) === false
      || structure.continuationOf(code) !== MZ_STRUCTURE.continuationOf(code));

    // Assert.
    expect([ codes.length > 50, disagreeing ])
      .toStrictEqual([ true, [] ]);
  });

  it('reads every list through the catalog with nothing irregular, every command in place', () =>
  {
    // Arrange.
    const failures: string[] = [];

    // Act.
    lists.forEach(({ where, list }) =>
    {
      const tree = readCommandTree(list, structure);
      const indexes = indexesOfTree(tree);
      if (tree.irregular !== 0 || indexes.some((value, position) => value !== position) || indexes.length !== list.length)
      {
        failures.push(where);
      }
    });

    // Assert.
    expect(failures)
      .toStrictEqual([]);
  });

  it('resolves every command to an entry that describes it', () =>
  {
    // Arrange.
    const failures: string[] = [];

    // Act.
    lists.forEach(({ where, list }) => list.forEach((command, index) =>
    {
      const entry = catalog.resolve(command);
      const [ plugin, name ] = command.parameters;
      const described = command.code === 357
        ? entry.plugin?.name === plugin && entry.plugin?.command === name
        : entry.id === `core:${command.code}`;
      if (described === false)
      {
        failures.push(`${where}@${index} code ${command.code} as ${entry.id}`);
      }
    }));

    // Assert.
    expect(failures)
      .toStrictEqual([]);
  });

  it('reads every row as a sentence', () =>
  {
    // Arrange.
    const failures: string[] = [];
    let rows = 0;

    // Act.
    lists.forEach(({ where, list }) =>
    {
      const tree = readCommandTree(list, structure);
      const locations = locateCommands(tree);
      buildListRows(tree, () => false).forEach(row =>
      {
        rows += 1;
        const location = locations.get(row.index)!;
        const command = list[row.index];
        try
        {
          const sentence = renderSentence(catalog.resolve(command), command, list.slice(row.index + 1, headEnd(location, row.index)));
          if (row.kind !== 'terminator' && sentence.trim() === '')
          {
            failures.push(`${where}@${row.index}: empty`);
          }
        }
        catch (error)
        {
          failures.push(`${where}@${row.index}: ${(error as Error).message}`);
        }
      });
    });

    // Assert: the floor sits well under today's 37,830 rows, so new content never trips it.
    expect([ rows > 30000, failures ])
      .toStrictEqual([ true, [] ]);
  });

  it('opens an editor for every command, and every editor reads it back exactly', () =>
  {
    // Arrange.
    const failures: string[] = [];
    const kinds = new Map<RowEditorKind, number>();

    // Act.
    forEachEditableRow(({ where, entry, draft }) =>
    {
      const kind = chooseRowEditor(registry, entry, draft);
      kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
      if (kind === 'generated')
      {
        // every input shown writes back its own value without changing a thing.
        const values = formValues(entry, draft);
        const rewritten = entry.fields
          .filter(field => isFieldVisible(field, values) && values[field.key] !== undefined)
          .reduce((current, field) => applyFieldChange(entry, current, field.key, values[field.key] as JsonValue), draft);
        if (rewritten !== draft)
        {
          failures.push(`${where}: generated form rewrote it`);
        }
      }

      if (kind === 'raw')
      {
        const read = readRawCommandText(rawCommandText(draft), draft, entry.continuation);
        if (read.ok === false || jsonEquals(read.draft, draft) === false)
        {
          failures.push(`${where}: raw editor changed it`);
        }
      }
    });

    // Assert: until the hand-built editors are wired in, every command opens the generated form (25,516 today) or,
    // for plugin commands whose header is not read yet, the raw JSON (744); none opens a hand-built one.
    expect([ failures, (kinds.get('generated') ?? 0) > 20000, (kinds.get('raw') ?? 0) > 500, kinds.get('hand-built') ?? 0 ])
      .toStrictEqual([ [], true, true, 0 ]);
  });

  it('saves every input changed and changed back with nothing else touched', () =>
  {
    // Arrange.
    const failures: string[] = [];
    let checked = 0;

    // Act.
    forEachEditableRow(({ where, entry, draft }) =>
    {
      if (chooseRowEditor(registry, entry, draft) !== 'generated')
      {
        return;
      }

      const controlling = controllingKeys(entry);
      const values = formValues(entry, draft);
      entry.fields
        .filter(field => controlling.has(field.key) === false && isFieldVisible(field, values))
        .forEach(field =>
        {
          const original = values[field.key];
          const other = perturbed(field, original);
          if (other === undefined)
          {
            return;
          }

          checked += 1;
          const changed = applyFieldChange(entry, draft, field.key, other);
          const restored = applyFieldChange(entry, changed, field.key, original as JsonValue);
          if (jsonEquals(changed, draft) || jsonEquals(restored, draft) === false)
          {
            failures.push(`${where}.${field.key}`);
          }
        });
    });

    // Assert.
    expect([ checked > 30000, failures.slice(0, 20) ])
      .toStrictEqual([ true, [] ]);
  });

  it('reconciles every Show Choices and battle in the game to exactly what it is', () =>
  {
    // Arrange.
    const failures: string[] = [];
    let blocks = 0;

    // Act.
    lists.forEach(({ where, list }) => list.forEach((command, index) =>
    {
      if (command.code === 102 || command.code === 301)
      {
        blocks += 1;
        if (jsonEquals(reconcileBlock(list, structure, index), list) === false)
        {
          failures.push(`${where}@${index}`);
        }
      }
    }));

    // Assert.
    expect([ blocks > 150, failures ])
      .toStrictEqual([ true, [] ]);
  });

  it('copies and pastes every list whole, with nothing lost', () =>
  {
    // Arrange.
    const failures: string[] = [];

    // Act.
    lists.forEach(({ where, list }) =>
    {
      const tree = readCommandTree(list, structure);
      if (tree.root.nodes.length === 0)
      {
        return;
      }

      const read = readClipboard(writeClipboard(commandsOfNodes(list, tree.root.nodes)), structure);
      const empty = [ { code: 0, indent: 0, parameters: [] } ];
      const pasted = read.ok
        ? insertAt(empty, { body: readCommandTree(empty, structure).root, position: 0 }, read.commands)
        : [];
      if (jsonEquals(pasted, list) === false)
      {
        failures.push(where);
      }
    });

    // Assert.
    expect(failures)
      .toStrictEqual([]);
  });

  it('moves every list\'s first unit to the end and back, with nothing lost', () =>
  {
    // Arrange.
    const failures: string[] = [];

    // Act.
    lists.forEach(({ where, list }) =>
    {
      const tree = readCommandTree(list, structure);
      if (tree.root.nodes.length < 2)
      {
        return;
      }

      const [ first ] = tree.root.nodes;
      const away = moveNodes(list, [ first ], { body: tree.root, position: tree.root.nodes.length });
      const awayTree = readCommandTree(away, structure);
      const moved = awayTree.root.nodes[awayTree.root.nodes.length - 1];
      const back = moveNodes(away, [ moved ], { body: awayTree.root, position: 0 });
      if (awayTree.irregular !== 0 || jsonEquals(back, list) === false)
      {
        failures.push(where);
      }
    });

    // Assert.
    expect(failures)
      .toStrictEqual([]);
  });

  it('keeps both of the game\'s merged Show Choices runs merged', () =>
  {
    // Arrange: the two runs HIME_LargeChoices merges, by where they are.
    const runs = [ [ 'Map001.json#49/0', 60 ], [ 'Map221.json#1/0', 34 ] ] as const;

    // Act.
    const kept = runs.map(([ where, index ]) =>
    {
      const { list } = lists.find(each => each.where === where) as RealCommandList;
      const reconciled = reconcileBlock(reconcileBlock(list, structure, index), structure, index - 1 - list.slice(0, index).reverse().findIndex(command => command.code === 102));
      return [ joinsChoicesAbove(list, index), joinsChoicesAbove(reconciled, index), jsonEquals(reconciled, list) ];
    });

    // Assert.
    expect(kept)
      .toStrictEqual([ [ true, true, true ], [ true, true, true ] ]);
  });

  it('finds every trigger area where KMS_AreaEvent reads it', () =>
  {
    // Arrange.
    const tags: string[] = [];

    // Act.
    lists.forEach(({ where, list }) => list.forEach((command, index) =>
    {
      const tag = command.code === 108 ? areaEventTag(list, index) : null;
      if (tag !== null)
      {
        tags.push(`${where} ${tag.width}x${tag.height} ${tag.effective ? 'read' : 'unread'}`);
      }
    }));

    // Assert: every tag the game holds is in its page's top comments.
    expect([ tags.length > 400, tags.filter(tag => tag.endsWith('unread')) ])
      .toStrictEqual([ true, [] ]);
  });
});
