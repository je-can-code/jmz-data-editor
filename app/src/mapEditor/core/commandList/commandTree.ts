import type { CommandBlock } from '../commands/catalogTypes.ts';
import type { CommandCatalog } from '../commands/CommandCatalog.ts';
import type { RmmzEventCommand } from '../model/rmmzTypes.ts';

/**
 * The code of the empty command. One ends the whole list, and one ends every block body, one indent deeper than
 * the block: MZ writes both, and the game reads the body's end from it.
 */
const END_CODE = 0;

/**
 * How commands nest: which codes open a block (with the branches inside it and the code closing it), and which
 * codes continue the command before them (Show Text's 401 lines). The catalog knows both; the tree only asks.
 */
type CommandStructure = {
  /**
   * Finds the block a code opens.
   * @param {number} code The command code.
   * @returns {CommandBlock | null} The block, or null when the code opens none.
   */
  blockOf(code: number): CommandBlock | null;

  /**
   * Finds the code of the lines that continue a command.
   * @param {number} code The command code.
   * @returns {number | null} The continuation code, or null when nothing continues it.
   */
  continuationOf(code: number): number | null;
};

/**
 * One command and the lines that continue it: Show Text with its text, a comment with its lines, a plugin
 * command with the lines MZ shows under it.
 */
type CommandLine = {
  readonly kind: 'line';

  /**
   * The command's index in the list.
   */
  readonly start: number;

  /**
   * One past its last continuation line.
   */
  readonly end: number;

  readonly indent: number;

  /**
   * The body it sits in.
   */
  readonly parent: CommandBody;
};

/**
 * One part of a block: its head (the opener, or a branch such as a choice or an else) and what runs under it.
 */
type BlockSegment = {
  /**
   * The head command's index.
   */
  readonly head: number;

  /**
   * The commands under the head, or null for a head with nothing under it (Show Choices itself, whose commands
   * sit under its choices).
   */
  readonly body: CommandBody | null;

  /**
   * The block it belongs to.
   */
  readonly block: CommandBlockNode;
};

/**
 * A command that opens a block, everything inside it and the command closing it: a conditional branch through
 * its end, a Show Choices through its end, a loop through its repeat.
 */
type CommandBlockNode = {
  readonly kind: 'block';

  /**
   * The opener's index.
   */
  readonly start: number;

  /**
   * One past the closing command.
   */
  readonly end: number;

  readonly indent: number;

  /**
   * The opener's segment first, then each branch in order.
   */
  readonly segments: readonly BlockSegment[];

  /**
   * The closing command's index.
   */
  readonly closer: number;

  /**
   * The body it sits in.
   */
  readonly parent: CommandBody;
};

/**
 * One unit of a command list: what a row selects, copies and drags as a whole.
 */
type CommandNode = CommandLine | CommandBlockNode;

/**
 * A run of commands at one indent, closed by an empty command: the whole list, or what runs under one block head.
 */
type CommandBody = {
  readonly indent: number;

  /**
   * The units in it, in order.
   */
  readonly nodes: readonly CommandNode[];

  /**
   * The empty command closing it, or null when the list strays from MZ's shape and it has none.
   */
  readonly terminator: number | null;

  /**
   * The index of its first command, or of its terminator when it is empty.
   */
  readonly start: number;

  /**
   * One past its terminator, or past its last unit when it has none.
   */
  readonly end: number;

  /**
   * The block segment it runs under, or null for the whole list.
   */
  readonly owner: BlockSegment | null;
};

/**
 * What a command's place in the list is.
 *
 * - {@code line}: a command heading a line of its own.
 * - {@code continuation}: a line continuing the command above it.
 * - {@code opener}: the command opening a block.
 * - {@code branch}: a branch inside a block, such as a choice or an else.
 * - {@code closer}: the command closing a block.
 * - {@code terminator}: the empty command closing a body.
 */
type CommandRole = 'line' | 'continuation' | 'opener' | 'branch' | 'closer' | 'terminator';

/**
 * Where one command sits.
 */
type CommandLocation = {
  readonly role: CommandRole;

  /**
   * The unit the command belongs to; for a terminator, the block whose body it closes, or null at the list's end.
   */
  readonly node: CommandNode | null;

  /**
   * The body the unit sits in; for a terminator, the body it closes.
   */
  readonly body: CommandBody;

  /**
   * For an opener or a branch, its segment.
   */
  readonly segment: BlockSegment | null;
};

