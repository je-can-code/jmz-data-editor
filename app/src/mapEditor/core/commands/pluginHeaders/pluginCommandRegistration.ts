import { pluginBasename, type PluginsJsEntry } from '../../../../services/plugins/PluginsJsReader.ts';

/**
 * Why a plugin command is unregistered: {@code plugin-missing} when {@code js/plugins.js} has no entry for the
 * plugin at all, {@code plugin-disabled} when it has one but the entry is switched off, and
 * {@code command-not-declared} when the plugin is enabled but its header names no command by this command.
 */
type PluginCommandRegistrationReason = 'plugin-missing' | 'plugin-disabled' | 'command-not-declared';

/**
 * Whether a plugin command's plugin and command actually resolve to something the game would run when played:
 * a plugin {@code js/plugins.js} lists and enables, whose header declares a command by this exact name.
 * Registered holds nothing more to say; unregistered carries why, and a message ready to show as it is.
 */
type PluginCommandRegistration =
  | { readonly registered: true }
  | { readonly registered: false; readonly reason: PluginCommandRegistrationReason; readonly message: string };

/**
 * Finds a plugin's entry in {@code js/plugins.js} by its exact name: the same string a plugin command stores
 * in its first parameter, and a parsed header carries as {@link PluginHeader.plugin}.
 * @param {string} plugin The plugin's name.
 * @param {readonly PluginsJsEntry[]} entries Every entry {@code js/plugins.js} lists, enabled or not.
 * @returns {PluginsJsEntry | undefined} The entry, or undefined when no such plugin is listed.
 */
const findEntry = (plugin: string, entries: readonly PluginsJsEntry[]): PluginsJsEntry | undefined =>
{
  return entries.find(each => each.name === plugin);
};

/**
 * Checks whether a plugin command is registered: {@code js/plugins.js} must list the plugin and enable it, and
 * that plugin's own header must declare a command by this exact name. The check runs in that order, so a
 * plugin switched off is reported disabled even when its header would otherwise have matched, and a plugin
 * that declares other commands but not this one is reported exactly as unregistered as a plugin nobody has
 * heard of, since a stale or retargeted plugin command is exactly what this exists to catch.
 * @param {string} plugin The plugin's name, as the command stores it and {@code js/plugins.js} spells it.
 * @param {string} command The command's name, as the command stores it.
 * @param {readonly PluginsJsEntry[]} entries Every entry {@code js/plugins.js} lists, enabled or not.
 * @param {(plugin: string, command: string) => boolean} declaresCommand Whether the named plugin's header declares a command by this name.
 * @returns {PluginCommandRegistration} Registered, or not, with why.
 */
const checkPluginCommandRegistration = (
  plugin: string,
  command: string,
  entries: readonly PluginsJsEntry[],
  declaresCommand: (plugin: string, command: string) => boolean,
): PluginCommandRegistration =>
{
  const entry = findEntry(plugin, entries);
  const name = pluginBasename(plugin);
  if (entry === undefined)
  {
    return { registered: false, reason: 'plugin-missing', message: `${name} is not listed in js/plugins.js.` };
  }

  if (entry.status === false)
  {
    return { registered: false, reason: 'plugin-disabled', message: `${name} is listed in js/plugins.js, but is not enabled.` };
  }

  if (declaresCommand(plugin, command) === false)
  {
    return {
      registered: false,
      reason: 'command-not-declared',
      message: `${name} is enabled, but its header does not declare a command named "${command}".`,
    };
  }

  return { registered: true };
};

export { checkPluginCommandRegistration };
export type { PluginCommandRegistration, PluginCommandRegistrationReason };
