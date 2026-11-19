/**
 * Where the UI finds the local Go HTTP API, for every page and service that calls it (same as {@code main.tsx} boot).
 * An explicit {@code VITE_JMZ_API_BASE} wins. In dev it defaults to {@code http://127.0.0.1:8080}, where the dev
 * stack runs the API beside Vite's server. A production build is served by the API itself, as the bundled editor
 * serves it, so it falls back to the page's own origin: an address baked in at build time would tie the port to
 * the build.
 * @returns {string} The API's origin, without a trailing slash.
 */
function getJmzHttpApiBase(): string
{
  const explicit = import.meta.env.VITE_JMZ_API_BASE;
  if (typeof explicit === 'string' && explicit.trim().length > 0)
  {
    return explicit.trim().replace(/\/$/u, '');
  }
  if (import.meta.env.DEV)
  {
    return 'http://127.0.0.1:8080';
  }

  // the API served this page, so it answers at the page's own origin.
  return window.location.origin;
}

export { getJmzHttpApiBase };
