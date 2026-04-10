import { RPG_BaseDomainModel } from '@core/domain/entities/RPG_BaseDomainModel.ts';
import RPG_Weapon = Rmmz.Implementations.RPG_Weapon;

/**
 * Domain model representing an RPG Maker MZ Weapon.
 */
class RPG_WeaponDomainModel
  extends RPG_BaseDomainModel<RPG_Weapon>
{
  constructor(rmmz: RPG_Weapon)
  {
    super(rmmz);
  }

  /**
   * Converts the domain model back into the Rmmz format for saving.
   * @returns {RPG_Weapon} The raw RMMZ Weapon data.
   */
  public toRmmz(): RPG_Weapon
  {
    return {
      ...this._original,
      id: this.id,
      name: this.name,
      note: this.syncNote(),
    };
  }

  /**
   * Synchronizes domain-specific properties back into the note string.
   * @returns {string} The normalized note string.
   */
  protected syncNote(): string
  {
    return this.note;
  }
}

export { RPG_WeaponDomainModel };
