import NoteReader from '@services/utils/NoteReader.ts';
import { NoteNormalizer } from '@services/utils/NoteNormalizer.ts';
import RPG_Base = Rmmz.Base.RPG_Base;

/**
 * Reads and writes J-Resources HP/MP/TP skill cost notetags on {@link RPG_Skill.note}.
 * MP/TP tags add to database {@link RPG_Skill.mpCost} / {@link RPG_Skill.tpCost}; HP cost is tag-only.
 */
class SkillResourceCostParser
{
  static #hpFlat = /<hp-cost:(\d+)>/gi;

  static #hpPercent = /<hp-cost:(\d+)%>/gi;

  static #hpFormula = /<hp-cost:\[([+\-*/ ().\w]+)]>/gi;

  static #hpCanKillLine = /^\s*<hp-cost-can-kill>\s*$/i;

  static #mpFlat = /<mp-cost:(\d+)>/gi;

  static #mpPercent = /<mp-cost:(\d+)%>/gi;

  static #mpFormula = /<mp-cost:\[([+\-*/ ().\w]+)]>/gi;

  static #tpFlat = /<tp-cost:(\d+)>/gi;

  static #tpPercent = /<tp-cost:(\d+)%>/gi;

  static #tpFormula = /<tp-cost:\[([+\-*/ ().\w]+)]>/gi;

  /**
   * @param note Skill note text.
   */
  static readHpCostFlat(note: string): number
  {
    return SkillResourceCostParser.#readNumberTag(note, SkillResourceCostParser.#hpFlat);
  }

  /**
   * @param note Skill note text.
   */
  static readHpCostPercent(note: string): number
  {
    return SkillResourceCostParser.#readNumberTag(note, SkillResourceCostParser.#hpPercent);
  }

  /**
   * @param note Skill note text.
   */
  static readHpCostFormula(note: string): string
  {
    return SkillResourceCostParser.#readFormulaTag(note, SkillResourceCostParser.#hpFormula);
  }

  /**
   * @param note Skill note text.
   */
  static readHpCostCanKill(note: string): boolean
  {
    return /<hp-cost-can-kill>/i.test(note);
  }

  /**
   * @param note Skill note text.
   */
  static readMpCostTagFlat(note: string): number
  {
    return SkillResourceCostParser.#readNumberTag(note, SkillResourceCostParser.#mpFlat);
  }

  /**
   * @param note Skill note text.
   */
  static readMpCostTagPercent(note: string): number
  {
    return SkillResourceCostParser.#readNumberTag(note, SkillResourceCostParser.#mpPercent);
  }

  /**
   * @param note Skill note text.
   */
  static readMpCostTagFormula(note: string): string
  {
    return SkillResourceCostParser.#readFormulaTag(note, SkillResourceCostParser.#mpFormula);
  }

  /**
   * @param note Skill note text.
   */
  static readTpCostTagFlat(note: string): number
  {
    return SkillResourceCostParser.#readNumberTag(note, SkillResourceCostParser.#tpFlat);
  }

  /**
   * @param note Skill note text.
   */
  static readTpCostTagPercent(note: string): number
  {
    return SkillResourceCostParser.#readNumberTag(note, SkillResourceCostParser.#tpPercent);
  }

  /**
   * @param note Skill note text.
   */
  static readTpCostTagFormula(note: string): string
  {
    return SkillResourceCostParser.#readFormulaTag(note, SkillResourceCostParser.#tpFormula);
  }

