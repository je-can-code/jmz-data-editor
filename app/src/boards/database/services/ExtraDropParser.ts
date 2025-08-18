import RPGManager from "../../../services/RPGManager.ts";
import RPG_DropItem = Rmmz.Data.RPG_DropItem;
import RPG_DropHelper from "./DropHelper.ts";
import DropItemBuilder from "./DropItemBuilder.ts";
import RPG_Enemy = Rmmz.Implementations.RPG_Enemy;

type RPG_ExtraDropChance = [ dropType: 'i' | 'w' | 'a', dropId: number, chance: number ];

class ExtraDropManager
{
  /**
   * The regular expression structure to match the designated extra drop tags in a string.
   */
  static #regex: RegExp = /<drops: ?(\[(i|item|w|weapon|a|armor), ?(\d+), ?(\d+)])>/gmi;

  /**
   * Reads the note of an enemy based on its current state and parses out all {@link RPG_DropItem}s from it.
   * @param note The note of an enemy, typically.
   */
  static read(note: string): RPG_DropItem[]
  {
    // get the drops found on the note.
    const moreDrops = RPGManager.getArraysFromNotesByRegex(note, this.#regex, true) ?? [];

    // if there are no more drops, then skip processing.
    if (moreDrops.length === 0) return [];

    // a mapping function to build proper drop items from the arrays.
    const mapper = (drop: RPG_ExtraDropChance): RPG_DropItem =>
    {
      // deconstruct the array into drop properties.
      const [ dropType, dropId, chance ] = drop;

      // build the new drop item.
      return new DropItemBuilder()
        .setType(RPG_DropHelper.TypeFromLetter(dropType))
        .setId(dropId)
        .setChance(chance)
        .build();
    };

    // return the mapped the converted drops.
    // @ts-ignore
    return moreDrops.map(mapper);
  }

  /**
   * Writes a new note for the given enemy based on the provided extra drops.
   * @param originalNote The original note from the enemy to be modified.
   * @param extraDrops The extra drops being slotted onto the note.
   */
  static write(originalNote: string, extraDrops: RPG_DropItem[]): string
  {
    // remove all original extra drops.
    let newNote = originalNote
      .replace(this.#regex, "")
      .replace(/\r\r/gmi, '\r')
      .replace(/\n\n/gmi, '\n');

    while (newNote.endsWith('\r') || newNote.endsWith('\n'))
    {
      newNote = newNote.slice(0, newNote.length - 1);
    }

    // build the new tags.
    let newTags = "";
    extraDrops
      .forEach((extraDrop, index) =>
      {
        // build the new tag with the data points from the drop.
        const letterDropTypeKind = RPG_DropHelper.LetterFromType(extraDrop.kind);
        let tag = `<drops:[${letterDropTypeKind},${extraDrop.dataId},${extraDrop.denominator}]>`;

        // add the tag.
        newTags += `${tag}`;

        // check if we're still going through the list.
        if (index !== extraDrops.length - 1)
        {
          // add a new line at the end.
          newTags += "\n";
        }
      });

    const combinedNote = this.#cleanupLineEndings(`${newNote}\n${newTags}`);

    // return the new note plus all the extra drops.
    return combinedNote;
  }

  static #cleanupLineEndings(note: string): string
  {
    return note
      .replace(/\r\r/gmi, '\r')
      .replace(/\n\n/gmi, '\n')
  }
}

export { ExtraDropManager };