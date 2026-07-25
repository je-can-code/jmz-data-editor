import { NoteNormalizer } from '@services/utils/NoteNormalizer.ts';

/**
 * Reads and writes J-Passive {@code <passive:[id,...]>} / {@code <uniquePassive:[id,...]>} on skill
 * notes ({@code J.PASSIVE.RegExp.PassiveStateIds} / {@code UniquePassiveStateIds}). Any skill a battler
 * knows — learned, not necessarily equipped/used — contributes its tagged state ids as always-on
 * passives (see {@code Game_Battler#getPassiveStateSources}, which includes {@code this.skills()}).
 * {@code uniquePassive} ids apply once even if multiple known sources declare the same state id;
 * plain {@code passive} ids stack once per declaring source.
 */
class PassiveGrantParser
{
  static readonly #RE_PASSIVE = /<passive:[ ]?(\[[^\]]+\])>/gi;

  static readonly #RE_UNIQUE_PASSIVE = /<uniquePassive:[ ]?(\[[^\]]+\])>/gi;

  /**
   * @param note Skill note text.
   * @returns State ids from every {@code <passive:[...]>} tag, in first-seen order, deduped.
   */
  static readPassiveStateIds(note: string): number[]
  {
    return PassiveGrantParser.#readIds(note, PassiveGrantParser.#RE_PASSIVE);
  }

  /**
   * @param note Skill note text.
   * @returns State ids from every {@code <uniquePassive:[...]>} tag, in first-seen order, deduped.
   */
  static readUniquePassiveStateIds(note: string): number[]
  {
    return PassiveGrantParser.#readIds(note, PassiveGrantParser.#RE_UNIQUE_PASSIVE);
  }

  /**
   * @param note Note text.
   * @param passiveStateIds Positive state ids for {@code <passive:[...]>}; duplicates dropped, order preserved.
   * @param uniquePassiveStateIds Positive state ids for {@code <uniquePassive:[...]>}; same rules.
   */
  static write(
    note: string,
    passiveStateIds: number[],
    uniquePassiveStateIds: number[]
  ): string
  {
    let n = (note ?? '').replace(new RegExp(PassiveGrantParser.#RE_PASSIVE.source, 'gi'), '');
    n = n.replace(new RegExp(PassiveGrantParser.#RE_UNIQUE_PASSIVE.source, 'gi'), '');
    n = NoteNormalizer.normalize(n);

    const passiveTag = PassiveGrantParser.#buildTag('passive', passiveStateIds);
    const uniqueTag = PassiveGrantParser.#buildTag('uniquePassive', uniquePassiveStateIds);

    const block = [ passiveTag, uniqueTag ].filter((t) => t !== null)
      .join('\n');

    if (block === '')
    {
      return n;
    }

    return NoteNormalizer.prependBlock(n, block);
  }

  static #readIds(
    note: string,
    tagRegex: RegExp
  ): number[]
  {
    const text = NoteNormalizer.normalize(note ?? '');
    const re = new RegExp(tagRegex.source, 'gi');
    const seen = new Set<number>();
    const order: number[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null)
    {
      const inner = m[ 1 ];
      if (typeof inner !== 'string')
      {
        continue;
      }
      for (const id of PassiveGrantParser.#parseBracketIds(inner))
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

  static #buildTag(
    tagName: string,
    ids: number[]
  ): string | null
  {
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
      return null;
    }

    return `<${tagName}:[${unique.join(',')}]>`;
  }

  static #parseBracketIds(bracket: string): number[]
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

export { PassiveGrantParser };
