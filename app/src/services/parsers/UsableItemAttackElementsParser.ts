import { NoteNormalizer } from "@services/utils/NoteNormalizer.ts";

/**
 * Reads and writes J-Elementalistics {@code <attackElements:[id,...]>} on skill/item notes.
 */
class UsableItemAttackElementsParser
{
  static #line = /^\s*<attackElements:\[([^\]]+)]>\s*$/i;

  /**
   * @param note Usable item note text.
   * @returns Unique positive element ids in first-seen order across all matching lines.
   */
  static readAttackElements(note: string): number[]
  {
    const lines = NoteNormalizer.normalize(note)
      .split("\n");
    const seen = new Set<number>();
    const order: number[] = [];

    for (const line of lines)
    {
      const m = line.match(UsableItemAttackElementsParser.#line);
      if (m === null)
      {
        continue;
      }

      const parts = m[1].split(",");
      for (const part of parts)
      {
        const n = parseInt(part.trim(), 10);
        if (!Number.isInteger(n) || n <= 0)
        {
          continue;
        }
        if (seen.has(n))
        {
          continue;
        }
        seen.add(n);
        order.push(n);
      }
    }

    return order;
  }

  /**
   * @param note Note text.
   * @param ids Positive element ids; duplicates are dropped; order is preserved.
   * @returns Note with all prior {@code attackElements} lines removed and at most one new tag prepended.
   */
  static writeAttackElements(note: string, ids: number[]): string
  {
    let n = NoteNormalizer.removeLinesMatching(
      note,
      UsableItemAttackElementsParser.#line
    );

    const seen = new Set<number>();
    const unique: number[] = [];
    for (const id of ids)
    {
      const v = Math.trunc(id);
      if (v <= 0 || seen.has(v))
      {
        continue;
      }
      seen.add(v);
      unique.push(v);
    }

    if (unique.length === 0)
    {
      return NoteNormalizer.normalize(n);
    }

    const tag = `<attackElements:[${unique.join(",")}]>`;
    return NoteNormalizer.prependBlock(n, tag);
  }
}

export { UsableItemAttackElementsParser };
