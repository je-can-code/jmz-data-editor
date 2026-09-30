import { describe, expect, it, vi } from 'vitest';
import type { PluginHeader } from '../../../../../src/mapEditor/core/commands/pluginHeaders/pluginHeader.ts';
import { PluginHeaderLibrary, PluginHeaderStore } from '../../../../../src/mapEditor/core/commands/pluginHeaders/PluginHeaderLibrary.ts';

/*
 * The plugin command editor looks headers up three ways: the plugins it can offer (those with commands), a
 * command by plugin and name, and a struct by the plugin declaring it, since two plugins may declare structs of
 * the same name. Headers load after the editor may already be open, so the store tells its listeners whenever
 * they arrive and hands out a fresh library each time.
 */
describe('plugin header library', () =>
{
  /**
   * A plugin with a command and a struct, and a plugin with neither.
   * @returns {PluginHeader[]} The headers.
   */
  const headers = (): PluginHeader[] => [
    {
      plugin: 'j/time/J-TIME',
      description: 'Time.',
      commands: [ { plugin: 'j/time/J-TIME', command: 'jumpToTimeOfDay', args: [] } ],
      structs: [ { name: 'Reward', params: [ { name: 'item', type: 'item' } ] } ],
    },
    { plugin: 'others/HIME_LargeChoices', description: 'Choices.', commands: [], structs: [] },
  ];

  describe('PluginHeaderLibrary', () =>
  {
    it('offers only the plugins with commands, and finds a plugin, command and struct by name', () =>
    {
      // Arrange.
      const library = new PluginHeaderLibrary(headers());

      // Act.
      const found = [
        library.withCommands().map(header => header.plugin),
        library.header('others/HIME_LargeChoices')?.description,
        library.command('j/time/J-TIME', 'jumpToTimeOfDay')?.command,
        library.struct('j/time/J-TIME', 'Reward')?.params.length,
      ];

      // Assert.
      expect(found)
        .toStrictEqual([ [ 'j/time/J-TIME' ], 'Choices.', 'jumpToTimeOfDay', 1 ]);
    });

    it('finds nothing for a plugin, command or struct it was never given', () =>
    {
      // Arrange.
      const library = new PluginHeaderLibrary(headers());

      // Act.
      const missing = [
        library.header('j/abs/J-ABS'),
        library.command('j/time/J-TIME', 'rewindTime'),
        library.command('j/abs/J-ABS', 'Spawn Enemy'),
        library.struct('others/HIME_LargeChoices', 'Reward'),
        library.struct('j/abs/J-ABS', 'Reward'),
      ];

      // Assert.
      expect(missing)
        .toStrictEqual([ null, null, null, null, null ]);
    });

    it('starts empty, and names plugins by their file name', () =>
    {
      // Arrange.
      const library = new PluginHeaderLibrary();

      // Act.
      const results = [ library.headers(), PluginHeaderLibrary.displayName('j/omni/ext/J-OMNI-Quests'), PluginHeaderLibrary.displayName('Solo') ];

      // Assert.
      expect(results)
        .toStrictEqual([ [], 'J-OMNI-Quests', 'Solo' ]);
    });
  });

  describe('PluginHeaderStore', () =>
  {
    it('hands out a new library when headers arrive, and tells its listeners until they stop listening', () =>
    {
      // Arrange.
      const store = new PluginHeaderStore();
      const listener = vi.fn();
      const stop = store.subscribe(listener);
      const before = store.library();

      // Act.
      store.set(headers());
      stop();
      store.set([]);

      // Assert.
      expect([ before.headers().length, listener.mock.calls.length, store.library().headers() ])
        .toStrictEqual([ 0, 1, [] ]);
    });
  });
});
