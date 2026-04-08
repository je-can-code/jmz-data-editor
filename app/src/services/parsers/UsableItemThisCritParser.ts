import { NoteNormalizer } from "@services/utils/NoteNormalizer.ts";

/**
 * Reads and writes J-CriticalFactors per-action crit tags on skill/item notes.
 */
class UsableItemThisCritParser
{
  static #chanceLine = /^\s*<thisCritChance:\[([^\]]+)]>\s*$/i;

  static #multiplierLine = /^\s*<thisCritDamageMultiplier:\[([^\]]+)]>\s*$/i;

  static #alwaysLine = /^\s*<thisCritsAlways>\s*$/i;

  /**
   * @param note Usable item note text.
   */
  static readThisCritChance(note: string): string
  {
    return UsableItemThisCritParser.#readLastBracketInner(
      note,
      UsableItemThisCritParser.#chanceLine
    );
  }

  /**
   * @param note Usable item note text.
   */
  static readThisCritDamageMultiplier(note: string): string
  {
    return UsableItemThisCritParser.#readLastBracketInner(
      note,
      UsableItemThisCritParser.#multiplierLine
    );
  }

  /**
   * @param note Usable item note text.
   */
  static readThisCritsAlways(note: string): boolean
  {
    const lines = NoteNormalizer.normalize(note)
      .split("\n");
    for (const line of lines)
    {
      UsableItemThisCritParser.#alwaysLine.lastIndex = 0;
      if (UsableItemThisCritParser.#alwaysLine.test(line))
      {
        return true;
      }
    }
    return false;
  }

  /**
   * @param note Note text.
   * @param formula Inner formula; empty after trim removes the tag line.
   */
  static writeThisCritChance(note: string, formula: string): string
  {
    return UsableItemThisCritParser.#writeBracketTag(
      note,
      UsableItemThisCritParser.#chanceLine,
      (inner) => `<thisCritChance:[${inner}]>`,
      formula
    );
  }

  /**
   * @param note Note text.
   * @param formula Inner formula; empty after trim removes the tag line.
   */
  static writeThisCritDamageMultiplier(note: string, formula: string): string
  {
    return UsableItemThisCritParser.#writeBracketTag(
      note,
      UsableItemThisCritParser.#multiplierLine,
      (inner) => `<thisCritDamageMultiplier:[${inner}]>`,
      formula
    );
  }

  /**
   * @param note Note text.
   * @param enabled When true, ensures {@code <thisCritsAlways>}; when false, strips it.
   */
  static writeThisCritsAlways(note: string, enabled: boolean): string
  {
    let n = NoteNormalizer.removeLinesMatching(
      note,
      UsableItemThisCritParser.#alwaysLine
    );
    n = n.replace(/<thisCritsAlways>/gi, "");
    n = NoteNormalizer.normalize(n);

    if (enabled === false)
    {
      return n;
    }

    return NoteNormalizer.prependBlock(n, "<thisCritsAlways>");
  }

  static #readLastBracketInner(note: string, lineRegex: RegExp): string
  {
    const lines = NoteNormalizer.normalize(note)
      .split("\n");
    let last = "";
    for (const line of lines)
    {
      lineRegex.lastIndex = 0;
      const m = line.match(lineRegex);
      if (m !== null)
      {
        last = m[1].trim();
      }
    }
    return last;
  }

  static #writeBracketTag(
    note: string,
    lineRegex: RegExp,
    buildTag: (inner: string) => string,
    formula: string
  ): string
  {
    const inner = formula.trim();
    let n = NoteNormalizer.removeLinesMatching(note, lineRegex);
    n = NoteNormalizer.normalize(n);

    if (inner === "")
    {
      return n;
    }

    const tag = buildTag(inner);
    return NoteNormalizer.prependBlock(n, tag);
  }
}

export { UsableItemThisCritParser };
