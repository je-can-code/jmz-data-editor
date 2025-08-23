import {
  describe,
  expect,
  it
} from "vitest";
import DropItemBuilder from "../../../src/services/utils/DropItemBuilder.ts";
import RPG_DropHelper from "../../../src/services/utils/DropHelper.ts";

describe('DropItemBuilder', () =>
{
  it('fluent setters build a proper RPG_DropItem and clear by default', () =>
  {
    const b = new DropItemBuilder()
      .setType(RPG_DropHelper.Types.Item)
      .setId(5)
      .setChance(10);

    const first = b.build();

    expect(first)
      .toEqual({
        kind: 1,
        dataId: 5,
        denominator: 10
      });

    // Because build() clears by default, a second build without setting anything
    // should yield zeros.
    const second = b.build();

    expect(second)
      .toEqual({
        kind: 0,
        dataId: 0,
        denominator: 0
      });
  });

  it('build(false) retains internal state for subsequent builds', () =>
  {
    const b = new DropItemBuilder()
      .setType(RPG_DropHelper.Types.Weapon)
      .setId(12)
      .setChance(3);

    const a = b.build(false);
    const c = b.build(false);

    expect(a)
      .toEqual({
        kind: 2,
        dataId: 12,
        denominator: 3
      });
    expect(c)
      .toEqual({
        kind: 2,
        dataId: 12,
        denominator: 3
      });

    // Now call default build() which clears afterwards; next build() zeros.
    const d = b.build();

    expect(d)
      .toEqual({
        kind: 2,
        dataId: 12,
        denominator: 3
      });

    const e = b.build();

    expect(e)
      .toEqual({
        kind: 0,
        dataId: 0,
        denominator: 0
      });
  });

  it('itemLoot/weaponLoot/armorLoot set type, id, chance and clear between calls', () =>
  {
    const b = new DropItemBuilder();

    const item = b.itemLoot(7, 25);
    expect(item)
      .toEqual({
        kind: RPG_DropHelper.Types.Item,
        dataId: 7,
        denominator: 25
      });

    const weap = b.weaponLoot(3, 5);
    expect(weap)
      .toEqual({
        kind: RPG_DropHelper.Types.Weapon,
        dataId: 3,
        denominator: 5
      });

    const armor = b.armorLoot(9, 50);
    expect(armor)
      .toEqual({
        kind: RPG_DropHelper.Types.Armor,
        dataId: 9,
        denominator: 50
      });

    // After three calls, builder should have been cleared after each build; if we build again now,
    // we should get zeros because there is no pending state.
    const cleared = b.build();
    expect(cleared)
      .toEqual({
        kind: 0,
        dataId: 0,
        denominator: 0
      });
  });

  it('building with default state produces zeros', () =>
  {
    const b = new DropItemBuilder();

    const result = b.build();

    expect(result)
      .toEqual({
        kind: 0,
        dataId: 0,
        denominator: 0
      });
  });
});