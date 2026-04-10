import { RPG_BaseDomainModel } from '@core/domain/entities/RPG_BaseDomainModel.ts';
import RPG_Item = Rmmz.Implementations.RPG_Item;

/**
 * Domain model representing an RPG Maker MZ Item.
 */
class RPG_ItemDomainModel
  extends RPG_BaseDomainModel<RPG_Item>
{
  constructor(rmmz: RPG_Item)
  {
    super(rmmz);
  }

  /**
   * Converts the domain model back into the Rmmz format for saving.
   * Leverages the captured original object to preserve all unhandled fields.
   * @returns {RPG_Item} The raw RMMZ Item data.
   */
  public toRmmz(): RPG_Item
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

export { RPG_ItemDomainModel };
