/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MARKER_STYLES } from '../../../src/mapEditor/core/eventKinds/eventMarkers.ts';
import { MARKER_GLYPHS } from '../../../src/mapEditor/core/eventKinds/markerGlyphs.ts';
import { MarkerIcon } from '../../../src/mapEditor/views/MarkerIcon.tsx';

/*
 * The events list draws each event's marker small beside it, so the list and the map must read alike: the icon is the
 * map's own marker, the symbol's colour behind the symbol's glyph in white, and it names what it stands for, so a screen
 * reader says "Battler" rather than nothing. It draws at the size asked for, or 16 pixels.
 */
describe('MarkerIcon', () =>
{
  it('draws the symbol\'s square in its colour behind its glyph, named for what it stands for', () =>
  {
    // Arrange.

    // Act.
    render(<MarkerIcon symbol={'battler'} size={14}/>);

    // Assert.
    const icon = screen.getByRole('img', { name: 'Battler' });
    const square = icon.querySelector('rect');
    const glyph = icon.querySelector('path');
    expect([ icon.getAttribute('width'), square?.getAttribute('fill'), glyph?.getAttribute('d'), glyph?.getAttribute('fill') ])
      .toStrictEqual([ '14', MARKER_STYLES.battler.colour, MARKER_GLYPHS.battler, '#ffffff' ]);
  });

  it('draws at 16 pixels unless told otherwise, and each trigger by its own name', () =>
  {
    // Arrange.

    // Act.
    render(<MarkerIcon symbol={'autorun'}/>);

    // Assert.
    const icon = screen.getByRole('img', { name: 'Autorun' });
    expect([ icon.getAttribute('width'), icon.getAttribute('height'), icon.querySelector('rect')?.getAttribute('fill') ])
      .toStrictEqual([ '16', '16', MARKER_STYLES.autorun.colour ]);
  });
});
