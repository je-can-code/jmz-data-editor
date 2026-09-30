import type { DatabaseRow } from '@services/rows/RowClipboard.ts';
import RPG_Item = Rmmz.Implementations.RPG_Item;
import RPG_Skill = Rmmz.Implementations.RPG_Skill;
import RPG_Enemy = Rmmz.Implementations.RPG_Enemy;
import RPG_State = Rmmz.Implementations.RPG_State;
import RPG_Armor = Rmmz.Implementations.RPG_Armor;
import RPG_Weapon = Rmmz.Implementations.RPG_Weapon;
import RPG_Class = Rmmz.Implementations.RPG_Class;

/**
 * The blank row each board's Clear resets a row to, keeping only the id it already had- exactly what RPG
 * Maker MZ's own database writes for a brand-new row of that table. Verified against real, never-edited
 * rows still sitting untouched in two independent projects (a fresh project straight from the editor's
 * own new-project template, and the long-running chef-adventure project), rather than typed from memory:
 * the two agreed on every field for every table but one, which is worth knowing about in the one case
 * they could not both check.
 *
 * {@link BLANK_CLASS_ROW} could not be verified this way- no project on hand, including the editor's own
 * template, has ever left a Class row blank, since RPG Maker MZ ships all ten of its sample classes filled
 * and nothing here has raised that table's maximum since. It is therefore the conservative reading- every
 * field at its type's own zero or empty value- rather than a verified shape; if MZ's database seeds
 * something more specific on a blank class, the way it seeds a placeholder trait on a blank weapon or
 * armor, this is the row to correct.
 */
const BLANK_ITEM_ROW: RPG_Item = {
  id: 0,
  name: '',
  note: '',
  description: '',
  iconIndex: 0,
  animationId: 0,
  damage: {
    type: 0,
    elementId: 0,
    formula: '0',
    variance: 20,
    critical: false,
  },
  effects: [],
  hitType: 0,
  occasion: 0,
  repeats: 1,
  scope: 7,
  speed: 0,
  successRate: 100,
  tpGain: 0,
  consumable: true,
  itypeId: 1,
  price: 0,
  kind: 1,
};

const BLANK_SKILL_ROW: RPG_Skill = {
  id: 0,
  name: '',
  note: '',
  description: '',
  iconIndex: 0,
  animationId: 0,
  damage: {
    type: 0,
    elementId: 0,
    formula: '0',
    variance: 20,
    critical: false,
  },
  effects: [],
  hitType: 0,
  message1: '',
  message2: '',
  messageType: 1,
  mpCost: 0,
  occasion: 0,
  repeats: 1,
  requiredWtypeId1: 0,
  requiredWtypeId2: 0,
  scope: 1,
  speed: 0,
  stypeId: 1,
  successRate: 100,
  tpCost: 0,
  tpGain: 0,
};

const BLANK_ENEMY_ROW: RPG_Enemy = {
  id: 0,
  name: '',
  note: '',
  battlerName: '',
  battlerHue: 0,
  traits: [],
  actions: [],
  dropItems: [],
  exp: 0,
  gold: 0,
  params: [ 0, 0, 0, 0, 0, 0, 0, 0 ],
};

const BLANK_STATE_ROW: RPG_State = {
  id: 0,
  name: '',
  note: '',
  description: '',
  iconIndex: 0,
  traits: [],
  autoRemovalTiming: 0,
  chanceByDamage: 100,
  minTurns: 1,
  maxTurns: 1,
  message1: '',
  message2: '',
  message3: '',
  message4: '',
  // a real blank State row also carries a "messageType": Rmmz.d.ts marks that field "not real" for
  // states- vestigial JSON this editor deliberately does not model- so it is left out here too.
  motion: 0,
  overlay: 0,
  priority: 50,
  restriction: 0,
  removeAtBattleEnd: false,
  removeByDamage: false,
  removeByRestriction: false,
  removeByWalking: false,
  stepsToRemove: 100,
};

const BLANK_ARMOR_ROW: RPG_Armor = {
  id: 0,
  name: '',
  note: '',
  description: '',
  iconIndex: 0,
  traits: [ { code: 22, dataId: 1, value: 0 } ],
  etypeId: 2,
  params: [ 0, 0, 0, 0, 0, 0, 0, 0 ],
  price: 0,
  atypeId: 0,
  kind: 3,
};

const BLANK_WEAPON_ROW: RPG_Weapon = {
  id: 0,
  name: '',
  note: '',
  description: '',
  iconIndex: 0,
  animationId: 0,
  etypeId: 1,
  traits: [
    { code: 31, dataId: 1, value: 0 },
    { code: 22, dataId: 0, value: 0 },
  ],
  params: [ 0, 0, 0, 0, 0, 0, 0, 0 ],
  price: 0,
  wtypeId: 0,
  kind: 2,
};

const BLANK_CLASS_ROW: RPG_Class = {
  id: 0,
  name: '',
  note: '',
  description: '',
  iconIndex: 0,
  // vestigial vanilla exp-curve inputs- this editor's own level curve lives in params below instead, so
  // an unused, neutral curve is as good a blank as any verified one would be.
  expParams: [ 0, 0, 0, 0 ],
  traits: [],
  learnings: [],
  params: [
    new Array(100).fill(0),
    new Array(100).fill(0),
    new Array(100).fill(0),
    new Array(100).fill(0),
    new Array(100).fill(0),
    new Array(100).fill(0),
    new Array(100).fill(0),
    new Array(100).fill(0),
  ],
};

/**
 * Whole-row Clear for the database boards, the way RPG Maker MZ's own database does it: every field of the
 * selected row, or the whole run a Shift-click selected, resets to that table's blank row above, while the
 * row's own id survives- because the id is its place in its table and everything else in the project points
 * at it by that id. Every row outside the cleared run is handed back exactly as it was.
 */
class RowClear
{
  /**
   * Resets a run of rows to a table's blank row, keeping each row's own id.
   * @param {TModel[]} list The board's rows as they stand right now.
   * @param {number[]} indices The index of every row to clear.
   * @param {TRow} blankRow The table's blank row, exactly as RPG Maker MZ's database writes one, apart from id.
   * @param {(row: TRow) => TModel} fromRow Builds a board row out of a row as the table writes it to disk.
   * @returns {TModel[]} A new list holding the cleared rows, and every other row exactly as it was.
   */
  static apply<TModel extends DatabaseRow, TRow extends DatabaseRow>(
    list: TModel[],
    indices: number[],
    blankRow: TRow,
    fromRow: (row: TRow) => TModel,
  ): TModel[]
  {
    const cleared = new Set(indices);

    return list.map((entry, index) =>
    {
      // leave every row outside the cleared run exactly as it was.
      if (cleared.has(index) === false)
      {
        return entry;
      }

      // take the table's blank row, but keep this row's own id.
      const blanked = {
        ...blankRow,
        id: entry.id,
      } as TRow;

      return fromRow(blanked);
    });
  }
}

export {
  RowClear,
  BLANK_ITEM_ROW,
  BLANK_SKILL_ROW,
  BLANK_ENEMY_ROW,
  BLANK_STATE_ROW,
  BLANK_ARMOR_ROW,
  BLANK_WEAPON_ROW,
  BLANK_CLASS_ROW,
};
