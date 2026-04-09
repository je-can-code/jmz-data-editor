import { JsonStore } from '../JsonStore.ts';

/**
 * A JsonStore implementation that keeps data in-memory.
 * Useful for tests and dev fixtures.
 */
class MemoryJsonStore
  implements JsonStore
{
  private files = new Map<string, string>();

  /**
   * Creates a pre-seeded memory store.
   * @param {Record<string, unknown | string>} [initial] Optional map of path->data.
   *        If a value is a string, it is assumed to be already JSON; otherwise it is stringified.
   */
  constructor(initial?: Record<string, unknown | string>)
  {
    // seed the in-memory map if provided.
    if (initial)
    {
      for (const [ path, value ] of Object.entries(initial))
      {
        const text = typeof value === 'string'
          ? value
          : JSON.stringify(value, null, 2);

        this.files.set(path, text);
      }
    }
  }

  /**
   * Reads a JSON value from the in-memory map.
   * @param {string} path The key representing the file path.
   */
  async readJson<T = unknown>(path: string): Promise<T>
  {
    // look up the text by path.
    const text = this.files.get(path);

    if (text == null)
    {
      // throw if not found to mimic missing file behavior.
      throw new Error(`File not found: ${path}`);
    }

    // parse and return the JSON payload.
    return JSON.parse(text) as T;
  }

  /**
   * Writes a JSON value to the in-memory map.
   * @param {string} path The key representing the file path.
   * @param {T} data The data to stringify and store.
   */
  async writeJson<T = unknown>(
    path: string,
    data: T
  ): Promise<void>
  {
    // stringify the data and update the map.
    const text = JSON.stringify(data, null, 2);
    this.files.set(path, text);
  }

  // --- Optional helpers to assist tests.

  /**
   * Returns the raw JSON string for a given path if present.
   */
  getText(path: string): string | undefined
  {
    return this.files.get(path);
  }

  /**
   * Returns whether the store contains a given path.
   */
  has(path: string): boolean
  {
    return this.files.has(path);
  }
}

export { MemoryJsonStore };
