import type { JsonStore } from '../JsonStore.ts';
import { resolveJsonApiUrl } from './jsonApiRoutes.ts';

/**
 * Response envelope from {@code server/internal/api/response.go} ({@code RestResponse[T]}).
 */
type JsonApiEnvelope<T = unknown> = {
  path: string;
  error?: string;
  data?: T;
};

/**
 * JsonStore that reads/writes via the local Go HTTP API (same contract as filesystem paths from {@link DataService}).
 */
class HttpJsonStore implements JsonStore
{
  private readonly apiBase: string;

  /**
   * @param apiBase Origin for the Go API, e.g. {@code http://127.0.0.1:8080} (no trailing slash required).
   */
  constructor(apiBase: string)
  {
    this.apiBase = apiBase.replace(/\/$/u, '');
  }

  /**
   * Loads JSON via GET and unwraps {@code data} from the API envelope.
   */
  async readJson<T = unknown>(path: string): Promise<T>
  {
    const url = resolveJsonApiUrl(this.apiBase, path);
    const response = await fetch(url, { method: 'GET' });
    const text = await response.text();
    let envelope: JsonApiEnvelope<T>;
    try
    {
      envelope = JSON.parse(text) as JsonApiEnvelope<T>;
    }
    catch (parseErr)
    {
      throw new Error(
        `HttpJsonStore: invalid JSON from GET ${url}: ${String(parseErr)}`,
      );
    }

    if (!response.ok || (envelope.error !== undefined && envelope.error !== ''))
    {
      throw new Error(
        envelope.error !== undefined && envelope.error !== ''
          ? envelope.error
          : `HTTP ${String(response.status)} for GET ${url}`,
      );
    }

    return envelope.data as T;
  }

  /**
   * Saves JSON via POST; body is the raw payload (no envelope).
   */
  async writeJson<T = unknown>(
    path: string,
    data: T
  ): Promise<void>
  {
    const url = resolveJsonApiUrl(this.apiBase, path);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    const text = await response.text();
    let envelope: JsonApiEnvelope;
    try
    {
      envelope = JSON.parse(text) as JsonApiEnvelope;
    }
    catch (parseErr)
    {
      throw new Error(
        `HttpJsonStore: invalid JSON from POST ${url}: ${String(parseErr)}`,
      );
    }

    if (!response.ok || (envelope.error !== undefined && envelope.error !== ''))
    {
      throw new Error(
        envelope.error !== undefined && envelope.error !== ''
          ? envelope.error
          : `HTTP ${String(response.status)} for POST ${url}`,
      );
    }
  }
}

export { HttpJsonStore };
