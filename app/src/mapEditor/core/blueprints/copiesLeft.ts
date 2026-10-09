import { isOutsideStep, type DocumentHub } from '../history/DocumentHub.ts';
import { eventHistoryKey, mapHistoryKey, TREE_HISTORY_KEY } from '../history/historyKeys.ts';
import type { HistoryStep } from '../history/HistoryStep.ts';
import type { LeftPart } from '../history/stepParts.ts';
import { mapDocumentKey, parseDocumentKey, type DocumentKey } from '../model/documentKeys.ts';
import type { HistoryDirection, LeftWords } from '../workspace/HistoryRouter.ts';
import { documentLabel } from '../../views/documentLabels.ts';

/**
 * How many of the things a move left are named one by one; the rest are only counted.
 */
const MOST_NAMED = 5;

/**
 * One thing a move left, as the author knows it: a copy of a blueprint's event on a map, some of a map's tiles, or some
 * other part of a document; each with the newest change in its way.
 */
type LeftThing =
  | { readonly kind: 'copy'; readonly mapId: number; readonly eventId: number; readonly by: HistoryStep | null }
  | { readonly kind: 'tiles'; readonly mapId: number; readonly count: number; readonly by: HistoryStep | null }
  | { readonly kind: 'other'; readonly document: DocumentKey; readonly by: HistoryStep | null };

/**
 * What the words need to name things.
 */
type CopyNaming = {
  /**
   * The window's documents, which hold the maps whose copies are named.
   */
  readonly hub: Pick<DocumentHub, 'has' | 'map'>;

  /**
   * Names a map as the project names it.
   * @param {number} mapId The map.
   * @returns {string} Its name, such as "Riverside Stroll", or "Map 12" while it is not known.
   */
  readonly mapName: (mapId: number) => string;
};

/**
 * Counts something in words.
 * @param {number} count How many.
 * @param {string} one The word for one.
 * @param {string} many The word for more.
 * @returns {string} Such as "1 copy" or "3 copies".
 */
const counted = (count: number, one: string, many: string): string =>
{
  return `${count} ${count === 1 ? one : many}`;
};

/**
 * Joins words as a list is said: "a", "a and b", "a, b and c".
 * @param {readonly string[]} words The words.
 * @returns {string} The list.
 */
const spokenList = (words: readonly string[]): string =>
{
  return words.length < 2
    ? words.join('')
    : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
};

/**
 * Reads which thing a part left is: a copy, when its path reaches into an event on a map; a map's tiles; or anything
 * else, by its document.
 * @param {LeftPart} part The part.
 * @returns {LeftThing} The thing.
 */
const thingOf = (part: LeftPart): LeftThing =>
{
  const parsed = parseDocumentKey(part.document);
  const { patch, by } = part;
  if (parsed.kind !== 'map')
  {
    return { kind: 'other', document: part.document, by };
  }

  if (patch.kind === 'tiles')
  {
    return { kind: 'tiles', mapId: parsed.mapId, count: patch.indices.length, by };
  }

  const [ field, eventId ] = patch.kind === 'resize' ? [] : patch.path;
  return field === 'events' && typeof eventId === 'number'
    ? { kind: 'copy', mapId: parsed.mapId, eventId, by }
    : { kind: 'other', document: part.document, by };
};

/**
 * Names a thing a move left, so the parts of one copy, or of one map's tiles, gather as one.
 * @param {LeftThing} thing The thing.
 * @returns {string} Its key.
 */
const keyOf = (thing: LeftThing): string =>
{
  switch (thing.kind)
  {
    case 'copy':
      return `copy:${thing.mapId}:${thing.eventId}`;
    case 'tiles':
      return `tiles:${thing.mapId}`;
    case 'other':
      return `other:${thing.document}`;
  }
};

/**
 * Gathers the parts a move left into the things the author knows: each copy once, however many of its fields were left,
 * with the change in the way of the first; each map's tiles once, counted cell by cell.
 * @param {readonly LeftPart[]} left The parts.
 * @returns {LeftThing[]} The things, in the order they were first left.
 */
const thingsOf = (left: readonly LeftPart[]): LeftThing[] =>
{
  const things = new Map<string, LeftThing>();
  left.map(thingOf).forEach(thing =>
  {
    const key = keyOf(thing);
    const known = things.get(key);
    if (known === undefined)
    {
      things.set(key, thing);
    }
    else if (known.kind === 'tiles' && thing.kind === 'tiles')
    {
      things.set(key, { ...known, count: known.count + thing.count });
    }
  });

  return [ ...things.values() ];
};