/**
 * A command list read as nested units. Every command of the list belongs to exactly one place in it, in order, so
 * reading the tree back out always gives the list it came from.
 */
type CommandTree = {
  /**
   * The list it was read from.
   */
  readonly list: readonly RmmzEventCommand[];

  /**
   * The whole list's body.
   */
  readonly root: CommandBody;

  /**
   * Commands after the list's own end, which MZ never writes; kept as they are.
   */
  readonly trailing: readonly CommandNode[];

  /**
   * How many places the list strays from the shapes MZ writes: a block with no end, a command at an indent no
   * block explains, a body with no end. Every shipped list reads with none.
   */
  readonly irregular: number;
};

/**
 * Lets a value built up field by field be written until it is handed out.
 */
type Draft<T> = { -readonly [K in keyof T]: T[K] };

/**
 * Reads one list into a tree, counting the places it strays from MZ's shapes rather than refusing it, so even a
 * list another tool mangled shows and saves exactly as it is.
 */
class TreeReader
{
  readonly list: readonly RmmzEventCommand[];

  irregular = 0;

  #structure: CommandStructure;

  /**
   * @param {readonly RmmzEventCommand[]} list The list.
   * @param {CommandStructure} structure How its commands nest.
   */
  constructor(list: readonly RmmzEventCommand[], structure: CommandStructure)
  {
    this.list = list;
    this.#structure = structure;
  }

  /**
   * Reads a body: units at its indent until the empty command closing it.
   * @param {number} index Where it starts.
   * @param {number} indent Its indent.
   * @param {BlockSegment | null} owner The segment it runs under, or null for the whole list.
   * @returns {CommandBody} The body.
   */
  body(index: number, indent: number, owner: BlockSegment | null): CommandBody
  {
    const nodes: CommandNode[] = [];
    const body: Draft<CommandBody> = { indent, nodes, terminator: null, start: index, end: index, owner };
    let position = index;
    while (position < this.list.length)
    {
      const command = this.list[position];
      if (command.code === END_CODE && command.indent === indent)
      {
        body.terminator = position;
        body.end = position + 1;
        return body;
      }

      // a shallower command means the body ended without its empty command.
      if (command.indent < indent)
      {
        break;
      }

      const node = this.#node(position, indent, body);
      nodes.push(node);
      position = node.end;
    }

    // a body that runs out of commands, or out of its indent, never met its end.
    this.irregular += 1;
    body.end = position;
    return body;
  }

  /**
   * Reads the commands left over after the list's own end, each as a unit at its own indent.
   * @param {number} index Where they start.
   * @param {CommandBody} root The list's body, which they are shown beside.
   * @returns {CommandNode[]} The units.
   */
  trailing(index: number, root: CommandBody): CommandNode[]
  {
    const nodes: CommandNode[] = [];
    let position = index;
    while (position < this.list.length)
    {
      this.irregular += 1;
      const node = this.#line(position, root);
      nodes.push(node);
      position = node.end;
    }

    return nodes;
  }

  /**
   * Reads one unit: a block when the command opens one and its shape completes, a line otherwise.
   * @param {number} index The command's index.
   * @param {number} indent The indent the body expects.
   * @param {CommandBody} parent The body it sits in.
   * @returns {CommandNode} The unit.
   */
  #node(index: number, indent: number, parent: CommandBody): CommandNode
  {
    const command = this.list[index];

    // a command deeper than its body, with no block above to explain it, is kept as a line where it is.
    if (command.indent !== indent)
    {
      this.irregular += 1;
      return this.#line(index, parent);
    }

    const block = this.#structure.blockOf(command.code);
    const node = block === null
      ? null
      : this.#block(index, indent, block, parent);

    return node ?? this.#line(index, parent);
  }

  /**
   * Reads a command and the lines continuing it.
   * @param {number} index The command's index.
   * @param {CommandBody} parent The body it sits in.
   * @returns {CommandLine} The line.
   */
  #line(index: number, parent: CommandBody): CommandLine
  {
    const { code, indent } = this.list[index];
    const continuation = this.#structure.continuationOf(code);
    let end = index + 1;
    while (continuation !== null && end < this.list.length && this.list[end].code === continuation && this.list[end].indent === indent)
    {
      end += 1;
    }

    return { kind: 'line', start: index, end, indent, parent };
  }

