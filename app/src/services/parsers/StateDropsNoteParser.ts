import type { StateDropsExtension } from '@core/domain/entities/state/StateDropsExtension.ts';
import { NoteNormalizer } from '@services/utils/NoteNormalizer.ts';

/**
 * J-DropsControl drop/gold multiplier tags on state notes.
 */
class StateDropsNoteParser
{
  static readonly #RE_DROP_MULT = /<dropMultiplier:[ ]?(-?\d+)>/gi;

  static readonly #RE_GOLD_MULT = /<goldMultiplier:[ ]?(-?\d+)>/gi;

  static readonly #STRIP_ORDER: RegExp[] = [
    StateDropsNoteParser.#RE_DROP_MULT,
    StateDropsNoteParser.#RE_GOLD_MULT,
  ];

  static strip(note: string): string
  {
    let n = note;
    for (const re of StateDropsNoteParser.#STRIP_ORDER)
    {
      n = n.replace(StateDropsNoteParser.#ensureGlobal(re), '');
    }
    return NoteNormalizer.normalize(n);
  }

  static hydrate(
    ext: StateDropsExtension,
    note: string
  ): void
  {
    ext.dropMultiplier = StateDropsNoteParser.#sumSignedIntGroup1(
      note,
      StateDropsNoteParser.#RE_DROP_MULT
    );
    ext.goldMultiplier = StateDropsNoteParser.#sumSignedIntGroup1(
      note,
      StateDropsNoteParser.#RE_GOLD_MULT
    );
  }

  static write(
    ext: StateDropsExtension,
    baseNote: string
  ): string
  {
    const parts: string[] = [];
    if (ext.dropMultiplier !== null)
    {
      parts.push(`<dropMultiplier:${Math.trunc(ext.dropMultiplier)}>`);
    }
    if (ext.goldMultiplier !== null)
    {
      parts.push(`<goldMultiplier:${Math.trunc(ext.goldMultiplier)}>`);
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

  static #sumSignedIntGroup1(
    note: string,
    re: RegExp
  ): number | null
  {
    const g = StateDropsNoteParser.#ensureGlobal(re);
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

export { StateDropsNoteParser };
