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
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import SaveButton from '../../../src/components/core/SaveButton.tsx';

describe('SaveButton', () =>
{
  it('renders with \'Save\' text by default', () =>
  {
    render(
      <SaveButton
        handleSave={vi.fn()}
        canSave={true}
      />
    );

    expect(screen.getByText('Save'))
      .toBeInTheDocument();
  });

  it('appends extraSaveText when provided', () =>
  {
    render(
      <SaveButton
        handleSave={vi.fn()}
        canSave={true}
        extraSaveText="Enemies"
      />
    );

    expect(screen.getByText('Save Enemies'))
      .toBeInTheDocument();
  });

  it('is disabled when canSave is false', () =>
  {
    render(
      <SaveButton
        handleSave={vi.fn()}
        canSave={false}
      />
    );

    const button = screen.getByRole('button');
    expect(button)
      .toBeDisabled();
  });

  it('shows loading state and is disabled when isSaving is true', () =>
  {
    render(
      <SaveButton
        handleSave={vi.fn()}
        canSave={true}
        isSaving={true}
      />
    );

    const button = screen.getByRole('button');

    // 1. Verify the button is disabled while saving.
    expect(button)
      .toBeDisabled();

    // 2. Verify MUI's loading state is active.
    // MUI Lab/Material buttons use this class when loading is true.
    expect(button)
      .toHaveClass('MuiButton-loading');

    // 3. Verify the loading indicator (spinner) is present in the document.
    const loader = screen.getByRole('progressbar', { hidden: true });
    expect(loader)
      .toBeInTheDocument();
  });

  it('calls handleSave when clicked', () =>
  {
    const handleSave = vi.fn();
    render(
      <SaveButton
        handleSave={handleSave}
        canSave={true}
      />
    );

    fireEvent.click(screen.getByRole('button'));
    expect(handleSave)
      .toHaveBeenCalledTimes(1);
  });
});
