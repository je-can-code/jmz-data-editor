import { parseAutoApplyStateCondition } from '@core/enums/RmmzAutoApplyStateCondition.ts';
import {
  parseAutoExecuteSkillCondition,
  type RmmzAutoExecuteSkillCondition,
} from '@core/enums/RmmzAutoExecuteSkillCondition.ts';
import type { StatePassiveConditionalExtension } from '@core/domain/entities/state/StatePassiveConditionalExtension.ts';
import {
  isCompleteStatePassiveAutoApplyRule,
  type StatePassiveAutoApplyRule,
} from '@core/domain/entities/state/StatePassiveAutoApplyRule.ts';
import {
  isCompleteStatePassiveAutoExecuteSkillRule,
  type StatePassiveAutoExecuteSkillRule,
} from '@core/domain/entities/state/StatePassiveAutoExecuteSkillRule.ts';
import { NoteNormalizer } from '@services/utils/NoteNormalizer.ts';

/**
 * J-Passive-Conditional state notetag read/write (mirrors {@code J.PASSIVE.EXT.CONDITIONAL.RegExp}).
 */
class StatePassiveConditionalNoteParser
{
  static readonly #RE_AUTO_APPLY_STATE = /<autoApplyState:[ ]?(\[[^\]]+])>/gi;

  static readonly #RE_AUTO_EXECUTE_SKILL = /<autoExecuteSkill:[ ]?(\[[^\]]+])>/gi;

