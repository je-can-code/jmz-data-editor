import { RPG_BaseDomainModel } from '@core/domain/entities/RPG_BaseDomainModel.ts';
import RPG_Skill = Rmmz.Implementations.RPG_Skill;

/**
 * Domain model representing an RPG Maker MZ Skill.
 */
class RPG_SkillDomainModel
  extends RPG_BaseDomainModel<RPG_Skill>
{
  public description: string = '';
  public mpCost: number = 0;
  public tpCost: number = 0;

  constructor(rmmz: RPG_Skill)
  {
    super(rmmz);
    this.description = rmmz.description;
    this.mpCost = rmmz.mpCost;
    this.tpCost = rmmz.tpCost;
  }

  protected syncNote(): string
  {
    return this.note;
  }

  public toRmmz(): RPG_Skill
  {
    return {
      ...this._original,
      id: this.id,
      name: this.name,
      note: this.syncNote(),
    };
  }
}

export { RPG_SkillDomainModel };
