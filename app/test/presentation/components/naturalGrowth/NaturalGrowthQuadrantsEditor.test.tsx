/**
 * @vitest-environment jsdom
 */

import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { NaturalGrowthQuadrant } from '@core/domain/valueObjects/NaturalQuadFormulas.ts';
import { NaturalGrowthQuadrantsEditor } from '@presentation/components/naturalGrowth/NaturalGrowthQuadrantsEditor.tsx';

/**
 * The growth editor is where an author types the formulas that scale an enemy, a class or a state with level, and
 * it owes them fields that behave like fields: every keystroke shows exactly as typed, spaces included, wherever it
 * lands. Behind the fields, the note it hands the board stays tidy, with each formula trimmed, and a formula the
 * game could not read is kept out of the note and flagged on its field rather than wiped from it. A formula that
 * changes from anywhere but its field, such as the graph, replaces what the field shows, and nothing typed is ever
 * left showing once the board selects another enemy, class or state, or pastes or copies a set of growths over it.
 */
describe('NaturalGrowthQuadrantsEditor', () =>
{
  /**
   * Renders the editor on a stand-in board that keeps the selected enemy and its note in state, and takes every
   * change the way the boards do, so a keystroke and the redraw it causes land together. Its buttons stand in for
   * the ways a note changes other than by typing: a formula rewritten under the same enemy, as the graph's Apply
   * does, selecting another enemy, and replacing the whole note, as a paste or the enemies dialog's Copy From does.
   * @param {string} startingNote The note the board starts with.
   * @param {string} otherNote The note each button puts in place of the current one.
   * @returns The board's record of every note the editor handed it, in order.
   */
  const renderOnBoard = (startingNote: string, otherNote: string = '') =>
  {
    const onNoteChange = vi.fn<(note: string) => void>();

    const StandInBoard = () =>
    {
      const [ subject, setSubject ] = useState({ id: 1, revision: 0, note: startingNote });

      return (
        <>
          <button onClick={() => setSubject({ ...subject, note: otherNote })}>Edit Elsewhere</button>
          <button onClick={() => setSubject({ ...subject, id: subject.id + 1, note: otherNote })}>Next Enemy</button>
          <button onClick={() => setSubject({ ...subject, revision: subject.revision + 1, note: otherNote })}>
            Paste
          </button>
          <NaturalGrowthQuadrantsEditor
            note={subject.note}
            onNoteChange={(next) =>
            {
              onNoteChange(next);
              setSubject((current) => ({ ...current, note: next }));
            }}
            subjectId={subject.id}
            revision={subject.revision}
            visibleQuadrants={[ NaturalGrowthQuadrant.BuffPlus ]}
          />
        </>
      );
    };

    render(<StandInBoard/>);
    return onNoteChange;
  };

  /**
   * The newest note the editor handed the board.
   * @param {ReturnType<typeof renderOnBoard>} onNoteChange The board's record of every note it was handed.
   * @returns {string} The last of them.
   */
  const latestNote = (onNoteChange: ReturnType<typeof renderOnBoard>): string =>
  {
    // the record's last call carries the note as its only argument.
    const [ note ] = onNoteChange.mock.lastCall!;
    return note;
  };

  it('shows every space as it is typed, and hands the board the formula with them', async () =>
  {
    // Arrange- an enemy with no attack growth yet.
    const user = userEvent.setup();
    const onNoteChange = renderOnBoard('<level:15>');

    // Act- type a whole formula, one key at a time.
    await user.type(screen.getByLabelText('Power'), '(a.level * 1.75)');

    // Assert
    expect(screen.getByLabelText('Power'))
      .toHaveValue('(a.level * 1.75)');
    expect(latestNote(onNoteChange))
      .toBe('<level:15>\n<atkBuffPlus:[(a.level * 1.75)]>');
  });

  it('keeps a space left at the end on screen, while the note keeps the formula without it', async () =>
  {
    // Arrange- an attack growth typed up to its operator.
    const user = userEvent.setup();
    const onNoteChange = renderOnBoard('<level:15>');
    await user.type(screen.getByLabelText('Power'), 'a.level *');

    // Act- take the operator back off, which leaves a space at the end and changes the note.
    await user.type(screen.getByLabelText('Power'), '{Backspace}');

    // Assert
    expect(screen.getByLabelText('Power'))
      .toHaveValue('a.level ');
    expect(latestNote(onNoteChange))
      .toBe('<level:15>\n<atkBuffPlus:[a.level]>');
  });

  it('keeps a formula the game could not read on its field, flagged, and out of the note', async () =>
  {
    // Arrange- an enemy with attack and defense growth.
    const user = userEvent.setup();
    const onNoteChange = renderOnBoard('<atkBuffPlus:[a.level]>\n<defBuffPlus:[a.level * 2]>');

    // Act- type a comma onto the attack formula.
    await user.type(screen.getByLabelText('Power'), ', 2');

    // Assert- the field keeps what was typed and says it can't be saved, and the note drops attack alone.
    expect(screen.getByLabelText('Power'))
      .toHaveValue('a.level, 2');
    expect(screen.getByLabelText('Power'))
      .toBeInvalid();
    expect(screen.getByText(/can't be saved/i))
      .toBeInTheDocument();
    expect(latestNote(onNoteChange))
      .toBe('<defBuffPlus:[a.level * 2]>');
  });

  it('shows a formula that arrives from elsewhere, such as the graph, in place of what was typed', async () =>
  {
    // Arrange- an attack growth typed and left with a space at the end, and the same enemy's note with its attack
    // growth rewritten elsewhere.
    const user = userEvent.setup();
    renderOnBoard('<level:15>', '<atkBuffPlus:[a.level * 9]>');
    await user.type(screen.getByLabelText('Power'), 'a.level * 3 ');

    // Act
    await user.click(screen.getByRole('button', { name: 'Edit Elsewhere' }));

    // Assert
    expect(screen.getByLabelText('Power'))
      .toHaveValue('a.level * 9');
  });

  it('starts every field over when the board selects another enemy', async () =>
  {
    // Arrange- a formula the game could not read, typed for the first enemy, and a next enemy with no attack growth
    // either, so its note alone gives the field no reason to change.
    const user = userEvent.setup();
    renderOnBoard('<level:15>', '<level:20>');
    await user.type(screen.getByLabelText('Power'), 'a.level, 2');
    const typedBeforeSwitching = screen.getByLabelText<HTMLInputElement>('Power').value;

    // Act
    await user.click(screen.getByRole('button', { name: 'Next Enemy' }));

    // Assert- the formula was really showing for the first enemy, and is gone for the next.
    expect(typedBeforeSwitching)
      .toBe('a.level, 2');
    expect(screen.getByLabelText('Power'))
      .toHaveValue('');
  });

  it('starts every field over when the board pastes or copies a set of growths over the same enemy', async () =>
  {
    // Arrange- the same unreadable formula, and a pasted or copied set of growths with no attack growth either.
    const user = userEvent.setup();
    renderOnBoard('<level:15>', '<level:20>');
    await user.type(screen.getByLabelText('Power'), 'a.level, 2');
    const typedBeforePasting = screen.getByLabelText<HTMLInputElement>('Power').value;

    // Act
    await user.click(screen.getByRole('button', { name: 'Paste' }));

    // Assert- the formula was really showing before the paste, and is gone after it.
    expect(typedBeforePasting)
      .toBe('a.level, 2');
    expect(screen.getByLabelText('Power'))
      .toHaveValue('');
  });
});
