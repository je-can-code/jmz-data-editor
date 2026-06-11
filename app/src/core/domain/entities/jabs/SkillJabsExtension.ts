import { SkillJabsNoteParser } from '@services/parsers/SkillJabsNoteParser.ts';

/**
 * JABS skill note slice (all {@code ON SKILLS} tags from {@code J.ABS.RegExp}).
 * Persisted only via {@link Rmmz.Implementations.RPG_Skill.note}.
 */
class SkillJabsExtension
{
  public actionId: number | null = null;

  public hideFromJabsMenu: boolean = false;

  public castTime: number | null = null;

  public castAnimation: number | null = null;

  public cooldown: number | null = null;

  public uniqueCooldown: boolean = false;

  /**
   * {@code <ogcd>} — JABS {@code jabsIgnoresGlobalCooldown}; skill ignores the battler-wide GCD (off-global).
   */
  public ogcd: boolean = false;

  /**
   * {@code <gcd:N>} — JABS {@code jabsGlobalCooldownOverride}; positive frames override for GCD length when this skill
   * is GCD-subject; {@code null} means use the plugin default.
   */
  public globalCooldownOverride: number | null = null;

  public degrees: number | null = null;

  public rangeRadius: number | null = null;

  /** {@code circle} | {@code rhombus} | … (see {@code J.ABS.RegExp.Shape}). */
  public hitboxShape: string | null = null;

  public projectileCount: number | null = null;

  /** {@code line} | {@code spray} | … */
  public projectileFormation: string | null = null;

  public thickness: number | null = null;

  public direct: boolean = false;

  public directLock: boolean = false;

  public proximity: number | null = null;

  public duration: number | null = null;

  public knockback: number | null = null;

  /** Bracket payload only, e.g. {@code [0, true, 0.5]} — see JABS {@code DelayData}. */
  public delayRaw: string | null = null;

  public linger: number | null = null;

  public selfAnimationId: number | null = null;

  public onCastAnimationId: number | null = null;

  /** e.g. {@code [1, 2]} */
  public comboRaw: string | null = null;

  public comboStarter: boolean = false;

  public aiSkillExclusion: boolean = false;

  public freeCombo: boolean = false;

  public noAutoAssign: boolean = false;

  public upgradeOverSkillId: number | null = null;

  public noUpgrade: boolean = false;

  public onlyUpgrade: boolean = false;

  public bonusAggro: number | null = null;

  public aggroMultiplier: number | null = null;

  public unparryable: boolean = false;

  /**
   * {@code <bonus-hits:N>} — {@code J.ABS.RegExp.BonusHitsSkillNote}; per-skill add to JABS bonus-hit total for this action.
   */
  public jabsBonusHitsFromSkillNote: number | null = null;

  /** Extra pierce steps (JABS {@code pierce} first value). */
  public pierceMaxCount: number | null = null;

  /** Frames between pierce hits (JABS {@code pierce} second value). */
  public pierceDelayFrames: number | null = null;

  /** Guard flat reduction (JABS {@code guard} first value). */
  public guardFlat: number | null = null;

  /** Guard percent reduction (JABS {@code guard} second value). */
  public guardPercent: number | null = null;

  public parry: number | null = null;

  public counterParrySkillId: number | null = null;

  public counterParryChance: number | null = null;

  public counterGuardSkillId: number | null = null;

  public counterGuardChance: number | null = null;

  public dodgeSteps: number | null = null;

  public dodgeSpeed: number | null = null;

  /** {@code forward} | {@code backward} | {@code directional} */
  public moveType: string | null = null;

  public invincibleDodge: boolean = false;

  public iframesStartFrame: number | null = null;

  public iframesEndFrame: number | null = null;

  public onDefeatedTarget: boolean = false;

  public visOffsetRaw: string | null = null;

  public visAnchorRaw: string | null = null;

  public visRotate: boolean = false;

  public visScaleRaw: string | null = null;

  public visZ: number | null = null;

  public visDebug: boolean = false;

  public visOffsetURaw: string | null = null;

  public visOffsetDRaw: string | null = null;

  public visOffsetLRaw: string | null = null;

  public visOffsetRRaw: string | null = null;

  public visOffsetURRaw: string | null = null;

  public visOffsetULRaw: string | null = null;

  public visOffsetDRRaw: string | null = null;

  public visOffsetDLRaw: string | null = null;

  public noCastPreview: boolean = false;

  public castPreviewWarnAt: number | null = null;

  /**
   * {@code <jabsJuiceIcon:N>} — J-ABS-Juice override for the weapon-swing IconSet index.
   * {@code null} (no tag) or a negative value means "let the plugin infer from the equipped weapon / offhand".
   */
  public juiceIconIndex: number | null = null;

  /**
   * {@code <jabsJuiceWeaponStyle:KEY>} — names a row in the J-ABS-Juice "Weapon style multipliers" JSON.
   * Free identifier (letters, digits, underscore, dash). Empty / null lets the plugin infer the row.
   */
  public juiceWeaponStyle: string | null = null;

  /**
   * {@code <juiceMotion:NAME>} — preset weapon swing motion (kebab-case). Canonical keys:
   * {@code arc}, {@code arc-reverse}, {@code bash}, {@code present}, {@code recoil}, {@code spin},
   * {@code spin-reverse}, {@code stab-forward}. Legacy aliases (e.g. {@code swing-top-down}) are mapped at runtime.
   */
  public juiceMotion: string | null = null;

  /**
   * {@code <juiceSpan:N>} — arc span in degrees for {@code arc} / {@code arc-reverse} (plugin default 120; typical 30–300).
   */
  public juiceArcSpanDegrees: number | null = null;

  /**
   * {@code <juiceSpinCount:N>} — full rotations for {@code spin} / {@code spin-reverse} (plugin default 1; clamped 1–8).
   */
  public juiceSpinCount: number | null = null;

  /**
   * {@code <juiceStabTipDegrees:N>} — tip / bore bearing from Pixi +x at rotation 0, in degrees (signed; see plugin help).
   */
  public juiceStabTipDegrees: number | null = null;

  /**
   * {@code <juiceProfileGun>} — side-profile gun overlay: flip horizontally for east/west aim
   * instead of the default ~180° rotation flip.
   */
  public juiceProfileGun: boolean = false;

  /**
   * @param note Skill {@code note} text.
   */
  static fromSkillNote(note: string): SkillJabsExtension
  {
    const j = new SkillJabsExtension();
    SkillJabsNoteParser.hydrate(j, note);
    return j;
  }

  /**
   * Strips managed JABS tags from {@code note} and rewrites them from this object.
   */
  applyToNote(note: string): string
  {
    const base = SkillJabsNoteParser.stripSkillTags(note);
    return SkillJabsNoteParser.writeSkillTags(this, base);
  }

  /**
   * Shallow copy for React updates (avoid sharing one extension across skill rows).
   */
  clone(patch?: Partial<SkillJabsExtension>): SkillJabsExtension
  {
    const j = new SkillJabsExtension();
    Object.assign(j, this);
    if (patch !== undefined)
    {
      Object.assign(j, patch);
    }
    return j;
  }
}

export { SkillJabsExtension };
