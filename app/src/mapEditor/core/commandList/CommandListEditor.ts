import type { CommandCatalogEntry } from '../commands/catalogTypes.ts';
import type { CommandCatalog } from '../commands/CommandCatalog.ts';
import { blockSpanAt, type CommandSpan } from '../commands/editors/blockSpan.ts';
import type { CommandDraft, ListOrigins } from '../commands/fieldValues.ts';
import type { DocumentHub } from '../history/DocumentHub.ts';
import type { HistoryKey } from '../history/historyKeys.ts';
import type { HistoryStep } from '../history/HistoryStep.ts';
import type { DocumentKey } from '../model/documentKeys.ts';
import type { PatchPath } from '../model/patches.ts';
import type { RmmzEventCommand } from '../model/rmmzTypes.ts';
import { reconcileBlock, setElseBranch } from './blockReconcile.ts';
import { readClipboard, writeClipboard, type ClipboardRead } from './commandClipboard.ts';
import {
  catalogStructure,
  headEnd,
  locateCommands,
  readCommandTree,
  type CommandBlockNode,
  type CommandLocation,
  type CommandNode,
  type CommandStructure,
  type CommandTree,
} from './commandTree.ts';
import { insertionIndex, pointBeforeNode, settleInsertion, type InsertionPoint } from './insertionPoints.ts';
import {
  asJsonCommands,
  duplicateNodes,
  insertAt,
  landingIndex,
  moveNodes,
  outermostNodes,
  reindent,
  removeNodes,
  replaceRange,
  spliceBetween,
  unitsAtIndent,
} from './listEdits.ts';
import { createCommandUnit } from './newCommand.ts';

/**
 * Which command list an editor edits: a document, the path to the list inside it, and the histories its edits are
 * recorded in (an event window's for a page, a common event's own for a common event).
 */
type CommandListTarget = {
  readonly documentKey: DocumentKey;
  readonly path: PatchPath;
  readonly histories: readonly HistoryKey[];
};

/**
 * What an operation did: the step it recorded (null when it changed nothing), and the index its commands now start
 * at, so the list can select and focus what the operation put there.
 */
type ListOutcome = {
  readonly step: HistoryStep | null;
  readonly index: number;
};

/**
 * What a paste did: the step it recorded and where the pasted units start, how many there are, or why nothing
 * was pasted.
 */
type PasteResult = (ListOutcome & { readonly ok: true; readonly count: number }) | Extract<ClipboardRead, { ok: false }>;

/**
 * Says how many commands something covers.
 * @param {number} count How many.
 * @returns {string} Such as "command" or "3 commands".
 */
const countPhrase = (count: number): string =>
{
  return count === 1
    ? 'command'
    : `${count} commands`;
};

/**
 * Everything the command list does to its list, as named, undoable steps. It reads the list straight out of its
 * document, keeps the tree of it until the document changes, and turns each operation (add, delete, move, copy,
 * paste, duplicate, edit, give a branch an else) into the smallest splice that makes it, recorded through the
 * document hub. Nothing here touches the screen, so every rule deciding what gets written lives where it can be
 * tested.
 */
class CommandListEditor
{
  readonly target: CommandListTarget;

  readonly structure: CommandStructure;

  #hub: DocumentHub;

  #catalog: CommandCatalog;

  #cache: { revision: number; tree: CommandTree; locations: Map<number, CommandLocation> } | null = null;

  /**
   * @param {DocumentHub} hub The window's documents and histories; the target's document must be held.
   * @param {CommandCatalog} catalog Every command the editor can describe.
   * @param {CommandListTarget} target The list edited.
   */
  constructor(hub: DocumentHub, catalog: CommandCatalog, target: CommandListTarget)
  {
    this.#hub = hub;
    this.#catalog = catalog;
    this.target = target;
    this.structure = catalogStructure(catalog);
  }

