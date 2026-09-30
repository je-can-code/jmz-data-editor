import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { blockSpanAt } from '../../../../../src/mapEditor/core/commands/editors/blockSpan.ts';
import { parseCondition, parseConditionalBranchBlock, writeCondition, writeConditionalBranchBlock } from '../../../../../src/mapEditor/core/commands/editors/conditionalBranch.ts';
import { parseControlVariables, writeControlVariables } from '../../../../../src/mapEditor/core/commands/editors/controlVariables.ts';
import { parseSetMovementRoute, writeSetMovementRoute } from '../../../../../src/mapEditor/core/commands/editors/moveRoute.ts';
import { parsePluginCommand, writePluginCommand } from '../../../../../src/mapEditor/core/commands/editors/pluginCommand.ts';
import { parseScript, writeScript } from '../../../../../src/mapEditor/core/commands/editors/script.ts';
import { parseChoiceList, writeChoiceList } from '../../../../../src/mapEditor/core/commands/editors/showChoices.ts';
import { parseShowText, writeShowText } from '../../../../../src/mapEditor/core/commands/editors/showText.ts';
import { parseTransferPlayer, writeTransferPlayer } from '../../../../../src/mapEditor/core/commands/editors/transferPlayer.ts';
import { parsePluginHeader } from '../../../../../src/mapEditor/core/commands/pluginHeaders/parsePluginHeader.ts';
import { PluginHeaderLibrary } from '../../../../../src/mapEditor/core/commands/pluginHeaders/PluginHeaderLibrary.ts';
import type { RmmzEventCommand, RmmzMap } from '../../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { readPluginEntries } from '../../../../../src/services/plugins/PluginsJsReader.ts';
import { listMapFiles, locateGameProject, readDataFile } from '../../../../support/gameProject.ts';

/*
 * Nothing is lost, command by command.
 *
 * The eight hand-built editors (Show Text, Show Choices, Conditional Branch, Control Variables, Set Movement
 * Route, Transfer Player, Plugin Command, Script) each read a command into something an author can edit and
 * write it back. That pair owes the game one thing above all: a command nobody changed comes back byte for
 * byte. The server stores command lists as raw JSON, so "the same" here means the same text, key order included,
 * not merely equal values.
 *
 * Every real command of those codes goes through, in every shipped map and in CommonEvents.json: Show Choices
 * as the whole list HIME_LargeChoices merges, conditional branches both on their own and as whole blocks, plugin
 * commands against the headers of the plugins actually enabled. A command an editor refuses to read would open
 * as uneditable, so refusals count as failures too. It skips when the game is not present.
 */
const project = locateGameProject();

/**
 * One command list, and where it came from, for failure messages.
 */
type LocatedList = {
  readonly where: string;
  readonly list: readonly RmmzEventCommand[];
};

/**
 * Collects every command list in the game: each page of each map event, then each common event.
 * @param {string} root The project root.
 * @returns {LocatedList[]} The lists.
 */
const collectLists = (root: string): LocatedList[] =>
{
  const pages = listMapFiles(root).flatMap(file =>
  {
    const map = readDataFile(root, file) as RmmzMap;
    return map.events.flatMap(event => (event === null
      ? []
      : event.pages.map((page, pageIndex) => ({ where: `${file} event ${event.id} page ${pageIndex + 1}`, list: page.list }))));
  });

  const commons = (readDataFile(root, 'CommonEvents.json') as ({ id: number; list: RmmzEventCommand[] } | null)[])
    .flatMap(commonEvent => (commonEvent === null ? [] : [ { where: `common event ${commonEvent.id}`, list: commonEvent.list } ]));

  return [ ...pages, ...commons ];
};

/**
 * Reads the headers of every enabled plugin the game ships.
 * @param {string} root The project root.
 * @returns {PluginHeaderLibrary} The headers.
 */
const readHeaders = (root: string): PluginHeaderLibrary =>
{
  const entries = readPluginEntries(readFileSync(`${root}/js/plugins.js`, 'utf8')).filter(entry => entry.status);
  return new PluginHeaderLibrary(entries
    .filter(entry => existsSync(`${root}/js/plugins/${entry.name}.js`))
    .map(entry => parsePluginHeader(entry.name, readFileSync(`${root}/js/plugins/${entry.name}.js`, 'utf8'))));
};

/**
 * Lists the lines of one code that follow a command.
 * @param {readonly RmmzEventCommand[]} list The command list.
 * @param {number} index The command.
 * @param {number} code The code of its lines.
 * @returns {RmmzEventCommand[]} The lines.
 */
const linesAfter = (list: readonly RmmzEventCommand[], index: number, code: number): RmmzEventCommand[] =>
{
  const lines: RmmzEventCommand[] = [];
  for (let at = index + 1; at < list.length && list[at].code === code; at++)
  {
    lines.push(list[at]);
  }

  return lines;
};

/**
 * Compares two values as the text the server would write.
 * @param {unknown} left One value.
 * @param {unknown} right The other.
 * @returns {boolean} True when they serialise identically.
 */
const sameText = (left: unknown, right: unknown): boolean =>
{
  return JSON.stringify(left) === JSON.stringify(right);
};

/**
 * Runs every command of one code through a check, collecting where it failed.
 * @param {readonly LocatedList[]} lists The command lists.
 * @param {number} code The code.
 * @param {(list: readonly RmmzEventCommand[], index: number) => boolean} check True when the command at the index round-trips.
 * @returns {{ checked: number, failures: string[] }} How many were checked, and where each failure was.
 */
