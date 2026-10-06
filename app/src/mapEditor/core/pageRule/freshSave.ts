import type { RmmzEventConditions } from '../model/rmmzTypes.ts';

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
 * Reports whether a page's own conditions hold on a fresh save, as Game_Event#meetsConditions judges them: every
 * switch and self switch reads off, every variable reads 0 and no item is held, so a page waiting for any of those
 * waits, while a page waiting for a variable to reach 0 or less has it already; and an actor condition holds for an
 * actor in the starting party.
 * @param {RmmzEventConditions} conditions The page's conditions.
 * @param {FreshSave} save What the new game starts with.
 * @returns {boolean} True when they all hold.
 */
const meetsOnFreshSave = (conditions: RmmzEventConditions, save: FreshSave): boolean =>
{
  // nothing a new game has yet turned on, picked up or set aside can ever be met.
  if (conditions.switch1Valid || conditions.switch2Valid || conditions.selfSwitchValid || conditions.itemValid)
  {
    return false;
  }

  // a variable reads 0, and the engine wants it at the page's value or above.
  if (conditions.variableValid && conditions.variableValue > 0)
  {
    return false;
  }

  // an actor counts only while it stands in the party.
  return conditions.actorValid === false || save.party.includes(conditions.actorId);
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

export { conditionWords, meetsOnFreshSave, NO_PARTY };
export type { FreshSave };
