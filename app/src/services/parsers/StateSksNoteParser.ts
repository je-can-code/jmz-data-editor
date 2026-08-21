import type { StateSksExtension } from '@core/domain/entities/state/StateSksExtension.ts';
import { NoteNormalizer } from '@services/utils/NoteNormalizer.ts';

/**
 * J-SkillSlots {@code slotCostModifier} on state notes.
 */
class StateSksNoteParser
{
  static readonly #RE_SLOT_COST_MODIFIER = /<slotCostModifier:[ ]?(-?\d+)>/gi;

  static strip(note: string): string
  {
    const n = note.replace(
      StateSksNoteParser.#ensureGlobal(StateSksNoteParser.#RE_SLOT_COST_MODIFIER),
      ''
    );
    return NoteNormalizer.normalize(n);
  }

  static hydrate(
    ext: StateSksExtension,
    note: string
  ): void
  {
    const g = StateSksNoteParser.#ensureGlobal(StateSksNoteParser.#RE_SLOT_COST_MODIFIER);
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
    ext.slotCostModifier = found
      ? sum
      : null;
  }

  static write(
    ext: StateSksExtension,
    baseNote: string
  ): string
  {
    const parts: string[] = [];
    if (ext.slotCostModifier !== null)
    {
      parts.push(`<slotCostModifier:${Math.trunc(ext.slotCostModifier)}>`);
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
}

export { StateSksNoteParser };
