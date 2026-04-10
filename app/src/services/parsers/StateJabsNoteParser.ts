import type { StateJabsExtension } from '@core/domain/entities/jabs/StateJabsExtension.ts';
import { NoteNormalizer } from '@services/utils/NoteNormalizer.ts';

/**
 * JABS {@code ON STATES} notetag read/write (mirrors {@code J.ABS.RegExp} in JABS {@code initialization.js}).
 */
class StateJabsNoteParser
{
  static readonly #RE_NEGATIVE = /<negative>/gi;

  static readonly #RE_ROOTED = /<rooted>/gi;

  static readonly #RE_DISABLED = /<disabled>/gi;

  static readonly #RE_MUTED = /<muted>/gi;

  static readonly #RE_PARALYZED = /<paralyzed>/gi;

  static readonly #RE_AGGRO_LOCK = /<aggroLock>/gi;

  static readonly #RE_AGGRO_OUT = /<aggroOutAmp:[ ]?((0|([1-9][0-9]*))(\.[0-9]+)?)>/gi;

  static readonly #RE_AGGRO_IN = /<aggroInAmp:[ ]?((0|([1-9][0-9]*))(\.[0-9]+)?)>/gi;

  static readonly #RE_STATE_DURATION_FLAT = /<stateDurationFlat:[ ]?([-+]?\d+)>/gi;

  static readonly #RE_STATE_DURATION_PERC = /<stateDurationPerc:[ ]?([-+]?\d+)>/gi;

  static readonly #RE_STATE_DURATION_FORMULA = /<stateDurationFormula:\[([+\-*/ ().\w]+)]>/gi;

  static readonly #RE_SHIELD_POINTS = /<shield:\[([+\-*/ ().\w]+)]>/gi;

  static readonly #RE_SHIELD_CAP = /<shieldCap:\[([+\-*/ ().\w]+)]>/gi;

  static readonly #RE_SHIELD_PRIORITY = /<shieldPriority:[ ]?(\d+)>/gi;

  static readonly #RE_SHIELD_PROTECT = /<shieldProtect>/gi;

  static readonly #RE_SHIELD_TYPE = /<shieldType:[ ]?(\[[\d, ]+])>/gi;

  static readonly #RE_SHIELD_BREAK = /<shieldBreak:[ ]?(\[[\d, ]+])>/gi;

  static readonly #RE_SPEED_BOOST = /<speedBoost:[ ]?(-?\d+)>/gi;

  static readonly #RE_TIMING_BASE_CAST = /<baseCastTime:\[([+\-*/ ().\w]+)]>/gi;

  static readonly #RE_TIMING_CAST_FLAT = /<castTimeFlat:\[([+\-*/ ().\w]+)]>/gi;

  static readonly #RE_TIMING_CAST_PERCENT = /<castTimePercent:\[([+\-*/ ().\w]+)]>/gi;

  static readonly #RE_TIMING_BASE_FCD = /<baseFastCooldown:\[([+\-*/ ().\w]+)]>/gi;

  static readonly #RE_TIMING_FCD_FLAT = /<fastCooldownFlat:\[([+\-*/ ().\w]+)]>/gi;

  static readonly #RE_TIMING_FCD_RATE = /<fastCooldownRate:\[([+\-*/ ().\w]+)]>/gi;

  static readonly #RE_GAP_CLOSE_TARGET = /<gapCloseTarget>/gi;

  static readonly #RE_STACK_TYPE = /<stackType:[ ]?(refresh|extend|stack)>/gi;

  static readonly #RE_STATE_REFRESH_DIMINISH = /<stateRefreshDiminish:[ ]?(-?\d+)>/gi;

  static readonly #RE_STATE_REFRESH_RESET = /<stateRefreshReset:[ ]?(\d+)>/gi;

  static readonly #RE_STACK_EXTEND_AMOUNT = /<stackExtendAmount:[ ]?(\d+)>/gi;

  static readonly #RE_STACK_EXTEND_MAX = /<stackExtendMax:[ ]?(\d+)>/gi;

  static readonly #RE_STACK_MAX = /<stackMax:[ ]?(\d+)>/gi;

  static readonly #RE_APPLY_STACKS = /<applyStacks:[ ]?(\d+)>/gi;

