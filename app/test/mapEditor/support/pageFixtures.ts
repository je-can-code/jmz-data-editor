import { NO_PARTY } from '../../../src/mapEditor/core/pageRule/freshSave.ts';
import { activePageOf, readEvent, type PageRule } from '../../../src/mapEditor/core/pageRule/pageRule.ts';
import type { ActivePages } from '../../../src/mapEditor/core/pageRule/ShownPages.ts';

/**
 * The engine's own page rule on a fresh save, with no plugin adding a condition: an event shows its last page whose own
 * conditions a new game meets.
 */
const ENGINE_RULE: PageRule = { save: NO_PARTY, conditions: [] };

/**
 * Picks the page each event shows by a rule at a time of day, reading every event afresh each time it is asked, as a
 * lighting frame's pages answer.
 * @param {PageRule} rule The rule; by default the engine's own on a fresh save.
 * @param {number} timeOfDay The time of day, in minutes past midnight; by default midnight.
 * @returns {ActivePages} The pages.
 */
const pagesBy = (rule: PageRule = ENGINE_RULE, timeOfDay = 0): ActivePages =>
{
  return { activePage: event => activePageOf(readEvent(event, rule), { timeOfDay }) };
};

/**
 * The page each event shows by the engine's own rule on a fresh save, as most lighting frames under test read them.
 */
const ENGINE_PAGES: ActivePages = pagesBy();

export { ENGINE_PAGES, ENGINE_RULE, pagesBy };
