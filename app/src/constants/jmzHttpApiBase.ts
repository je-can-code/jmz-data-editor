/**
 * Shared rule for when the UI talks to the local Go HTTP API (same as {@code main.tsx} boot).
 * In dev, defaults to {@code http://127.0.0.1:8080} when {@code VITE_JMZ_API_BASE} is unset.
 */
function getJmzHttpApiBase(): string | null
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
  return null;
}

export { getJmzHttpApiBase };
