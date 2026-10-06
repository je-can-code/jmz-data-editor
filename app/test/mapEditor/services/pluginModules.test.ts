import { describe, expect, it, vi } from 'vitest';
import { MapEditorApiError } from '../../../src/mapEditor/core/api/MapEditorApi.ts';
import { CommandCatalog } from '../../../src/mapEditor/core/commands/CommandCatalog.ts';
import type { JsonValue } from '../../../src/mapEditor/core/model/json.ts';
import type { PluginModule } from '../../../src/mapEditor/core/modules/PluginModule.ts';
import { PluginModuleRegistry } from '../../../src/mapEditor/core/modules/PluginModuleRegistry.ts';
import {
  activatePluginModules,
  isModuleConfigFile,
  ModuleActivation,
  readModuleConfigs,
  type ModuleSource,
} from '../../../src/mapEditor/services/pluginModules.ts';
import type { PluginsJsEntry } from '../../../src/services/plugins/PluginsJsReader.ts';

/*
 * A window switches its plugin modules on once it has read js/plugins.js, and first reads the project config files those
 * modules draw with, so every module starts with what it needs. Only the configs of modules about to switch on are
 * read, each once however many modules name it, so a project without a plugin is never asked for that plugin's file. A
 * config the server cannot give, or a client that cannot read configs at all, hands the module null and why, in the
 * server's own words where it gave any, so the module falls back as its plugin would and says so rather than falling
 * back quietly; a plugin list that cannot be read leaves the core's kinds on their own. Switching on never fails the
 * window.
 *
 * A window keeps its modules as the project stands: asked again, as it is when a config file a module reads changes on
 * disk, it reads the list and the configs again and switches the modules on afresh when anything they are built from
 * changed (the list, a config, or why a config cannot be read), and leaves them, drawings and all, when nothing did.
 * Reads never overlap, and asks made while one runs are answered by one more read after it. A list that cannot be read
 * later leaves the modules as they were. A changed file is a module's config when it sits where the server reads the
 * config some module names.
 */

/**
 * A plugin as js/plugins.js lists it.
 * @param {string} name The path-like name.
 * @param {boolean} status Whether it is enabled.
 * @returns {PluginsJsEntry} The entry.
 */
const plugin = (name: string, status: boolean): PluginsJsEntry => ({ name, status, description: '', parameters: {} });

/**
 * How J-Lighting's effects run, as Chef Adventure ships them; the server serves every effect, as its model declares.
 */
