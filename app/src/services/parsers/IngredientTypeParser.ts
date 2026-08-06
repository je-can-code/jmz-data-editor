import { NoteNormalizer } from '@services/utils/NoteNormalizer.ts';

/**
 * Reads and writes J-JAFTING-Creation {@code <ingredientType:key>} lines on item, weapon, and armor notes.
 *
 * An entry carries one line per type it counts as, and the plugin matches a recipe slot only when the entry carries
 * every type that slot asks for. Extra types never disqualify anything, so the vocabulary stacks freely - the same
 * flank can be protein, meat, and flank all at once, and a slot asking for any one of those will accept it.
 */
class IngredientTypeParser
{
  /**
   * One tag on its own line. The plugin scans line by line, so a line holding anything else is not a match.
   */
  static #line = /^\s*<ingredientType:\s?(\w+)>\s*$/i;

  /**
   * Reads every ingredient type an entry declares.
   * @param {string} note The note text of an item, weapon, or armor.
   * @returns {string[]} The declared type keys, deduplicated, in the order they were written.
   */
  static readIngredientTypes(note: string): string[]
  {
    const lines = NoteNormalizer.normalize(note)
      .split('\n');
    const seen = new Set<string>();
    const order: string[] = [];

    for (const line of lines)
    {
      const match = line.match(IngredientTypeParser.#line);
      if (match === null)
      {
        continue;
      }

      // the plugin matches these case-insensitively, so two spellings of one key are the same type.
      const key = match[ 1 ].toLowerCase();
      if (seen.has(key))
      {
        continue;
      }

      seen.add(key);
      order.push(key);
    }

    return order;
  }

  /**
   * Rewrites the ingredient type lines on a note, leaving everything else untouched.
   * @param {string} note The note text to rewrite.
   * @param {string[]} keys The type keys the entry should declare; blanks and duplicates are dropped.
   * @returns {string} The note with its prior ingredient type lines replaced by one line per key.
   */
  static writeIngredientTypes(
    note: string,
    keys: string[]
  ): string
  {
    const withoutPrior = NoteNormalizer.removeLinesMatching(
      note,
      IngredientTypeParser.#line
    );

    const seen = new Set<string>();
    const unique: string[] = [];
    for (const key of keys)
    {
      const trimmed = (key ?? '').trim()
        .toLowerCase();

      // a key the tag cannot express is worse than no key at all: the plugin would never match it, silently.
      if (trimmed.length === 0 || !/^\w+$/.test(trimmed) || seen.has(trimmed))
      {
        continue;
      }

      seen.add(trimmed);
      unique.push(trimmed);
    }

    if (unique.length === 0)
    {
      return withoutPrior;
    }

    const block = unique
      .map(key => `<ingredientType:${key}>`)
      .join('\n');

    return NoteNormalizer.prependBlock(withoutPrior, block);
  }
}

export { IngredientTypeParser };
