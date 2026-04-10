import NoteReader from '../utils/NoteReader.ts';
import { NoteNormalizer } from '../utils/NoteNormalizer.ts';
import RPG_Enemy = Rmmz.Implementations.RPG_Enemy;

class LevelParser
{
  static #regex: RegExp = /<level: ?(\d+)>/gi;

  static read(enemy: RPG_Enemy): number
  {
    return NoteReader.getNumberFromNoteByRegex(enemy, this.#regex) ?? 0;
  }

  static write(
    originalNote: string,
    level: number
  ): string
  {
    if (level <= 0)
    {
      // remove any existing level lines and normalize
      return NoteNormalizer.removeLinesMatching(originalNote, this.#regex);
    }

    const newTag = `<level:${level}>`;

    let newNote = originalNote;
    if (originalNote.match(this.#regex))
    {
      // inline replace to preserve position
      newNote = originalNote.replace(this.#regex, newTag);
      return NoteNormalizer.normalize(newNote);
    }

    // preserve current behavior: add at the top when absent
    newNote = `${newTag}\n${newNote}`;
    return NoteNormalizer.normalize(newNote);
  }
}

export { LevelParser };

/*
      points     stats
1:      100       10
5:      250       20
10:    1500       50
20:    5000       75
35:   15000      150
50:   30000      250
70:  100000      450
100: 250000      750
 */
