export default class RPG_DropHelper
{
  /**
   * The various types of {@link RPG_DropItem} that can be produced.
   */
  static Types = {
    /**
     * The drop item type that maps to "items" in the database.
     */
    Item: 1,

    /**
     * The drop item type that maps to "weapons" in the database.
     */
    Weapon: 2,

    /**
     * The drop item type that maps to "armors" in the database.
     */
    Armor: 3,
  }

  /**
   * Translates a letter or word drop item type into its numeric counterpart.
   * @param {i|w|a} letter The letter to translate.
   * @returns {1|2|3} The numeric drop item type.
   */
  static TypeFromLetter = (letter: 'i' | 'item' | 'w' | 'weapon' | 'a' | 'armor'): number =>
  {
    // pivot on the lowercase version of the letter.
    switch (true)
    {
      // "i" for "item".
      case [ 'i', 'item' ].includes(letter.toLowerCase()):
        return this.Types.Item;

      // "w" for "weapon".
      case [ 'w', 'weapon' ].includes(letter.toLowerCase()):
        return this.Types.Weapon;

      // "a" for "armor".
      case [ 'a', 'armor' ].includes(letter.toLowerCase()):
        return this.Types.Armor;

      // don't use this with invalid item types.
      default:
        throw new Error(`invalid item type letter provided: [${letter}].`);
    }
  }

  /**
   * Translates a {@link RPG_DropItem} "kind" into its corresponding letter.
   * @param {1|2|3} dropType
   * @returns {'i'|'w'|'a'}
   */
  static LetterFromType = (dropType: number): 'i' | 'w' | 'a' =>
  {
    switch (dropType)
    {
      case 1:
        return 'i';
      case 2:
        return 'w';
      case 3:
        return 'a';
      default:
        throw new Error(`invalid drop type (kind): [${dropType}].`);
    }
  }
}