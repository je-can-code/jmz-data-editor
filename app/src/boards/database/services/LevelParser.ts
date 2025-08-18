import RPGManager from "../../../services/RPGManager.ts";
import RPG_Enemy = Rmmz.Implementations.RPG_Enemy;

class LevelParser
{
  static #regex: RegExp = /<level: ?(\d+)>/gi;

  static read(enemy: RPG_Enemy): number
  {
    return RPGManager.getNumberFromNoteByRegex(enemy, this.#regex) ?? 0;
  }

  static write(originalNote: string, level: number): string
  {
    console.log('WRITE START');
    console.log(originalNote);

    const newTag = level <= 0
      ? ""
      : `<level:${level}>`;

    let newNote = originalNote;
    if (originalNote.match(this.#regex))
    {
      newNote = originalNote.replace(this.#regex, newTag);
    }
    else if (level > 0)
    {
      newNote = `${newTag}\n${newNote}`;
    }

    const combinedNote = this.#cleanupLineEndings(newNote);
    console.log(combinedNote);

    return combinedNote;
  }

  static #cleanupLineEndings(note: string): string
  {
    return note
      .replace(/\r\r/gmi, '\r')
      .replace(/\n\n/gmi, '\n')
  }
}

export { LevelParser }

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