import { NoteNormalizer } from '../utils/NoteNormalizer.ts';
import NoteReader from '@services/utils/NoteReader.ts';

class ApParser
{
  static #apRegex = /<ap:\s*(\d+)>/gi;

  /**
   * Reads the AP reward value from a note.
   * @param note The note to parse.
   * @returns The AP reward value or null if not found.
   */
  static readAp(note: string): number | null
  {
    const dummy = { note } as any;
    return NoteReader.getNumberFromNoteByRegex(dummy, this.#apRegex, true);
  }

  /**
   * Writes the AP reward value to a note.
   * @param originalNote The original note to update.
   * @param ap The AP reward value to write.
   * @returns The updated note.
   */
  static writeAp(
    originalNote: string,
    ap: number
  ): string
  {
    const newTag = `<ap:${ap}>`;

    // ensure only one ap tag by removing then appending
    const base = NoteNormalizer.removeLinesMatching(originalNote, this.#apRegex);
    return NoteNormalizer.appendBlock(base, newTag);
  }

  /**
   * Deletes the AP reward tag from the note.
   * @param note The note to cleanup.
   * @returns The cleaned up note.
   */
  static deleteAp(note: string): string
  {
    return NoteNormalizer.removeLinesMatching(note, this.#apRegex);
  }
}

export { ApParser };
