import { describe, expect, it } from 'vitest';
import { loadPluginHeaders } from '../../../../../src/mapEditor/core/commands/pluginHeaders/loadPluginHeaders.ts';

/*
 * The editor reads plugin headers through the server: js/plugins.js says which plugins are enabled, and each
 * enabled plugin's source is fetched and parsed. A disabled plugin is never fetched (the game never loads it, so
 * its commands would do nothing), and a plugin whose file is missing is left out rather than failing the rest.
 */
describe('loadPluginHeaders', () =>
{
  /**
   * The text of a js/plugins.js listing three plugins, the middle one switched off.
   */
  const pluginList = `var $plugins = [
{"name":"j/time/J-TIME","status":true,"description":"","parameters":{}},
{"name":"j/log/J-Log","status":false,"description":"","parameters":{}},
{"name":"gone/Missing","status":true,"description":"","parameters":{}}
];`;

  it('parses every enabled plugin\'s header, never fetching a disabled one and leaving out a missing one', async () =>
  {
    // Arrange: a server with J-TIME's source and nothing else.
    const fetched: string[] = [];
    const api = {
      loadPluginList: async () => pluginList,
      loadPluginSource: async (path: string) =>
      {
        fetched.push(path);
        return path === 'j/time/J-TIME'
          ? '/*:\n * @plugindesc Time.\n * @command stopTime\n * @text Stop TIME\n */'
          : null;
      },
    };

    // Act.
    const headers = await loadPluginHeaders(api);

    // Assert.
    expect([ fetched, headers ])
      .toStrictEqual([
        [ 'j/time/J-TIME', 'gone/Missing' ],
        [ { plugin: 'j/time/J-TIME', description: 'Time.', commands: [ { plugin: 'j/time/J-TIME', command: 'stopTime', text: 'Stop TIME', args: [] } ], structs: [] } ],
      ]);
  });
});