  /**
   * Reads a block: its opener and each branch, each with the body under it when there is one, through the code
   * closing it. A block whose shape never completes is not one after all (a battle with no outcome branches is a
   * plain command), and reading it leaves no trace.
   * @param {number} index The opener's index.
   * @param {number} indent The block's indent.
   * @param {CommandBlock} spec The block's shape.
   * @param {CommandBody} parent The body it sits in.
   * @returns {CommandBlockNode | null} The block, or null when the shape never completes.
   */
  #block(index: number, indent: number, spec: CommandBlock, parent: CommandBody): CommandBlockNode | null
  {
    const irregularBefore = this.irregular;
    const segments: BlockSegment[] = [];
    const node: Draft<CommandBlockNode> = { kind: 'block', start: index, end: index, indent, segments, closer: index, parent };
    const branches = spec.branches ?? [];
    let head = index;
    while (head < this.list.length)
    {
      // a body follows its head exactly when the next command sits deeper.
      const segment: Draft<BlockSegment> = { head, body: null, block: node };
      const next = this.list[head + 1];
      if (next !== undefined && next.indent > indent)
      {
        segment.body = this.body(head + 1, indent + 1, segment);
      }

      segments.push(segment);
      const after = segment.body === null
        ? head + 1
        : segment.body.end;
      const following = this.list[after];
      if (following === undefined || following.indent !== indent)
      {
        break;
      }

      if (branches.includes(following.code))
      {
        head = after;
        continue;
      }

      if (following.code === spec.end)
      {
        node.closer = after;
        node.end = after + 1;
        return node;
      }

      break;
    }

    // the shape never completed, so whatever was counted inside it is read again as plain lines.
    this.irregular = irregularBefore;
    return null;
  }
}

/**
 * Reads a command list into nested units. Never throws: a list that strays from MZ's shapes is read as far as it
 * goes, and the strays are counted in {@link CommandTree.irregular}.
 * @param {readonly RmmzEventCommand[]} list The list.
 * @param {CommandStructure} structure How its commands nest.
 * @returns {CommandTree} The tree.
 */
const readCommandTree = (list: readonly RmmzEventCommand[], structure: CommandStructure): CommandTree =>
{
  const reader = new TreeReader(list, structure);
  const root = reader.body(0, 0, null);
  const trailing = reader.trailing(root.end, root);
  return { list, root, trailing, irregular: reader.irregular };
};

/**
 * Lists every command index a unit covers, in order, walking its segments and bodies.
 * @param {CommandNode} node The unit.
 * @returns {number[]} The indexes.
 */
const indexesOfNode = (node: CommandNode): number[] =>
{
  if (node.kind === 'line')
  {
    return Array.from({ length: node.end - node.start }, (_, offset) => node.start + offset);
  }

  const inside = node.segments.flatMap(segment => [
    segment.head,
    ...(segment.body === null ? [] : indexesOfBody(segment.body)),
  ]);

  return [ ...inside, node.closer ];
};

/**
 * Lists every command index a body covers, in order: its units, then its terminator.
 * @param {CommandBody} body The body.
 * @returns {number[]} The indexes.
 */
const indexesOfBody = (body: CommandBody): number[] =>
{
  const inside = body.nodes.flatMap(indexesOfNode);
  return body.terminator === null
    ? inside
    : [ ...inside, body.terminator ];
};

/**
 * Lists every command index the tree covers, in the order the tree holds them. For any list this is exactly
 * 0, 1, 2 and so on to the end, which is what makes a tree safe to edit through.
 * @param {CommandTree} tree The tree.
 * @returns {number[]} The indexes.
 */
const indexesOfTree = (tree: CommandTree): number[] =>
{
  return [ ...indexesOfBody(tree.root), ...tree.trailing.flatMap(indexesOfNode) ];
};

/**
 * Records where every command of a body sits.
 * @param {CommandBody} body The body.
 * @param {Map<number, CommandLocation>} locations Filled in.
 */