const EFFECTS = {
  flicker: { depth: 0.2, period: 40, chance: 0, variance: 0.18 },
  pulse: { depth: 0.45, period: 165, chance: 0, variance: 0.22 },
  glitch: { depth: 0.85, period: 55, chance: 0.28, variance: 0.12 },
};

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
      const lightingConfig = { light: { radius: 5, color: '#ffffff', intensity: 0, effects: EFFECTS }, ambient: { color: '#000000' } };
      const { api, asked } = serverWith(list, () => lightingConfig);
      const registry = new PluginModuleRegistry(new CommandCatalog());

      // Act.
      await activatePluginModules(api, registry);

      // Assert.
      expect([ registry.isActive('lighting'), registry.isActive('jabs'), registry.lightingLayers().map(layer => layer.id), asked ])
        .toStrictEqual([ true, false, [ 'lighting.dark', 'lighting.rings' ], [ 'lighting' ] ]);
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
        .toStrictEqual([ `It could not be read: ${words}. This clears as soon as the file is fixed.` ]);
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

  describe('ModuleActivation', () =>
  {
    /**
     * js/plugins.js enabling J-Lighting alone.
     */
    const LIGHTING_ONLY = 'var $plugins =\n[\n{"name":"j/lighting/J-Lighting","status":true,"description":"","parameters":{}}\n];\n';

    /**
     * J-Lighting's config with the given default light colour.
     * @param {string} color The colour.
     * @returns {JsonValue} The config.
     */
    const lightingConfig = (color: string): JsonValue => ({ light: { radius: 5, color, intensity: 0, effects: EFFECTS }, ambient: { color: '#000000' } });

    /**
     * A server answering the plugin list and J-Lighting's config from whatever the project holds now, counting reads.
     * @param {{ list: string, config: () => Promise<JsonValue> }} project What the project holds; changed between reads.
     * @returns {{ api: ModuleSource, reads: () => number }} The server, and how many times the list was read.
     */
    const serverOver = (project: { list: string; config: () => Promise<JsonValue> }) =>
    {
      let reads = 0;
      const api: ModuleSource = {
        loadPluginList: async () =>
        {
          reads += 1;
          return project.list;
        },
        loadPluginConfig: () => project.config(),
      };
      return { api, reads: () => reads };
    };

    it('switches the modules on afresh once a config they read changes, so a notice clears as soon as it is fixed', async () =>
    {
      // Arrange: a config whose colour is no colour, switched on.
      const project = { list: LIGHTING_ONLY, config: async () => lightingConfig('white') };
      const registry = new PluginModuleRegistry(new CommandCatalog());
      const activation = new ModuleActivation(serverOver(project).api, registry);
      await activation.refresh();
      const before = registry.notices().length;

      // Act: the file is fixed.
      project.config = async () => lightingConfig('#ffbb73');
      await activation.refresh();

      // Assert.
      expect([ before, registry.notices().length, registry.revision ])
        .toStrictEqual([ 1, 0, 2 ]);
    });

    it('switches the modules on afresh once the plugin list changes', async () =>
    {
      // Arrange: J-Lighting enabled, switched on.
      const project = { list: LIGHTING_ONLY, config: async () => lightingConfig('#ffffff') };
      const registry = new PluginModuleRegistry(new CommandCatalog());
      const activation = new ModuleActivation(serverOver(project).api, registry);
      await activation.refresh();

      // Act: J-Lighting is switched off.
      project.list = LIGHTING_ONLY.replace('"status":true', '"status":false');
      await activation.refresh();

      // Assert.
      expect([ registry.isActive('lighting'), registry.revision ])
        .toStrictEqual([ false, 2 ]);
    });

    it('switches the modules on afresh when a config still cannot be read, but now for another reason', async () =>
    {
      // Arrange: a config missing, switched on.
      let reason = 'open /game/data/config.lighting.json: no such file or directory';
      const project = { list: LIGHTING_ONLY, config: () => Promise.reject(new MapEditorApiError('GET /api/config/lighting answered 500', 500, reason)) };
      const registry = new PluginModuleRegistry(new CommandCatalog());
      const activation = new ModuleActivation(serverOver(project).api, registry);
      await activation.refresh();

      // Act: the file is back, but holds a field the strict read refuses.
      reason = 'decoding /game/data/config.lighting.json: json: unknown field "tint"';
      await activation.refresh();

      // Assert.
      expect([ registry.notices().map(notice => notice.detail), registry.revision ])
        .toStrictEqual([ [ `It could not be read: ${reason}. This clears as soon as the file is fixed.` ], 2 ]);
    });

    it('leaves the modules as they are when a read finds the project the same', async () =>
    {
      // Arrange: a project switched on.
      const project = { list: LIGHTING_ONLY, config: async () => lightingConfig('#ffffff') };
      const registry = new PluginModuleRegistry(new CommandCatalog());
      const server = serverOver(project);
      const activation = new ModuleActivation(server.api, registry);
      await activation.refresh();
      const layers = registry.lightingLayers();

      // Act: read again, with nothing changed.
      await activation.refresh();

      // Assert: read twice, switched on once, the same drawings kept.
      expect([ server.reads(), registry.revision, registry.lightingLayers() === layers ])
        .toStrictEqual([ 2, 1, true ]);
    });

    it('answers every ask made while a read runs with one more read after it, never two at once', async () =>
    {
      // Arrange: a server whose first answer waits to be let through, and which notes how many reads run together.
      let release: () => void = () => undefined;
      const gate = new Promise<void>(resolve =>
      {
        release = resolve;
      });
      let running = 0;
      let mostAtOnce = 0;
      let reads = 0;
      const api: ModuleSource = {
        loadPluginList: async () =>
        {
          reads += 1;
          running += 1;
          mostAtOnce = Math.max(mostAtOnce, running);
          if (reads === 1)
          {
            await gate;
          }

          running -= 1;
          return LIGHTING_ONLY;
        },
        loadPluginConfig: async () => lightingConfig('#ffffff'),
      };
      const activation = new ModuleActivation(api, new PluginModuleRegistry(new CommandCatalog()));
      const first = activation.refresh();
      await new Promise(resolve =>
      {
        setTimeout(resolve, 0);
      });

      // Act: three asks while the first read waits, then the first let through.
      const asks = [ activation.refresh(), activation.refresh(), activation.refresh() ];
      release();
      await Promise.all([ first, ...asks ]);

      // Assert.
      expect([ reads, mostAtOnce ])
        .toStrictEqual([ 2, 1 ]);
    });

    it('keeps the modules as they were when a later read cannot read the plugin list', async () =>
    {
      // Arrange: a project switched on, whose list then fails.
      const project = { list: LIGHTING_ONLY, config: async () => lightingConfig('#ffffff') };
      const registry = new PluginModuleRegistry(new CommandCatalog());
      const { api } = serverOver(project);
      const activation = new ModuleActivation(api, registry);
      await activation.refresh();
      api.loadPluginList = () => Promise.reject(new Error('GET plugin-metadata answered 500'));

      // Act.
      await activation.refresh();

      // Assert.
      expect([ registry.isActive('lighting'), registry.revision ])
        .toStrictEqual([ true, 1 ]);
    });
  });

  describe('isModuleConfigFile', () =>
  {
    it('knows a config file a module reads, by the path the change stream names', () =>
    {
      // Arrange.
      const path = 'data/config.lighting.json';

      // Act.
      const known = isModuleConfigFile(path);

      // Assert.
      expect(known)
        .toBe(true);
    });

    it('passes over a config no module reads, a map, and paths only shaped like a config', () =>
    {
      // Arrange: the crafting board's config, a map, a config in another folder, and one with a dot in its name.
      const paths = [ 'data/config.crafting.json', 'data/Map006.json', 'img/config.lighting.json', 'data/config.lighting.old.json' ];

      // Act.
      const known = paths.map(path => isModuleConfigFile(path));

      // Assert.
      expect(known)
        .toStrictEqual([ false, false, false, false ]);
    });

    it('reads the configs of the modules handed over, rather than the shipped ones', () =>
    {
      // Arrange: a module reading the crafting config.
      const modules = [ moduleNaming('crafting', 'J-Crafting', [ 'crafting' ]), moduleNaming('plain', 'J-Plain') ];

      // Act.
      const known = [ isModuleConfigFile('data/config.crafting.json', modules), isModuleConfigFile('data/config.lighting.json', modules) ];

      // Assert.
      expect(known)
        .toStrictEqual([ true, false ]);
    });
  });
});
