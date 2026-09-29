/**
 * @vitest-environment jsdom
 */

import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ClassParamsGrowthEditor } from '@presentation/components/classParams/ClassParamsGrowthEditor.tsx';
import type { ClassGrowth } from '@services/classes/ClassGrowthCloner.ts';

// a row with baked levels draws a chart that sizes itself with a ResizeObserver, which jsdom does not have,
// and nothing here measures the chart.
globalThis.ResizeObserver = class
{
  observe()
  {
  }

  unobserve()
  {
  }

  disconnect()
  {
  }
};

// the editor reads the project's level cap only to preview growth beyond it, which nothing here needs.
vi.mock('@presentation/context/resources/level.context.tsx', () => (
  {
    useLevelConfig: () => (
      {
        levelConfig: null,
      }
    ),
  }
));

/**
 * The Parameter Growth card stays mounted while the author moves from class to class on the Classes board,
 * and it owes the board two things. Every input shows the growth the class actually has: typed formulas are
 * held until they are applied, so any that outlived a change of class, or a clone from another class, would
 * sit over the wrong curve waiting for one press of Apply to write them there. And every change reaches the
 * board whole: one Apply, one Apply all or one Clone is one change, carrying every formula it applies and the
 * levels baked from them, with nothing it was not asked to touch moved.
 */