  static readonly #RE_LOSE_ALL_STACKS_AT_ONCE = /<loseAllStacksAtOnce>/gi;

  static readonly #RE_SLIP_HP_FLAT = /<hpFlat:[ ]?(-?\d+)>/gi;

  static readonly #RE_SLIP_MP_FLAT = /<mpFlat:[ ]?(-?\d+)>/gi;

  static readonly #RE_SLIP_TP_FLAT = /<tpFlat:[ ]?(-?\d+)>/gi;

  static readonly #RE_SLIP_HP_PERCENT = /<hpPercent:[ ]?(-?\d+)%?>/gi;

  static readonly #RE_SLIP_MP_PERCENT = /<mpPercent:[ ]?(-?\d+)%?>/gi;

  static readonly #RE_SLIP_TP_PERCENT = /<tpPercent:[ ]?(-?\d+)%?>/gi;

  static readonly #RE_SLIP_HP_FORMULA = /<hpFormula:\[([+\-*/ ().\w]+)]>/gi;

  static readonly #RE_SLIP_MP_FORMULA = /<mpFormula:\[([+\-*/ ().\w]+)]>/gi;

  static readonly #RE_SLIP_TP_FORMULA = /<tpFormula:\[([+\-*/ ().\w]+)]>/gi;

  static readonly #STRIP_ORDER: RegExp[] = [
    StateJabsNoteParser.#RE_NEGATIVE,
    StateJabsNoteParser.#RE_ROOTED,
    StateJabsNoteParser.#RE_DISABLED,
    StateJabsNoteParser.#RE_MUTED,
    StateJabsNoteParser.#RE_PARALYZED,
    StateJabsNoteParser.#RE_STACK_TYPE,
    StateJabsNoteParser.#RE_STATE_REFRESH_DIMINISH,
    StateJabsNoteParser.#RE_STATE_REFRESH_RESET,
    StateJabsNoteParser.#RE_STACK_EXTEND_AMOUNT,
    StateJabsNoteParser.#RE_STACK_EXTEND_MAX,
    StateJabsNoteParser.#RE_STACK_MAX,
    StateJabsNoteParser.#RE_APPLY_STACKS,
    StateJabsNoteParser.#RE_LOSE_ALL_STACKS_AT_ONCE,
    StateJabsNoteParser.#RE_AGGRO_LOCK,
    StateJabsNoteParser.#RE_AGGRO_OUT,
    StateJabsNoteParser.#RE_AGGRO_IN,
    StateJabsNoteParser.#RE_SLIP_HP_FLAT,
    StateJabsNoteParser.#RE_SLIP_MP_FLAT,
    StateJabsNoteParser.#RE_SLIP_TP_FLAT,
    StateJabsNoteParser.#RE_SLIP_HP_PERCENT,
    StateJabsNoteParser.#RE_SLIP_MP_PERCENT,
    StateJabsNoteParser.#RE_SLIP_TP_PERCENT,
    StateJabsNoteParser.#RE_SLIP_HP_FORMULA,
    StateJabsNoteParser.#RE_SLIP_MP_FORMULA,
    StateJabsNoteParser.#RE_SLIP_TP_FORMULA,
    StateJabsNoteParser.#RE_STATE_DURATION_FLAT,
    StateJabsNoteParser.#RE_STATE_DURATION_PERC,
    StateJabsNoteParser.#RE_STATE_DURATION_FORMULA,
    StateJabsNoteParser.#RE_SHIELD_POINTS,
    StateJabsNoteParser.#RE_SHIELD_CAP,
    StateJabsNoteParser.#RE_SHIELD_PRIORITY,
    StateJabsNoteParser.#RE_SHIELD_PROTECT,
    StateJabsNoteParser.#RE_SHIELD_TYPE,
    StateJabsNoteParser.#RE_SHIELD_BREAK,
    StateJabsNoteParser.#RE_SPEED_BOOST,
    StateJabsNoteParser.#RE_TIMING_BASE_CAST,
    StateJabsNoteParser.#RE_TIMING_CAST_FLAT,
    StateJabsNoteParser.#RE_TIMING_CAST_PERCENT,
    StateJabsNoteParser.#RE_TIMING_BASE_FCD,
    StateJabsNoteParser.#RE_TIMING_FCD_FLAT,
    StateJabsNoteParser.#RE_TIMING_FCD_RATE,
    StateJabsNoteParser.#RE_GAP_CLOSE_TARGET,
  ];

  /**
   * Removes every JABS ON STATES tag this parser manages.
   */
  static stripStateJabsTags(note: string): string
  {
    let n = note;
    for (const re of StateJabsNoteParser.#STRIP_ORDER)
    {
      n = n.replace(StateJabsNoteParser.#ensureGlobal(re), '');
    }
    return NoteNormalizer.normalize(n);
  }

  /**
   * Fills {@link StateJabsExtension} from {@code note}.
   */
  static hydrate(
    ext: StateJabsExtension,
    note: string
  ): void
  {
    ext.negative = StateJabsNoteParser.#testAny(note, StateJabsNoteParser.#RE_NEGATIVE);
    ext.rooted = StateJabsNoteParser.#testAny(note, StateJabsNoteParser.#RE_ROOTED);
    ext.disabled = StateJabsNoteParser.#testAny(note, StateJabsNoteParser.#RE_DISABLED);
    ext.muted = StateJabsNoteParser.#testAny(note, StateJabsNoteParser.#RE_MUTED);
    ext.paralyzed = StateJabsNoteParser.#testAny(note, StateJabsNoteParser.#RE_PARALYZED);

    ext.stackType = StateJabsNoteParser.#readStackType(note);
    ext.stateRefreshDiminish = StateJabsNoteParser.#readSignedInt(
      note,
      StateJabsNoteParser.#RE_STATE_REFRESH_DIMINISH
    );
    ext.stateRefreshReset = StateJabsNoteParser.#readNonNegInt(
      note,
      StateJabsNoteParser.#RE_STATE_REFRESH_RESET
    );
    ext.stackExtendAmount = StateJabsNoteParser.#readNonNegInt(
      note,
      StateJabsNoteParser.#RE_STACK_EXTEND_AMOUNT
    );
    ext.stackExtendMax = StateJabsNoteParser.#readNonNegInt(note, StateJabsNoteParser.#RE_STACK_EXTEND_MAX);
    ext.stackMax = StateJabsNoteParser.#readNonNegInt(note, StateJabsNoteParser.#RE_STACK_MAX);
    ext.applyStacks = StateJabsNoteParser.#readNonNegInt(note, StateJabsNoteParser.#RE_APPLY_STACKS);
    ext.loseAllStacksAtOnce = StateJabsNoteParser.#testAny(
      note,
      StateJabsNoteParser.#RE_LOSE_ALL_STACKS_AT_ONCE
    );

    ext.aggroLock = StateJabsNoteParser.#testAny(note, StateJabsNoteParser.#RE_AGGRO_LOCK);
    ext.aggroOutAmp = StateJabsNoteParser.#readFloat(note, StateJabsNoteParser.#RE_AGGRO_OUT);
    ext.aggroInAmp = StateJabsNoteParser.#readFloat(note, StateJabsNoteParser.#RE_AGGRO_IN);

    ext.slipHpFlat = StateJabsNoteParser.#readSignedInt(note, StateJabsNoteParser.#RE_SLIP_HP_FLAT);
    ext.slipMpFlat = StateJabsNoteParser.#readSignedInt(note, StateJabsNoteParser.#RE_SLIP_MP_FLAT);
    ext.slipTpFlat = StateJabsNoteParser.#readSignedInt(note, StateJabsNoteParser.#RE_SLIP_TP_FLAT);
    ext.slipHpPercent = StateJabsNoteParser.#readSignedInt(note, StateJabsNoteParser.#RE_SLIP_HP_PERCENT);
    ext.slipMpPercent = StateJabsNoteParser.#readSignedInt(note, StateJabsNoteParser.#RE_SLIP_MP_PERCENT);
    ext.slipTpPercent = StateJabsNoteParser.#readSignedInt(note, StateJabsNoteParser.#RE_SLIP_TP_PERCENT);
    {
      const cap = StateJabsNoteParser.#readCapture(note, StateJabsNoteParser.#RE_SLIP_HP_FORMULA);
      ext.slipHpFormula = cap === null
        ? ''
        : cap;
    }
    {
      const cap = StateJabsNoteParser.#readCapture(note, StateJabsNoteParser.#RE_SLIP_MP_FORMULA);
      ext.slipMpFormula = cap === null
        ? ''
        : cap;
    }
    {
      const cap = StateJabsNoteParser.#readCapture(note, StateJabsNoteParser.#RE_SLIP_TP_FORMULA);
      ext.slipTpFormula = cap === null
        ? ''
        : cap;
    }

    ext.stateDurationFlat = StateJabsNoteParser.#readSignedInt(note, StateJabsNoteParser.#RE_STATE_DURATION_FLAT);
    ext.stateDurationPercent = StateJabsNoteParser.#readSignedInt(
      note,
      StateJabsNoteParser.#RE_STATE_DURATION_PERC
    );
    {
      const cap = StateJabsNoteParser.#readCapture(note, StateJabsNoteParser.#RE_STATE_DURATION_FORMULA);
      ext.stateDurationFormula = cap === null
        ? ''
        : cap;
    }

    {
      const cap = StateJabsNoteParser.#readCapture(note, StateJabsNoteParser.#RE_SHIELD_POINTS);
      ext.shieldPointsFormula = cap === null
        ? ''
        : cap;
    }
    {
      const cap = StateJabsNoteParser.#readCapture(note, StateJabsNoteParser.#RE_SHIELD_CAP);
      ext.shieldCapFormula = cap === null
        ? ''
        : cap;
    }
    ext.shieldPriority = StateJabsNoteParser.#readNonNegInt(note, StateJabsNoteParser.#RE_SHIELD_PRIORITY);
    ext.shieldProtect = StateJabsNoteParser.#testAny(note, StateJabsNoteParser.#RE_SHIELD_PROTECT);
    {
      const cap = StateJabsNoteParser.#readCapture(note, StateJabsNoteParser.#RE_SHIELD_TYPE);
      ext.shieldTypeList = StateJabsNoteParser.#listFromBracketCapture(cap);
    }
    {
      const cap = StateJabsNoteParser.#readCapture(note, StateJabsNoteParser.#RE_SHIELD_BREAK);
      ext.shieldBreakSkillIds = StateJabsNoteParser.#listFromBracketCapture(cap);
    }

    ext.speedBoost = StateJabsNoteParser.#readSignedInt(note, StateJabsNoteParser.#RE_SPEED_BOOST);

    {
      const cap = StateJabsNoteParser.#readCapture(note, StateJabsNoteParser.#RE_TIMING_BASE_CAST);
      ext.timingBaseCastTime = cap === null
        ? ''
        : cap;
    }
    {
      const cap = StateJabsNoteParser.#readCapture(note, StateJabsNoteParser.#RE_TIMING_CAST_FLAT);
      ext.timingCastTimeFlat = cap === null
        ? ''
        : cap;
    }
    {
      const cap = StateJabsNoteParser.#readCapture(note, StateJabsNoteParser.#RE_TIMING_CAST_PERCENT);
      ext.timingCastTimePercent = cap === null
        ? ''
        : cap;
    }
    {
      const cap = StateJabsNoteParser.#readCapture(note, StateJabsNoteParser.#RE_TIMING_BASE_FCD);
      ext.timingBaseFastCooldown = cap === null
        ? ''
        : cap;
    }
    {
      const cap = StateJabsNoteParser.#readCapture(note, StateJabsNoteParser.#RE_TIMING_FCD_FLAT);
      ext.timingFastCooldownFlat = cap === null
        ? ''
        : cap;
    }
    {
      const cap = StateJabsNoteParser.#readCapture(note, StateJabsNoteParser.#RE_TIMING_FCD_RATE);
      ext.timingFastCooldownRate = cap === null
        ? ''
        : cap;
    }

    ext.gapCloseTarget = StateJabsNoteParser.#testAny(note, StateJabsNoteParser.#RE_GAP_CLOSE_TARGET);
  }

  /**
   * Prepends managed tags from {@code ext} onto stripped {@code baseNote}.
   */
  static writeStateTags(
    ext: StateJabsExtension,
    baseNote: string
  ): string
  {
    const parts: string[] = [];
    if (ext.negative)
    {
      parts.push('<negative>');
    }
    if (ext.rooted)
    {
      parts.push('<rooted>');
    }
    if (ext.disabled)
    {
      parts.push('<disabled>');
    }
    if (ext.muted)
    {
      parts.push('<muted>');
    }
    if (ext.paralyzed)
    {
      parts.push('<paralyzed>');
    }

    if (ext.stackType !== null)
    {
      parts.push(`<stackType:${ext.stackType}>`);
    }
    if (ext.stateRefreshDiminish !== null)
    {
      parts.push(`<stateRefreshDiminish:${Math.trunc(ext.stateRefreshDiminish)}>`);
    }
    if (ext.stateRefreshReset !== null)
    {
      parts.push(`<stateRefreshReset:${Math.trunc(ext.stateRefreshReset)}>`);
    }
    if (ext.stackExtendAmount !== null)
    {
      parts.push(`<stackExtendAmount:${Math.trunc(ext.stackExtendAmount)}>`);
    }
    if (ext.stackExtendMax !== null)
    {
      parts.push(`<stackExtendMax:${Math.trunc(ext.stackExtendMax)}>`);
    }
    if (ext.stackMax !== null)
    {
      parts.push(`<stackMax:${Math.trunc(ext.stackMax)}>`);
    }
    if (ext.applyStacks !== null)
    {
      parts.push(`<applyStacks:${Math.trunc(ext.applyStacks)}>`);
    }
    if (ext.loseAllStacksAtOnce)
    {
      parts.push('<loseAllStacksAtOnce>');
    }

    if (ext.aggroLock)
    {
      parts.push('<aggroLock>');
    }
    if (ext.aggroOutAmp !== null)
    {
      parts.push(`<aggroOutAmp:${StateJabsNoteParser.#fmtNum(ext.aggroOutAmp)}>`);
    }
    if (ext.aggroInAmp !== null)
    {
      parts.push(`<aggroInAmp:${StateJabsNoteParser.#fmtNum(ext.aggroInAmp)}>`);
    }

    if (ext.slipHpFlat !== null)
    {
      parts.push(`<hpFlat:${Math.trunc(ext.slipHpFlat)}>`);
    }
    if (ext.slipMpFlat !== null)
    {
      parts.push(`<mpFlat:${Math.trunc(ext.slipMpFlat)}>`);
    }
    if (ext.slipTpFlat !== null)
    {
      parts.push(`<tpFlat:${Math.trunc(ext.slipTpFlat)}>`);
    }
    if (ext.slipHpPercent !== null)
    {
      parts.push(`<hpPercent:${Math.trunc(ext.slipHpPercent)}>`);
    }
    if (ext.slipMpPercent !== null)
    {
      parts.push(`<mpPercent:${Math.trunc(ext.slipMpPercent)}>`);
    }
    if (ext.slipTpPercent !== null)
    {
      parts.push(`<tpPercent:${Math.trunc(ext.slipTpPercent)}>`);
    }
    if (ext.slipHpFormula.trim() !== '')
    {
      parts.push(`<hpFormula:[${ext.slipHpFormula.trim()}]>`);
    }
    if (ext.slipMpFormula.trim() !== '')
    {
      parts.push(`<mpFormula:[${ext.slipMpFormula.trim()}]>`);
    }
    if (ext.slipTpFormula.trim() !== '')
    {
      parts.push(`<tpFormula:[${ext.slipTpFormula.trim()}]>`);
    }

    if (ext.stateDurationFlat !== null)
    {
      parts.push(`<stateDurationFlat:${Math.trunc(ext.stateDurationFlat)}>`);
    }
    if (ext.stateDurationPercent !== null)
    {
      parts.push(`<stateDurationPerc:${Math.trunc(ext.stateDurationPercent)}>`);
    }
    if (ext.stateDurationFormula.trim() !== '')
    {
      parts.push(`<stateDurationFormula:[${ext.stateDurationFormula.trim()}]>`);
    }

    if (ext.shieldPointsFormula.trim() !== '')
    {
      parts.push(`<shield:[${ext.shieldPointsFormula.trim()}]>`);
    }
    if (ext.shieldCapFormula.trim() !== '')
    {
      parts.push(`<shieldCap:[${ext.shieldCapFormula.trim()}]>`);
    }
    if (ext.shieldPriority !== null)
    {
      parts.push(`<shieldPriority:${Math.trunc(ext.shieldPriority)}>`);
    }
    if (ext.shieldProtect)
    {
      parts.push('<shieldProtect>');
    }
    {
      const br = StateJabsNoteParser.#toBracketList(ext.shieldTypeList);
      if (br !== null)
      {
        parts.push(`<shieldType:${br}>`);
      }
    }
    {
      const br = StateJabsNoteParser.#toBracketList(ext.shieldBreakSkillIds);
      if (br !== null)
      {
        parts.push(`<shieldBreak:${br}>`);
      }
    }

    if (ext.speedBoost !== null)
    {
      parts.push(`<speedBoost:${Math.trunc(ext.speedBoost)}>`);
    }

    if (ext.timingBaseCastTime.trim() !== '')
    {
      parts.push(`<baseCastTime:[${ext.timingBaseCastTime.trim()}]>`);
    }
    if (ext.timingCastTimeFlat.trim() !== '')
    {
      parts.push(`<castTimeFlat:[${ext.timingCastTimeFlat.trim()}]>`);
    }
    if (ext.timingCastTimePercent.trim() !== '')
    {
      parts.push(`<castTimePercent:[${ext.timingCastTimePercent.trim()}]>`);
    }
    if (ext.timingBaseFastCooldown.trim() !== '')
    {
      parts.push(`<baseFastCooldown:[${ext.timingBaseFastCooldown.trim()}]>`);
    }
    if (ext.timingFastCooldownFlat.trim() !== '')
    {
      parts.push(`<fastCooldownFlat:[${ext.timingFastCooldownFlat.trim()}]>`);
    }
    if (ext.timingFastCooldownRate.trim() !== '')
    {
      parts.push(`<fastCooldownRate:[${ext.timingFastCooldownRate.trim()}]>`);
    }

    if (ext.gapCloseTarget)
    {
      parts.push('<gapCloseTarget>');
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

  static #listFromBracketCapture(cap: string | null): string
  {
    if (cap === null || cap.length === 0)
    {
      return '';
    }
    const t = cap.trim();
    if (t.length >= 2 && t.startsWith('[') && t.endsWith(']'))
    {
      return t.slice(1, -1)
        .trim();
    }
    return t;
  }

  static #toBracketList(raw: string): string | null
  {
    const t = raw.trim();
    if (t === '')
    {
      return null;
    }
    return `[${t}]`;
  }

  static #readStackType(note: string): 'refresh' | 'extend' | 'stack' | null
  {
    const cap = StateJabsNoteParser.#readCapture(note, StateJabsNoteParser.#RE_STACK_TYPE);
    if (cap === null)
    {
      return null;
    }
    const k = cap.toLowerCase();
    if (k === 'refresh' || k === 'extend' || k === 'stack')
    {
      return k;
    }
    return null;
  }

  static #readCapture(
    note: string,
    re: RegExp
  ): string | null
  {
    const g = StateJabsNoteParser.#ensureGlobal(re);
    g.lastIndex = 0;
    const m = g.exec(note);
    if (m === null)
    {
      return null;
    }
    const s = m[ 1 ];
    if (typeof s !== 'string' || s.length === 0)
    {
      return null;
    }
    return s;
  }

  static #testAny(
    note: string,
    re: RegExp
  ): boolean
  {
    const g = StateJabsNoteParser.#ensureGlobal(re);
    g.lastIndex = 0;
    return g.test(note);
  }

  static #readFloat(
    note: string,
    re: RegExp
  ): number | null
  {
    const s = StateJabsNoteParser.#readCapture(note, re);
    if (s === null)
    {
      return null;
    }
    const v = parseFloat(s);
    if (Number.isNaN(v))
    {
      return null;
    }
    return v;
  }

  static #readSignedInt(
    note: string,
    re: RegExp
  ): number | null
  {
    const s = StateJabsNoteParser.#readCapture(note, re);
    if (s === null)
    {
      return null;
    }
    const v = parseInt(s, 10);
    if (Number.isNaN(v))
    {
      return null;
    }
    return v;
  }

  static #readNonNegInt(
    note: string,
    re: RegExp
  ): number | null
  {
    const s = StateJabsNoteParser.#readCapture(note, re);
    if (s === null)
    {
      return null;
    }
    const v = parseInt(s, 10);
    if (Number.isNaN(v) || v < 0)
    {
      return null;
    }
    return v;
  }

  static #fmtNum(n: number): string
  {
    if (Number.isInteger(n))
    {
      return String(n);
    }
    return String(n);
  }
}

export { StateJabsNoteParser };
