import { filesystem } from "@neutralinojs/lib";
import { JsonStore } from "../JsonStore.ts";

/**
 * A JsonStore implementation backed by Neutralino's filesystem APIs.
 */
class NeutralinoJsonStore implements JsonStore
{
  /**
   * Reads a file from disk and parses it as JSON.
   * @param {string} path The absolute or project-relative path to the JSON file.
   */
  async readJson<T = unknown>(path: string): Promise<T>
  {
    // read the raw file contents as string.
    const text = await filesystem.readFile(path);

    // parse and return the JSON payload.
    return JSON.parse(text) as T;
  }

  /**
   * Writes the given data as pretty-printed JSON to disk.
   * @param {string} path The absolute or project-relative path to the JSON file.
   * @param {T} data The data to be stringified and persisted.
   */
  async writeJson<T = unknown>(path: string, data: T): Promise<void>
  {
    // stringify the data as pretty-printed JSON.
    const text = JSON.stringify(data, null, 2);

    // write the data to the target.
    await filesystem.writeFile(path, text);
  }
}

export { NeutralinoJsonStore };
