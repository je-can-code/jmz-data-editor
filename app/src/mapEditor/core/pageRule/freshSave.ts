import type { RmmzEventConditions } from '../model/rmmzTypes.ts';
import { GamePreview } from '../preview/GamePreview.ts';

/**
 * What a new game starts with, as far as an event page's own conditions read it. A new game turns no switch or self
 * switch on, sets no variable (each reads 0) and holds no item, so none of that needs saying; what does is who stands
 * in the party, since a page can wait for an actor and a new game starts with some.
 */
type FreshSave = {
  /**
   * The actors a new game's party starts with, by id: System.json's starting party, keeping each actor Actors.json
   * has a row for, as Game_Party#setupStartingMembers seats them.
   */
  readonly party: readonly number[];
};

/**
 * A new game whose party is not known yet, or a project that starts with nobody in its party: an actor condition
 * holds for nobody.
 */
const NO_PARTY: FreshSave = { party: [] };

/**
 * A variable a page waits for, and the least it must read: the engine wants it at the page's value or above.
 */
type VariableWait = {
  readonly id: number;
  readonly atLeast: number;
};

/**
 * What one page's own conditions wait for, read once: the part a preview can never change, already judged, and the
 * switches and the variable a preview sets, left to judge at each preview.
 */
type OwnWaits = {
  /**
   * Whether what the page waits for besides switches and a variable holds: no self switch and no item, which a fresh
   * save never has and a preview never sets, and an actor, if it waits for one, standing in the starting party.
   */
  readonly settled: boolean;

  /**
   * The switches the page waits for, every one of which must be on: none, one, or both of its two.
   */
  readonly switches: readonly number[];

  /**
   * The variable the page waits for, or null when it waits for none.
   */
  readonly variable: VariableWait | null;
};

/**
 * Reads what a page's own conditions wait for on a save, as Game_Event#meetsConditions reads them: whatever a condition
 * keeps that the page does not wait for counts for nothing. A self switch and an item are never had, since a new game
 * has neither and a preview sets neither; an actor counts only while it stands in the party.
 * @param {RmmzEventConditions} conditions The page's conditions.
 * @param {FreshSave} save What the new game starts with.
 * @returns {OwnWaits} What the page waits for.
 */
const ownWaitsOf = (conditions: RmmzEventConditions, save: FreshSave): OwnWaits =>
{
  const settled = conditions.selfSwitchValid === false
    && conditions.itemValid === false
    && (conditions.actorValid === false || save.party.includes(conditions.actorId));
  const first = conditions.switch1Valid ? [ conditions.switch1Id ] : [];
  const second = conditions.switch2Valid ? [ conditions.switch2Id ] : [];
  const variable = conditions.variableValid
    ? { id: conditions.variableId, atLeast: conditions.variableValue }
    : null;
  return { settled, switches: [ ...first, ...second ], variable };
};

/**
 * Reports whether a page's own conditions hold at a preview, as Game_Event#meetsConditions judges them: every switch
 * the page waits for on, its variable at the page's value or above, and everything else it waits for settled. A preview
 * reads as a fresh save wherever it sets nothing, with every switch off and every variable 0, so on a fresh save a page
 * waiting for a switch waits, while one waiting for a variable to reach 0 or less has it already.
 * @param {OwnWaits} waits What the page waits for, as {@link ownWaitsOf} read it.
 * @param {GamePreview} preview The switches and variables the author set; a fresh save's by default.
 * @returns {boolean} True when they all hold.
 */
const ownWaitsHold = (waits: OwnWaits, preview: GamePreview = GamePreview.FRESH): boolean =>
{
  // what no preview can change is answered already.
  if (waits.settled === false)
  {
    return false;
  }

  // every switch waited for must be on, both of them on a page waiting for two.
  if (waits.switches.some(switchId => preview.isSwitchOn(switchId) === false))
  {
    return false;
  }

  // the variable must read the page's value or above.
  return waits.variable === null || preview.variable(waits.variable.id) >= waits.variable.atLeast;
};

/**
 * Words the switches a page waits for: one switch, two, or the same switch named twice, which is one.
 * @param {RmmzEventConditions} conditions The page's conditions.
 * @returns {string[]} The words, or none for a page waiting for no switch.
 */
const switchWords = (conditions: RmmzEventConditions): string[] =>
{
  const firstId = conditions.switch1Valid ? [ conditions.switch1Id ] : [];
  const secondId = conditions.switch2Valid ? [ conditions.switch2Id ] : [];
  const ids = [ ...new Set([ ...firstId, ...secondId ]) ];
  if (ids.length === 0)
  {
    return [];
  }

  return ids.length === 1
    ? [ `while switch ${ids[0]} is on` ]
    : [ `while switches ${ids[0]} and ${ids[1]} are on` ];
};

/**
 * Words what a page's own conditions wait for, in the order MZ lists them, as an author would say it: "while switch 4
 * is on", "once variable 13 reaches 80". Ids stand in for names, since a page holds only ids.
 * @param {RmmzEventConditions} conditions The page's conditions.
 * @returns {string[]} The words, one entry per thing waited for; none for a page waiting for nothing.
 */
const conditionWords = (conditions: RmmzEventConditions): string[] =>
{
  const variable = conditions.variableValid ? [ `once variable ${conditions.variableId} reaches ${conditions.variableValue}` ] : [];
  const selfSwitch = conditions.selfSwitchValid ? [ `while self switch ${conditions.selfSwitchCh} is on` ] : [];
  const item = conditions.itemValid ? [ `while the party holds item ${conditions.itemId}` ] : [];
  const actor = conditions.actorValid ? [ `while actor ${conditions.actorId} is in the party` ] : [];
  return [ ...switchWords(conditions), ...variable, ...selfSwitch, ...item, ...actor ];
};

export { conditionWords, NO_PARTY, ownWaitsHold, ownWaitsOf };
export type { FreshSave, OwnWaits, VariableWait };