describe('ClassParamsGrowthEditor', () =>
{
  /**
   * Some Guy, the class the others are cloned from.
   */
  const someGuy = {
    id: 1,
    name: 'Some Guy',
    note: '<atkGrowthCurve:[(12+3*(a.level-1))*1]>',
    params: [],
  };

  /**
   * Builds the editor's props for a class whose only saved formula is its attack curve, and which has no
   * baked values yet, so every row draws its "nothing saved" line rather than a chart.
   * @param {number} classId The id of the class.
   * @param {string} attackFormula The attack formula saved on the class's note.
   * @returns The editor's props.
   */
  const propsFor = (classId: number, attackFormula: string) => (
    {
      classId,
      growth: {
        note: `<atkGrowthCurve:[${attackFormula}]>`,
        params: [],
      } as ClassGrowth,
      cloneSources: [ someGuy ],
      onGrowthChange: vi.fn(),
    }
  );

  /**
   * Renders the editor on a stand-in board that holds the class's growth in state and takes every change the
   * way the real board does, so a change and the redraw it causes land together.
   * @param {ReturnType<typeof propsFor>} props The editor's props; its growth is where the board starts.
   */
  const renderOnBoard = (props: ReturnType<typeof propsFor>) =>
  {
    const StandInBoard = () =>
    {
      const [ growth, setGrowth ] = useState(props.growth);

      return (
        <ClassParamsGrowthEditor
          {...props}
          growth={growth}
          onGrowthChange={(next) =>
          {
            props.onGrowthChange(next);
            setGrowth(next);
          }}
        />
      );
    };

    render(<StandInBoard/>);
  };

  /**
   * Opens the card, which starts collapsed, so its rows can be reached the way an author reaches them.
   */
  const openCard = () => fireEvent.click(screen.getByText('Parameter Growth'));

  describe('switching classes', () =>
  {
    it('shows the newly selected class\'s formulas, and none of the last class\'s', () =>
    {
      // Arrange- Fucking Oni's attack curve first.
      const { rerender } = render(<ClassParamsGrowthEditor {...propsFor(2, '(12+3*(a.level-1))*1.15')}/>);

      // Act- the board moves on to Melufa.
      rerender(<ClassParamsGrowthEditor {...propsFor(16, '(8+2.5*(a.level-1))*0.90')}/>);

      // Assert
      expect(screen.getByDisplayValue('(8+2.5*(a.level-1))*0.90'))
        .toBeInTheDocument();
      expect(screen.queryByDisplayValue('(12+3*(a.level-1))*1.15'))
        .not.toBeInTheDocument();
    });

    it('clears a checkmark applied on the last class', () =>
    {
      // Arrange- apply Fucking Oni's attack formula, the only row with anything to apply.
      const { rerender } = render(<ClassParamsGrowthEditor {...propsFor(2, '(12+3*(a.level-1))*1.15')}/>);
      openCard();
      const [ attackApply ] = screen.getAllByRole('button', { name: /^apply$/i })
        .filter((button) => button.hasAttribute('disabled') === false);
      fireEvent.click(attackApply);
      const checkedBeforeSwitching = screen.queryByTestId('CheckIcon') !== null;

      // Act- the board moves on to Melufa.
      rerender(<ClassParamsGrowthEditor {...propsFor(16, '(8+2.5*(a.level-1))*0.90')}/>);

      // Assert- the checkmark was really there for Oni, and is gone for Melufa.
      expect(checkedBeforeSwitching)
        .toBe(true);
      expect(screen.queryByTestId('CheckIcon'))
        .not.toBeInTheDocument();
    });
  });

  describe('cloning', () =>
  {
    it('hands the board the chosen class\'s growth, then shows the cloned formulas in every row', () =>
    {
      // Arrange- Melufa, about to take Some Guy's growth; open the card and choose Some Guy.
      const props = propsFor(16, '(8+2.5*(a.level-1))*0.90');
      renderOnBoard(props);
      openCard();
      fireEvent.change(screen.getByLabelText('Clone growth from'), { target: { value: 'Some' } });
      fireEvent.click(screen.getByRole('option', { name: '1: Some Guy' }));

      // Act
      fireEvent.click(screen.getByRole('button', { name: /clone/i }));

      // Assert- the board got Some Guy's growth, and the attack row reads it rather than Melufa's old one.
      expect(props.onGrowthChange)
        .toHaveBeenCalledWith({ note: '<atkGrowthCurve:[(12+3*(a.level-1))*1]>', params: [] });
      expect(screen.getByDisplayValue('(12+3*(a.level-1))*1'))
        .toBeInTheDocument();
      expect(screen.queryByDisplayValue('(8+2.5*(a.level-1))*0.90'))
        .not.toBeInTheDocument();
    });

    it('never offers to clone a class onto itself', () =>
    {
      // Arrange- Some Guy looking at itself in the picker.
      render(<ClassParamsGrowthEditor {...propsFor(1, '(12+3*(a.level-1))*1')}/>);
      openCard();

      // Act
      fireEvent.change(screen.getByLabelText('Clone growth from'), { target: { value: 'Some' } });
      fireEvent.click(screen.getByRole('option', { name: '1: Some Guy' }));

      // Assert
      expect(screen.getByRole('button', { name: /clone/i }))
        .toBeDisabled();
    });
  });

  describe('applying every edited row', () =>
  {
    it('offers Apply all only once a row holds something new', () =>
    {
      // Arrange
      render(<ClassParamsGrowthEditor {...propsFor(2, '(12+3*(a.level-1))*1.15')}/>);
      openCard();
      const disabledBeforeEditing = screen.getByRole('button', { name: /apply all/i })
        .hasAttribute('disabled');

      // Act- a new attack formula.
      fireEvent.change(screen.getByLabelText('Power'), { target: { value: '(12+3*(a.level-1))*1.25' } });

      // Assert- nothing to apply at first, then the one edited row.
      expect(disabledBeforeEditing)
        .toBe(true);
      expect(screen.getByRole('button', { name: 'Apply all (1)' }))
        .toBeEnabled();
    });

    it('applies every edited row as one change, leaving the rows that were not edited alone', () =>
    {
      // Arrange- a class with Max Life, attack and defense saved; retype attack and defense only.
      const props = {
        ...propsFor(2, '(12+3*(a.level-1))*1.15'),
        growth: {
          note: [
            '<mhpGrowthCurve:[(220+40*(a.level-1))*1]>',
            '<atkGrowthCurve:[(12+3*(a.level-1))*1.15]>',
            '<defGrowthCurve:[(10+3*(a.level-1))*1.05]>',
          ].join('\n'),
          params: [ [ 0, 220 ], [ 0, 140 ], [ 0, 14 ], [ 0, 11 ] ],
        },
      };
      renderOnBoard(props);
      openCard();
      fireEvent.change(screen.getByLabelText('Power'), { target: { value: '(12+3*(a.level-1))*1' } });
      fireEvent.change(screen.getByLabelText('Endurance'), { target: { value: '(10+3*(a.level-1))*1' } });

      // Act
      fireEvent.click(screen.getByRole('button', { name: 'Apply all (2)' }));

      // Assert- one change carrying both formulas and their levels, with Max Life's untouched, and both rows
      // checked off.
      expect(props.onGrowthChange)
        .toHaveBeenCalledTimes(1);
      const [ [ applied ] ] = props.onGrowthChange.mock.calls;
      expect(applied.note)
        .toContain('<atkGrowthCurve:[(12+3*(a.level-1))*1]>');
      expect(applied.note)
        .toContain('<defGrowthCurve:[(10+3*(a.level-1))*1]>');
      expect(applied.note)
        .toContain('<mhpGrowthCurve:[(220+40*(a.level-1))*1]>');
      expect(applied.params[ 2 ][ 99 ])
        .toBe(306);
      expect(applied.params[ 3 ][ 99 ])
        .toBe(304);
      expect(applied.params[ 0 ])
        .toEqual([ 0, 220 ]);
      expect(screen.getAllByTestId('CheckIcon'))
        .toHaveLength(2);
    });
  });
});
