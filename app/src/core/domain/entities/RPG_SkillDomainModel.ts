import { RPG_BaseDomainModel } from '@core/domain/entities/RPG_BaseDomainModel.ts';
import { parseRmmzDamageElementId } from '@core/enums/RmmzDamageElementId.ts';
import { parseRmmzDamageType, parseRmmzDamageVariance, } from '@core/enums/RmmzDamageType.ts';
import { parseRmmzSkillOccasion, RmmzSkillOccasion } from '@core/enums/RmmzSkillOccasion.ts';
import { normalizeSkillAnimationId } from '@core/enums/RmmzSkillAnimation.ts';
import {
  normalizeSkillRepeats,
  normalizeSkillSpeed,
  normalizeSkillSuccessRate,
} from '@core/enums/RmmzSkillInvocation.ts';
import { normalizeSkillStypeId } from '@core/enums/RmmzSkillStype.ts';
import { normalizeRequiredWtypeId } from '@core/enums/RmmzWeaponType.ts';
import { parseRmmzSkillScope, RmmzSkillScope } from '@core/enums/RmmzSkillScope.ts';
import { parseRmmzUsableHitType, RmmzUsableHitType } from '@core/enums/RmmzUsableHitType.ts';
import { SkillJabsExtension } from '@core/domain/entities/jabs/SkillJabsExtension.ts';
import { SkillExtendParser } from '@services/parsers/SkillExtendParser.ts';
import { SkillSksSkillNoteParser } from '@services/parsers/SkillSksSkillNoteParser.ts';
import { SkillOnAttackGainParser } from '@services/parsers/SkillOnAttackGainParser.ts';
import { SkillResourceCostParser } from '@services/parsers/SkillResourceCostParser.ts';
import { UsableItemAttackElementsParser } from '@services/parsers/UsableItemAttackElementsParser.ts';
import { UsableItemThisCritParser } from '@services/parsers/UsableItemThisCritParser.ts';
import { NoteNormalizer } from '@services/utils/NoteNormalizer.ts';
import { cloneUsableEffectsFromRmmz } from '@core/enums/RmmzUsableEffectCatalog.ts';
import RPG_Skill = Rmmz.Implementations.RPG_Skill;
import RPG_SkillDamage = Rmmz.Data.RPG_SkillDamage;
import RPG_UsableEffect = Rmmz.Data.RPG_UsableEffect;

/**
 * Domain model representing an RPG Maker MZ Skill.
 */