const locateBody = (body: CommandBody, locations: Map<number, CommandLocation>): void =>
{
  body.nodes.forEach(node => locateNode(node, locations));
  if (body.terminator !== null)
  {
    locations.set(body.terminator, { role: 'terminator', node: body.owner?.block ?? null, body, segment: body.owner });
  }
};

/**
 * Records where every command of a unit sits.
 * @param {CommandNode} node The unit.
 * @param {Map<number, CommandLocation>} locations Filled in.
 */
const locateNode = (node: CommandNode, locations: Map<number, CommandLocation>): void =>
{
  const body = node.parent;
  if (node.kind === 'line')
  {
    locations.set(node.start, { role: 'line', node, body, segment: null });
    for (let index = node.start + 1; index < node.end; index++)
    {
      locations.set(index, { role: 'continuation', node, body, segment: null });
    }

    return;
  }

  node.segments.forEach((segment, position) =>
  {
    locations.set(segment.head, { role: position === 0 ? 'opener' : 'branch', node, body, segment });
    if (segment.body !== null)
    {
      locateBody(segment.body, locations);
    }
  });
  locations.set(node.closer, { role: 'closer', node, body, segment: null });
};

/**
 * Builds a lookup of where every command of a tree sits, by index.
 * @param {CommandTree} tree The tree.
 * @returns {Map<number, CommandLocation>} The locations.
 */
const locateCommands = (tree: CommandTree): Map<number, CommandLocation> =>
{
  const locations = new Map<number, CommandLocation>();
  locateBody(tree.root, locations);
  tree.trailing.forEach(node => locateNode(node, locations));
  return locations;
};

/**
 * Finds one past the commands a head spans: a line's continuation, or just the head itself for a block's opener
 * and branches, whose commands sit in their bodies.
 * @param {CommandLocation} location Where the head sits.
 * @param {number} index The head's index.
 * @returns {number} One past its last command.
 */
const headEnd = (location: CommandLocation, index: number): number =>
{
  return location.role === 'line' && location.node !== null
    ? location.node.end
    : index + 1;
};

/**
 * Reports whether a body lies inside a unit, at any depth.
 * @param {CommandBody} body The body.
 * @param {CommandNode} node The unit.
 * @returns {boolean} True when the body runs under one of the unit's segments, or deeper.
 */
const isBodyInside = (body: CommandBody, node: CommandNode): boolean =>
{
  let current: CommandBody | null = body;
  while (current !== null && current.owner !== null)
  {
    if (current.owner.block === node)
    {
      return true;
    }

    current = current.owner.block.parent;
  }

  return false;
};

/**
 * Builds the structure the catalog describes: each code's block and continuation, as its entry declares them.
 * Answers are kept per code, since every list asks about the same few codes thousands of times.
 * @param {CommandCatalog} catalog The catalog.
 * @returns {CommandStructure} The structure.
 */
const catalogStructure = (catalog: CommandCatalog): CommandStructure =>
{
  const blocks = new Map<number, CommandBlock | null>();
  const continuations = new Map<number, number | null>();

  /**
   * Finds the entry for a bare command of a code; plugin commands all share one shape, so any stands for them.
   * @param {number} code The code.
   * @returns {ReturnType<CommandCatalog['resolve']>} The entry.
   */
  const entryOf = (code: number) => catalog.resolve({ code, indent: 0, parameters: [] });

  return {
    blockOf: (code: number) =>
    {
      if (blocks.has(code) === false)
      {
        blocks.set(code, entryOf(code).block ?? null);
      }

      return blocks.get(code) ?? null;
    },
    continuationOf: (code: number) =>
    {
      if (continuations.has(code) === false)
      {
        continuations.set(code, entryOf(code).continuation ?? null);
      }

      return continuations.get(code) ?? null;
    },
  };
};

export {
  catalogStructure,
  END_CODE,
  headEnd,
  indexesOfBody,
  indexesOfNode,
  indexesOfTree,
  isBodyInside,
  locateCommands,
  readCommandTree,
};
export type {
  BlockSegment,
  CommandBlockNode,
  CommandBody,
  CommandLine,
  CommandLocation,
  CommandNode,
  CommandRole,
  CommandStructure,
  CommandTree,
};
