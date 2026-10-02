/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { NumberField } from '../../../../src/mapEditor/views/commandEditors/editorFields.tsx';

/*
 * The number input lets the author type freely and brings a typed number back inside its bounds when they leave
 * it. It owes the command one more thing: a stored number is never changed just because the author passed
 * through the input. Real data holds numbers outside the bounds the editor offers, and tabbing across one must
 * not rewrite it.
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

  it('hands on a typed number inside its bounds as it is typed, and puts back text that is no number', () =>
  {
    // Arrange.
    const { onChange, input } = renderField(128);

    // Act.
    fireEvent.change(input, { target: { value: '64' } });
    fireEvent.change(input, { target: { value: 'lots' } });
    fireEvent.blur(input);

    // Assert: the typed 64 went out; the text did not, and the input shows the stored value again.
    expect([ onChange.mock.calls, (input as HTMLInputElement).value ])
      .toStrictEqual([ [ [ 64 ] ], '128' ]);
  });
});
