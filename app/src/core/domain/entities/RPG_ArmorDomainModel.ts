import { RPG_BaseDomainModel } from '@core/domain/entities/RPG_BaseDomainModel.ts';
import RPG_Armor = Rmmz.Implementations.RPG_Armor;

/**
 * Domain model representing an RPG Maker MZ Armor.
 */
class RPG_ArmorDomainModel
  extends RPG_BaseDomainModel<RPG_Armor>
{
  constructor(rmmz: RPG_Armor)
  {
    super(rmmz);
  }

  /**
   * Converts the domain model back into the Rmmz format for saving.
   * @returns {RPG_Armor} The raw RMMZ Armor data.
   */
  public toRmmz(): RPG_Armor
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

export { RPG_ArmorDomainModel };
