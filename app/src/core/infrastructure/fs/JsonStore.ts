/**
 * Describes a JSON-based store capable of reading and writing JSON objects.
 */
interface JsonStore
{
  readJson<T = unknown>(path: string): Promise<T>;

  writeJson<T = unknown>(
    path: string,
    data: T
  ): Promise<void>;
}

export { JsonStore };
