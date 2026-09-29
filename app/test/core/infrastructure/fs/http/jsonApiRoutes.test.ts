import { describe, expect, it } from 'vitest';
import { apiPathnameForBasename } from '@core/infrastructure/fs/http/jsonApiRoutes.ts';

/**
 * Every read and write this editor makes goes through the pathname this module picks for a file, so a wrong
 * or missing answer sends a save to the wrong place or nowhere at all. It owes one pathname for each whole
 * file the server serves, one per map by number, and nothing for a file the server does not know.
 */
describe('apiPathnameForBasename', () =>
{
  it('routes a database file to its own endpoint', () =>
  {
    // Arrange
    const baseName = 'Classes.json';

    // Act
    const pathname = apiPathnameForBasename(baseName);

    // Assert
    expect(pathname)
      .toBe('/api/classes');
  });

  it('routes a plugin configuration to its endpoint under config', () =>
  {
    // Arrange
    const baseName = 'config.weather.json';

    // Act
    const pathname = apiPathnameForBasename(baseName);

    // Assert
    expect(pathname)
      .toBe('/api/config/weather');
  });

  it('routes a map to its endpoint by number, without the zero padding', () =>
  {
    // Arrange
    const baseName = 'Map042.json';

    // Act
    const pathname = apiPathnameForBasename(baseName);

    // Assert
    expect(pathname)
      .toBe('/api/maps/42');
  });

  it('routes nothing for a file the server does not serve', () =>
  {
    // Arrange- a name an object literal would have answered from its prototype.
    const baseName = 'constructor';

    // Act
    const pathname = apiPathnameForBasename(baseName);

    // Assert
    expect(pathname)
      .toBeNull();
  });
});
