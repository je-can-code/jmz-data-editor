/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ReloadButton from '@components/core/ReloadButton.tsx';

describe('ReloadButton', () =>
{
  it('renders with default \'Reload\' text', () =>
  {
    render(
      <ReloadButton
        handleReload={vi.fn()}
        canReload={true}
      />
    );

    expect(screen.getByText('Reload'))
      .toBeInTheDocument();
  });

  it('appends extraReloadText when provided', () =>
  {
    render(
      <ReloadButton
        handleReload={vi.fn()}
        canReload={true}
        extraReloadText="Enemies"
      />
    );

    expect(screen.getByText('Reload Enemies'))
      .toBeInTheDocument();
  });

  it('triggers handleReload on click', () =>
  {
    const handleReload = vi.fn();
    render(
      <ReloadButton
        handleReload={handleReload}
        canReload={true}
      />
    );

    fireEvent.click(screen.getByRole('button'));
    expect(handleReload)
      .toHaveBeenCalledTimes(1);
  });

  it('shows loading state and is disabled when canReload is false', () =>
  {
    render(
      <ReloadButton
        handleReload={vi.fn()}
        canReload={false}
      />
    );

    const button = screen.getByRole('button');
    expect(button)
      .toBeDisabled();

    // MUI Button with loading={true} usually has this class
    expect(button)
      .toHaveClass('MuiButton-loading');

    // Verify the loading indicator (spinner) is present
    const loader = screen.getByRole('progressbar', { hidden: true });
    expect(loader)
      .toBeInTheDocument();
  });

  it('renders the SdCard icon when not loading', () =>
  {
    render(
      <ReloadButton
        handleReload={vi.fn()}
        canReload={true}
      />
    );

    const icon = screen.getByTestId('SdCardIcon');
    expect(icon)
      .toBeInTheDocument();
  });
});
