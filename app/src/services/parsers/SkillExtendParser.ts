import { NoteNormalizer } from '@services/utils/NoteNormalizer.ts';

/**
 * Reads and writes J-SkillExtend {@code <skillExtend:[id,...]>} on skill notes
 * ({@code J.EXTEND.RegExp.SkillExtend}).
 */
class SkillExtendParser
{
  static readonly #TAG_RE = /<skillExtend:[ ]?(\[[^\]]+\])>/gi;

  /**
   * @param note Skill note text.
   * @returns Base skill ids this extension skill applies to, in first-seen order, deduped.
   */
  static readBaseSkillIds(note: string): number[]
  {
    const text = NoteNormalizer.normalize(note ?? '');
    const re = new RegExp(SkillExtendParser.#TAG_RE.source, 'gi');
    const seen = new Set<number>();
    const order: number[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null)
    {
      const [ , inner ] = m;
      if (typeof inner !== 'string')
      {
        continue;
      }
      for (const id of SkillExtendParser.#parseBracketSkillIds(inner))
      {
        if (seen.has(id))
        {
          continue;
        }
        seen.add(id);
        order.push(id);
      }
    }
    return order;
  }

  /**
   * @param note Note text.
   * @param ids Positive skill ids; duplicates dropped; order preserved.
   * @returns Note with all prior {@code skillExtend} tags removed and at most one tag prepended.
   */
  static writeSkillExtend(
    note: string,
    ids: number[]
  ): string
  {
    const stripRe = new RegExp(SkillExtendParser.#TAG_RE.source, 'gi');
    let n = (note ?? '').replace(stripRe, '');
    n = NoteNormalizer.normalize(n);

    const seen = new Set<number>();
    const unique: number[] = [];
    for (const id of ids)
    {
      const v = Math.trunc(id);
      if (v < 1 || seen.has(v))
      {
        continue;
      }
      seen.add(v);
      unique.push(v);
    }

    if (unique.length === 0)
    {
      return n;
    }

    const tag = `<skillExtend:[${unique.join(',')}]>`;
    return NoteNormalizer.prependBlock(n, tag);
  }

  static #parseBracketSkillIds(bracket: string): number[]
  {
    const t = bracket.trim();
    if (t.length < 2 || t[ 0 ] !== '[' || t[ t.length - 1 ] !== ']')
    {
      return [];
    }
    const inner = t.slice(1, -1)
      .trim();
    if (inner === '')
    {
      return [];
    }
    const out: number[] = [];
    for (const part of inner.split(','))
    {
      const n = parseInt(part.trim(), 10);
      if (!Number.isInteger(n) || n < 1)
      {
        continue;
      }
      out.push(n);
    }
    return out;
  }
}

export { SkillExtendParser };
