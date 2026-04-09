import type { StateCritExtension } from '@core/domain/entities/state/StateCritExtension.ts';
import { NoteNormalizer } from '@services/utils/NoteNormalizer.ts';

/**
 * J-CriticalFactors base crit tags on state notes ({@code J.CRIT.RegExp} base block only).
 */
class StateCritNoteParser
{
  static readonly #RE_REDUCTION_BASE = /<critReductionBase: ?(\d+)>/gi;

  static readonly #RE_REDUCTION = /<critReduction: ?(\d+)>/gi;

  static readonly #RE_MULTIPLIER_BASE = /<critMultiplierBase: ?(\d+)>/gi;

  static readonly #RE_MULTIPLIER = /<critMultiplier: ?(\d+)>/gi;

  static readonly #STRIP_ORDER: RegExp[] = [
    StateCritNoteParser.#RE_REDUCTION_BASE,
    StateCritNoteParser.#RE_REDUCTION,
    StateCritNoteParser.#RE_MULTIPLIER_BASE,
    StateCritNoteParser.#RE_MULTIPLIER,
  ];

  static strip(note: string): string
  {
    let n = note;
    for (const re of StateCritNoteParser.#STRIP_ORDER)
    {
      n = n.replace(StateCritNoteParser.#ensureGlobal(re), '');
    }
    return NoteNormalizer.normalize(n);
  }

  static hydrate(
    ext: StateCritExtension,
    note: string
  ): void
  {
    ext.critReductionBase = StateCritNoteParser.#sumUIntGroup1(
      note,
      StateCritNoteParser.#RE_REDUCTION_BASE
    );
    ext.critReduction = StateCritNoteParser.#sumUIntGroup1(note, StateCritNoteParser.#RE_REDUCTION);
    ext.critMultiplierBase = StateCritNoteParser.#sumUIntGroup1(
      note,
      StateCritNoteParser.#RE_MULTIPLIER_BASE
    );
    ext.critMultiplier = StateCritNoteParser.#sumUIntGroup1(note, StateCritNoteParser.#RE_MULTIPLIER);
  }

  static write(
    ext: StateCritExtension,
    baseNote: string
  ): string
  {
    const parts: string[] = [];
    if (ext.critReductionBase !== null)
    {
      parts.push(`<critReductionBase:${Math.trunc(ext.critReductionBase)}>`);
    }
    if (ext.critReduction !== null)
    {
      parts.push(`<critReduction:${Math.trunc(ext.critReduction)}>`);
    }
    if (ext.critMultiplierBase !== null)
    {
      parts.push(`<critMultiplierBase:${Math.trunc(ext.critMultiplierBase)}>`);
    }
    if (ext.critMultiplier !== null)
    {
      parts.push(`<critMultiplier:${Math.trunc(ext.critMultiplier)}>`);
    }
    const head = parts.length > 0
      ? `${parts.join('\n')}\n`
      : '';
    return NoteNormalizer.normalize(head + baseNote);
  }

  static #ensureGlobal(re: RegExp): RegExp
  {
    if (re.global)
    {
      return re;
    }
    return new RegExp(re.source, `${re.flags}g`);
  }

  /**
   * Sums all capture group 1 values for {@code re} over {@code note}.
   */
  static #sumUIntGroup1(
    note: string,
    re: RegExp
  ): number | null
  {
    const g = StateCritNoteParser.#ensureGlobal(re);
    g.lastIndex = 0;
    let sum = 0;
    let found = false;
    let m = g.exec(note);
    while (m !== null)
    {
      const v = parseInt(m[ 1 ], 10);
      if (Number.isNaN(v) === false)
      {
        sum += v;
        found = true;
      }
      m = g.exec(note);
    }
    return found
      ? sum
      : null;
  }
}

export { StateCritNoteParser };
