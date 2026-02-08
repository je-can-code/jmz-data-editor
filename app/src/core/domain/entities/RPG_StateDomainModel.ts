import { RPG_BaseDomainModel } from '@core/domain/entities/RPG_BaseDomainModel.ts';
import RPG_State = Rmmz.Implementations.RPG_State;

/**
 * Domain model representing an RPG Maker MZ State.
 */
class RPG_StateDomainModel
  extends RPG_BaseDomainModel<RPG_State>
{
  constructor(rmmz: RPG_State)
  {
    super(rmmz);
  }

  protected syncNote(): string
  {
    return this.note;
  }

  public toRmmz(): RPG_State
  {
    return {
      ...this._original,
      id: this.id,
      name: this.name,
      note: this.syncNote(),
    };
  }
}

export { RPG_StateDomainModel };
