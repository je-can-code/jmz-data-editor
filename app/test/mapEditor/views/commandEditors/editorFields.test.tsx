/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { NumberField } from '../../../../src/mapEditor/views/commandEditors/editorFields.tsx';
import { TYPING_PAUSE_MS } from '../../../../src/mapEditor/views/commandEditors/TypingBurst.ts';

/*
 * The number input lets the author type freely and brings a typed number back inside its bounds when they leave
 * it. A number typed lands as one step, once the typing pauses or the author leaves, never one per digit: every
 * number handed on is a step in the event's history, and undo should take back what was typed, not its last digit.
 * It owes the command one more thing: a stored number is never changed just because the author passed through the
 * input. Real data holds numbers outside the bounds the editor offers, and tabbing across one must not rewrite it.
 */
describe('NumberField', () =>
{
  /**
   * Renders the input over a value that stays as stored, as a command does until history answers.
   * @param {number} value The stored value.
   * @returns {{ onChange: ReturnType<typeof vi.fn>, input: HTMLElement }} What the input handed on, and the input.
   */
  const renderField = (value: number) =>
  {
    const onChange = vi.fn();
    render(<NumberField label={'Opacity'} value={value} min={0} max={255} onChange={onChange}/>);
    return { onChange, input: screen.getByLabelText('Opacity') };
  };

  it('leaves a stored number outside its bounds alone when the author only passes through', () =>
  {
    // Arrange.
    const { onChange, input } = renderField(300);

    // Act.
    fireEvent.focus(input);
    fireEvent.blur(input);

    // Assert.
    expect([ onChange.mock.calls.length, (input as HTMLInputElement).value ])
      .toStrictEqual([ 0, '300' ]);
  });

  it('brings a typed number outside its bounds inside them on leaving, and not before', () =>
  {
    // Arrange.
    const { onChange, input } = renderField(128);

    // Act.
    fireEvent.change(input, { target: { value: '400' } });
    const whileTyping = onChange.mock.calls.length;
    fireEvent.blur(input);

    // Assert.
    expect([ whileTyping, onChange.mock.calls ])
      .toStrictEqual([ 0, [ [ 255 ] ] ]);
  });

  it('hands on a number typed inside its bounds once, when the typing pauses, rather than once per digit', () =>
  {
    // Arrange: typing 120 a digit at a time, the clock held still between keys.
    vi.useFakeTimers();
    const { onChange, input } = renderField(128);

    // Act.
    fireEvent.change(input, { target: { value: '1' } });
    fireEvent.change(input, { target: { value: '12' } });
    fireEvent.change(input, { target: { value: '120' } });
    const whileTyping = onChange.mock.calls.length;
    act(() => vi.advanceTimersByTime(TYPING_PAUSE_MS));
    vi.useRealTimers();

    // Assert.
    expect([ whileTyping, onChange.mock.calls ])
      .toStrictEqual([ 0, [ [ 120 ] ] ]);
  });

  it('forgets a number typed once the text stops being one, and puts back the stored value on leaving', () =>
  {
    // Arrange.
    vi.useFakeTimers();
    const { onChange, input } = renderField(128);

    // Act: 64 is typed, then turned into text before the typing pauses; the pause then passes.
    fireEvent.change(input, { target: { value: '64' } });
    fireEvent.change(input, { target: { value: 'lots' } });
    act(() => vi.advanceTimersByTime(TYPING_PAUSE_MS));
    fireEvent.blur(input);
    vi.useRealTimers();

    // Assert: nothing went out, and the input shows the stored value again.
    expect([ onChange.mock.calls, (input as HTMLInputElement).value ])
      .toStrictEqual([ [], '128' ]);
  });

  it('hands on a number typed at once when the author leaves, and only once', () =>
  {
    // Arrange.
    vi.useFakeTimers();
    const { onChange, input } = renderField(128);

    // Act: 64 is typed and left before the typing pauses; the pause then passes too.
    fireEvent.change(input, { target: { value: '64' } });
    fireEvent.blur(input);
    act(() => vi.advanceTimersByTime(TYPING_PAUSE_MS));
    vi.useRealTimers();

    // Assert.
    expect(onChange.mock.calls)
      .toStrictEqual([ [ 64 ] ]);
  });
});
