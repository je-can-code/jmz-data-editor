/**
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import EnemiesExtraDrops from '@presentation/boards/enemies/EnemiesExtraDrops.tsx';
import { RPG_EnemyDomainModel } from '@core/domain/entities/RPG_EnemyDomainModel.ts';
import { MuiSnackbarSeverity } from '@core/enums/MuiSnackbar.ts';
import RPG_Enemy = Rmmz.Implementations.RPG_Enemy;

// the drops list names each drop from the item table; weapons and armors play no part here.
vi.mock('@presentation/context/resources/items.context.tsx', () => (
  {
    useItems: () => (
      {
        data: [ { id: 5, name: 'Potion' }, { id: 6, name: 'Ether' } ],
        loading: false,
      }
    ),
  }
));

vi.mock('@presentation/context/resources/weapons.context.tsx', () => (
  {
    useWeapons: () => (
      {
        data: [],
        loading: false,
      }
    ),
  }
));

vi.mock('@presentation/context/resources/armors.context.tsx', () => (
  {
    useArmors: () => (
      {
        data: [],
        loading: false,
      }
    ),
  }
));

/**
 * The Extra Drops card remembers the drop last picked out of its list, and Clone copies that drop into the
 * enemy's list. It owes the Enemies board one thing: the remembered drop always belongs to the enemy on
 * screen. Moving to another enemy forgets it, and so does a paste, which replaces the whole enemy while
 * keeping its id- otherwise Clone would quietly copy the old enemy's drop into the pasted one, an edit the
 * author never made and would have no reason to look for.
 */
describe('EnemiesExtraDrops', () =>
{
  /**
   * Builds an enemy the way the board holds one, carrying a single extra drop of the given item.
   * @param {number} id The enemy's id.
   * @param {number} itemId The item it drops.
   * @returns {RPG_EnemyDomainModel} The enemy.
   */
  const enemyDropping = (id: number, itemId: number): RPG_EnemyDomainModel => new RPG_EnemyDomainModel({
    id,
    name: `Enemy ${id}`,
    exp: 0,
    gold: 0,
    params: [ 100, 0, 10, 10, 10, 10, 10, 10 ],
    traits: [],
    note: `<drops:[i,${itemId},25]>`,
    actions: [],
    battlerHue: 0,
    battlerName: '',
    dropItems: [],
  } as unknown as RPG_Enemy);

  /**
   * Opens the drops list's menu and picks Clone above.
   * @param {string} rowText The text of a row in the list, where the menu is opened.
   */
  const cloneAbove = (rowText: string) =>
  {
    fireEvent.contextMenu(screen.getByText(rowText));
    fireEvent.click(screen.getByText('Clone above'));
  };

  it('forgets the picked drop when the enemy is pasted over, so Clone has nothing of the old enemy\'s to copy', () =>
  {
    // Arrange- the Potion drop picked on enemy 7, then another enemy pasted over 7, dropping Ether instead.
    const updateEnemy = vi.fn();
    const handleSnack = vi.fn();
    const { rerender } = render(
      <EnemiesExtraDrops selectedEnemy={enemyDropping(7, 5)} revision={0} updateEnemy={updateEnemy} handleSnack={handleSnack}/>
    );
    fireEvent.click(screen.getByText('5: Potion'));
    rerender(
      <EnemiesExtraDrops selectedEnemy={enemyDropping(7, 6)} revision={1} updateEnemy={updateEnemy} handleSnack={handleSnack}/>
    );

    // Act
    cloneAbove('6: Ether');

    // Assert- nothing copied in, and the author is asked to pick a drop first.
    expect(updateEnemy)
      .not.toHaveBeenCalled();
    expect(handleSnack)
      .toHaveBeenCalledWith('Must select a drop to clone.', MuiSnackbarSeverity.Error);
  });

  it('keeps the picked drop while the enemy is only drawn again, so Clone copies it', () =>
  {
    // Arrange- the Potion drop picked on enemy 7, and the board drawing the same enemy again after an edit.
    const updateEnemy = vi.fn();
    const handleSnack = vi.fn();
    const enemy = enemyDropping(7, 5);
    const { rerender } = render(
      <EnemiesExtraDrops selectedEnemy={enemy} revision={0} updateEnemy={updateEnemy} handleSnack={handleSnack}/>
    );
    fireEvent.click(screen.getByText('5: Potion'));
    rerender(
      <EnemiesExtraDrops selectedEnemy={enemy} revision={0} updateEnemy={updateEnemy} handleSnack={handleSnack}/>
    );

    // Act
    cloneAbove('5: Potion');

    // Assert- a second Potion drop, copied from the one picked.
    const [ [ cloned ] ] = updateEnemy.mock.calls;
    expect(cloned.extraDrops.map((drop: { dataId: number; denominator: number }) => [ drop.dataId, drop.denominator ]))
      .toEqual([ [ 5, 25 ], [ 5, 25 ] ]);
  });
});
