import { describe, expect, it } from 'vitest';
import {
  createNotetagLine,
  hydrateNotetagLine,
  hydrateNotetagLinesConfig,
} from '@core/domain/valueObjects/notetag-lines-config.ts';

/**
 * The Tag Lines board writes back the whole file, so what it holds in memory is what the game reads next launch.
 * Two things decide that, and both fail quietly:
 *
 *   - reading: every line has to come through with both of its fields, and a line left empty on purpose has to
 *     stay empty rather than vanish, since an empty sentence and a missing one mean different things in game
 *   - adding: a new line must never take a key another line already uses, or one sentence silently replaces the
 *     other the moment the game loads the file
 */
describe('hydrateNotetagLinesConfig', () =>
{
  it('reads anything but a list as no lines at all', () =>
  {
    // Arrange - a file the editor never wrote, holding an object where the list belongs.
    const source = { key: 'rewardMultiplier' };

    // Act
    const lines = hydrateNotetagLinesConfig(source);

    // Assert
    expect(lines)
      .toEqual([]);
  });

  it('carries every line through as written, a line left empty included', () =>
  {
    // Arrange
    const source = [
      { key: 'rewardMultiplier', template: 'Enemies yield {value} {reward}.' },
      { key: 'stackMax', template: '' },
    ];

    // Act
    const lines = hydrateNotetagLinesConfig(source);

    // Assert
    expect(lines)
      .toEqual([
        { key: 'rewardMultiplier', template: 'Enemies yield {value} {reward}.' },
        { key: 'stackMax', template: '' },
      ]);
  });
});

describe('hydrateNotetagLine', () =>
{
  it('names a line with no key after its place in the file, and gives it empty words', () =>
  {
    // Arrange - a hand-edited entry missing both of its fields.
    const source = {};

    // Act
    const line = hydrateNotetagLine(source, 3);

    // Assert
    expect(line)
      .toEqual({ key: 'line_3', template: '' });
  });
});

describe('createNotetagLine', () =>
{
  it('starts a new line on the plain key when nothing uses it', () =>
  {
    // Arrange
    const lines = [ { key: 'rewardMultiplier', template: 'Enemies yield {value} {reward}.' } ];

    // Act
    const line = createNotetagLine(lines);

    // Assert
    expect(line)
      .toEqual({ key: 'newLine', template: '' });
  });

  it('numbers the key past every one already taken', () =>
  {
    // Arrange - the plain key and its first number are both in use.
    const lines = [
      { key: 'newLine', template: '' },
      { key: 'newLine2', template: '' },
    ];

    // Act
    const line = createNotetagLine(lines);

    // Assert
    expect(line.key)
      .toBe('newLine3');
  });
});