  /**
   * The list as the document holds it now.
   * @returns {readonly RmmzEventCommand[]} The live commands; change them only through this editor.
   */
  commands(): readonly RmmzEventCommand[]
  {
    const value = this.#hub.document(this.target.documentKey).valueAt(this.target.path);
    if (Array.isArray(value) === false)
    {
      throw new Error(`${this.target.documentKey} has no command list at ${this.target.path.join('/')}`);
    }

    return value as unknown as RmmzEventCommand[];
  }

  /**
   * The list read as a tree, kept until the document changes.
   * @returns {CommandTree} The tree.
   */
  tree(): CommandTree
  {
    return this.#read().tree;
  }

  /**
   * Finds where a command sits.
   * @param {number} index The command's index.
   * @returns {CommandLocation | null} Where it sits, or null past the end.
   */
  locate(index: number): CommandLocation | null
  {
    return this.#read().locations.get(index) ?? null;
  }

  /**
   * Finds the unit that starts at an index.
   * @param {number} start The index of its first command.
   * @returns {CommandNode | null} The unit, or null when none starts there.
   */
  nodeAt(start: number): CommandNode | null
  {
    const location = this.locate(start);
    const node = location?.node ?? null;
    return node !== null && node.start === start && location?.role !== 'terminator'
      ? node
      : null;
  }

  /**
   * Finds the place right before a command as the list stands now: before the unit it heads, or at the end of the
   * body it closes. A place found while the list was different (another window edited it mid-drag) is found again
   * this way, by the command it sat before.
   * @param {RmmzEventCommand} command A unit's first command, or the empty command closing a body.
   * @returns {InsertionPoint | null} The place, or null when the command is gone or heads nothing.
   */
  placeBefore(command: RmmzEventCommand): InsertionPoint | null
  {
    const index = this.commands().indexOf(command);
    const location = this.locate(index);
    if (location !== null && location.role === 'terminator')
    {
      return { body: location.body, position: location.body.nodes.length };
    }

    const node = this.nodeAt(index);
    return node === null
      ? null
      : pointBeforeNode(node);
  }

  /**
   * Finds the block a command opens as the list stands now, for an action chosen while the list may have changed
   * under it (a menu left open while another window edited the list).
   * @param {RmmzEventCommand} command The block's first command.
   * @returns {CommandBlockNode | null} The block, or null when the command is gone or opens no block.
   */
  blockOpenedBy(command: RmmzEventCommand): CommandBlockNode | null
  {
    const node = this.nodeAt(this.commands().indexOf(command));
    return node !== null && node.kind === 'block'
      ? node
      : null;
  }

  /**
   * Finds the catalog entry describing a command.
   * @param {number} index The command's index.
   * @returns {CommandCatalogEntry} The entry.
   */
  entryAt(index: number): CommandCatalogEntry
  {
    return this.#catalog.resolve(this.commands()[index]);
  }

  /**
   * Reads what a row edits: its command and the lines continuing it.
   * @param {number} index The command's index.
   * @returns {CommandDraft} The command and its lines.
   */
  draftAt(index: number): CommandDraft
  {
    const list = this.commands();
    const location = this.locate(index);
    const end = location === null
      ? index + 1
      : headEnd(location, index);
    return { command: list[index], continuation: list.slice(index + 1, end) };
  }

  /**
   * Adds a fresh command where a place is, as the search inserts one. A command that is not a comment never lands
   * above the page's area tag; it goes in just below the tag's comment instead (see {@code settleInsertion}).
   * @param {CommandCatalogEntry} entry The command's entry.
   * @param {InsertionPoint} point The place, in the current tree, as the insertion points give it.
   * @returns {ListOutcome} The step, and where the new command now sits.
   */
  insertNew(entry: CommandCatalogEntry, point: InsertionPoint): ListOutcome
  {
    const unit = createCommandUnit(entry, this.structure);
    const settled = settleInsertion(this.tree(), point, unit);
    const index = insertionIndex(settled);
    const step = this.#commit(`Add ${entry.name}`, insertAt(this.commands(), settled, unit));
    return { step, index };
  }

