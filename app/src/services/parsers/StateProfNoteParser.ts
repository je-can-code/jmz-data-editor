import type { StateProfExtension } from '@core/domain/entities/state/StateProfExtension.ts';
import { NoteNormalizer } from '@services/utils/NoteNormalizer.ts';

/**
 * J-Proficiency tags on state notes.
 */
class StateProfNoteParser
{
  static readonly #RE_BONUS = /<proficiencyBonus:[ ]?(\d+)>/gi;

  static readonly #RE_GIVING_BLOCK = /<proficiencyGivingBlock>/gi;

  static readonly #RE_GAINING_BLOCK = /<proficiencyGainingBlock>/gi;

  static strip(note: string): string
  {
    let n = note;
    n = n.replace(StateProfNoteParser.#ensureGlobal(StateProfNoteParser.#RE_BONUS), '');
    n = n.replace(StateProfNoteParser.#ensureGlobal(StateProfNoteParser.#RE_GIVING_BLOCK), '');
    n = n.replace(StateProfNoteParser.#ensureGlobal(StateProfNoteParser.#RE_GAINING_BLOCK), '');
    return NoteNormalizer.normalize(n);
  }

  static hydrate(
    ext: StateProfExtension,
    note: string
  ): void
  {
    ext.proficiencyBonus = StateProfNoteParser.#sumUIntGroup1(note);
    ext.proficiencyGivingBlock = StateProfNoteParser.#testAny(note, StateProfNoteParser.#RE_GIVING_BLOCK);
    ext.proficiencyGainingBlock = StateProfNoteParser.#testAny(note, StateProfNoteParser.#RE_GAINING_BLOCK);
  }

  static write(
    ext: StateProfExtension,
    baseNote: string
  ): string
  {
    const parts: string[] = [];
    if (ext.proficiencyBonus !== null)
    {
      parts.push(`<proficiencyBonus:${Math.trunc(ext.proficiencyBonus)}>`);
    }
    if (ext.proficiencyGivingBlock)
    {
      parts.push('<proficiencyGivingBlock>');
    }
    if (ext.proficiencyGainingBlock)
    {
      parts.push('<proficiencyGainingBlock>');
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

  static #sumUIntGroup1(note: string): number | null
  {
    const g = StateProfNoteParser.#ensureGlobal(StateProfNoteParser.#RE_BONUS);
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

  static #testAny(
    note: string,
    re: RegExp
  ): boolean
  {
    const g = StateProfNoteParser.#ensureGlobal(re);
    g.lastIndex = 0;
    return g.test(note);
  }
}

export { StateProfNoteParser };
