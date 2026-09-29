/**
 * Replaces one entry of a list with a copy of itself carrying the given changes. The copy keeps the entry's
 * prototype, so a domain model is still a domain model afterwards, `toRmmz` and all.
 *
 * Call it from inside a React state updater, against the list React hands the updater. A board that builds
 * the copy from the entry it last rendered instead loses edits: two changes made in one click both start
 * from that same render, and the second quietly puts back whatever the first one changed.
 * @param {T[]} list The list as it stands right now.
 * @param {number} index The index of the entry to change.
 * @param {Partial<T>} partial The changes to make to that entry.
 * @returns {T[]} A new list holding a new entry at that index, and every other entry exactly as it was.
 */
const patchAt = <T extends object>(list: T[], index: number, partial: Partial<T>): T[] =>
{
  return list.map((entry, entryIndex) =>
  {
    // leave every other entry exactly as it was.
    if (entryIndex !== index)
    {
      return entry;
    }

    // copy onto the same prototype, so a domain model stays a domain model.
    return Object.assign(Object.create(Object.getPrototypeOf(entry)), entry, partial);
  });
};

export { patchAt };
