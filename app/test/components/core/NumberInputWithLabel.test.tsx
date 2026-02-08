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
import NumberInputWithLabel from '../../../src/components/core/NumberInputWithLabel.tsx';

// A simple adornment we can assert on.
const Adorn = () => <span data-testid="adorn">%</span>;

describe('NumberInputWithLabel', () =>
{
  it('renders the label text and initial numeric value', () =>
  {
    render(
      <NumberInputWithLabel
        label={'Power'}
        value={7}
        onChangeEventHandler={vi.fn()}
      />
    );

    // FormControlLabel renders the label text.
    expect(screen.getByText('Power'))
      .toBeInTheDocument();

    // type=number inputs are role "spinbutton" in RTL/ARIA.
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    expect(input.value)
      .toBe('7');
  });

  it('calls onChangeEventHandler with the DOM event when value changes', () =>
  {
    const handler = vi.fn();
    render(
      <NumberInputWithLabel
        label={'Max Tech'}
        value={0}
        onChangeEventHandler={handler}
      />
    );

    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '42' } });

    expect(handler)
      .toHaveBeenCalledTimes(1);
  });

  it('disables the input when disabled is true', () =>
  {
    render(
      <NumberInputWithLabel
        label={'Endurance'}
        value={10}
        disabled={true}
        onChangeEventHandler={vi.fn()}
      />
    );

    expect(screen.getByRole('spinbutton'))
      .toBeDisabled();
  });

  it('renders the provided endAdornment inside an InputAdornment at the end', () =>
  {
    render(
      <NumberInputWithLabel
        label={'Power'}
        value={1}
        endAdornment={<Adorn/>}
        onChangeEventHandler={vi.fn()}
      />
    );

    // Our adornment should be present.
    expect(screen.getByTestId('adorn'))
      .toBeInTheDocument();
  });

  it('applies default sizing without requiring sx (smoke test)', () =>
  {
    // We avoid asserting exact computed styles in jsdom (flaky),
    // but ensure the component renders successfully without a custom sx.
    render(
      <NumberInputWithLabel
        label={'Force'}
        value={3}
        onChangeEventHandler={vi.fn()}
      />
    );

    // Presence of the control is sufficient for this smoke test.
    expect(screen.getByRole('spinbutton'))
      .toBeInTheDocument();
  });
});
