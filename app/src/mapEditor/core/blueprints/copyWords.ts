import { lineFieldName, type FieldPlace } from './blueprintFields.ts';
import { differencesOf, type CopyDifferences, type CopyFieldState, type CopyReading } from './copyReading.ts';
import { amountText } from './fieldLinks.ts';

/**
 * A reading of an event that is a copy of a blueprint, whatever came of it.
 */
type LinkedReading = Exclude<CopyReading, { readonly kind: 'plain' }>;

/**
 * What a copy's commands do when they name other events of its blueprint whose copies on its map can't be told, said the
 * same way wherever it is said: on the commands' row, in the copy's summary, in where-used, and when following them is
 * refused. Its subject, the commands, comes before it.
 */
const NAMES_GROUP_WORDS = 'name other events in the blueprint, so this copy keeps its own';

/**
 * Names a field of a copy the way an author knows it, in lowercase, as the event window labels it: "name", "speed",
 * "graphic", "commands", or a module's tag field by the module's own words, such as "sight" or "light 1 radius". A tag
 * whose module gives no words goes by its name on the page.
 * @param {FieldPlace} place Where the field sits.
 * @returns {string} The words.
 */
const fieldWords = (place: FieldPlace): string =>
{
  switch (place.kind)
  {
    case 'name':
      return 'name';
    case 'note':
      return 'note';
    case 'page':
      return place.field.words;
    case 'commands':
      return 'commands';
    case 'tag':
      return place.tag.words === undefined
        ? lineFieldName(place.line, place.field)
        : place.tag.words(place.line, place.field);
  }
};

/**
 * Names the page a field sits on, for a step's name, the way the event window's tabs number pages: nothing for the name or
 * the note, which belong to no page.
 * @param {FieldPlace} place Where the field sits.
 * @returns {string} Such as " (page 2)", or nothing.
 */
const pageWords = (place: FieldPlace): string =>
{
  return place.kind === 'name' || place.kind === 'note'
    ? ''
    : ` (page ${place.page + 1})`;
};

/**
 * Writes an offset with its sign: +2, -1, +0.5.
 * @param {number} amount The offset, never 0.
 * @returns {string} The offset.
 */
const offsetText = (amount: number): string =>
{
  return `${amount < 0 ? '-' : '+'}${amountText(Math.abs(amount))}`;
};

/**
 * Says where a field of a copy stands, in plain words: "Follows the blueprint", "Follows the blueprint, +1", "Pinned at 3",
 * "Set by hand", "These commands name other events in the blueprint, so this copy keeps its own", "Only on this copy", or
 * "Not on this copy".
 * @param {CopyFieldState} state Where it stands.
 * @returns {string} The words.
 */
const stateWords = (state: CopyFieldState): string =>
{
  switch (state.kind)
  {
    case 'follows':
      return 'Follows the blueprint';
    case 'offset':
      return `Follows the blueprint, ${offsetText(state.amount)}`;
    case 'pinned':
      return `Pinned at ${amountText(state.value)}`;
    case 'own':
      return 'Set by hand';
    case 'names-group':
      return `These commands ${NAMES_GROUP_WORDS}`;
    case 'copy-only':
      return 'Only on this copy';
    case 'blueprint-only':
      return 'Not on this copy';
  }
};

/**
 * Names what a copy copies, the way its panel heads it: the blueprint by name, and the blueprint's event it was made from,
 * by the id the blueprint knows it by. A copy whose blueprint is gone can only say so.
 * @param {LinkedReading} reading The copy, read against its blueprint.
 * @returns {string} Such as "Copy of "Needler nest" (event 2)".
 */
const copyTitle = (reading: LinkedReading): string =>
{
  return reading.blueprint === null
    ? 'Copy of a blueprint that is gone'
    : `Copy of "${reading.blueprint.name}" (event ${reading.link.eventId})`;
};

/**
 * Says how a copy stands apart from its blueprint, kind by kind, leaving out the kinds it has none of, the first counted
 * in fields: "2 fields set by hand, 1 pinned, 1 at an offset", or "1 field pinned". Offsets are counted only when asked,
 * since a number at an offset still follows the blueprint; choices set by hand and pinned numbers never do.
 * @param {CopyDifferences} differences The counts.
 * @param {boolean} offsets Whether to count offsets too.
 * @returns {string} The words; empty when there is nothing to count.
 */
const differenceWords = (differences: CopyDifferences, offsets: boolean): string =>
{
  const kinds: readonly (readonly [ number, string ])[] = [
    [ differences.own, 'set by hand' ],
    [ differences.pinned, 'pinned' ],
    [ offsets ? differences.offsets : 0, 'at an offset' ],
  ];
  return kinds
    .filter(([ count ]) => count > 0)
    .map(([ count, words ], index) =>
    {
      // the first kind says what is counted; the rest read on from it.
      const noun = count === 1 ? 'field' : 'fields';
      return index === 0 ? `${count} ${noun} ${words}` : `${count} ${words}`;
    })
    .join(', ');
};

/**
 * Starts words with a capital.
 * @param {string} words The words.
 * @returns {string} The words, capitalised.
 */
const capitalised = (words: string): string =>
{
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
};

/**
 * Says how a copy stands against its blueprint as a whole, as a sentence: how far it stands apart, offsets and all, when
 * it was read field by field, or that it follows in everything, and then whether its commands name other events of the
 * blueprint, which it keeps as its own; why no change to the blueprint reaches it, when it has drifted; and why there is
 * nothing to read it against, when it is lost.
 * @param {LinkedReading} reading The copy, read.
 * @returns {string} Such as "2 fields set by hand, 1 pinned." or "Follows the blueprint in everything."
 */
const summaryWords = (reading: LinkedReading): string =>
{
  if (reading.kind === 'lost')
  {
    return `${capitalised(reading.reason)}.`;
  }

  if (reading.kind === 'drifted')
  {
    return `No change to the blueprint reaches it: ${reading.reason}.`;
  }

  const differences = differencesOf(reading.fields);
  const apart = differenceWords(differences, true);
  if (differences.group === 0)
  {
    return apart === ''
      ? 'Follows the blueprint in everything.'
      : `${capitalised(apart)}.`;
  }

  // commands kept for naming the others of the group are said after the counts, in the words their row says them in.
  return apart === ''
    ? `Follows the blueprint, but its commands ${NAMES_GROUP_WORDS}.`
    : `${capitalised(apart)}. Its commands ${NAMES_GROUP_WORDS}.`;
};

/**
 * Says how far one copy stands apart from its blueprint, for the where-used list to mark beside it: its choices set by
 * hand and its numbers pinned, counted, then its commands kept for naming other events of the blueprint, in the words the
 * copy's own panel says them in. Offsets are left out, since a number at an offset still follows the blueprint.
 * @param {CopyDifferences} differences The counts.
 * @returns {string} The words, such as "1 field set by hand; its commands name other events in the blueprint, so this
 * copy keeps its own"; empty when there is nothing to mark.
 */
const markWords = (differences: CopyDifferences): string =>
{
  const counted = differenceWords(differences, false);
  const group = differences.group > 0 ? `its commands ${NAMES_GROUP_WORDS}` : '';
  return [ counted, group ].filter(words => words !== '').join('; ');
};

export {
  capitalised,
  copyTitle,
  differenceWords,
  fieldWords,
  markWords,
  NAMES_GROUP_WORDS,
  offsetText,
  pageWords,
  stateWords,
  summaryWords,
};
export type { LinkedReading };
