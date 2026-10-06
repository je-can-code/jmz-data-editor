import { describe, expect, it, vi } from 'vitest';
import { MapEditorApiError } from '../../../src/mapEditor/core/api/MapEditorApi.ts';
import { CommandCatalog } from '../../../src/mapEditor/core/commands/CommandCatalog.ts';
import type { JsonValue } from '../../../src/mapEditor/core/model/json.ts';
import type { PluginModule } from '../../../src/mapEditor/core/modules/PluginModule.ts';
import { PluginModuleRegistry } from '../../../src/mapEditor/core/modules/PluginModuleRegistry.ts';
import { activatePluginModules, readModuleConfigs, type ModuleSource } from '../../../src/mapEditor/services/pluginModules.ts';
import type { PluginsJsEntry } from '../../../src/services/plugins/PluginsJsReader.ts';

/*
 * A window switches its plugin modules on once it has read js/plugins.js, and first reads the project config files those
 * modules draw with, so every module starts with what it needs. Only the configs of modules about to switch on are
 * read, each once however many modules name it, so a project without a plugin is never asked for that plugin's file. A
 * config the server cannot give, or a client that cannot read configs at all, hands the module null and why, in the
 * server's own words where it gave any, so the module falls back as its plugin would and says so rather than falling
 * back quietly; a plugin list that cannot be read leaves the core's kinds on their own. Switching on never fails the
 * window.
 */

/**
 * A plugin as js/plugins.js lists it.
 * @param {string} name The path-like name.
 * @param {boolean} status Whether it is enabled.
 * @returns {PluginsJsEntry} The entry.
 */
const plugin = (name: string, status: boolean): PluginsJsEntry => ({ name, status, description: '', parameters: {} });

/**
 * A module needing one plugin and naming some configs.
 * @param {string} id The module's id.
 * @param {string} needs The plugin it needs.
 * @param {string[] | undefined} configs The configs it names.
 * @returns {PluginModule} The module.
 */
const moduleNaming = (id: string, needs: string, configs?: string[]): PluginModule =>
{
  return { id, title: id, plugins: [ needs ], configs, register: () => undefined };
};

/**
 * A server that answers the plugin list it is given, and every config as the given answer makes it, writing down which
 * configs it was asked for.
 * @param {string} list The js/plugins.js text.
 * @param {(name: string) => JsonValue} answer Makes a config's content; by default, a config holding its own name.
 * @returns {{ api: ModuleSource, asked: string[] }} The server and the configs asked for.
 */
const serverWith = (list: string, answer: (name: string) => JsonValue = name => ({ name })) =>
{
  const asked: string[] = [];
  const api: ModuleSource = {
    loadPluginList: async () => list,
    loadPluginConfig: async (name: string) =>
    {
      asked.push(name);
      return answer(name);
    },
  };
  return { api, asked };
};

