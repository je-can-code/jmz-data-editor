import NoteReader from '../utils/NoteReader.ts';
import { NoteNormalizer } from '../utils/NoteNormalizer.ts';

/**
 * Reads and writes the actors a class is set aside for (J-Classes).
 *
 * A class naming no actors is open to anyone. A class naming some unlocks only for them, and waits in
 * their class lists as "???" until they do.
 */
class UnlockableForActorsParser
{
  /**
   * Matches `<unlockableForActors:[actorId, actorId, ...]>`, mirroring `J.CLASS.RegExp.UnlockableForActors`.
   */
  static #regex: RegExp = /<unlockableForActors: ?(\[[\d, ]+])>/gi;

  /**
   * Reads every actor a class's note sets it aside for, flattened across every tag and listed once each.
   * The game merges every tag on the class the same way.
   * @param {string} note The class's note.
   * @returns {number[]} The actor ids, in the order they first appear; empty when the class is open to anyone.
   */
  static read(note: string): number[]
  {
    // a note with no tag at all is a class open to anyone.
    const arraysFound = NoteReader.getArraysFromNotesByRegex(note, this.#regex, true) ?? [];

    // every tag's actors together, each once.
    const flattened = arraysFound.flat() as number[];
    return [ ...new Set(flattened) ];
  }

  /**
   * Writes the given actors back onto a class's note as a single tag, replacing every tag already there
   * while leaving the rest of the note untouched.
   * @param {string} originalNote The class's note as it stands.
   * @param {number[]} actorIds The actors the class is set aside for; empty opens it to anyone.
   * @returns {string} The rewritten note.
   */
  static write(
    originalNote: string,
    actorIds: number[]
  ): string
  {
    // clear out every existing tag first, so the note never carries two opinions.
    const base = NoteNormalizer.removeLinesMatching(originalNote, this.#regex);

    // a class open to anyone carries no tag at all.
    if (actorIds.length === 0)
    {
      return base;
    }

    const newBlock = `<unlockableForActors:[${actorIds.join(',')}]>`;
    return NoteNormalizer.appendBlock(base, newBlock);
  }
}

export { UnlockableForActorsParser };
