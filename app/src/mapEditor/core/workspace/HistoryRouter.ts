import { untrackedWords, type DocumentHub, type HistoryCheck, type HistoryFailure } from '../history/DocumentHub.ts';
import { TREE_HISTORY_KEY, type HistoryKey } from '../history/historyKeys.ts';
import type { HistoryStep } from '../history/HistoryStep.ts';
import type { LeftPart } from '../history/stepParts.ts';
import { mapDocumentKey } from '../model/documentKeys.ts';
import type { MapTreeService, TreeOutcome } from '../tree/MapTreeService.ts';
import { documentLabel, documentName } from '../../views/documentLabels.ts';

/**
 * What an undo, a redo or a history jump came to. {@code nothing} marks the quiet failure (there was no step that
 * way), which a keypress should not nag about; {@code stuckStepId} names a step a later edit blocks, which the
 * history panel offers to forget so the person can go on past it; {@code alarm} marks a tree step whose failed
 * write could not be put back, which must stay on screen until the person dismisses it. A move that left parts of its
 * step as they stand, copies of a blueprint changed since, carries what to tell the author about them ({@code message}).
 */
type HistoryOutcome =
  | { readonly ok: true; readonly message?: string }
  | { readonly ok: false; readonly nothing: boolean; readonly message: string; readonly stuckStepId: string | null; readonly alarm?: true };

/**
 * Which way a history moves.
 */
type Direction = 'backward' | 'forward';

/**
 * Names a map as the map tree shows it (see documentLabels' documentName).
 */
type MapName = (mapId: number) => string;

/**
 * Says why one step must not move one way, for a reason the hub's own checks know nothing of, or null when nothing beyond
 * them stands in its way: taking away a blueprint something is still a copy of, say. Asked of every step the hub would
 * move, whatever its history, just before it moves, so it must change nothing; handed how the window names a map, so a
 * reason naming one names it as the map tree shows it.
 */
type MoveGuard = (step: HistoryStep, direction: Direction, mapName: MapName) => string | null;

/**
 * Words what a move left of its step for the author (see DocumentHub's HistoryCheck): which copies, on which maps, each
 * keeping the change made to it since.
 */
type LeftWords = (step: HistoryStep, left: readonly LeftPart[], direction: Direction) => string;

/**
 * Words the hub's refusal for the author, naming each map it names as the map tree shows it.
 * @param {HistoryFailure} failure The refusal.
 * @param {Direction} direction Undo or redo.
 * @param {MapName} mapName Names a map as the map tree shows it.
 * @returns {HistoryOutcome} The outcome.
 */
const fromHubFailure = (failure: HistoryFailure, direction: Direction, mapName: MapName): HistoryOutcome =>
{
  const verb = direction === 'backward' ? 'undone' : 'redone';
  switch (failure.reason)
  {
    case 'nothing':
      return { ok: false, nothing: true, message: `Nothing to ${direction === 'backward' ? 'undo' : 'redo'}.`, stuckStepId: null };
    case 'missing-documents':
    {
      const names = failure.documents.map(key => documentName(key, mapName)).join(', ');
      return { ok: false, nothing: false, message: `"${failure.step.label}" also changed ${names}; open it to have it ${verb}.`, stuckStepId: null };
    }
    case 'conflict':
    case 'moved':
    case 'untracked':
    {
      // the hub words each kind of blocked move itself, naming the edit in the way when it knows it; a document whose
      // record does not reach the step is named here, as the author knows it.
      const why = failure.document === undefined
        ? failure.message
        : untrackedWords(documentName(failure.document, mapName), failure.step, direction);
      return { ok: false, nothing: false, message: `"${failure.step.label}" cannot be ${verb}: ${why}.`, stuckStepId: failure.step.id };
    }
  }
};

/**
 * Turns the tree service's answer into a history outcome.
 * @param {TreeOutcome} outcome The tree service's answer.
 * @returns {HistoryOutcome} The outcome.
 */
