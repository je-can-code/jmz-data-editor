import NoteReader from '@services/utils/NoteReader.ts';
import { NoteNormalizer } from '@services/utils/NoteNormalizer.ts';
import RPG_Base = Rmmz.Base.RPG_Base;

/**
 * Reads and writes J-Resources ABS on-attack HP/MP/TP gain notetags on {@link Rmmz.Implementations.RPG_Skill.note}.
 * Applied to the caster on a successful hit ({@code ResourceHitManager.applyOnAttackGains}).
 */
class SkillOnAttackGainParser
{
  static #hpFlat = /<on-attack-hp-gain:(\d+)>/gi;

  static #hpPercent = /<on-attack-hp-gain:(\d+)%>/gi;

  static #hpFormula = /<on-attack-hp-gain:\[([+\-*/ ().\w]+)]>/gi;

  static #mpFlat = /<on-attack-mp-gain:(\d+)>/gi;

  static #mpPercent = /<on-attack-mp-gain:(\d+)%>/gi;

  static #mpFormula = /<on-attack-mp-gain:\[([+\-*/ ().\w]+)]>/gi;

  static #tpFlat = /<on-attack-tp-gain:(\d+)>/gi;

  static #tpPercent = /<on-attack-tp-gain:(\d+)%>/gi;

  static #tpFormula = /<on-attack-tp-gain:\[([+\-*/ ().\w]+)]>/gi;

  static readOnAttackHpGainFlat(note: string): number
  {
    return SkillOnAttackGainParser.#readNumberTag(note, SkillOnAttackGainParser.#hpFlat);
  }

  static readOnAttackHpGainPercent(note: string): number
  {
    return SkillOnAttackGainParser.#readNumberTag(note, SkillOnAttackGainParser.#hpPercent);
  }

  static readOnAttackHpGainFormula(note: string): string
  {
    return SkillOnAttackGainParser.#readFormulaTag(note, SkillOnAttackGainParser.#hpFormula);
  }

  static readOnAttackMpGainFlat(note: string): number
  {
    return SkillOnAttackGainParser.#readNumberTag(note, SkillOnAttackGainParser.#mpFlat);
  }

  static readOnAttackMpGainPercent(note: string): number
  {
    return SkillOnAttackGainParser.#readNumberTag(note, SkillOnAttackGainParser.#mpPercent);
  }

  static readOnAttackMpGainFormula(note: string): string
  {
    return SkillOnAttackGainParser.#readFormulaTag(note, SkillOnAttackGainParser.#mpFormula);
  }

  static readOnAttackTpGainFlat(note: string): number
  {
    return SkillOnAttackGainParser.#readNumberTag(note, SkillOnAttackGainParser.#tpFlat);
  }

  static readOnAttackTpGainPercent(note: string): number
  {
    return SkillOnAttackGainParser.#readNumberTag(note, SkillOnAttackGainParser.#tpPercent);
  }

  static readOnAttackTpGainFormula(note: string): string
  {
    return SkillOnAttackGainParser.#readFormulaTag(note, SkillOnAttackGainParser.#tpFormula);
  }

  static writeOnAttackHpGainFlat(
    note: string,
    flat: number
  ): string
  {
    return SkillOnAttackGainParser.#writeNumberTag(
      note,
      SkillOnAttackGainParser.#hpFlat,
      (v) => `<on-attack-hp-gain:${v}>`,
      flat
    );
  }

  static writeOnAttackHpGainPercent(
    note: string,
    percent: number
  ): string
  {
    return SkillOnAttackGainParser.#writeNumberTag(
      note,
      SkillOnAttackGainParser.#hpPercent,
      (v) => `<on-attack-hp-gain:${v}%>`,
      percent
    );
  }

  static writeOnAttackHpGainFormula(
    note: string,
    formula: string
  ): string
  {
    return SkillOnAttackGainParser.#writeFormulaTag(
      note,
      SkillOnAttackGainParser.#hpFormula,
      (inner) => `<on-attack-hp-gain:[${inner}]>`,
      formula
    );
  }

  static writeOnAttackMpGainFlat(
    note: string,
    flat: number
  ): string
  {
    return SkillOnAttackGainParser.#writeNumberTag(
      note,
      SkillOnAttackGainParser.#mpFlat,
      (v) => `<on-attack-mp-gain:${v}>`,
      flat
    );
  }

  static writeOnAttackMpGainPercent(
    note: string,
    percent: number
  ): string
  {
    return SkillOnAttackGainParser.#writeNumberTag(
      note,
      SkillOnAttackGainParser.#mpPercent,
      (v) => `<on-attack-mp-gain:${v}%>`,
      percent
    );
  }

  static writeOnAttackMpGainFormula(
    note: string,
    formula: string
  ): string
  {
    return SkillOnAttackGainParser.#writeFormulaTag(
      note,
      SkillOnAttackGainParser.#mpFormula,
      (inner) => `<on-attack-mp-gain:[${inner}]>`,
      formula
    );
  }

  static writeOnAttackTpGainFlat(
    note: string,
    flat: number
  ): string
  {
    return SkillOnAttackGainParser.#writeNumberTag(
      note,
      SkillOnAttackGainParser.#tpFlat,
      (v) => `<on-attack-tp-gain:${v}>`,
      flat
    );
  }

  static writeOnAttackTpGainPercent(
    note: string,
    percent: number
  ): string
  {
    return SkillOnAttackGainParser.#writeNumberTag(
      note,
      SkillOnAttackGainParser.#tpPercent,
      (v) => `<on-attack-tp-gain:${v}%>`,
      percent
    );
  }

  static writeOnAttackTpGainFormula(
    note: string,
    formula: string
  ): string
  {
    return SkillOnAttackGainParser.#writeFormulaTag(
      note,
      SkillOnAttackGainParser.#tpFormula,
      (inner) => `<on-attack-tp-gain:[${inner}]>`,
      formula
    );
  }

  static #readNumberTag(
    note: string,
    regex: RegExp
  ): number
  {
    const asBase = { note } as RPG_Base;
    return NoteReader.getNumberFromNoteByRegex(asBase, regex) ?? 0;
  }

  static #readFormulaTag(
    note: string,
    regex: RegExp
  ): string
  {
    const raw = NoteReader.getStringFromNoteByRegex(note, regex, true);
    if (raw === null || raw === undefined)
    {
      return '';
    }
    return raw;
  }

  static #writeNumberTag(
    note: string,
    regex: RegExp,
    buildTag: (positiveInt: number) => string,
    value: number
  ): string
  {
    const n = Math.trunc(value);
    if (n <= 0)
    {
      return NoteNormalizer.removeLinesMatching(note, regex);
    }

    const tag = buildTag(n);
    if (note.match(regex))
    {
      return NoteNormalizer.normalize(note.replace(regex, tag));
    }

    return NoteNormalizer.normalize(`${tag}\n${note}`);
  }

  static #writeFormulaTag(
    note: string,
    regex: RegExp,
    buildTag: (inner: string) => string,
    formula: string
  ): string
  {
    const inner = formula.trim();
    if (inner === '')
    {
      return NoteNormalizer.removeLinesMatching(note, regex);
    }

    const tag = buildTag(inner);
    if (note.match(regex))
    {
      return NoteNormalizer.normalize(note.replace(regex, tag));
    }

    return NoteNormalizer.normalize(`${tag}\n${note}`);
  }
}

export { SkillOnAttackGainParser };
