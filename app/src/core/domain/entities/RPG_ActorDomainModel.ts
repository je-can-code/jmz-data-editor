import { RPG_BaseDomainModel } from '@core/domain/entities/RPG_BaseDomainModel.ts';
import RPG_Actor = Rmmz.Implementations.RPG_Actor;

/**
 * Domain model representing an RPG Maker MZ Actor.
 */
class RPG_ActorDomainModel
  extends RPG_BaseDomainModel<RPG_Actor>
{
  constructor(rmmz: RPG_Actor)
  {
    super(rmmz);
  }

  protected syncNote(): string
  {
    return this.note;
  }

  public toRmmz(): RPG_Actor
  {
    return {
      ...this._original,
      id: this.id,
      name: this.name,
      note: this.syncNote(),
    };
  }
}

export { RPG_ActorDomainModel };
