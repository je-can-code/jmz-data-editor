import NoteReader from "../utils/NoteReader.ts";
import RPG_DropHelper from "../utils/DropHelper.ts";
import DropItemBuilder from "../utils/DropItemBuilder.ts";
import { NoteNormalizer } from "../utils/NoteNormalizer.ts";
import RPG_DropItem = Rmmz.Data.RPG_DropItem;

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
    const moreDrops = NoteReader.getArraysFromNotesByRegex(note, this.#regex, true) ?? [];

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
    // remove all original extra drops lines
    const base = NoteNormalizer.removeLinesMatching(originalNote, this.#regex);

    // build new tags as a block
    const newBlock = extraDrops.map(extraDrop =>
      {
        const letter = RPG_DropHelper.LetterFromType(extraDrop.kind);
        return `<drops:[${letter},${extraDrop.dataId},${extraDrop.denominator}]>`;
      })
      .join('\n');

    // if no new drops, return the cleaned base
    if (!newBlock)
    {
      return base;
    }

    // append the block in a normalized way
    return NoteNormalizer.appendBlock(base, newBlock);
  }
}

export { ExtraDropManager };