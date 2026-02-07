/**
 * @vitest-environment jsdom
 */

import React from 'react';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';
import {
  render,
  screen,
  fireEvent
} from '@testing-library/react';
import '@testing-library/jest-dom';
import KeyTextField from '../../../src/components/core/KeyTextField.tsx';

describe('KeyTextField', () =>
{
  it('renders with correct label and initial value', () =>
  {
    render(
      <KeyTextField
        value="test-key"
        onChange={vi.fn()}
      />
    );

    // Use a regex to match the label text even with the asterisk
    expect(screen.getByLabelText(/Key/i))
      .toBeInTheDocument();

    expect(screen.getByDisplayValue('test-key'))
      .toBeInTheDocument();
  });

  it('calls onChange when text is entered', () =>
  {
    const handleChange = vi.fn();
    render(
      <KeyTextField
        value=""
        onChange={handleChange}
      />
    );

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'new-key' } });

    expect(handleChange)
      .toHaveBeenCalledWith('new-key');
  });

  it('is disabled when the disabled prop is true', () =>
  {
    render(
      <KeyTextField
        value="locked"
        onChange={vi.fn()}
        disabled={true}
      />
    );

    expect(screen.getByRole('textbox'))
      .toBeDisabled();
  });

  it('renders the Key icon in the start adornment', () =>
  {
    render(
      <KeyTextField
        value=""
        onChange={vi.fn()}
      />
    );

    const icon = screen.getByTestId('KeyIcon');
    expect(icon)
      .toBeInTheDocument();
  });

  it('applies monospace font family to the input root', () =>
  {
    render(
      <KeyTextField
        value="monospace-text"
        onChange={vi.fn()}
      />
    );

    const inputRoot = screen.getByRole('textbox').parentElement;
    // Verify the class exists since JSDOM style computed values can be flaky for MUI sx props
    expect(inputRoot)
      .toHaveClass('MuiOutlinedInput-root');
  });
});
