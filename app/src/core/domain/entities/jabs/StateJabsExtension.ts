import { StateJabsNoteParser } from '@services/parsers/StateJabsNoteParser.ts';

/** COUNT_MODE values for {@code <skillHistoryBonus:[TYPE, WINDOW, PCT, MODE]>}. */
type SkillHistoryBonusCountMode = 'all' | 'unique' | 'streak' | 'distinct_types';

/**
 * JABS state note slice ({@code ON STATES} tags from {@code J.ABS.RegExp}).
 * Persisted only via {@link Rmmz.Implementations.RPG_State.note}.
 */
class StateJabsExtension
{
  /** {@code <negative>} — JABS treats this state as a debuff for certain calculations. */
  public negative: boolean = false;

  /** {@code <rooted>} — cannot move. */
  public rooted: boolean = false;

  /** {@code <disabled>} — cannot use basic attacks. */
  public disabled: boolean = false;

  /** {@code <muted>} — cannot use non-basic-attack skills. */
  public muted: boolean = false;

  /** {@code <paralyzed>} — cannot move, basic attack, or use skills (all of the above). */
  public paralyzed: boolean = false;

  /** {@code refresh} | {@code extend} | {@code stack}; null defers to plugin parameter. */
  public stackType: 'refresh' | 'extend' | 'stack' | null = null;

  public stateRefreshDiminish: number | null = null;

  public stateRefreshReset: number | null = null;

  public stackExtendAmount: number | null = null;

  public stackExtendMax: number | null = null;

  public stackMax: number | null = null;

  public applyStacks: number | null = null;

  public loseAllStacksAtOnce: boolean = false;

  /** {@code <aggroLock>} */
  public aggroLock: boolean = false;

  /** {@code <aggroOutAmp:N>} — multiplier on aggro generated toward others. */
  public aggroOutAmp: number | null = null;

  /** {@code <aggroInAmp:N>} — multiplier on aggro taken from others. */
  public aggroInAmp: number | null = null;

  /** Slip HP/MP/TP flat amount per five seconds (negative = DoT, positive = regen). */
  public slipHpFlat: number | null = null;

  public slipMpFlat: number | null = null;

  public slipTpFlat: number | null = null;

  /** Percent of max pool per five seconds (negative or positive). */
  public slipHpPercent: number | null = null;

  public slipMpPercent: number | null = null;

  public slipTpPercent: number | null = null;

  /** Bracket interior for slip formulas (per five seconds). */
  public slipHpFormula: string = '';

  public slipMpFormula: string = '';

  public slipTpFormula: string = '';

  /**
   * {@code <stateDuration:FRAMES>} — this state's map timer in frames (J-ABS core).
   * When set, runtime ignores MZ {@code stepsToRemove} cap; takes priority over {@link stateDurationSeconds}.
   */
  public stateDurationFrames: number | null = null;

  /**
   * {@code <stateDurationSec:SECONDS>} — convenience map timer; runtime uses {@code SECONDS * 60} frames.
   * Written only when {@link stateDurationFrames} is unset.
   */
  public stateDurationSeconds: number | null = null;

  /**
   * {@code <indefiniteState>} — never expires on the map (J-ABS duration {@code -1}).
   * Replaces relying on MZ {@code removeByWalking} for "eternal" states.
   */
  public indefiniteState: boolean = false;

  /** {@code <stateDurationFlat:N>} — added flat turns when this state is applied (JABS). */
  public stateDurationFlat: number | null = null;

  /** {@code <stateDurationPerc:N>} — added percent turns when this state is applied (JABS). */
  public stateDurationPercent: number | null = null;

  /** Bracket interior only for {@code <stateDurationForm:[...]>}. */
  public stateDurationFormula: string = '';

  /** {@code shield:[...]} interior (Shield extension). */
  public shieldPointsFormula: string = '';

  /** {@code shieldCap:[...]} interior. */
  public shieldCapFormula: string = '';

  public shieldPriority: number | null = null;

  public shieldProtect: boolean = false;

  /** Comma-separated damage element ids for {@code shieldType:[...]} (which elements this shield absorbs). */
  public shieldTypeList: string = '';

  /** Comma-separated skill ids executed when the shield breaks ({@code shieldBreak:[...]}). */
  public shieldBreakSkillIds: string = '';

  /** {@code speedBoost} on map (Speed extension). */
  public speedBoost: number | null = null;

  /** Formula bracket interiors (Timing extension). */
  public timingBaseCastTime: string = '';

  public timingCastTimeFlat: string = '';

  public timingCastTimePercent: string = '';

  public timingBaseFastCooldown: string = '';

  public timingFastCooldownFlat: string = '';

  public timingFastCooldownRate: string = '';

  /** Tools extension: battler can be gap-closed to. */
  public gapCloseTarget: boolean = false;

  /**
   * {@code <skillHistoryBonus:[TYPE, WINDOW, PCT, MODE]>} — outgoing damage from recent skill use.
   * TYPE 0 = any skill type; WINDOW is seconds; PCT is percent per counted entry; MODE see {@link SkillHistoryBonusCountMode}.
   */
  public skillHistoryBonusTypeId: number | null = null;

  public skillHistoryBonusWindowSeconds: number | null = null;

  public skillHistoryBonusPctPerCount: number | null = null;

  public skillHistoryBonusCountMode: SkillHistoryBonusCountMode | null = null;

  /**
   * @param note State {@code note} text.
   */
  static fromStateNote(note: string): StateJabsExtension
  {
    const s = new StateJabsExtension();
    StateJabsNoteParser.hydrate(s, note);
    return s;
  }

  /**
   * Strips managed JABS tags from {@code note} and rewrites them from this object.
   */
  applyToNote(note: string): string
  {
    const base = StateJabsNoteParser.stripStateJabsTags(note);
    return StateJabsNoteParser.writeStateTags(this, base);
  }

  /**
   * Shallow copy for React updates (avoid sharing one extension across state rows).
   */
  clone(patch?: Partial<StateJabsExtension>): StateJabsExtension
  {
    const s = new StateJabsExtension();
    Object.assign(s, this);
    if (patch !== undefined)
    {
      Object.assign(s, patch);
    }
    return s;
  }
}

export { StateJabsExtension };
export type { SkillHistoryBonusCountMode };