  /**
   * Deletes some units.
   * @param {readonly CommandNode[]} nodes The units.
   * @returns {ListOutcome} The step, or null when there was nothing to delete, and where the first unit was.
   */
  remove(nodes: readonly CommandNode[]): ListOutcome
  {
    const outer = outermostNodes(nodes);
    const index = outer[0]?.start ?? 0;
    return { step: this.#commit(`Delete ${countPhrase(outer.length)}`, removeNodes(this.commands(), outer)), index };
  }

  /**
   * Moves some units to a place, as a drop does. Units that are not all comments never land above the page's area
   * tag; they go in just below the tag's comment instead.
   * @param {readonly CommandNode[]} nodes The units.
   * @param {InsertionPoint} point The place, in the current tree; never inside one of the units.
   * @returns {ListOutcome} The step, or null when the units were already there, and where they landed.
   */
  move(nodes: readonly CommandNode[], point: InsertionPoint): ListOutcome
  {
    const outer = outermostNodes(nodes);
    const list = this.commands();
    const settled = settleInsertion(this.tree(), point, unitsAtIndent(list, outer, 0));
    const index = landingIndex(outer, settled);
    return { step: this.#commit(`Move ${countPhrase(outer.length)}`, moveNodes(list, outer, settled)), index };
  }

  /**
   * Copies some units right after the last of them.
   * @param {readonly CommandNode[]} nodes The units.
   * @returns {ListOutcome} The step, or null when there was nothing to copy, and where the copies start.
   */
  duplicate(nodes: readonly CommandNode[]): ListOutcome
  {
    const outer = outermostNodes(nodes);
    const index = outer[outer.length - 1]?.end ?? 0;
    return { step: this.#commit(`Duplicate ${countPhrase(outer.length)}`, duplicateNodes(this.commands(), outer)), index };
  }

  /**
   * Finds units that follow one another in one body, from the one starting at an index: where a paste, a move or
   * a duplicate put its units, so the selection can follow them.
   * @param {number} start The first unit's first command.
   * @param {number} count How many units.
   * @returns {CommandNode[]} The units found, fewer when the body ends first; none when no unit starts there.
   */
  unitsFrom(start: number, count: number): CommandNode[]
  {
    const first = this.nodeAt(start);
    if (first === null)
    {
      return [];
    }

    const siblings = first.parent.nodes;
    const position = siblings.indexOf(first);
    return siblings.slice(position, position + count);
  }

  /**
   * Writes some units for the system clipboard, each brought to the top level by its own depth, so units selected
   * at different depths paste back as siblings.
   * @param {readonly CommandNode[]} nodes The units.
   * @returns {string} The clipboard text.
   */
  copy(nodes: readonly CommandNode[]): string
  {
    return writeClipboard(unitsAtIndent(this.commands(), nodes, 0));
  }

  /**
   * Pastes clipboard text at a place, when it holds whole commands this editor wrote. Commands that are not all
   * comments never land above the page's area tag; they go in just below the tag's comment instead.
   * @param {InsertionPoint} point The place, in the current tree, as the insertion points give it.
   * @param {string} text The clipboard text.
   * @returns {PasteResult} The step and where the pasted commands start, or why nothing was pasted.
   */
  paste(point: InsertionPoint, text: string): PasteResult
  {
    const read = readClipboard(text, this.structure);
    if (read.ok === false)
    {
      return read;
    }

    const count = readCommandTree([ ...read.commands, { code: 0, indent: 0, parameters: [] } ], this.structure).root.nodes.length;
    const settled = settleInsertion(this.tree(), point, read.commands);
    const index = insertionIndex(settled);
    const step = this.#commit(`Paste ${countPhrase(count)}`, insertAt(this.commands(), settled, read.commands));
    return { ok: true, step, index, count };
  }

  /**
   * Replaces a row's command and its lines with an edited version, then brings a block's branches in line with
   * its opener (a choice added or removed, a battle's outcomes switched on or off).
   * @param {number} index The command's index.
   * @param {CommandDraft} draft The edited command and lines; the command keeps its indent.
   * @param {ListOrigins} origins Where each of a Show Choices' choices came from, when the edit reshaped them, so
   * each branch goes with its own choice; by place without.
   * @returns {HistoryStep | null} The step, or null when nothing changed.
   */
  edit(index: number, draft: CommandDraft, origins?: ListOrigins): HistoryStep | null
  {
    const list = this.commands();
    const current = this.draftAt(index);
    const { indent } = current.command;
    const placed = [ draft.command, ...draft.continuation ].map(command => ({ ...command, indent }));
    const replaced = replaceRange(list, index, index + 1 + current.continuation.length, placed);
    const reconciled = reconcileBlock(replaced, this.structure, index, origins);
    return this.#commit(`Edit ${this.#catalog.resolve(draft.command).name}`, reconciled);
  }

  /**
   * Finds the whole block the editor of a block's opener works on, exactly as the hand-built editors find it
   * ({@code blockSpanAt}): a conditional branch through its end, or a Show Choices list across every block
   * HIME_LargeChoices merges with it, from whichever of them the row opens.
   * @param {number} index The opener's index.
   * @returns {CommandSpan | null} The span, or null when the row opens no such block.
   */
  blockSpanAt(index: number): CommandSpan | null
  {
    return this.locate(index)?.role === 'opener'
      ? blockSpanAt(this.commands(), index)
      : null;
  }

  /**
   * Replaces a whole block with an edited version, as the editors that change a block's shape hand it back (Show
   * Choices adding a choice, Conditional Branch taking its else away). The block keeps its indent.
   * @param {CommandSpan} span Where the block is.
   * @param {readonly RmmzEventCommand[]} commands The edited block, its first command its opener.
   * @returns {HistoryStep | null} The step, or null when nothing changed.
   */
  editBlock(span: CommandSpan, commands: readonly RmmzEventCommand[]): HistoryStep | null
  {
    const list = this.commands();
    const [ first ] = commands;
    if (first === undefined)
    {
      throw new Error('a block needs its opener');
    }

    const placed = reindent(commands, list[span.start].indent - first.indent);
    return this.#commit(`Edit ${this.#catalog.resolve(first).name}`, replaceRange(list, span.start, span.end, placed));
  }

  /**
   * Gives a conditional branch an else, or takes it away with what is under it.
   * @param {CommandBlockNode} block The conditional branch.
   * @param {boolean} wanted Whether it should have one.
   * @returns {HistoryStep | null} The step, or null when it already was that way.
   */
  setElse(block: CommandBlockNode, wanted: boolean): HistoryStep | null
  {
    return this.#commit(wanted ? 'Add else branch' : 'Remove else branch', setElseBranch(this.commands(), block, wanted));
  }

  /**
   * Records the change from the current list to another as one step, as the smallest splice that makes it.
   * @param {string} label What the history panel calls the step.
   * @param {readonly RmmzEventCommand[]} next The list as it should be.
   * @returns {HistoryStep | null} The step, or null when nothing changed.
   */
  #commit(label: string, next: readonly RmmzEventCommand[]): HistoryStep | null
  {
    const splice = spliceBetween(this.commands(), next);
    if (splice === null)
    {
      return null;
    }

    const { documentKey, path, histories } = this.target;
    return this.#hub.edit(label, histories, transaction =>
    {
      transaction.splice(documentKey, path, splice.index, splice.deleteCount, asJsonCommands(splice.inserted));
    });
  }

  /**
   * Reads the list into a tree, once per document revision.
   * @returns {{ revision: number, tree: CommandTree, locations: Map<number, CommandLocation> }} The tree and where
   * every command sits.
   */
  #read(): { revision: number; tree: CommandTree; locations: Map<number, CommandLocation> }
  {
    const { revision } = this.#hub.document(this.target.documentKey);
    if (this.#cache === null || this.#cache.revision !== revision)
    {
      const tree = readCommandTree(this.commands(), this.structure);
      this.#cache = { revision, tree, locations: locateCommands(tree) };
    }

    return this.#cache;
  }
}

export { CommandListEditor };
export type { CommandListTarget, ListOutcome, PasteResult };
