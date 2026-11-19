/**
 * The health route's answer, inside the envelope every route of the server shares ({@code internal/api/health.go}).
 */
type HealthEnvelope = {
  path: string;
  error?: string;
  data?: {
    ok: boolean;

    /**
     * The folder the API reads and writes, left out when {@code JMZ_PROJECT_ROOT} is unset.
     */
    projectRoot?: string;

    /**
     * Whether {@code JMZ_PROJECT_ROOT} is set, which is exactly whether {@link projectRoot} is there.
     */
    projectRootOk: boolean;
  };
};

/**
 * Where the backend gate stands: still asking, an API that did not answer as one, an API serving no project, or an API
 * ready to serve the project at {@code projectRoot}.
 */
type BackendState =
  | { type: 'checking' }
  | { type: 'unreachable'; apiBase: string }
  | { type: 'missing-project-root'; apiBase: string }
  | { type: 'ready'; apiBase: string; projectRoot: string };

/**
 * Fetches a URL: {@link fetch}, or a stand-in.
 */
type Fetcher = (url: string) => Promise<Response>;

/**
 * Asks the API whether it is up and which project it serves. A ready answer carries the project's root, so the editor
 * starts on the folder the API actually reads and writes rather than one remembered from an earlier session, and shows
 * that folder in its bar.
 * @param {string} apiBase The API's origin.
 * @param {Fetcher} fetcher Fetches the answer; the browser's fetch by default.
 * @returns {Promise<BackendState>} Where the gate stands, which is never still asking.
 */
const probeBackend = async (apiBase: string, fetcher: Fetcher = url => fetch(url)): Promise<BackendState> =>
{
  try
  {
    const response = await fetcher(`${apiBase}/api/health`);
    if (response.ok === false)
    {
      return { type: 'unreachable', apiBase };
    }

    // anything but the health route's own answer is something else listening on the API's address.
    const { error, data } = await response.json() as HealthEnvelope;
    if ((error !== undefined && error.trim() !== '') || data === undefined || data.ok !== true)
    {
      return { type: 'unreachable', apiBase };
    }

    // the root is left out exactly when projectRootOk is false, so the root alone decides.
    const projectRoot = data.projectRoot ?? '';
    if (projectRoot === '')
    {
      return { type: 'missing-project-root', apiBase };
    }

    return { type: 'ready', apiBase, projectRoot };
  }
  catch
  {
    // no answer at all, or one that is not JSON.
    return { type: 'unreachable', apiBase };
  }
};

export { probeBackend };
export type { BackendState, Fetcher };
