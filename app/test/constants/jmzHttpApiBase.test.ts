import { afterEach, describe, expect, it, vi } from 'vitest';
import { getJmzHttpApiBase } from '../../src/constants/jmzHttpApiBase.ts';

/*
 * Every page and service finds the API through this one rule, so it has to name the right server in each of the
 * three ways the UI runs. A base set at build time is used as given, less a trailing slash, since whoever set it
 * knows where its API is. The dev stack runs the API on its own port beside Vite's server, so dev falls back to that
 * port, never to the page's origin. A production build is served by the API itself, as the bundled editor serves
 * it, so it falls back to the page's own origin; any other answer there leaves the bundle stuck at its backend gate.
 */
describe('getJmzHttpApiBase', () =>
{
  afterEach(() =>
  {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  /**
   * Puts the test on a page loaded from an origin, the way the bundled editor's pages are loaded from the API.
   * @param {string} origin The page's origin.
   */
  const servePageFrom = (origin: string): void =>
  {
    vi.stubGlobal('window', { location: { origin } });
  };

  it('uses a base set at build time as given, without its trailing slash', () =>
  {
    // Arrange- a production build on a page from elsewhere, so only the setting can produce this answer.
    vi.stubEnv('VITE_JMZ_API_BASE', ' http://127.0.0.1:18082/ ');
    vi.stubEnv('DEV', false);
    servePageFrom('http://127.0.0.1:47380');

    // Act.
    const apiBase = getJmzHttpApiBase();

    // Assert.
    expect(apiBase)
      .toBe('http://127.0.0.1:18082');
  });

  it('falls back to the dev stack\'s API port in dev, not to the page\'s origin', () =>
  {
    // Arrange- the page comes from Vite's server, which is not the API.
    vi.stubEnv('VITE_JMZ_API_BASE', undefined);
    vi.stubEnv('DEV', true);
    servePageFrom('http://127.0.0.1:3000');

    // Act.
    const apiBase = getJmzHttpApiBase();

    // Assert.
    expect(apiBase)
      .toBe('http://127.0.0.1:8080');
  });

  it('falls back to the page\'s own origin in a production build', () =>
  {
    // Arrange- the page comes from the API, as it does in the bundled editor.
    vi.stubEnv('VITE_JMZ_API_BASE', undefined);
    vi.stubEnv('DEV', false);
    servePageFrom('http://127.0.0.1:47380');

    // Act.
    const apiBase = getJmzHttpApiBase();

    // Assert.
    expect(apiBase)
      .toBe('http://127.0.0.1:47380');
  });

  it('treats a blank base as no base at all', () =>
  {
    // Arrange.
    vi.stubEnv('VITE_JMZ_API_BASE', '   ');
    vi.stubEnv('DEV', false);
    servePageFrom('http://127.0.0.1:47380');

    // Act.
    const apiBase = getJmzHttpApiBase();

    // Assert.
    expect(apiBase)
      .toBe('http://127.0.0.1:47380');
  });
});
