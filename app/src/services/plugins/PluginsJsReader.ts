/**
 * One plugin as {@code js/plugins.js} lists it: its path-like name ({@code j/abs/J-ABS}), whether it is enabled,
 * its description, and its parameters, every one of which RMMZ stores as text.
 */
type PluginsJsEntry = {
  name: string;
  status: boolean;
  description: string;
  parameters: Record<string, string>;
};

/**
 * Reports whether a value is a non-null object.
 * @param {unknown} value The value.
 * @returns {boolean} True for an object.
 */
const isRecord = (value: unknown): value is Record<string, unknown> =>
{
  return typeof value === 'object' && value !== null;
};

/**
 * Extracts the {@code $plugins} JSON array from {@code js/plugins.js} text. The file is a script, not JSON: the
 * array is everything between its first {@code [} and its last {@code ]}.
 * @param {string} text The file's text.
 * @returns {unknown[]} The array, entries unchecked.
 */
function parsePluginsJsArray(text: string): unknown[]
{
  const first = text.indexOf('[');
  const last = text.lastIndexOf(']');
  if (first === -1 || last === -1 || last <= first)
  {
    throw new Error('plugins.js: could not locate JSON array');
  }
  return JSON.parse(text.slice(first, last + 1)) as unknown[];
}

/**
 * Reads every plugin {@code js/plugins.js} lists, in load order, skipping any entry without a name.
 * @param {string} text The file's text.
 * @returns {PluginsJsEntry[]} The plugins.
 */
const readPluginEntries = (text: string): PluginsJsEntry[] =>
{
  return parsePluginsJsArray(text)
    .filter(isRecord)
    .filter(entry => typeof entry['name'] === 'string' && entry['name'] !== '')
    .map(entry =>
    {
      const parameters = isRecord(entry['parameters'])
        ? Object.fromEntries(Object.entries(entry['parameters']).map(([ key, value ]) => [ key, String(value) ]))
        : {};

      return {
        name: entry['name'] as string,
        status: entry['status'] === true,
        description: typeof entry['description'] === 'string'
          ? entry['description']
          : '',
        parameters,
      };
    });
};

/**
 * Takes the file name out of a plugin's path-like name: {@code j/abs/J-ABS} is {@code J-ABS}. Plugins are told
 * apart by this, exactly, so {@code J-ABS} never matches {@code J-ABS-Metrics}.
 * @param {string} name The name as plugins.js spells it.
 * @returns {string} The last path segment.
 */
const pluginBasename = (name: string): string =>
{
  const slash = name.lastIndexOf('/');
  return slash === -1
    ? name
    : name.slice(slash + 1);
};

export { parsePluginsJsArray, pluginBasename, readPluginEntries };
export type { PluginsJsEntry };
