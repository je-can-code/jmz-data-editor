/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { CORE_NOUNS, previewNouns } from '../../../src/mapEditor/core/preview/previewWords.ts';
import { WindowPreview } from '../../../src/mapEditor/core/preview/WindowPreview.ts';
import { PreviewChip } from '../../../src/mapEditor/render/PreviewChip.tsx';

/*
 * The window's preview sits in a map view's bar beside the clock, so a preview is never on unnoticed: "Fresh save",
 * outlined, while every map shows a new game, and otherwise what it sets, filled in the warning colour until it is
 * cleared, each kind named as the core or the module adding it names it, so a quest set reads "1 quest set" rather than
 * "1 more set". It follows the window's preview wherever it was changed, and a click on it opens where it is changed.
 */
describe('PreviewChip', () =>
{
  /**
   * What the switches, the variables and the quests are called, as the quest module names its kind.
   */
  const NOUNS = previewNouns([ { id: 'quest.states', nouns: { one: 'quest', many: 'quests', state: 'set' } } ]);

  it('says a fresh save, outlined, while the preview sets nothing', () =>
  {
    // Arrange.
    const preview = new WindowPreview();

    // Act.
    render(<PreviewChip preview={preview} nouns={NOUNS} onOpen={() => undefined}/>);

    // Assert.
    const chip = screen.getByTestId('map-preview');
    expect([ chip.textContent, chip.classList.contains('MuiChip-outlined'), chip.classList.contains('MuiChip-colorWarning') ])
      .toStrictEqual([ 'Fresh save', true, false ]);
  });

  it('says what the preview sets with each kind named as its module names it, filled, following every change', () =>
  {
    // Arrange.
    const preview = new WindowPreview();
    render(<PreviewChip preview={preview} nouns={NOUNS} onOpen={() => undefined}/>);

    // Act: a switch turned on and a quest set, from elsewhere.
    act(() => preview.setSwitch(74, true));
    act(() => preview.setValue('quest.states', 'cecil-001', { state: 'completed' }));

    // Assert.
    const chip = screen.getByTestId('map-preview');
    expect([ chip.textContent, chip.classList.contains('MuiChip-filled'), chip.classList.contains('MuiChip-colorWarning') ])
      .toStrictEqual([ '1 switch on, 1 quest set', true, true ]);
  });

  it('counts a kind no module names as more, so a quest set while its module is off is still said', () =>
  {
    // Arrange: a quest set, and only the core's kinds named.
    const preview = new WindowPreview();
    preview.setValue('quest.states', 'cecil-001', { state: 'completed' });

    // Act.
    render(<PreviewChip preview={preview} nouns={CORE_NOUNS} onOpen={() => undefined}/>);

    // Assert.
    expect(screen.getByTestId('map-preview').textContent)
      .toBe('1 more set');
  });

  it('opens where the preview is changed when clicked', () =>
  {
    // Arrange.
    const onOpen = vi.fn();
    render(<PreviewChip preview={new WindowPreview()} nouns={NOUNS} onOpen={onOpen}/>);

    // Act.
    fireEvent.click(screen.getByTestId('map-preview'));

    // Assert.
    expect(onOpen.mock.calls.length)
      .toBe(1);
  });
});
