import { NoteNormalizer } from "@services/utils/NoteNormalizer.ts";

/**
 * Reads and writes J-SKS skill-only notetags ({@code J.SKS.RegExp.SlotCost}, {@code Unslotted}).
 */
class SkillSksSkillNoteParser
{
  static readonly #RE_SLOT_COST = /<slotCost:[ ]?(-?\d+)>/gi;

  static readonly #RE_UNSLOTTED = /<unslotted>/gi;

  /**
   * @param note Skill note text.
   * @returns First captured slot cost, or {@code null} when the tag is absent.
   */
  static readSlotCost(note: string): number | null
  {
    const re = new RegExp(SkillSksSkillNoteParser.#RE_SLOT_COST.source, "gi");
    const m = re.exec(note);
    if (m === null || typeof m[1] !== "string")
    {
      return null;
    }
    const v = parseInt(m[1], 10);
    if (Number.isNaN(v))
    {
      return null;
    }
    return v;
  }

  /**
   * @param note Skill note text.
   * @returns True when {@code <unslotted>} is present (explicit SKS unslotted tag only).
   */
  static readExplicitUnslotted(note: string): boolean
  {
    const re = new RegExp(SkillSksSkillNoteParser.#RE_UNSLOTTED.source, "gi");
    return re.test(note);
  }

  /**
   * Removes managed SKS tags, then prepends current values.
   *
   * @param note Note text after other writers have run.
   * @param slotCost When non-null, writes {@code <slotCost:N>}.
   * @param explicitUnslotted When true, writes {@code <unslotted>}.
   */
  static writeSksSkillTags(
    note: string,
    slotCost: number | null,
    explicitUnslotted: boolean
  ): string
  {
    let n = note.replace(
      new RegExp(SkillSksSkillNoteParser.#RE_SLOT_COST.source, "gi"),
      ""
    );
    n = n.replace(
      new RegExp(SkillSksSkillNoteParser.#RE_UNSLOTTED.source, "gi"),
      ""
    );
    n = NoteNormalizer.normalize(n);

    const parts: string[] = [];
    if (slotCost !== null)
    {
      parts.push(`<slotCost:${Math.trunc(slotCost)}>`);
    }
    if (explicitUnslotted === true)
    {
      parts.push("<unslotted>");
    }
    if (parts.length === 0)
    {
      return n;
    }

    return NoteNormalizer.prependBlock(n, parts.join("\n"));
  }
}

export { SkillSksSkillNoteParser };
