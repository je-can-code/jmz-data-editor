import type { NameLookup } from '../commands/sentence.ts';
import { PRIORITY_OPTIONS, TRIGGER_OPTIONS } from '../eventKinds/pageFields.ts';
import type { RmmzEventPage } from '../model/rmmzTypes.ts';
import { describePageConditions } from './pageConditions.ts';

/**
 * Finds an option's label by its value, or the bare value when no option names it.
 * @param {readonly { value: number, label: string }[]} options The options.
 * @param {number} value The value.
 * @returns {string} The label.
 */
const labelOf = (options: readonly { readonly value: number; readonly label: string }[], value: number): string =>
{
  return options.find(option => option.value === value)?.label ?? String(value);
};

/**
 * Words what a page waits for and how it starts, for its tab: what its conditions ask, or that it asks nothing, then
 * its trigger and priority. A tab says only its page's number, so this is what tells pages apart at a glance.
 * @param {RmmzEventPage} page The page.
 * @param {NameLookup} names Names ids; ids read as numbers without a name.
 * @returns {string[]} The lines.
 */
const describePageTab = (page: RmmzEventPage, names: NameLookup): string[] =>
{
  const conditions = describePageConditions(page.conditions, names);
  return [
    ...(conditions.length === 0 ? [ 'No conditions' ] : conditions),
    `${labelOf(TRIGGER_OPTIONS, page.trigger)}, ${labelOf(PRIORITY_OPTIONS, page.priorityType).toLowerCase()}`,
  ];
};

export { describePageTab };
