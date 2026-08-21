import { NoteNormalizer } from '@services/utils/NoteNormalizer.ts';

/**
 * Reads and writes J-ABS-Food {@code <food:key>} on item notes.
 *
 * Unlike ingredient types, which stack freely, a consumable belongs to exactly one food group - eating it binds the
 * battler to that group's state chain, and only one chain runs at a time. So this reads a single value and writes at
 * most one line, replacing whatever was there rather than adding alongside it.
 */
class FoodTypeParser
{
  /**
   * One tag on its own line. The plugin's own pattern accepts letters only, so a key with digits would parse as a
   * shorter key than the author wrote.
   */
  static #line = /^\s*<food:\s?([a-zA-Z]+)>\s*$/;

  /**
   * Reads the food group a consumable belongs to.
   * @param {string} note The note text of an item.
   * @returns {string} The declared group key, or an empty string when the item is not food.
   */
  static readFoodType(note: string): string
  {
    const lines = NoteNormalizer.normalize(note)
      .split('\n');

    for (const line of lines)
    {
      const match = line.match(FoodTypeParser.#line);
      if (match === null)
      {
        continue;
      }

      // first one wins, matching the plugin, which stops at its first match rather than collecting them.
      return match[ 1 ].toLowerCase();
    }

    return '';
  }

  /**
   * Rewrites the food group on a note, leaving everything else untouched.
   * @param {string} note The note text to rewrite.
   * @param {string} key The group key to declare; an empty key removes the tag and makes the item ordinary again.
   * @returns {string} The note carrying at most one food tag.
   */
  static writeFoodType(
    note: string,
    key: string
  ): string
  {
    const withoutPrior = NoteNormalizer.removeLinesMatching(
      note,
      FoodTypeParser.#line
    );

    const trimmed = (key ?? '').trim()
      .toLowerCase();

    // a key the tag cannot express would never match at runtime, so it is treated as no key at all.
    if (trimmed.length === 0 || !/^[a-zA-Z]+$/.test(trimmed))
    {
      return withoutPrior;
    }

    return NoteNormalizer.prependBlock(withoutPrior, `<food:${trimmed}>`);
  }
}

export { FoodTypeParser };