const fromTreeOutcome = (outcome: TreeOutcome): HistoryOutcome =>
{
  if (outcome.ok)
  {
    return { ok: true };
  }

  // an alarm rides along only on the failures that raise one, so every other outcome keeps its exact shape.
  return {
    ok: false,
    nothing: false,
    message: outcome.message,
    stuckStepId: null,
    ...(outcome.alarm === true ? { alarm: true as const } : {}),
  };
};

/**
 * Sends every undo, redo and history jump to whatever owns that history. The map tree's steps create and remove
 * whole map files, which only the tree service writes, so the tree history always goes there; every other history
 * (a map's, an event's, a blueprint's) is the hub's alone. Ctrl+Z, Ctrl+Y and every click on a history panel row go
 * through here, and nothing else moves a history.
 *
 * A step the hub would move may still be refused by the window's guard, for what moving it would do beyond the hub's
 * knowing: an undo that would take away a blueprint its copies still name. Such a refusal is worded and reported as one a
 * later edit blocks, the step named as stuck, and a jump stops at it as it stops at any step that cannot move. The guard
 * is asked about what would move: of a step that would leave parts of itself, the part that moves.
 *
 * A move that leaves parts of its step, a blueprint's change leaving copies changed since as they stand, has moved all
 * the same, and the author hears what it left, in the words the window gives.
 *
 * A refusal naming a map names it as the map tree shows it, by the name the window gives it, never by how the window
 * keeps it apart from other documents.
 */
class HistoryRouter
{
  #hub: DocumentHub;

  #tree: MapTreeService | null;

  #guard: MoveGuard | null;

  #leftWords: LeftWords | null;

  #mapName: MapName;

  /**
   * @param {DocumentHub} hub The window's documents and histories.
   * @param {MapTreeService | null} tree The tree service, or null when the window has no server to write through.
   * @param {MoveGuard | null} guard What every step the hub would move must also pass, or null for nothing more.
   * @param {LeftWords | null} leftWords Words what a move left of its step, or null to say nothing of it.
   * @param {MapName | null} mapName Names a map as the map tree shows it, or null to name each "Map N".
   */
  constructor(
    hub: DocumentHub,
    tree: MapTreeService | null,
    guard: MoveGuard | null = null,
    leftWords: LeftWords | null = null,
    mapName: MapName | null = null,
  )
  {
    this.#hub = hub;
    this.#tree = tree;
    this.#guard = guard;
    this.#leftWords = leftWords;
    this.#mapName = mapName ?? (mapId => documentLabel(mapDocumentKey(mapId)));
  }

  /**
   * Undoes a history's newest step.
   * @param {HistoryKey} key The history.
   * @returns {Promise<HistoryOutcome>} What it came to.
   */
  undo(key: HistoryKey): Promise<HistoryOutcome>
  {
    return this.#step(key, 'backward');
  }

  /**
   * Redoes a history's most recently undone step.
   * @param {HistoryKey} key The history.
   * @returns {Promise<HistoryOutcome>} What it came to.
   */
  redo(key: HistoryKey): Promise<HistoryOutcome>
  {
    return this.#step(key, 'forward');
  }

