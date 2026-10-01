import { describe, expect, it } from 'vitest';
import { checkPluginCommandRegistration } from '../../../../../src/mapEditor/core/commands/pluginHeaders/pluginCommandRegistration.ts';
import type { PluginsJsEntry } from '../../../../../src/services/plugins/PluginsJsReader.ts';

/*
 * A plugin command names a plugin and a command by string, and nothing stops either from going stale: the
 * plugin can be removed or switched off in js/plugins.js, or its header can stop declaring that command,
 * while the map data keeps calling it. This is what tells a genuinely dead plugin command apart from a live
 * one, and says why, since the row that flags it and the editor that opens it both need a reason to show. The
 * check runs plugin existence, then enabled state, then the header's own declared commands, in that order, so
 * a disabled plugin is reported disabled even when an unrelated enabled plugin happens to declare a
 * same-named command, and a plugin with some valid commands is still flagged for one it does not declare.
 */
describe('checkPluginCommandRegistration', () =>
{
  /**
   * js/plugins.js listing J-JAFTING enabled and J-Log disabled.
   * @returns {PluginsJsEntry[]} The entries.
   */
  const entries = (): PluginsJsEntry[] => [
    { name: 'j/jafting/J-JAFTING', status: true, description: '', parameters: {} },
    { name: 'j/log/J-Log', status: false, description: '', parameters: {} },
  ];

  /**
   * A header declaring only {@code craft-item} for J-JAFTING; nothing else, from any plugin, is declared.
   * @param {string} plugin The plugin asked about.
   * @param {string} command The command asked about.
   * @returns {boolean} True only for J-JAFTING's {@code craft-item}.
   */
  const declaresOnlyCraftItem = (plugin: string, command: string): boolean =>
  {
    return plugin === 'j/jafting/J-JAFTING' && command === 'craft-item';
  };

  it('registers a command an enabled plugin\'s header declares', () =>
  {
    // Arrange: J-JAFTING is enabled and declares craft-item.
    const list = entries();

    // Act.
    const result = checkPluginCommandRegistration('j/jafting/J-JAFTING', 'craft-item', list, declaresOnlyCraftItem);

    // Assert.
    expect(result)
      .toStrictEqual({ registered: true });
  });

  it('flags a plugin js/plugins.js never lists, as plugin-missing', () =>
  {
    // Arrange: no entry named J-GHOST exists at all.
    const list = entries();

    // Act.
    const result = checkPluginCommandRegistration('j/ghost/J-GHOST', 'doThing', list, () => true);

    // Assert.
    expect(result)
      .toStrictEqual({ registered: false, reason: 'plugin-missing', message: 'J-GHOST is not listed in js/plugins.js.' });
  });

  it('flags a listed but disabled plugin as plugin-disabled, even when its header would have matched', () =>
  {
    // Arrange: J-Log is listed but switched off; the header lookup is stubbed to always say yes, so a pass
    // here can only mean the disabled check ran first and short-circuited before that lookup mattered.
    const list = entries();

    // Act.
    const result = checkPluginCommandRegistration('j/log/J-Log', 'hideLog', list, () => true);

    // Assert.
    expect(result)
      .toStrictEqual({ registered: false, reason: 'plugin-disabled', message: 'J-Log is listed in js/plugins.js, but is not enabled.' });
  });

  it('flags a command an enabled plugin\'s header does not declare, as command-not-declared, even though the same plugin declares a different one', () =>
  {
    // Arrange: J-JAFTING is enabled and declares craft-item, but not refine-item.
    const list = entries();

    // Act.
    const result = checkPluginCommandRegistration('j/jafting/J-JAFTING', 'refine-item', list, declaresOnlyCraftItem);

    // Assert.
    expect(result)
      .toStrictEqual({
        registered: false,
        reason: 'command-not-declared',
        message: 'J-JAFTING is enabled, but its header does not declare a command named "refine-item".',
      });
  });

  it('flags a command against an enabled plugin whose header declares no commands at all, as command-not-declared', () =>
  {
    // Arrange: the plugin is enabled and its file loaded fine, but nothing it declares ever matches.
    const list = entries();

    // Act.
    const result = checkPluginCommandRegistration('j/jafting/J-JAFTING', 'craft-item', list, () => false);

    // Assert.
    expect(result)
      .toStrictEqual({
        registered: false,
        reason: 'command-not-declared',
        message: 'J-JAFTING is enabled, but its header does not declare a command named "craft-item".',
      });
  });
});