class RPG_SkillDomainModel
  extends RPG_BaseDomainModel<RPG_Skill>
{
  public description: string = '';

  /**
   * Index into {@code IconSet.png} ({@link Rmmz.Base.RPG_BaseItem.iconIndex}).
   */
  public iconIndex: number = 0;

  /**
   * Battle log lines ({@link Rmmz.Implementations.RPG_Skill.message1} / {@code message2}); engine resolves {@code %1} etc.
   */
  public message1: string = '';

  public message2: string = '';

  public mpCost: number = 0;
  public tpCost: number = 0;

  /**
   * Database TP gained by the user on successful hit ({@link Rmmz.Core.RPG_UsableItem.tpGain}); separate from J-Resources on-attack TP tags.
   */
  public tpGain: number = 0;

  public scope: RmmzSkillScope = RmmzSkillScope.None;

  public occasion: RmmzSkillOccasion = RmmzSkillOccasion.Always;

  /**
   * Index into {@link Rmmz.System.RPG_System.skillTypes}; {@code 0} is {@code None} in a default database.
   */
  public stypeId: number = 0;

  /**
   * Indices into {@link Rmmz.System.RPG_System.weaponTypes}; {@code 0} = no requirement.
   */
  public requiredWtypeId1: number = 0;

  public requiredWtypeId2: number = 0;

  /**
   * Invocation: agility / timing modifier (can be negative).
   */
  public speed: number = 0;

  /**
   * Invocation: success chance 0–100. {@link Rmmz.Core.RPG_UsableItem.successRate}.
   */
  public successRate: number = 100;

  /**
   * Invocation: times the skill applies per use (minimum 1).
   */
  public repeats: number = 1;

  /**
   * Invocation: certain / physical / magical hit.
   */
  public hitType: RmmzUsableHitType = RmmzUsableHitType.PhysicalAttack;

  /**
   * Invocation: {@code Animations.json} id; {@code -1} = weapon default, {@code 0} = none.
   */
  public animationId: number = 0;

  /**
   * J-Resources HP cost tags (flat / percent / formula) and lethal allowance.
   */
  public hpCostFlat: number = 0;

  public hpCostPercent: number = 0;

  public hpCostFormula: string = '';

  public hpCostCanKill: boolean = false;

  /**
   * Extra MP/TP cost from J-Resources tags (added to database mpCost/tpCost at runtime).
   */
  public mpCostTagFlat: number = 0;

  public mpCostTagPercent: number = 0;

  public mpCostTagFormula: string = '';

  public tpCostTagFlat: number = 0;

  public tpCostTagPercent: number = 0;

  public tpCostTagFormula: string = '';

  /**
   * J-Resources ABS on-attack gains (caster) from skill note tags.
   */
  public onAttackHpGainFlat: number = 0;

  public onAttackHpGainPercent: number = 0;

  public onAttackHpGainFormula: string = '';

  public onAttackMpGainFlat: number = 0;

  public onAttackMpGainPercent: number = 0;

  public onAttackMpGainFormula: string = '';

  public onAttackTpGainFlat: number = 0;

  public onAttackTpGainPercent: number = 0;

  public onAttackTpGainFormula: string = '';

  /**
   * Core MZ {@link RPG_SkillDamage} fields (skills and items). Type {@code 0} (none) skips the damage step in MZ.
   */
  public damageType: number = 1;

  /**
   * {@link Rmmz.Data.RPG_SkillDamage.elementId}; {@code -1} = normal attack (battler attack elements).
   */
  public damageElementId: number = 0;

  public damageFormula: string = '';

  public damageVariance: number = 0;

  public damageCritical: boolean = false;

  /**
   * J-Elementalistics: extra attack element ids (excludes {@link damageElementId} when loaded).
   */
  public attackElementIds: number[] = [];

  /**
   * J-SkillExtend: base skill ids this skill extends ({@code <skillExtend:[id,...]>}); overlay augments those skills when learned.
   */
  public skillExtendBaseIds: number[] = [];

  /**
   * J-SKS {@code <slotCost:N>}; {@code null} when the tag is omitted (runtime default applies).
   */
  public sksSlotCost: number | null = null;

  /**
   * J-SKS explicit {@code <unslotted>} tag only. In-game {@code unslotted} is also true when the skill type is not equippable per plugin params.
   */
  public sksExplicitUnslotted: boolean = false;

  /**
   * J-CriticalFactors per-action modifiers (only apply when {@link damageCritical} is true in-game).
   */
  public thisCritChanceFormula: string = '';

  public thisCritDamageMultiplierFormula: string = '';

  public thisCritsAlways: boolean = false;

  /**
   * Vanilla MZ {@link Rmmz.Core.RPG_UsableItem.effects} (HP/MP recover, states, buffs, common events, etc.).
   */
  public effects: RPG_UsableEffect[] = [];

  /**
   * JABS-related tags on this skill (see {@link SkillJabsExtension}).
   */
  public jabs!: SkillJabsExtension;

  constructor(rmmz: RPG_Skill)
  {
    super(rmmz);
    this.description = rmmz.description;
    this.iconIndex = typeof rmmz.iconIndex === 'number'
      ? Math.max(0, Math.trunc(rmmz.iconIndex))
      : 0;
    this.message1 = typeof rmmz.message1 === 'string'
      ? rmmz.message1
      : '';
    this.message2 = typeof rmmz.message2 === 'string'
      ? rmmz.message2
      : '';
    this.mpCost = rmmz.mpCost;
    this.tpCost = rmmz.tpCost;
    this.tpGain = typeof rmmz.tpGain === 'number'
      ? Math.trunc(rmmz.tpGain)
      : 0;
    this.scope = parseRmmzSkillScope(
      typeof rmmz.scope === 'number'
        ? rmmz.scope
        : RmmzSkillScope.None
    );
    this.occasion = parseRmmzSkillOccasion(
      typeof rmmz.occasion === 'number'
        ? rmmz.occasion
        : RmmzSkillOccasion.Always
    );
    this.stypeId = normalizeSkillStypeId(
      typeof rmmz.stypeId === 'number'
        ? rmmz.stypeId
        : 0
    );
    this.requiredWtypeId1 = normalizeRequiredWtypeId(
      typeof rmmz.requiredWtypeId1 === 'number'
        ? rmmz.requiredWtypeId1
        : 0
    );
    this.requiredWtypeId2 = normalizeRequiredWtypeId(
      typeof rmmz.requiredWtypeId2 === 'number'
        ? rmmz.requiredWtypeId2
        : 0
    );

    this.speed = normalizeSkillSpeed(
      typeof rmmz.speed === 'number'
        ? rmmz.speed
        : 0
    );
    this.successRate = normalizeSkillSuccessRate(
      typeof rmmz.successRate === 'number'
        ? rmmz.successRate
        : 100
    );
    this.repeats = normalizeSkillRepeats(
      typeof rmmz.repeats === 'number'
        ? rmmz.repeats
        : 1
    );
    this.hitType = parseRmmzUsableHitType(
      typeof rmmz.hitType === 'number'
        ? rmmz.hitType
        : RmmzUsableHitType.PhysicalAttack
    );
    this.animationId = normalizeSkillAnimationId(
      typeof rmmz.animationId === 'number'
        ? rmmz.animationId
        : 0
    );

    this.hpCostFlat = SkillResourceCostParser.readHpCostFlat(this.note);
    this.hpCostPercent = SkillResourceCostParser.readHpCostPercent(this.note);
    this.hpCostFormula = SkillResourceCostParser.readHpCostFormula(this.note);
    this.hpCostCanKill = SkillResourceCostParser.readHpCostCanKill(this.note);
    this.mpCostTagFlat = SkillResourceCostParser.readMpCostTagFlat(this.note);
    this.mpCostTagPercent = SkillResourceCostParser.readMpCostTagPercent(this.note);
    this.mpCostTagFormula = SkillResourceCostParser.readMpCostTagFormula(this.note);
    this.tpCostTagFlat = SkillResourceCostParser.readTpCostTagFlat(this.note);
    this.tpCostTagPercent = SkillResourceCostParser.readTpCostTagPercent(this.note);
    this.tpCostTagFormula = SkillResourceCostParser.readTpCostTagFormula(this.note);

    this.onAttackHpGainFlat = SkillOnAttackGainParser.readOnAttackHpGainFlat(this.note);
    this.onAttackHpGainPercent = SkillOnAttackGainParser.readOnAttackHpGainPercent(this.note);
    this.onAttackHpGainFormula = SkillOnAttackGainParser.readOnAttackHpGainFormula(this.note);
    this.onAttackMpGainFlat = SkillOnAttackGainParser.readOnAttackMpGainFlat(this.note);
    this.onAttackMpGainPercent = SkillOnAttackGainParser.readOnAttackMpGainPercent(this.note);
    this.onAttackMpGainFormula = SkillOnAttackGainParser.readOnAttackMpGainFormula(this.note);
    this.onAttackTpGainFlat = SkillOnAttackGainParser.readOnAttackTpGainFlat(this.note);
    this.onAttackTpGainPercent = SkillOnAttackGainParser.readOnAttackTpGainPercent(this.note);
    this.onAttackTpGainFormula = SkillOnAttackGainParser.readOnAttackTpGainFormula(this.note);

    const dmg: RPG_SkillDamage = rmmz.damage ?? {
      critical: false,
      elementId: 0,
      formula: '',
      type: 1,
      variance: 0,
    };
    this.damageType = parseRmmzDamageType(dmg.type);
    this.damageElementId = parseRmmzDamageElementId(dmg.elementId);
    this.damageFormula = dmg.formula ?? '';
    this.damageVariance = parseRmmzDamageVariance(dmg.variance);
    this.damageCritical = dmg.critical === true;

    const extras = UsableItemAttackElementsParser.readAttackElements(this.note);
    this.attackElementIds = extras.filter((id) => id !== this.damageElementId);

    this.skillExtendBaseIds = SkillExtendParser.readBaseSkillIds(this.note);

    this.sksSlotCost = SkillSksSkillNoteParser.readSlotCost(this.note);
    this.sksExplicitUnslotted = SkillSksSkillNoteParser.readExplicitUnslotted(this.note);

    this.thisCritChanceFormula =
      UsableItemThisCritParser.readThisCritChance(this.note);
    this.thisCritDamageMultiplierFormula =
      UsableItemThisCritParser.readThisCritDamageMultiplier(this.note);
    this.thisCritsAlways = UsableItemThisCritParser.readThisCritsAlways(this.note);

    this.effects = cloneUsableEffectsFromRmmz(rmmz.effects);

    this.jabs = SkillJabsExtension.fromSkillNote(this.note);
  }

  /**
   * {@code <bonus-hits:N>} on this skill ({@code RPG_Skill#jabsBonusHitsFromSkillNote} / {@code J.ABS.RegExp.BonusHitsSkillNote}).
   * Alias of {@link SkillJabsExtension.jabsBonusHitsFromSkillNote}; edits should go through {@link jabs} (e.g. extensions panel).
   */
  public get jabsBonusHitsFromSkillNote(): number | null
  {
    return this.jabs.jabsBonusHitsFromSkillNote;
  }

  public toRmmz(): RPG_Skill
  {
    const damage: RPG_SkillDamage = {
      ...this._original.damage,
      type: parseRmmzDamageType(this.damageType),
      elementId: parseRmmzDamageElementId(this.damageElementId),
      formula: this.damageFormula,
      variance: parseRmmzDamageVariance(this.damageVariance),
      critical: this.damageCritical,
    };

    return {
      ...this._original,
      id: this.id,
      name: this.name,
      note: this.syncNote(),

      description: this.description,
      iconIndex: Math.max(0, Math.trunc(this.iconIndex)),
      message1: this.message1,
      message2: this.message2,
      mpCost: this.mpCost,
      tpCost: this.tpCost,
      tpGain: Math.trunc(this.tpGain),
      scope: parseRmmzSkillScope(this.scope),
      occasion: parseRmmzSkillOccasion(this.occasion),
      stypeId: normalizeSkillStypeId(this.stypeId),
      requiredWtypeId1: normalizeRequiredWtypeId(this.requiredWtypeId1),
      requiredWtypeId2: normalizeRequiredWtypeId(this.requiredWtypeId2),
      speed: normalizeSkillSpeed(this.speed),
      successRate: normalizeSkillSuccessRate(this.successRate),
      repeats: normalizeSkillRepeats(this.repeats),
      hitType: parseRmmzUsableHitType(this.hitType),
      animationId: normalizeSkillAnimationId(this.animationId),
      damage,
      effects: this.effects.map((row) => ({
        code: row.code,
        dataId: row.dataId,
        value1: row.value1,
        value2: row.value2,
      })),
    };
  }

  protected syncNote(): string
  {
    let n = this.note;

    n = SkillResourceCostParser.writeHpCostFlat(n, this.hpCostFlat);
    n = SkillResourceCostParser.writeHpCostPercent(n, this.hpCostPercent);
    n = SkillResourceCostParser.writeHpCostFormula(n, this.hpCostFormula);
    n = SkillResourceCostParser.writeHpCostCanKill(n, this.hpCostCanKill);

    n = SkillResourceCostParser.writeMpCostTagFlat(n, this.mpCostTagFlat);
    n = SkillResourceCostParser.writeMpCostTagPercent(n, this.mpCostTagPercent);
    n = SkillResourceCostParser.writeMpCostTagFormula(n, this.mpCostTagFormula);

    n = SkillResourceCostParser.writeTpCostTagFlat(n, this.tpCostTagFlat);
    n = SkillResourceCostParser.writeTpCostTagPercent(n, this.tpCostTagPercent);
    n = SkillResourceCostParser.writeTpCostTagFormula(n, this.tpCostTagFormula);

    n = SkillOnAttackGainParser.writeOnAttackHpGainFlat(n, this.onAttackHpGainFlat);
    n = SkillOnAttackGainParser.writeOnAttackHpGainPercent(n, this.onAttackHpGainPercent);
    n = SkillOnAttackGainParser.writeOnAttackHpGainFormula(n, this.onAttackHpGainFormula);
    n = SkillOnAttackGainParser.writeOnAttackMpGainFlat(n, this.onAttackMpGainFlat);
    n = SkillOnAttackGainParser.writeOnAttackMpGainPercent(n, this.onAttackMpGainPercent);
    n = SkillOnAttackGainParser.writeOnAttackMpGainFormula(n, this.onAttackMpGainFormula);
    n = SkillOnAttackGainParser.writeOnAttackTpGainFlat(n, this.onAttackTpGainFlat);
    n = SkillOnAttackGainParser.writeOnAttackTpGainPercent(n, this.onAttackTpGainPercent);
    n = SkillOnAttackGainParser.writeOnAttackTpGainFormula(n, this.onAttackTpGainFormula);

    n = UsableItemAttackElementsParser.writeAttackElements(n, this.attackElementIds);
    n = SkillExtendParser.writeSkillExtend(n, this.skillExtendBaseIds);
    n = SkillSksSkillNoteParser.writeSksSkillTags(
      n,
      this.sksSlotCost,
      this.sksExplicitUnslotted
    );
    n = UsableItemThisCritParser.writeThisCritChance(n, this.thisCritChanceFormula);
    n = UsableItemThisCritParser.writeThisCritDamageMultiplier(
      n,
      this.thisCritDamageMultiplierFormula
    );
    n = UsableItemThisCritParser.writeThisCritsAlways(n, this.thisCritsAlways);

    n = this.jabs.applyToNote(n);

    return NoteNormalizer.normalize(n);
  }
}

export { RPG_SkillDomainModel };
