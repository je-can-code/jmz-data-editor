import { pluginEntryId } from '../commands/pluginCommands.ts';

/**
 * How often a project uses each command, counted by events: a map event (whatever its pages) or a common event
 * counts once for every command it uses at least once. That is the count the search ranks by, since how many
 * events need a command says more about reaching for it than how many times one long cutscene repeats it.
 */
type CommandUsageCounts = {
  /**
   * How many events were counted.
   */
  readonly events: number;

  /**
   * Events using each command code, by code.
   */
  readonly codes: Readonly<Record<string, number>>;

  /**
   * Events using each plugin command, by plugin (as {@code js/plugins.js} names it) and command.
   */
  readonly pluginCommands: readonly { readonly plugin: string; readonly command: string; readonly events: number }[];
};

/**
 * Turns usage counts into the counts the catalog's search ranks by, by entry id: {@code core:<code>} for built-in
 * commands, and each plugin command's own entry id.
 * @param {CommandUsageCounts} counts The counts.
 * @returns {Map<string, number>} The counts by entry id.
 */
const usageByEntry = (counts: CommandUsageCounts): Map<string, number> =>
{
  const usage = new Map<string, number>();
  Object.entries(counts.codes).forEach(([ code, events ]) => usage.set(`core:${code}`, events));
  counts.pluginCommands.forEach(({ plugin, command, events }) => usage.set(pluginEntryId(plugin, command), events));
  return usage;
};

export { usageByEntry };
export type { CommandUsageCounts };
