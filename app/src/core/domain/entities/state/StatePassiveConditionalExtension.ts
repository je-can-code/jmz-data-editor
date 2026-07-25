import {
  createEmptyStatePassiveAutoApplyRule,
  type StatePassiveAutoApplyRule,
} from '@core/domain/entities/state/StatePassiveAutoApplyRule.ts';
import {
  createEmptyStatePassiveAutoExecuteSkillRule,
  type StatePassiveAutoExecuteSkillRule,
} from '@core/domain/entities/state/StatePassiveAutoExecuteSkillRule.ts';
import { StatePassiveConditionalNoteParser } from '@services/parsers/StatePassiveConditionalNoteParser.ts';

/**
 * J-Passive-Conditional tags on {@link Rmmz.Implementations.RPG_State.note}.
 */
class StatePassiveConditionalExtension
{
  /**
   * {@code autoApplyState} tuples — applies another state on a timer or combat event.
   */
  public autoApplyStateRules: StatePassiveAutoApplyRule[] = [];

  /**
   * {@code autoExecuteSkill} tuples — uses a map skill on a timer or combat event.
   */
  public autoExecuteSkillRules: StatePassiveAutoExecuteSkillRule[] = [];

  /**
   * @param note State {@code note} text.
   */
  static fromStateNote(note: string): StatePassiveConditionalExtension
  {
    const s = new StatePassiveConditionalExtension();
    StatePassiveConditionalNoteParser.hydrate(s, note);
    return s;
  }

  /**
   * Strips managed conditional tags from {@code note} and rewrites them from this object.
   */
  applyToNote(note: string): string
  {
    const base = StatePassiveConditionalNoteParser.strip(note);
    return StatePassiveConditionalNoteParser.write(this, base);
  }

  /**
   * Shallow copy for React updates (avoid sharing one extension across state rows).
   */
  clone(patch?: Partial<StatePassiveConditionalExtension>): StatePassiveConditionalExtension
  {
    const s = new StatePassiveConditionalExtension();
    s.autoApplyStateRules = this.autoApplyStateRules.map((rule) => ({ ...rule }));
    s.autoExecuteSkillRules = this.autoExecuteSkillRules.map((rule) => ({ ...rule }));
    if (patch !== undefined)
    {
      if (patch.autoApplyStateRules !== undefined)
      {
        s.autoApplyStateRules = patch.autoApplyStateRules.map((rule) => ({ ...rule }));
      }
      if (patch.autoExecuteSkillRules !== undefined)
      {
        s.autoExecuteSkillRules = patch.autoExecuteSkillRules.map((rule) => ({ ...rule }));
      }
    }
    return s;
  }
}

export {
  createEmptyStatePassiveAutoApplyRule,
  createEmptyStatePassiveAutoExecuteSkillRule,
  StatePassiveConditionalExtension,
};
export type {
  StatePassiveAutoApplyRule,
  StatePassiveAutoExecuteSkillRule,
};
