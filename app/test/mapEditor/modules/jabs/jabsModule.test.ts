import { describe, expect, it } from 'vitest';
import { CommandCatalog } from '../../../../src/mapEditor/core/commands/CommandCatalog.ts';
import { PluginModuleRegistry } from '../../../../src/mapEditor/core/modules/PluginModuleRegistry.ts';
import { actionMapIdOf, jabsModule } from '../../../../src/mapEditor/modules/jabs/jabsModule.ts';
import { registerCoreEventKinds } from '../../../../src/mapEditor/services/coreEventKinds.ts';
import type { PluginsJsEntry } from '../../../../src/services/plugins/PluginsJsReader.ts';
import { event, page } from '../../support/eventKindFixtures.ts';

/*
 * J-ABS copies an action's event off its action map each time the action spawns, so the events there are its
 * patterns, never things placed on a map: while J-ABS is enabled, its module names that map, and no kind claims an
 * event on it. Which map that is comes from J-ABS's Action Map Id parameter, kept as text like every RMMZ parameter;
 * a value that is not a map id names no map, so nothing is taken from any map by mistake.
 */
describe('jabsModule', () =>
{
  /**
   * J-ABS as js/plugins.js lists it.
   * @param {boolean} status Whether it is enabled.
   * @param {Record<string, string>} parameters Its parameters.
   * @returns {PluginsJsEntry} The entry.
   */
  const jabs = (status: boolean, parameters: Record<string, string>): PluginsJsEntry => ({ name: 'j/abs/J-ABS', status, description: '', parameters });

  /**
   * A window's registry with the core's kinds, and J-ABS's module activated over the given plugin.
   * @param {PluginsJsEntry} plugin J-ABS.
   * @returns {PluginModuleRegistry} The registry.
   */
  const registryWith = (plugin: PluginsJsEntry): PluginModuleRegistry =>
  {
    const registry = new PluginModuleRegistry(new CommandCatalog());
    registerCoreEventKinds(registry);
    registry.activate([ jabsModule ], [ plugin ]);
    return registry;
  };

  describe('actionMapIdOf', () =>
  {
    it('reads the action map from its parameter, and no map from a value that is not a map id', () =>
    {
      // Arrange.
      const values: Record<string, string>[] = [ { actionMapId: '2' }, { actionMapId: '115' }, { actionMapId: '' }, { actionMapId: '0' }, { actionMapId: '2.5' }, { actionMapId: 'two' }, {} ];

      // Act.
      const mapIds = values.map(parameters => actionMapIdOf(jabs(true, parameters)));

      // Assert.
      expect(mapIds)
        .toStrictEqual([ 2, 115, null, null, null, null, null ]);
    });
  });

  describe('jabsModule', () =>
  {
    it('leaves every event on the action map unclaimed while J-ABS is enabled, and claims the same event elsewhere', () =>
    {
      // Arrange: a sword swing's pattern, which runs nothing and so reads as decor anywhere else.
      const swing = event(32, [ page([]) ]);

      // Act.
      const enabled = registryWith(jabs(true, { actionMapId: '2' }));
      const disabled = registryWith(jabs(false, { actionMapId: '2' }));

      // Assert.
      expect([ enabled.isActive('jabs'), enabled.kindOf(swing, 2), enabled.kindOf(swing, 3)?.id, disabled.kindOf(swing, 2)?.id ])
        .toStrictEqual([ true, null, 'core.decor', 'core.decor' ]);
    });

    it('takes no map from an action map parameter that names none', () =>
    {
      // Arrange.
      const swing = event(32, [ page([]) ]);

      // Act.
      const registry = registryWith(jabs(true, { actionMapId: '0' }));

      // Assert: the module is on, and every map still claims the event.
      expect([ registry.isActive('jabs'), registry.kindOf(swing, 0)?.id, registry.kindOf(swing, 2)?.id ])
        .toStrictEqual([ true, 'core.decor', 'core.decor' ]);
    });
  });
});
