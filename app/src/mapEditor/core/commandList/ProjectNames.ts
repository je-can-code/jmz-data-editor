import type { RmmzNameList } from '../model/rmmzTypes.ts';
import type { DatabaseNamesJson } from './databaseNames.ts';

/**
 * The switch and variable names as System.json holds them right now, each list by id.
 */
type SystemNames = Readonly<Record<RmmzNameList, readonly string[]>>;

/**
 * No names at all, for a window that has System.json's names but could not read the rest.
 */
const NO_NAMES: DatabaseNamesJson = {
  switches: [],
  variables: [],
  actors: [],
  classes: [],
  skills: [],
  items: [],
  weapons: [],
  armors: [],
  enemies: [],
  troops: [],
  states: [],
  animations: [],
  tilesets: [],
  commonEvents: [],
  maps: [],
  equipTypes: [],
};

/**
 * Reports whether two lists of names hold the same names in the same order.
 * @param {readonly string[]} left One list.
 * @param {readonly string[]} right The other.
 * @returns {boolean} True when they match name for name.
 */
const sameNames = (left: readonly string[], right: readonly string[]): boolean =>
{
  return left.length === right.length && left.every((name, index) => right[index] === name);
};

/**
 * The names one window shows ids by: the project's names, read from the server once, with the switch and variable names
 * kept as they stand in System.json right now, unsaved renames in any window included. Every command row, condition and
 * picker in the window reads it, so a switch renamed anywhere reads by its new name everywhere at once.
 *
 * - {@link names} reads them. The same object comes back until they change, so it can be handed straight to React's
 *   {@code useSyncExternalStore} along with {@link subscribe}.
 * - {@link read} reads the project's names from the server, once however often it is asked.
 * - {@link followSystem} takes the switch and variable names as they stand now.
 */
class ProjectNames
{
  #load: () => Promise<DatabaseNamesJson>;

  #reading: Promise<DatabaseNamesJson | null> | null = null;

  #base: DatabaseNamesJson | null = null;

  #system: SystemNames | null = null;

  #names: DatabaseNamesJson | null = null;

  #listeners = new Set<() => void>();

  /**
   * @param {() => Promise<DatabaseNamesJson>} load Reads the project's names from the server.
   */
  constructor(load: () => Promise<DatabaseNamesJson>)
  {
    this.#load = load;
  }

  /**
   * Reads the names: the project's, with the switch and variable names as they stand now.
   * @returns {DatabaseNamesJson | null} The names, or null until either has arrived, when ids read as numbers.
   */
  names = (): DatabaseNamesJson | null =>
  {
    return this.#names;
  };

  /**
   * Listens for the names changing.
   * @param {() => void} listener Called after each change.
   * @returns {() => void} Stops listening.
   */
  subscribe = (listener: () => void): (() => void) =>
  {
    this.#listeners.add(listener);
    return () =>
    {
      this.#listeners.delete(listener);
    };
  };

  /**
   * Reads the project's names from the server, the first time it is asked; every later ask has the same answer. A read
   * that fails leaves ids as numbers, save for the switches and variables once those are followed, and never rejects.
   * @returns {Promise<DatabaseNamesJson | null>} The names as the server gave them, or null when it could not.
   */
  read(): Promise<DatabaseNamesJson | null>
  {
    // a load that throws before it even starts fails the same quiet way as one the server refuses.
    this.#reading ??= new Promise<DatabaseNamesJson>(resolve => resolve(this.#load()))
      .catch(() => null)
      .then(base =>
      {
        this.#base = base;
        this.#combine();
        return base;
      });
    return this.#reading;
  }

  /**
   * Takes the switch and variable names as they stand now in System.json, which outrank the ones the server read, since
   * they may hold renames not saved yet. Names that match the ones already followed change nothing.
   * @param {SystemNames} system The names, each list by id.
   */
  followSystem(system: SystemNames): void
  {
    const current = this.#system;
    if (current !== null && sameNames(current.switches, system.switches) && sameNames(current.variables, system.variables))
    {
      return;
    }

    this.#system = { switches: [ ...system.switches ], variables: [ ...system.variables ] };
    this.#combine();
  }

  /**
   * Puts the names together afresh and tells whoever listens.
   */
  #combine(): void
  {
    const base = this.#base;
    const system = this.#system;
    if (system === null)
    {
      this.#names = base;
    }
    else
    {
      this.#names = { ...base ?? NO_NAMES, switches: system.switches, variables: system.variables };
    }

    this.#listeners.forEach(listener => listener());
  }
}

export { ProjectNames };
export type { SystemNames };
