import { NoteNormalizer } from '@services/utils/NoteNormalizer.ts';

/**
 * Reads and writes J-Extend {@code <toggleOnExecute:STATE_ID>} tags on skill notes
 * ({@code J.EXTEND.RegExp.ToggleOnExecute}). Skill-scoped and repeatable — one bare state id per
 * tag/line, fires once at press-time: removes the state from the caster if already present, adds
 * it otherwise. Intended for "stance" skills that flip a state on/off with the same skill.
 */
class ToggleOnExecuteParser
{
  static readonly #TAG_RE = /<toggleOnExecute:[ ]?(\d+)>/gi;

  /**
   * @param note Skill note text.
   * @returns Tagged state ids, in first-seen order, deduped.
   */
  static read(note: string): number[]
  {
    const text = NoteNormalizer.normalize(note ?? '');
    const re = new RegExp(ToggleOnExecuteParser.#TAG_RE.source, 'gi');

    const seen = new Set<number>();
    const order: number[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null)
    {
      const raw = m[ 1 ];
      if (typeof raw !== 'string')
      {
        continue;
      }
      const id = parseInt(raw, 10);
      if (!Number.isInteger(id) || id < 1 || seen.has(id))
      {
        continue;
      }
      seen.add(id);
      order.push(id);
    }
    return order;
  }

  /**
   * @param note Note text.
   * @param stateIds Positive state ids; duplicates dropped; order preserved.
   * @returns Note with all prior {@code toggleOnExecute} tags removed and one tag per id appended.
   */
  static write(
    note: string,
    stateIds: number[]
  ): string
  {
    const stripRe = new RegExp(ToggleOnExecuteParser.#TAG_RE.source, 'gi');
    let n = (note ?? '').replace(stripRe, '');
    n = NoteNormalizer.normalize(n);

    const seen = new Set<number>();
    const unique: number[] = [];
    for (const id of stateIds)
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

    const block = unique.map((id) => `<toggleOnExecute:${id}>`)
      .join('\n');
    return NoteNormalizer.appendBlock(n, block);
  }
}

export { ToggleOnExecuteParser };
