import RPG_DropItem = Rmmz.Data.RPG_DropItem;
import RPG_DropHelper from "./DropHelper.ts";

/**
 * A builder class for simply developing {@link RPG_DropItem}s.
 */
export default class DropItemBuilder
{
  //region properties
  /**
   * The current id mapping to the entry in the database for this drop.
   * @type {number}
   */
  #id = 0;

  /**
   * The type id mapping to one of the given {@link RPG_DropItem.Types} that represent
   * the type of drop this is.
   * @type {number}
   */
  #type = 0;

  /**
   * The percent chance that this loot will be dropped.
   * @type {number}
   */
  #chance = 0;

  //endregion properties

  /**
   * Builds the {@link RPG_DropItem} with the current parameters in this builder.
   * @param {boolean=} withClear Whether or not to clear the builder's data after building; defaults to true.
   */
  build(withClear: boolean = true): RPG_DropItem
  {
    // create an anonymous object representing the drop data.
    const dropItem = {
      kind: this.#type, dataId: this.#id, denominator: this.#chance,
    };

    // check to make sure the clear needs execution.
    if (withClear)
    {
      // wipe out the existing data in the builder.
      this.#clear();
    }

    // return the built drop item.
    return dropItem as RPG_DropItem;
  }

  /**
   * Clears all data currently in the builder.
   */
  #clear()
  {
    this.setId(0);
    this.setType(0);
    this.setChance(0);
  }

  //region builders
  /**
   * Sets the id aka `dataId` of this {@link RPG_DropItem}.<br>
   * @param {number} id The database id of the item.
   * @returns {DropItemBuilder} This builder for fluent-chaining.
   */
  setId(id: number): this
  {
    this.#id = id;
    return this;
  }

  /**
   * Sets the typeId aka `kind` of this {@link RPG_DropItem}.<br>
   * @param {number} typeId The typeId of this loot.
   * @returns {DropItemBuilder} This builder for fluent-chaining.
   */
  setType(typeId: number): this
  {
    this.#type = typeId;
    return this;
  }

  /**
   * Sets the chance aka `denominator` for this {@link RPG_DropItem} to drop.
   * @param {number} percentChance The chance for this loot to drop.
   * @returns {DropItemBuilder} This builder for fluent-chaining.
   */
  setChance(percentChance: number): this
  {
    this.#chance = percentChance;
    return this;
  }

  /**
   * Builds a item drop based on the given parameters.
   * @param {number} databaseId The id in the database of this item.
   * @param {number} percentChance The chance that this loot should drop.
   * @return {RPG_DropItem} A item-based loot drop with the given parameters.
   */
  itemLoot(databaseId: number, percentChance: number): RPG_DropItem
  {
    this.setType(RPG_DropHelper.Types.Item);
    this.setId(databaseId);
    this.setChance(percentChance);
    return this.build();
  }

  /**
   * Builds a weapon drop based on the given parameters.
   * @param {number} databaseId The id in the database of this weapon.
   * @param {number} percentChance The chance that this loot should drop.
   * @return {RPG_DropItem} A weapon-based loot drop with the given parameters.
   */
  weaponLoot(databaseId: number, percentChance: number): RPG_DropItem
  {
    this.setType(RPG_DropHelper.Types.Weapon);
    this.setId(databaseId);
    this.setChance(percentChance);
    return this.build();
  }

  /**
   * Builds a armor drop based on the given parameters.
   * @param {number} databaseId The id in the database of this armor.
   * @param {number} percentChance The chance that this loot should drop.
   * @return {RPG_DropItem} A armor-based loot drop with the given parameters.
   */
  armorLoot(databaseId: number, percentChance: number): RPG_DropItem
  {
    this.setType(RPG_DropHelper.Types.Armor);
    this.setId(databaseId);
    this.setChance(percentChance);
    return this.build();
  }

  //endregion builders
}