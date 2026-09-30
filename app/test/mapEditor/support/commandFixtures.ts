import type { CommandBlock } from '../../../src/mapEditor/core/commands/catalogTypes.ts';
import type { CommandStructure } from '../../../src/mapEditor/core/commandList/commandTree.ts';
import type { JsonValue } from '../../../src/mapEditor/core/model/json.ts';
import type { RmmzEventCommand } from '../../../src/mapEditor/core/model/rmmzTypes.ts';

/**
 * Builds one command.
 * @param {number} code The code.
 * @param {number} indent The indent.
 * @param {JsonValue[]} parameters The parameters.
 * @returns {RmmzEventCommand} The command.
 */
const cmd = (code: number, indent: number, parameters: JsonValue[] = []): RmmzEventCommand =>
{
  return { code, indent, parameters };
};

/**
 * The blocks MZ writes, as the catalog declares them.
 */
const BLOCKS: ReadonlyMap<number, CommandBlock> = new Map<number, CommandBlock>([
  [ 102, { end: 404, branches: [ 402, 403 ] } ],
  [ 109, { end: 409 } ],
  [ 111, { end: 412, branches: [ 411 ] } ],
  [ 112, { end: 413 } ],
  [ 301, { end: 604, branches: [ 601, 602, 603 ] } ],
]);

/**
 * The continuation lines MZ writes, as the catalog declares them.
 */
const CONTINUATIONS: ReadonlyMap<number, number> = new Map([
  [ 101, 401 ],
  [ 105, 405 ],
  [ 108, 408 ],
  [ 205, 505 ],
  [ 302, 605 ],
  [ 355, 655 ],
  [ 357, 657 ],
]);

/**
 * How MZ's commands nest, written out by hand so tree tests do not depend on the catalog they help check.
 */
const MZ_STRUCTURE: CommandStructure = {
  blockOf: (code: number) => BLOCKS.get(code) ?? null,
  continuationOf: (code: number) => CONTINUATIONS.get(code) ?? null,
};

/**
 * A page that uses every shape: a line with continuation, a branch with an else holding a nested loop, choices
 * with a cancel branch, and the list's end. Indexes are noted beside each command.
 * @returns {RmmzEventCommand[]} The list.
 */
const buildMixedList = (): RmmzEventCommand[] =>
{
  return [
    cmd(101, 0, [ 'Actor1', 0, 0, 2, 'Harold' ]), // 0
    cmd(401, 0, [ 'Hello.' ]), // 1
    cmd(401, 0, [ 'Again.' ]), // 2
    cmd(111, 0, [ 0, 1, 0 ]), // 3
    cmd(250, 1, [ { name: 'Heal1', volume: 90, pitch: 100, pan: 0 } ]), // 4
    cmd(0, 1), // 5
    cmd(411, 0), // 6
    cmd(112, 1), // 7
    cmd(113, 2), // 8
    cmd(0, 2), // 9
    cmd(413, 1), // 10
    cmd(0, 1), // 11
    cmd(412, 0), // 12
    cmd(102, 0, [ [ 'Yes', 'No' ], -2, 0, 2, 0 ]), // 13
    cmd(402, 0, [ 0, 'Yes' ]), // 14
    cmd(230, 1, [ 30 ]), // 15
    cmd(0, 1), // 16
    cmd(402, 0, [ 1, 'No' ]), // 17
    cmd(0, 1), // 18
    cmd(403, 0, [ 6, null ]), // 19
    cmd(0, 1), // 20
    cmd(404, 0), // 21
    cmd(0, 0), // 22
  ];
};

export { buildMixedList, cmd, MZ_STRUCTURE };
