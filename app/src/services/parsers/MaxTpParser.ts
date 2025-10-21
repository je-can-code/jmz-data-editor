import NoteReader from "../utils/NoteReader.ts";
import { NoteNormalizer } from "../utils/NoteNormalizer.ts";

class MaxTpParser
{
  static #regex = /<maxTp: ?(-?\d+)>/gi;

  static read(note: string): number
  {
    // Use NoteReader directly with a synthetic RPG_Base-like object not required,
    // we just want a number out of the note string.
    // We’ll mimic LevelParser semantics: return 0 when absent.
    const dummy = { note } as any;
    return NoteReader.getNumberFromNoteByRegex(dummy, this.#regex) ?? 0;
  }

  static write(originalNote: string, maxTp: number): string
  {
    if (maxTp === 0)
    {
      // remove any existing tag line(s) and normalize
      return NoteNormalizer.removeLinesMatching(originalNote, this.#regex);
    }

    const newTag = `<maxTp:${maxTp}>`;

    // If present, replace inline to preserve position
    if (originalNote.match(this.#regex))
    {
      const replaced = originalNote.replace(this.#regex, newTag);
      return NoteNormalizer.normalize(replaced);
    }

    // Absent: put it at the top (mirrors LevelParser behavior)
    const newNote = `${newTag}\n${originalNote}`;
    return NoteNormalizer.normalize(newNote);
  }
}

export { MaxTpParser };