import type { DocumentHub, HistoryFailure } from '../history/DocumentHub.ts';
import { TREE_HISTORY_KEY, type HistoryKey } from '../history/historyKeys.ts';
import type { MapTreeService, TreeOutcome } from '../tree/MapTreeService.ts';
import { documentLabel } from '../../views/documentLabels.ts';

/**
 * What an undo, a redo or a history jump came to. {@code nothing} marks the quiet failure (there was no step that
 * way), which a keypress should not nag about; {@code stuckStepId} names a step a later edit blocks, which the
 * history panel offers to forget so the person can go on past it; {@code alarm} marks a tree step whose failed
 * write could not be put back, which must stay on screen until the person dismisses it.
 */
type HistoryOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly nothing: boolean; readonly message: string; readonly stuckStepId: string | null; readonly alarm?: true };

/**
 * Which way a history moves.
 */
type Direction = 'backward' | 'forward';

/**
 * Words the hub's refusal for the author.
 * @param {HistoryFailure} failure The refusal.
 * @param {Direction} direction Undo or redo.
 * @returns {HistoryOutcome} The outcome.
 */
const fromHubFailure = (failure: HistoryFailure, direction: Direction): HistoryOutcome =>
{
  const verb = direction === 'backward' ? 'undone' : 'redone';
  switch (failure.reason)
  {
    case 'nothing':
      return { ok: false, nothing: true, message: `Nothing to ${direction === 'backward' ? 'undo' : 'redo'}.`, stuckStepId: null };
    case 'missing-documents':
    {
      const names = failure.documents.map(documentLabel).join(', ');
      return { ok: false, nothing: false, message: `"${failure.step.label}" also changed ${names}; open it to have it ${verb}.`, stuckStepId: null };
    }
    case 'conflict':
    case 'moved':
    case 'untracked':
    {
      // the hub words each kind of blocked move itself, naming the edit in the way when it knows it.
      return { ok: false, nothing: false, message: `"${failure.step.label}" cannot be ${verb}: ${failure.message}.`, stuckStepId: failure.step.id };
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
 */
class HistoryRouter
{
  #hub: DocumentHub;

  #tree: MapTreeService | null;

  /**
   * @param {DocumentHub} hub The window's documents and histories.
   * @param {MapTreeService | null} tree The tree service, or null when the window has no server to write through.
   */
  constructor(hub: DocumentHub, tree: MapTreeService | null)
  {
    this.#hub = hub;
    this.#tree = tree;
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

    // a jump to an undone step redoes its way there; any other jump undoes.
    const forward = this.#hub.history(key).rows.some(row => row.id === stepId && row.done === false);
    const result = this.#hub.jumpTo(key, stepId);
    return result.ok
      ? { ok: true }
      : fromHubFailure(result, forward ? 'forward' : 'backward');
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
      return fromHubFailure(check, direction);
    }

    if (key === TREE_HISTORY_KEY)
    {
      const tree = this.#requireTree();
      return fromTreeOutcome(direction === 'backward' ? await tree.undo() : await tree.redo());
    }

    const moved = direction === 'backward'
      ? this.#hub.undo(key)
      : this.#hub.redo(key);
    return moved.ok
      ? { ok: true }
      : fromHubFailure(moved, direction);
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
export type { HistoryOutcome };
