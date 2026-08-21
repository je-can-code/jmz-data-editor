import { RPG_BaseDomainModel } from '@core/domain/entities/RPG_BaseDomainModel.ts';
import { parseRmmzDamageElementId } from '@core/enums/RmmzDamageElementId.ts';
import { parseRmmzDamageType, parseRmmzDamageVariance } from '@core/enums/RmmzDamageType.ts';
import { parseRmmzSkillOccasion, RmmzSkillOccasion } from '@core/enums/RmmzSkillOccasion.ts';
import { parseRmmzSkillScope, RmmzSkillScope } from '@core/enums/RmmzSkillScope.ts';
import { parseRmmzUsableHitType, RmmzUsableHitType } from '@core/enums/RmmzUsableHitType.ts';
import {
  normalizeSkillRepeats,
  normalizeSkillSpeed,
  normalizeSkillSuccessRate,
} from '@core/enums/RmmzSkillInvocation.ts';
import { UsableItemAttackElementsParser } from '@services/parsers/UsableItemAttackElementsParser.ts';
import { UsableItemThisCritParser } from '@services/parsers/UsableItemThisCritParser.ts';
import { IngredientTypeParser } from '@services/parsers/IngredientTypeParser.ts';
import { FoodTypeParser } from '@services/parsers/FoodTypeParser.ts';
import { cloneUsableEffectsFromRmmz } from '@core/enums/RmmzUsableEffectCatalog.ts';
import { NoteNormalizer } from '@services/utils/NoteNormalizer.ts';
import RPG_Item = Rmmz.Implementations.RPG_Item;
import RPG_UsableEffect = Rmmz.Data.RPG_UsableEffect;

class RPG_ItemDomainModel
  extends RPG_BaseDomainModel<RPG_Item>
{
  public iconIndex: number;
  public description: string;
  public price: number;
  public itypeId: number;
  public consumable: boolean;

  public scope: RmmzSkillScope;
  public occasion: RmmzSkillOccasion;
  public speed: number;
  public successRate: number;
  public repeats: number;
  public tpGain: number;
  public hitType: RmmzUsableHitType;
  public animationId: number;

  public damageType: number;
  public damageElementId: number;
  public damageFormula: string;
  public damageVariance: number;
  public damageCritical: boolean;
  public attackElementIds: number[];
  /** The ingredient types this item counts as when a recipe slot asks for them. */
  public ingredientTypeKeys: string[];
  /** The food group eating this item binds the battler to, or empty when it is not food. */
  public foodTypeKey: string;
  public thisCritChanceFormula: string;
  public thisCritDamageMultiplierFormula: string;
  public thisCritsAlways: boolean;

  public effects: RPG_UsableEffect[];

  constructor(rmmz: RPG_Item)
  {
    super(rmmz);
    this.iconIndex = typeof rmmz.iconIndex === 'number'
      ? Math.max(0, Math.trunc(rmmz.iconIndex))
      : 0;
    this.description = rmmz.description ?? '';
    this.price = typeof rmmz.price === 'number'
      ? Math.max(0, Math.trunc(rmmz.price))
      : 0;
    this.itypeId = typeof rmmz.itypeId === 'number'
      ? Math.trunc(rmmz.itypeId)
      : 1;
    this.consumable = rmmz.consumable ?? true;

    this.scope = parseRmmzSkillScope(
      typeof rmmz.scope === 'number'
        ? rmmz.scope
        : RmmzSkillScope.None,
    );
    this.occasion = parseRmmzSkillOccasion(
      typeof rmmz.occasion === 'number'
        ? rmmz.occasion
        : RmmzSkillOccasion.Always,
    );
    this.speed = normalizeSkillSpeed(
      typeof rmmz.speed === 'number'
        ? rmmz.speed
        : 0,
    );
    this.successRate = normalizeSkillSuccessRate(
      typeof rmmz.successRate === 'number'
        ? rmmz.successRate
        : 100,
    );
    this.repeats = normalizeSkillRepeats(
      typeof rmmz.repeats === 'number'
        ? rmmz.repeats
        : 1,
    );
    this.tpGain = typeof rmmz.tpGain === 'number'
      ? Math.trunc(rmmz.tpGain)
      : 0;
    this.hitType = parseRmmzUsableHitType(
      typeof rmmz.hitType === 'number'
        ? rmmz.hitType
        : RmmzUsableHitType.PhysicalAttack,
    );
    this.animationId = typeof rmmz.animationId === 'number'
      ? Math.trunc(rmmz.animationId)
      : 0;

    const dmg = rmmz.damage ?? {};
    this.damageType = parseRmmzDamageType(typeof dmg.type === 'number'
      ? dmg.type
      : 0);
    this.damageElementId = parseRmmzDamageElementId(typeof dmg.elementId === 'number'
      ? dmg.elementId
      : 0);
    this.damageFormula = typeof dmg.formula === 'string'
      ? dmg.formula
      : '';
    this.damageVariance = parseRmmzDamageVariance(typeof dmg.variance === 'number'
      ? dmg.variance
      : 0);
    this.damageCritical = dmg.critical === true;

    this.attackElementIds = UsableItemAttackElementsParser.readAttackElements(this.note);
    this.thisCritChanceFormula = UsableItemThisCritParser.readThisCritChance(this.note);
    this.thisCritDamageMultiplierFormula = UsableItemThisCritParser.readThisCritDamageMultiplier(this.note);
    this.thisCritsAlways = UsableItemThisCritParser.readThisCritsAlways(this.note);
    this.ingredientTypeKeys = IngredientTypeParser.readIngredientTypes(this.note);
    this.foodTypeKey = FoodTypeParser.readFoodType(this.note);

    this.effects = cloneUsableEffectsFromRmmz(rmmz.effects);
  }

  public toRmmz(): RPG_Item
  {
    return {
      ...this._original,
      id: this.id,
      name: this.name,
      note: this.syncNote(),
      iconIndex: this.iconIndex,
      description: this.description,
      price: this.price,
      itypeId: this.itypeId,
      consumable: this.consumable,
      scope: this.scope,
      occasion: this.occasion,
      speed: this.speed,
      successRate: this.successRate,
      repeats: this.repeats,
      tpGain: this.tpGain,
      hitType: this.hitType,
      animationId: this.animationId,
      damage: {
        type: this.damageType,
        elementId: this.damageElementId,
        formula: this.damageFormula,
        variance: this.damageVariance,
        critical: this.damageCritical,
      },
      effects: this.effects.map((e) => ({ ...e })),
    };
  }

  protected syncNote(): string
  {
    let note = this.note;
    note = UsableItemAttackElementsParser.writeAttackElements(note, this.attackElementIds);
    note = UsableItemThisCritParser.writeThisCritChance(note, this.thisCritChanceFormula);
    note = UsableItemThisCritParser.writeThisCritDamageMultiplier(note, this.thisCritDamageMultiplierFormula);
    note = UsableItemThisCritParser.writeThisCritsAlways(note, this.thisCritsAlways);
    note = IngredientTypeParser.writeIngredientTypes(note, this.ingredientTypeKeys);
    note = FoodTypeParser.writeFoodType(note, this.foodTypeKey);
    return NoteNormalizer.normalize(note);
  }
}

export { RPG_ItemDomainModel };