/**
 * Says where the change in a thing's way can be undone from: the window of the copy's own event, the map, its blueprint,
 * or the map tree, by the history that change sits in; or that it was made on disk, or outside the editor, where nothing
 * here can undo it.
 * @param {HistoryStep | null} by The change, or null for a file changed on disk.
 * @param {number} mapId The map the thing is on.
 * @param {number | null} eventId The copy, or null for a map's tiles.
 * @returns {string} The words, such as "whose own change can be undone in its event window".
 */
const whereUndone = (by: HistoryStep | null, mapId: number, eventId: number | null): string =>
{
  if (by === null)
  {
    return 'changed on disk';
  }

  if (isOutsideStep(by))
  {
    return 'changed outside the editor';
  }

  const subject = eventId === null ? 'whose painting' : 'whose own change';
  if (eventId !== null && by.histories.includes(eventHistoryKey(mapId, eventId)))
  {
    return `${subject} can be undone in its event window`;
  }

  if (by.histories.includes(mapHistoryKey(mapId)))
  {
    return `${subject} can be undone on the map`;
  }

  if (by.histories.some(key => key.startsWith('blueprint:')))
  {
    return `${subject} can be undone in its blueprint`;
  }

  if (by.histories.includes(TREE_HISTORY_KEY))
  {
    return `${subject} can be undone in the map tree`;
  }

  return by.histories.length === 0
    ? `${subject} can no longer be undone`
    : `${subject} can be undone where it was made`;
};

/**
 * Names a copy as the author finds it: its name and its id, or its id alone once it has no name or is gone.
 * @param {CopyNaming} naming What names things.
 * @param {number} mapId The map.
 * @param {number} eventId The copy.
 * @returns {string} Such as "Bandit (event 12)".
 */
const copyName = (naming: CopyNaming, mapId: number, eventId: number): string =>
{
  const key = mapDocumentKey(mapId);
  const event = naming.hub.has(key) ? naming.hub.map(key).event(eventId) : null;
  return event === null || event.name.trim() === ''
    ? `event ${eventId}`
    : `${event.name} (event ${eventId})`;
};

/**
 * Words one thing a move left, with where the change in its way can be undone from.
 * @param {CopyNaming} naming What names things.
 * @param {LeftThing} thing The thing.
 * @returns {string} Such as "Bandit (event 12) on Riverside Stroll, whose own change can be undone in its event window".
 */
const thingWords = (naming: CopyNaming, thing: LeftThing): string =>
{
  switch (thing.kind)
  {
    case 'copy':
      return `${copyName(naming, thing.mapId, thing.eventId)} on ${naming.mapName(thing.mapId)}, ${whereUndone(thing.by, thing.mapId, thing.eventId)}`;
    case 'tiles':
      return `${counted(thing.count, 'tile', 'tiles')} on ${naming.mapName(thing.mapId)}, ${whereUndone(thing.by, thing.mapId, null)}`;
    case 'other':
      return `${documentLabel(thing.document)}, changed since`;
  }
};

/**
 * Builds the words an undo or a redo of a blueprint's change gives when it left copies changed since as they stand (see
 * DocumentHub's HistoryCheck): that it moved all the same, how many copies and tiles it left, and each by name, on its
 * map, with where the change in its way can be undone from, so the author can take that back first and move this again.
 * For example: "Undone, except on 1 copy changed since: Bandit (event 12) on Riverside Stroll, whose own change can be
 * undone in its event window." Past five things, the rest are counted.
 * @param {CopyNaming} naming The window's documents, and how it names a map.
 * @returns {LeftWords} The words.
 */
const copiesLeftWords = (naming: CopyNaming): LeftWords =>
{
  return (_step: HistoryStep, left: readonly LeftPart[], direction: HistoryDirection): string =>
  {
    const things = thingsOf(left);
    const copies = things.filter(thing => thing.kind === 'copy').length;
    const tiles = things.reduce((sum, thing) => sum + (thing.kind === 'tiles' ? thing.count : 0), 0);
    const others = things.filter(thing => thing.kind === 'other').length;
    const counts = [
      ...(copies > 0 ? [ counted(copies, 'copy', 'copies') ] : []),
      ...(tiles > 0 ? [ counted(tiles, 'tile', 'tiles') ] : []),
      ...(others > 0 ? [ counted(others, 'other part', 'other parts') ] : []),
    ];
    const named = things.slice(0, MOST_NAMED).map(thing => thingWords(naming, thing));
    const rest = things.length > MOST_NAMED ? [ `${things.length - MOST_NAMED} more` ] : [];
    const verb = direction === 'backward' ? 'Undone' : 'Redone';
    return `${verb}, except on ${spokenList(counts)} changed since: ${[ ...named, ...rest ].join('; ')}.`;
  };
};

export { copiesLeftWords };
export type { CopyNaming };
