import type { PageCondition, PageRule } from './pageRule.ts';
import { NO_PARTY, type FreshSave } from './freshSave.ts';

/**
 * What the window's page rule reads the plugins' conditions from: the window's plugin modules.
 */
type PageConditionSource = {
  pageConditions(): readonly PageCondition[];
  subscribe(listener: () => void): () => void;
};

/**
 * Reports whether two new games seat the same party, in the same order.
 * @param {FreshSave} left One.
 * @param {FreshSave} right The other.
 * @returns {boolean} True when they seat the same actors.
 */
const sameParty = (left: FreshSave, right: FreshSave): boolean =>
{
  return left.party.length === right.party.length && left.party.every((actorId, index) => right.party[index] === actorId);
};

/**
 * The page rule one window shows every map by: what a new game starts with, which the window reads from the project
 * once it starts, and the conditions the active plugin modules add, which change as they switch on. Until the new game
 * is read, it seats nobody. Every map view in the window draws its events by it, and hears when it changes.
 */
class WindowPageRule
{
  #modules: PageConditionSource;

  #save: FreshSave = NO_PARTY;

  #listeners = new Set<() => void>();

  /**
   * @param {PageConditionSource} modules The window's plugin modules.
   */
  constructor(modules: PageConditionSource)
  {
    this.#modules = modules;
  }

  /**
   * What a new game starts with, as last read.
   * @returns {FreshSave} The new game.
   */
  get save(): FreshSave
  {
    return this.#save;
  }

  /**
   * The rule as it stands: the new game as last read, and the conditions the modules add now.
   * @returns {PageRule} The rule.
   */
  rule(): PageRule
  {
    return { save: this.#save, conditions: this.#modules.pageConditions() };
  }

  /**
   * Takes what a new game starts with, as read from the project, telling whoever listens when it seats another party.
   * @param {FreshSave} save The new game.
   */
  setSave(save: FreshSave): void
  {
    if (sameParty(save, this.#save))
    {
      return;
    }

    this.#save = save;
    this.#listeners.forEach(listener => listener());
  }

  /**
   * Listens for the rule changing: the new game read afresh seating another party, or the modules switching on.
   * @param {() => void} listener Called after each change.
   * @returns {() => void} Stops listening.
   */
  subscribe(listener: () => void): () => void
  {
    this.#listeners.add(listener);
    const stopModules = this.#modules.subscribe(listener);
    return () =>
    {
      this.#listeners.delete(listener);
      stopModules();
    };
  }
}

export { WindowPageRule };
export type { PageConditionSource };