  /**
   * Moves a history to just after one of its steps: a click on a history panel row.
   * @param {HistoryKey} key The history.
   * @param {string | null} stepId The step to end on, or null for before the first.
   * @returns {Promise<HistoryOutcome>} What it came to.
   */
  async jumpTo(key: HistoryKey, stepId: string | null): Promise<HistoryOutcome>
  {
    if (key === TREE_HISTORY_KEY)
    {
      return fromTreeOutcome(await this.#requireTree().jumpTo(stepId));
    }

    return this.#jumpOnHub(key, stepId);
  }

  /**
   * Forgets a step a later edit blocks, so its history can go on past it; whatever the step did stays.
   * @param {string} stepId The step.
   * @returns {boolean} True when the step was known and is now forgotten.
   */
  forget(stepId: string): boolean
  {
    return this.#hub.forgetStep(stepId);
  }

  /**
   * Undoes or redoes once.
   * @param {HistoryKey} key The history.
   * @param {Direction} direction Which way.
   * @returns {Promise<HistoryOutcome>} What it came to.
   */
  async #step(key: HistoryKey, direction: Direction): Promise<HistoryOutcome>
  {
    // an empty direction is quiet everywhere, the tree included.
    const check = direction === 'backward'
      ? this.#hub.canUndo(key)
      : this.#hub.canRedo(key);
    if (check.ok === false && check.reason === 'nothing')
    {
      return fromHubFailure(check, direction, this.#mapName);
    }

    if (key === TREE_HISTORY_KEY)
    {
      const tree = this.#requireTree();
      return fromTreeOutcome(direction === 'backward' ? await tree.undo() : await tree.redo());
    }

    return this.#moveOnHub(key, direction, check);
  }

  /**
   * Undoes or redoes a hub history's head step once, unless the guard refuses what moving it would do, which it is asked
   * only once the hub would move the step: a step the hub refuses is the hub's to word.
   * @param {HistoryKey} key The history.
   * @param {Direction} direction Which way.
   * @param {HistoryCheck} check The hub's answer to whether it can move that way, asked just now.
   * @returns {HistoryOutcome} What it came to.
   */
  #moveOnHub(key: HistoryKey, direction: Direction, check: HistoryCheck): HistoryOutcome
  {
    // the guard's refusal reads as a blocked step's does, the step named as stuck, so the history panel can say why, and
    // names a map as the hub's refusals do.
    if (check.ok && this.#guard !== null)
    {
      const refusal = this.#guard(check.step, direction, this.#mapName);
      if (refusal !== null)
      {
        const verb = direction === 'backward' ? 'undone' : 'redone';
        return { ok: false, nothing: false, message: `"${check.step.label}" cannot be ${verb}: ${refusal}.`, stuckStepId: check.step.id };
      }
    }

    const moved = direction === 'backward'
      ? this.#hub.undo(key)
      : this.#hub.redo(key);
    if (moved.ok === false)
    {
      return fromHubFailure(moved, direction, this.#mapName);
    }

    // a move that left parts of its step says which, where the window can word them.
    return moved.left === undefined || this.#leftWords === null
      ? { ok: true }
      : { ok: true, message: this.#leftWords(moved.step, moved.left, direction) };
  }

  /**
   * Moves a hub history to just after one of its steps one undo or redo at a time, each through the same checks as a
   * keypress's, so the jump stops at the first step that cannot move, the guard's refusals included, having moved every
   * step before it. Nothing else can move the history between two of its moves, as they follow one another at once. What
   * the last move to leave parts of its step left is what the author hears.
   * @param {HistoryKey} key The history.
   * @param {string | null} stepId The step to end on, or null for before the first.
   * @returns {HistoryOutcome} What it came to; a step the history does not hold is nothing to jump to.
   */
  #jumpOnHub(key: HistoryKey, stepId: string | null): HistoryOutcome
  {
    let told: string | null = null;
    for (;;)
    {
      // the rows list the steps done, oldest first, then those undone, next to redo first, so the history stands just
      // after a row once as many steps are done as come up to it.
      const { rows, position } = this.#hub.history(key);
      const index = stepId === null ? -1 : rows.findIndex(row => row.id === stepId);
      if (stepId !== null && index < 0)
      {
        return fromHubFailure({ ok: false, reason: 'nothing', historyKey: key }, 'backward', this.#mapName);
      }

      const target = index + 1;
      if (position === target)
      {
        return told === null ? { ok: true } : { ok: true, message: told };
      }

      const direction: Direction = position > target ? 'backward' : 'forward';
      const check = direction === 'backward'
        ? this.#hub.canUndo(key)
        : this.#hub.canRedo(key);
      const moved = this.#moveOnHub(key, direction, check);
      if (moved.ok === false)
      {
        return moved;
      }

      told = moved.message ?? told;
    }
  }

  /**
   * Finds the tree service, which a tree step cannot move without.
   * @returns {MapTreeService} The service.
   */
  #requireTree(): MapTreeService
  {
    if (this.#tree === null)
    {
      throw new Error('the map tree cannot change without a server to write it to');
    }

    return this.#tree;
  }
}

export { HistoryRouter };
export type { Direction as HistoryDirection, HistoryOutcome, LeftWords, MapName, MoveGuard };
