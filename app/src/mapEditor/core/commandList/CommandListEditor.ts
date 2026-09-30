import type { CommandCatalogEntry } from '../commands/catalogTypes.ts';
import type { CommandCatalog } from '../commands/CommandCatalog.ts';
import type { CommandDraft } from '../commands/fieldValues.ts';
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
import { insertionIndex, type InsertionPoint } from './insertionPoints.ts';
import {
  asJsonCommands,
  commandsOfNodes,
  duplicateNodes,
  insertAt,
  landingIndex,
  moveNodes,
  outermostNodes,
  removeNodes,
  replaceRange,
  spliceBetween,
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
   * Adds a fresh command where a place is, as the search inserts one.
   * @param {CommandCatalogEntry} entry The command's entry.
   * @param {InsertionPoint} point The place, in the current tree.
   * @returns {ListOutcome} The step, and where the new command now sits.
   */
  insertNew(entry: CommandCatalogEntry, point: InsertionPoint): ListOutcome
  {
    const index = insertionIndex(point);
    const step = this.#commit(`Add ${entry.name}`, insertAt(this.commands(), point, createCommandUnit(entry, this.structure)));
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
   * Moves some units to a place, as a drop does.
   * @param {readonly CommandNode[]} nodes The units.
   * @param {InsertionPoint} point The place, in the current tree; never inside one of the units.
   * @returns {ListOutcome} The step, or null when the units were already there, and where they landed.
   */
  move(nodes: readonly CommandNode[], point: InsertionPoint): ListOutcome
  {
    const outer = outermostNodes(nodes);
    const index = landingIndex(outer, point);
    return { step: this.#commit(`Move ${countPhrase(outer.length)}`, moveNodes(this.commands(), outer, point)), index };
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
   * Writes some units for the system clipboard.
   * @param {readonly CommandNode[]} nodes The units.
   * @returns {string} The clipboard text.
   */
  copy(nodes: readonly CommandNode[]): string
  {
    return writeClipboard(commandsOfNodes(this.commands(), nodes));
  }

  /**
   * Pastes clipboard text at a place, when it holds whole commands this editor wrote.
   * @param {InsertionPoint} point The place, in the current tree.
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
    const index = insertionIndex(point);
    const step = this.#commit(`Paste ${countPhrase(count)}`, insertAt(this.commands(), point, read.commands));
    return { ok: true, step, index, count };
  }

  /**
   * Replaces a row's command and its lines with an edited version, then brings a block's branches in line with
   * its opener (a choice added or removed, a battle's outcomes switched on or off).
   * @param {number} index The command's index.
   * @param {CommandDraft} draft The edited command and lines; the command keeps its indent.
   * @returns {HistoryStep | null} The step, or null when nothing changed.
   */
  edit(index: number, draft: CommandDraft): HistoryStep | null
  {
    const list = this.commands();
    const current = this.draftAt(index);
    const { indent } = current.command;
    const placed = [ draft.command, ...draft.continuation ].map(command => ({ ...command, indent }));
    const replaced = replaceRange(list, index, index + 1 + current.continuation.length, placed);
    const reconciled = reconcileBlock(replaced, this.structure, index);
    return this.#commit(`Edit ${this.#catalog.resolve(draft.command).name}`, reconciled);
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
