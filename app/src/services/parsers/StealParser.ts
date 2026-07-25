import NoteReader from '@services/utils/NoteReader.ts';
import { NoteNormalizer } from '@services/utils/NoteNormalizer.ts';

/**
 * J-Resources-ABS life/magi/tech steal rates, as integer percent (5 means 5%, i.e. {@code 0.05} in-engine).
 * Signed — a negative value inflicts self-damage/drain instead of stealing.
 */
type RPG_StealRates = {
  lst: number;
  mst: number;
  tst: number;
};

/**
 * Reads and writes J-Resources-ABS {@code <lst:N>} / {@code <mst:N>} / {@code <tst:N>} tags
 * ({@code J.RESOURCES.EXT.ABS.RegExp.Lifesteal/Manasteal/Techsteal}). These are caster-wide at runtime
 * (summed across actor, class, equips, and state notes into one steal rate per resource) — usable on
 * Actors, Classes, Weapons, Armors, and States. Each tag is a bare signed integer; this editor authors
 * at most one line per tag per note (matching {@link NoteReader#getNumberFromNoteByRegex}, which reads
 * the last matching line rather than summing within a single note — the plugin's own cross-note summing
 * still applies at runtime across the caster's different traited sources).
 */
class StealParser
{
  static readonly #RE_LST = /<lst: ?(-?\d+)>/gi;

  static readonly #RE_MST = /<mst: ?(-?\d+)>/gi;

  static readonly #RE_TST = /<tst: ?(-?\d+)>/gi;

  /**
   * @param note Database object note text.
   * @returns The steal rates found; each defaults to {@code 0} when the tag is absent.
   */
  static read(note: string): RPG_StealRates
  {
    const dummy = { note } as any;
    return {
      lst: NoteReader.getNumberFromNoteByRegex(dummy, StealParser.#RE_LST) ?? 0,
      mst: NoteReader.getNumberFromNoteByRegex(dummy, StealParser.#RE_MST) ?? 0,
      tst: NoteReader.getNumberFromNoteByRegex(dummy, StealParser.#RE_TST) ?? 0,
    };
  }

  /**
   * @param originalNote The original note text.
   * @param rates Rates to write; a rate of {@code 0} omits (removes) that tag entirely.
   */
  static write(
    originalNote: string,
    rates: RPG_StealRates
  ): string
  {
    let base = NoteNormalizer.removeLinesMatching(originalNote ?? '', StealParser.#RE_LST);
    base = NoteNormalizer.removeLinesMatching(base, StealParser.#RE_MST);
    base = NoteNormalizer.removeLinesMatching(base, StealParser.#RE_TST);

    const lines: string[] = [];
    if (Number.isFinite(rates.lst) && Math.trunc(rates.lst) !== 0)
    {
      lines.push(`<lst:${Math.trunc(rates.lst)}>`);
    }
    if (Number.isFinite(rates.mst) && Math.trunc(rates.mst) !== 0)
    {
      lines.push(`<mst:${Math.trunc(rates.mst)}>`);
    }
    if (Number.isFinite(rates.tst) && Math.trunc(rates.tst) !== 0)
    {
      lines.push(`<tst:${Math.trunc(rates.tst)}>`);
    }

    if (lines.length === 0)
    {
      return base;
    }

    return NoteNormalizer.appendBlock(base, lines.join('\n'));
  }
}

export { StealParser, type RPG_StealRates };