const checkEvery = (
  lists: readonly LocatedList[],
  code: number,
  check: (list: readonly RmmzEventCommand[], index: number) => boolean,
): { checked: number; failures: string[] } =>
{
  let checked = 0;
  const failures: string[] = [];
  lists.forEach(({ where, list }) => list.forEach((command, index) =>
  {
    if (command.code !== code)
    {
      return;
    }

    checked += 1;
    if (check(list, index) === false)
    {
      failures.push(`${where}, line ${index + 1}`);
    }
  }));

  return { checked, failures };
};

describe.skipIf(project === null)('the hand-built editors lose nothing', () =>
{
  const lists = project === null ? [] : collectLists(project);

  it('reads and writes back every Show Text exactly', () =>
  {
    // Arrange: every map page and common event.

    // Act.
    const { checked, failures } = checkEvery(lists, 101, (list, index) =>
    {
      const continuation = linesAfter(list, index, 401);
      const model = parseShowText(list[index], continuation);
      return model !== null && sameText(writeShowText(list[index], continuation, model), { command: list[index], continuation });
    });

    // Assert: something was checked, and nothing failed.
    expect(checked)
      .toBeGreaterThan(0);
    expect(failures)
      .toStrictEqual([]);
  });

  it('reads and writes back every Show Choices list exactly, merged the way HIME_LargeChoices merges it', () =>
  {
    // Arrange: every map page and common event.

    // Act.
    const { checked, failures } = checkEvery(lists, 102, (list, index) =>
    {
      const span = blockSpanAt(list, index);
      const commands = span === null ? [] : list.slice(span.start, span.end);
      const model = parseChoiceList(commands);
      return model !== null && sameText(writeChoiceList(model), commands);
    });

    // Assert.
    expect(checked)
      .toBeGreaterThan(0);
    expect(failures)
      .toStrictEqual([]);
  });

  it('reads and writes back every conditional branch exactly, on its own and as a whole block', () =>
  {
    // Arrange: every map page and common event.

    // Act.
    const { checked, failures } = checkEvery(lists, 111, (list, index) =>
    {
      const condition = parseCondition(list[index]);
      const span = blockSpanAt(list, index);
      const commands = span === null ? [] : list.slice(span.start, span.end);
      const block = parseConditionalBranchBlock(commands);
      return condition !== null
        && block !== null
        && sameText(writeCondition(list[index], condition), list[index])
        && sameText(writeConditionalBranchBlock(commands, block), commands);
    });

    // Assert.
    expect(checked)
      .toBeGreaterThan(0);
    expect(failures)
      .toStrictEqual([]);
  });

  it('reads and writes back every Control Variables exactly', () =>
  {
    // Arrange: every map page and common event.

    // Act.
    const { checked, failures } = checkEvery(lists, 122, (list, index) =>
    {
      const model = parseControlVariables(list[index]);
      return model !== null && sameText(writeControlVariables(list[index], model), list[index]);
    });

    // Assert.
    expect(checked)
      .toBeGreaterThan(0);
    expect(failures)
      .toStrictEqual([]);
  });

  it('reads and writes back every Set Movement Route exactly, rebuilding the lines that repeat its steps', () =>
  {
    // Arrange: every map page and common event.

    // Act.
    const { checked, failures } = checkEvery(lists, 205, (list, index) =>
    {
      const continuation = linesAfter(list, index, 505);
      const model = parseSetMovementRoute(list[index], continuation);
      return model !== null && sameText(writeSetMovementRoute(list[index], model), { command: list[index], continuation });
    });

    // Assert.
    expect(checked)
      .toBeGreaterThan(0);
    expect(failures)
      .toStrictEqual([]);
  });

  it('reads and writes back every Transfer Player exactly', () =>
  {
    // Arrange: every map page and common event.

    // Act.
    const { checked, failures } = checkEvery(lists, 201, (list, index) =>
    {
      const model = parseTransferPlayer(list[index]);
      return model !== null && sameText(writeTransferPlayer(list[index], model), list[index]);
    });

    // Assert.
    expect(checked)
      .toBeGreaterThan(0);
    expect(failures)
      .toStrictEqual([]);
  });

  it('reads and writes back every Script exactly', () =>
  {
    // Arrange: every map page and common event.

    // Act.
    const { checked, failures } = checkEvery(lists, 355, (list, index) =>
    {
      const continuation = linesAfter(list, index, 655);
      const model = parseScript(list[index], continuation);
      return model !== null && sameText(writeScript(list[index], continuation, model), { command: list[index], continuation });
    });

    // Assert.
    expect(checked)
      .toBeGreaterThan(0);
    expect(failures)
      .toStrictEqual([]);
  });

  it('reads and writes back every plugin command exactly, against the enabled plugins\' own headers', () =>
  {
    // Arrange.
    const headers = readHeaders(project as string);
    const distinct = new Set<string>();

    // Act.
    const { checked, failures } = checkEvery(lists, 357, (list, index) =>
    {
      const continuation = linesAfter(list, index, 657);
      const model = parsePluginCommand(list[index], continuation);
      if (model === null)
      {
        return false;
      }

      distinct.add(`${model.plugin}:${model.command}`);
      const schema = headers.command(model.plugin, model.command);
      return sameText(writePluginCommand(list[index], continuation, model, schema), { command: list[index], continuation });
    });

    // Assert: every plugin command the plan counted is among them, and none failed.
    expect([ checked > 0, distinct.size >= 57 ])
      .toStrictEqual([ true, true ]);
    expect(failures)
      .toStrictEqual([]);
  });
});