describe('pluginModules', () =>
{
  describe('readModuleConfigs', () =>
  {
    it('reads the configs named by the modules switching on, each once, and none of the others\'', async () =>
    {
      // Arrange: two modules on J-Lighting naming the same config, and one on a disabled J-ABS naming its own.
      const modules = [
        moduleNaming('lighting', 'J-Lighting', [ 'lighting' ]),
        moduleNaming('lighting-time', 'J-Lighting', [ 'lighting', 'lighting-time' ]),
        moduleNaming('jabs', 'J-ABS', [ 'jabs' ]),
        moduleNaming('plain', 'J-Lighting'),
      ];
      const { api, asked } = serverWith('');

      // Act.
      const { contents, problems } = await readModuleConfigs(api, modules, [ plugin('j/lighting/J-Lighting', true), plugin('j/abs/J-ABS', false) ]);

      // Assert.
      expect([ [ ...contents ], [ ...problems ], asked ])
        .toStrictEqual([
          [ [ 'lighting', { name: 'lighting' } ], [ 'lighting-time', { name: 'lighting-time' } ] ],
          [],
          [ 'lighting', 'lighting-time' ],
        ]);
    });

    /**
     * Reads the lighting config from a server that refuses it with the given error.
     * @param {Error} error What the read fails with.
     * @returns {Promise<{ contents: [ string, JsonValue | null ][], problems: [ string, string ][] }>} What was read, and why not.
     */
    const readRefused = async (error: Error) =>
    {
      const api: ModuleSource = { loadPluginList: async () => '', loadPluginConfig: () => Promise.reject(error) };
      const { contents, problems } = await readModuleConfigs(api, [ moduleNaming('lighting', 'J-Lighting', [ 'lighting' ]) ], [ plugin('J-Lighting', true) ]);
      return { contents: [ ...contents ], problems: [ ...problems ] };
    };

    it('reads a config the server cannot give as null, keeping why in the server\'s own words', async () =>
    {
      // Arrange: a project without the file.
      const words = 'open /game/data/config.lighting.json: no such file or directory';
      const error = new MapEditorApiError(`GET /api/config/lighting answered 500: ${words}`, 500, words);

      // Act.
      const read = await readRefused(error);

      // Assert.
      expect(read)
        .toStrictEqual({ contents: [ [ 'lighting', null ] ], problems: [ [ 'lighting', words ] ] });
    });

    it('keeps why from the error itself when the server said nothing', async () =>
    {
      // Arrange: an answer with no words.
      const error = new MapEditorApiError('GET /api/config/lighting answered 502', 502);

      // Act.
      const read = await readRefused(error);

      // Assert.
      expect(read.problems)
        .toStrictEqual([ [ 'lighting', 'GET /api/config/lighting answered 502' ] ]);
    });

    it('keeps why from the error itself when the server never answered', async () =>
    {
      // Arrange.
      const error = new TypeError('Failed to fetch');

      // Act.
      const read = await readRefused(error);

      // Assert.
      expect(read.problems)
        .toStrictEqual([ [ 'lighting', 'Failed to fetch' ] ]);
    });

    it('reads every config as null for a client that cannot read configs, saying so', async () =>
    {
      // Arrange.
      const api: ModuleSource = { loadPluginList: async () => '' };

      // Act.
      const { contents, problems } = await readModuleConfigs(api, [ moduleNaming('lighting', 'J-Lighting', [ 'lighting' ]) ], [ plugin('J-Lighting', true) ]);

      // Assert.
      expect([ [ ...contents ], [ ...problems ] ])
        .toStrictEqual([ [ [ 'lighting', null ] ], [ [ 'lighting', 'this window cannot read config files' ] ] ]);
    });
  });

  describe('activatePluginModules', () =>
  {
    it('switches on the shipped modules the list enables, after reading the configs they draw with', async () =>
    {
      // Arrange: a project enabling J-Lighting and not J-ABS.
      const list = 'var $plugins =\n[\n{"name":"j/lighting/J-Lighting","status":true,"description":"","parameters":{}},\n'
        + '{"name":"j/abs/J-ABS","status":false,"description":"","parameters":{}}\n];\n';
      const lightingConfig = { light: { radius: 5, color: '#ffffff', intensity: 0, effects: {} }, ambient: { color: '#000000' } };
      const { api, asked } = serverWith(list, () => lightingConfig);
      const registry = new PluginModuleRegistry(new CommandCatalog());

      // Act.
      await activatePluginModules(api, registry);

      // Assert.
      expect([ registry.isActive('lighting'), registry.isActive('jabs'), registry.lightingLayers().map(layer => layer.id), asked ])
        .toStrictEqual([ true, false, [ 'lighting.rings' ], [ 'lighting' ] ]);
    });

    it('hands a module why its config could not be read, which J-Lighting\'s says over the map', async () =>
    {
      // Arrange: a project enabling J-Lighting whose config the strict read refuses.
      const list = 'var $plugins =\n[\n{"name":"j/lighting/J-Lighting","status":true,"description":"","parameters":{}}\n];\n';
      const words = 'decoding /game/data/config.lighting.json: json: unknown field "tint"';
      const api: ModuleSource = {
        loadPluginList: async () => list,
        loadPluginConfig: () => Promise.reject(new MapEditorApiError(`GET /api/config/lighting answered 500: ${words}`, 500, words)),
      };
      const registry = new PluginModuleRegistry(new CommandCatalog());

      // Act.
      await activatePluginModules(api, registry);

      // Assert.
      expect(registry.notices().map(notice => notice.detail))
        .toStrictEqual([ `It could not be read: ${words}. Reopen the map editor once it is fixed.` ]);
    });

    it('leaves the core\'s kinds on their own when the plugin list cannot be read', async () =>
    {
      // Arrange.
      const api: ModuleSource = { loadPluginList: () => Promise.reject(new Error('GET plugin-metadata answered 500')) };
      const registry = new PluginModuleRegistry(new CommandCatalog());
      const activate = vi.spyOn(registry, 'activate');

      // Act.
      await activatePluginModules(api, registry);

      // Assert.
      expect([ activate.mock.calls.length, registry.revision ])
        .toStrictEqual([ 0, 0 ]);
    });
  });
});
