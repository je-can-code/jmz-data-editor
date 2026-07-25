import NoteReader from '../utils/NoteReader.ts';
import { NoteNormalizer } from '../utils/NoteNormalizer.ts';

class UnslottedSkillsParser
{
  /**
   * Matches `<unslottedSkills:[skillId, skillId, ...]>`, mirroring `J.SKS.RegExp.UnslottedSkills`.
   */
  static #regex: RegExp = /<unslottedSkills:[ ]?(\[[\d, ]+])>/gi;

  /**
   * Reads every `<unslottedSkills:[...]>` tag off a note, flattened and deduped into one list.
   * Mirrors `Game_Actor.prototype.forcedUnslottedSkillIds()` in `sks/core`, which merges every
   * tag found across all of a battler's note sources the same way.
   */
  static read(note: string): number[]
  {
    const arraysFound = NoteReader.getArraysFromNotesByRegex(note, this.#regex, true) ?? [];
    const flattened = arraysFound.flat() as number[];
    return [ ...new Set(flattened) ];
  }

  /**
   * Writes the given skill ids back onto the note as a single `<unslottedSkills:[...]>` line,
   * replacing every existing line matching the tag while leaving the rest of the note untouched.
   */
  static write(
    originalNote: string,
    skillIds: number[]
  ): string
  {
    const base = NoteNormalizer.removeLinesMatching(originalNote, this.#regex);

    if (skillIds.length === 0)
    {
      return base;
    }

    const newBlock = `<unslottedSkills:[${skillIds.join(',')}]>`;
    return NoteNormalizer.appendBlock(base, newBlock);
  }
}

export { UnslottedSkillsParser };