  /**
   * Removes every managed conditional tag from {@code note}.
   */
  static strip(note: string): string
  {
    let n = note;
    n = n.replace(StatePassiveConditionalNoteParser.#ensureGlobal(
      StatePassiveConditionalNoteParser.#RE_AUTO_APPLY_STATE
    ), '');
    n = n.replace(StatePassiveConditionalNoteParser.#ensureGlobal(
      StatePassiveConditionalNoteParser.#RE_AUTO_EXECUTE_SKILL
    ), '');
    return NoteNormalizer.normalize(n);
  }

  /**
   * Fills {@link StatePassiveConditionalExtension} from {@code note}.
   */
  static hydrate(
    ext: StatePassiveConditionalExtension,
    note: string
  ): void
  {
    ext.autoApplyStateRules = StatePassiveConditionalNoteParser.#readAllAutoApplyRules(note);
    ext.autoExecuteSkillRules = StatePassiveConditionalNoteParser.#readAllAutoExecuteSkillRules(note);
  }

  /**
   * Rewrites managed tags onto {@code baseNote}.
   */
  static write(
    ext: StatePassiveConditionalExtension,
    baseNote: string
  ): string
  {
    const stripped = StatePassiveConditionalNoteParser.strip(baseNote);
    const tags: string[] = [];
    for (const rule of ext.autoApplyStateRules)
    {
      const tag = StatePassiveConditionalNoteParser.#formatAutoApplyStateTag(rule);
      if (tag !== null)
      {
        tags.push(tag);
      }
    }
    for (const rule of ext.autoExecuteSkillRules)
    {
      const tag = StatePassiveConditionalNoteParser.#formatAutoExecuteSkillTag(rule);
      if (tag !== null)
      {
        tags.push(tag);
      }
    }
    if (tags.length === 0)
    {
      return stripped;
    }
    const merged = stripped === ''
      ? tags.join('\n')
      : `${stripped}\n${tags.join('\n')}`;
    return NoteNormalizer.normalize(merged);
  }

  static #readAllAutoApplyRules(note: string): StatePassiveAutoApplyRule[]
  {
    const rules: StatePassiveAutoApplyRule[] = [];
    const re = StatePassiveConditionalNoteParser.#ensureGlobal(
      StatePassiveConditionalNoteParser.#RE_AUTO_APPLY_STATE
    );
    let match: RegExpExecArray | null = re.exec(note);
    while (match !== null)
    {
      if (match[ 1 ] !== undefined)
      {
        const parsed = StatePassiveConditionalNoteParser.#parseAutoApplyBracket(match[ 1 ]);
        if (parsed !== null)
        {
          rules.push(parsed);
        }
      }
      match = re.exec(note);
    }
    return rules;
  }

  static #readAllAutoExecuteSkillRules(note: string): StatePassiveAutoExecuteSkillRule[]
  {
    const rules: StatePassiveAutoExecuteSkillRule[] = [];
    const re = StatePassiveConditionalNoteParser.#ensureGlobal(
      StatePassiveConditionalNoteParser.#RE_AUTO_EXECUTE_SKILL
    );
    let match: RegExpExecArray | null = re.exec(note);
    while (match !== null)
    {
      if (match[ 1 ] !== undefined)
      {
        const parsed = StatePassiveConditionalNoteParser.#parseAutoExecuteSkillBracket(match[ 1 ]);
        if (parsed !== null)
        {
          rules.push(parsed);
        }
      }
      match = re.exec(note);
    }
    return rules;
  }

  static #parseAutoApplyBracket(bracket: string): StatePassiveAutoApplyRule | null
  {
    const inner = bracket.trim();
    const stripped = inner.startsWith('[') && inner.endsWith(']')
      ? inner.slice(1, -1)
      : inner;
    const parts = stripped.split(',')
      .map((p) => p.trim());
    if (parts.length !== 3)
    {
      return null;
    }
    const stateId = parseInt(parts[ 0 ], 10);
    const condition = parseAutoApplyStateCondition(parts[ 1 ]);
    const param = parseInt(parts[ 2 ], 10);
    if (Number.isNaN(stateId) || condition === null || Number.isNaN(param))
    {
      return null;
    }
    if (stateId < 1 || param < 1)
    {
      return null;
    }
    return {
      stateId,
      condition,
      param,
    };
  }

  static #parseAutoExecuteSkillBracket(bracket: string): StatePassiveAutoExecuteSkillRule | null
  {
    const inner = bracket.trim();
    const stripped = inner.startsWith('[') && inner.endsWith(']')
      ? inner.slice(1, -1)
      : inner;
    const parts = stripped.split(',')
      .map((p) => p.trim());
    if (parts.length < 3)
    {
      return null;
    }
    const skillId = parseInt(parts[ 0 ], 10);
    const condition = parseAutoExecuteSkillCondition(parts[ 1 ]);
    if (Number.isNaN(skillId) || condition === null || skillId < 1)
    {
      return null;
    }
    if (condition === 'enemiesNearby')
    {
      if (parts.length < 4)
      {
        return null;
      }
      const enemyMinCount = parseInt(parts[ 2 ], 10);
      const enemyCooldownFrames = parseInt(parts[ 3 ], 10);
      if (Number.isNaN(enemyMinCount) || Number.isNaN(enemyCooldownFrames))
      {
        return null;
      }
      if (enemyMinCount < 1 || enemyCooldownFrames < 0)
      {
        return null;
      }
      let enemyTriggerTiles: number | null = null;
      if (parts.length >= 5)
      {
        const triggerTiles = parseInt(parts[ 4 ], 10);
        if (Number.isNaN(triggerTiles) || triggerTiles < 1)
        {
          return null;
        }
        enemyTriggerTiles = triggerTiles;
      }
      return {
        skillId,
        condition,
        param: null,
        enemyMinCount,
        enemyCooldownFrames,
        enemyTriggerTiles,
      };
    }
    if (parts.length !== 3)
    {
      return null;
    }
    const param = parseInt(parts[ 2 ], 10);
    if (Number.isNaN(param) || param < 0)
    {
      return null;
    }
    return {
      skillId,
      condition: condition as RmmzAutoExecuteSkillCondition,
      param,
      enemyMinCount: null,
      enemyCooldownFrames: null,
      enemyTriggerTiles: null,
    };
  }

  static #formatAutoApplyStateTag(rule: StatePassiveAutoApplyRule): string | null
  {
    if (isCompleteStatePassiveAutoApplyRule(rule) === false)
    {
      return null;
    }
    const {
      stateId,
      condition,
      param,
    } = rule;
    return `<autoApplyState:[${Math.trunc(stateId as number)}, ${condition}, ${Math.trunc(param as number)}]>`;
  }

  static #formatAutoExecuteSkillTag(rule: StatePassiveAutoExecuteSkillRule): string | null
  {
    if (isCompleteStatePassiveAutoExecuteSkillRule(rule) === false)
    {
      return null;
    }
    const {
      skillId,
      condition,
      param,
      enemyMinCount,
      enemyCooldownFrames,
      enemyTriggerTiles,
    } = rule;
    if (condition === 'enemiesNearby')
    {
      const base = `<autoExecuteSkill:[${Math.trunc(skillId as number)}, enemiesNearby, ${Math.trunc(enemyMinCount as number)}, ${Math.trunc(enemyCooldownFrames as number)}`;
      if (enemyTriggerTiles !== null)
      {
        return `${base}, ${Math.trunc(enemyTriggerTiles)}]>`;
      }
      return `${base}]>`;
    }
    return `<autoExecuteSkill:[${Math.trunc(skillId as number)}, ${condition}, ${Math.trunc(param as number)}]>`;
  }

  static #ensureGlobal(re: RegExp): RegExp
  {
    return new RegExp(re.source, re.flags.includes('g')
      ? re.flags
      : `${re.flags}g`);
  }
}

export { StatePassiveConditionalNoteParser };