  /**
   * @param note Note text.
   * @param flat When &lt;= 0, flat HP cost tag lines are removed.
   */
  static writeHpCostFlat(
    note: string,
    flat: number
  ): string
  {
    return SkillResourceCostParser.#writeNumberTag(
      note,
      SkillResourceCostParser.#hpFlat,
      (v) => `<hp-cost:${v}>`,
      flat
    );
  }

  /**
   * @param note Note text.
   * @param percent When &lt;= 0, percent HP cost tag lines are removed.
   */
  static writeHpCostPercent(
    note: string,
    percent: number
  ): string
  {
    return SkillResourceCostParser.#writeNumberTag(
      note,
      SkillResourceCostParser.#hpPercent,
      (v) => `<hp-cost:${v}%>`,
      percent
    );
  }

  /**
   * @param note Note text.
   * @param formula Inner text for &lt;hp-cost:[…]&gt;; blank removes the tag.
   */
  static writeHpCostFormula(
    note: string,
    formula: string
  ): string
  {
    return SkillResourceCostParser.#writeFormulaTag(
      note,
      SkillResourceCostParser.#hpFormula,
      (inner) => `<hp-cost:[${inner}]>`,
      formula
    );
  }

  /**
   * @param note Note text.
   * @param enabled When true, ensures &lt;hp-cost-can-kill&gt;; when false, strips it.
   */
  static writeHpCostCanKill(
    note: string,
    enabled: boolean
  ): string
  {
    let n = NoteNormalizer.removeLinesMatching(note, SkillResourceCostParser.#hpCanKillLine);

    n = n.replace(/<hp-cost-can-kill>/gi, '');
    n = NoteNormalizer.normalize(n);

    if (enabled === false)
    {
      return n;
    }

    return NoteNormalizer.prependBlock(n, '<hp-cost-can-kill>');
  }

  /**
   * @param note Note text.
   * @param flat When &lt;= 0, extra MP flat tag lines are removed.
   */
  static writeMpCostTagFlat(
    note: string,
    flat: number
  ): string
  {
    return SkillResourceCostParser.#writeNumberTag(
      note,
      SkillResourceCostParser.#mpFlat,
      (v) => `<mp-cost:${v}>`,
      flat
    );
  }

  /**
   * @param note Note text.
   * @param percent When &lt;= 0, extra MP percent tag lines are removed.
   */
  static writeMpCostTagPercent(
    note: string,
    percent: number
  ): string
  {
    return SkillResourceCostParser.#writeNumberTag(
      note,
      SkillResourceCostParser.#mpPercent,
      (v) => `<mp-cost:${v}%>`,
      percent
    );
  }

  /**
   * @param note Note text.
   * @param formula Inner text for &lt;mp-cost:[…]&gt;; blank removes the tag.
   */
  static writeMpCostTagFormula(
    note: string,
    formula: string
  ): string
  {
    return SkillResourceCostParser.#writeFormulaTag(
      note,
      SkillResourceCostParser.#mpFormula,
      (inner) => `<mp-cost:[${inner}]>`,
      formula
    );
  }

  /**
   * @param note Note text.
   * @param flat When &lt;= 0, extra TP flat tag lines are removed.
   */
  static writeTpCostTagFlat(
    note: string,
    flat: number
  ): string
  {
    return SkillResourceCostParser.#writeNumberTag(
      note,
      SkillResourceCostParser.#tpFlat,
      (v) => `<tp-cost:${v}>`,
      flat
    );
  }

  /**
   * @param note Note text.
   * @param percent When &lt;= 0, extra TP percent tag lines are removed.
   */
  static writeTpCostTagPercent(
    note: string,
    percent: number
  ): string
  {
    return SkillResourceCostParser.#writeNumberTag(
      note,
      SkillResourceCostParser.#tpPercent,
      (v) => `<tp-cost:${v}%>`,
      percent
    );
  }

  /**
   * @param note Note text.
   * @param formula Inner text for &lt;tp-cost:[…]&gt;; blank removes the tag.
   */
  static writeTpCostTagFormula(
    note: string,
    formula: string
  ): string
  {
    return SkillResourceCostParser.#writeFormulaTag(
      note,
      SkillResourceCostParser.#tpFormula,
      (inner) => `<tp-cost:[${inner}]>`,
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

  /**
   * @param note Note text.
   * @param regex Tag regex (global).
   * @param buildTag Builds the replacement tag from a positive integer.
   * @param value When &lt;= 0, matching lines are removed.
   */
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

  /**
   * @param note Note text.
   * @param regex Bracket-formula tag regex.
   * @param buildTag Wraps trimmed inner formula text.
   * @param formula When empty after trim, matching lines are removed.
   */
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

export { SkillResourceCostParser };
