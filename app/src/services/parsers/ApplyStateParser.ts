import NoteReader from '@services/utils/NoteReader.ts';
import { NoteNormalizer } from '@services/utils/NoteNormalizer.ts';

/**
 * One {@code <applyState:[...]>} / {@code <thisApplyState:[...]>} row (J-Extend on-hit state application).
 * {@code duration}/{@code stacks} {@code null} means the tag omits that slot, so the plugin falls back to the
 * target state's own {@code jabsStateDurationFrames}/{@code jabsStateStacksApplied} at apply time.
 */
type RPG_ApplyStateRow = {
  stateId: number;
  chance: number;
  duration: number | null;
  stacks: number | null;
  /** {@code true} writes {@code <thisApplyState:...>} (this skill's own note only); {@code false} writes {@code <applyState:...>} (any of the caster's notes). */
  thisSkillOnly: boolean;
};

/**
 * Reads and writes J-Extend {@code <applyState:[stateId,chance,duration?,stacks?]>} and
 * {@code <thisApplyState:[...]>} tags on skill notes ({@code J.EXTEND.RegExp.ApplyState} /
 * {@code J.EXTEND.RegExp.ThisApplyState}). Both tags are repeatable — a note may carry many, one per state.
 */
class ApplyStateParser
{
  static readonly #RE_APPLY_STATE = /<applyState:[ ]?(\[\d+,[ ]?\d+(?:,[ ]?\d+){0,2}])>/gi;

  static readonly #RE_THIS_APPLY_STATE = /<thisApplyState:[ ]?(\[\d+,[ ]?\d+(?:,[ ]?\d+){0,2}])>/gi;

  /**
   * @param note Skill note text.
   * @returns Every {@code applyState} / {@code thisApplyState} row found, in tag-family then note-order.
   */
  static read(note: string): RPG_ApplyStateRow[]
  {
    const text = NoteNormalizer.normalize(note ?? '');

    const anyCaster = NoteReader.getArraysFromNotesByRegex(text, ApplyStateParser.#RE_APPLY_STATE, true) ?? [];
    const thisSkill = NoteReader.getArraysFromNotesByRegex(text, ApplyStateParser.#RE_THIS_APPLY_STATE, true) ?? [];

    const toRow = (thisSkillOnly: boolean) =>
      (tuple: number[]): RPG_ApplyStateRow =>
      {
        const [ stateId, chance, duration, stacks ] = tuple;
        return {
          stateId: stateId ?? 0,
          chance: chance ?? 0,
          duration: typeof duration === 'number'
            ? duration
            : null,
          stacks: typeof stacks === 'number'
            ? stacks
            : null,
          thisSkillOnly,
        };
      };

    return [
      ...anyCaster.map(toRow(false)),
      ...thisSkill.map(toRow(true)),
    ];
  }

  /**
   * @param originalNote The original skill note.
   * @param rows Rows to write; invalid rows (stateId &lt; 1) are dropped, chance/duration/stacks are clamped.
   */
  static write(
    originalNote: string,
    rows: RPG_ApplyStateRow[]
  ): string
  {
    let base = NoteNormalizer.removeLinesMatching(originalNote ?? '', ApplyStateParser.#RE_APPLY_STATE);
    base = NoteNormalizer.removeLinesMatching(base, ApplyStateParser.#RE_THIS_APPLY_STATE);

    const lines = rows
      .filter((row) => Math.trunc(row.stateId) >= 1)
      .map((row) =>
      {
        const stateId = Math.trunc(row.stateId);
        const chance = Math.min(100, Math.max(0, Math.trunc(row.chance)));
        const tagName = row.thisSkillOnly
          ? 'thisApplyState'
          : 'applyState';

        const parts: number[] = [ stateId, chance ];
        if (row.duration !== null && row.duration >= 1)
        {
          parts.push(Math.trunc(row.duration));
          if (row.stacks !== null && row.stacks >= 1)
          {
            parts.push(Math.trunc(row.stacks));
          }
        }

        return `<${tagName}:[${parts.join(',')}]>`;
      });

    if (lines.length === 0)
    {
      return base;
    }

    return NoteNormalizer.appendBlock(base, lines.join('\n'));
  }
}

export { ApplyStateParser, type RPG_ApplyStateRow };
