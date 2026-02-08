import { RPG_BaseDomainModel } from '@core/domain/entities/RPG_BaseDomainModel.ts';
import RPG_Class = Rmmz.Implementations.RPG_Class;

/**
 * Domain model representing an RPG Maker MZ Class.
 */
class RPG_ClassDomainModel
  extends RPG_BaseDomainModel<RPG_Class>
{
  constructor(rmmz: RPG_Class)
  {
    super(rmmz);
  }

  protected syncNote(): string
  {
    return this.note;
  }

  public toRmmz(): RPG_Class
  {
    return {
      ...this._original,
      id: this.id,
      name: this.name,
      note: this.syncNote(),
    };
  }
}

export { RPG_ClassDomainModel };
