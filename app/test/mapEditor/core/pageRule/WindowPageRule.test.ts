import { describe, expect, it, vi } from 'vitest';
import { CommandCatalog } from '../../../../src/mapEditor/core/commands/CommandCatalog.ts';
import type { PluginModule } from '../../../../src/mapEditor/core/modules/PluginModule.ts';
import { PluginModuleRegistry } from '../../../../src/mapEditor/core/modules/PluginModuleRegistry.ts';
import { WindowPageRule } from '../../../../src/mapEditor/core/pageRule/WindowPageRule.ts';
import type { PluginsJsEntry } from '../../../../src/services/plugins/PluginsJsReader.ts';

/*
 * One window's page rule: what a new game starts with, seating nobody until the window reads it, and the conditions the
 * active plugin modules add as they stand when asked. Whoever draws by it hears when it changes: when the new game is
 * read seating another party, and when the modules switch on; reading the same party again changes nothing. A listener
 * that stops hears neither.
 */
describe('WindowPageRule', () =>
{
  /**
   * A module adding a page condition while J-TIME is enabled.
   */
  const TIME: PluginModule = {
    id: 'time',
    title: 'J-TIME',
    plugins: [ 'J-TIME' ],
    register: contributions => contributions.pageCondition({ id: 'time.pages', read: () => null }),
  };

  /**
   * J-TIME as js/plugins.js lists it.
   */
  const J_TIME: PluginsJsEntry = { name: 'j/time/J-TIME', status: true, description: '', parameters: {} };

  it('seats nobody until the new game is read, then the party read, with the conditions the modules add now', () =>
  {
    // Arrange.
    const modules = new PluginModuleRegistry(new CommandCatalog());
    const pages = new WindowPageRule(modules);
    const before = pages.rule();

    // Act: the modules switch on, and the new game is read.
    modules.activate([ TIME ], [ J_TIME ]);
    pages.setSave({ party: [ 1, 2 ] });

    // Assert.
    expect([ before.save, before.conditions, pages.save, pages.rule().conditions.map(condition => condition.id) ])
      .toStrictEqual([ { party: [] }, [], { party: [ 1, 2 ] }, [ 'time.pages' ] ]);
  });

  it('tells its listeners when the new game seats another party, and when the modules switch on, but not for the same party', () =>
  {
    // Arrange.
    const modules = new PluginModuleRegistry(new CommandCatalog());
    const pages = new WindowPageRule(modules);
    const listener = vi.fn();
    pages.subscribe(listener);

    // Act: a party, the same party again, a party in another order, and the modules switching on.
    pages.setSave({ party: [ 1, 2 ] });
    const afterFirst = listener.mock.calls.length;
    pages.setSave({ party: [ 1, 2 ] });
    const afterSame = listener.mock.calls.length;
    pages.setSave({ party: [ 2, 1 ] });
    modules.activate([ TIME ], [ J_TIME ]);

    // Assert.
    expect([ afterFirst, afterSame, listener.mock.calls.length ])
      .toStrictEqual([ 1, 1, 3 ]);
  });

  it('tells a listener that stopped nothing more', () =>
  {
    // Arrange.
    const modules = new PluginModuleRegistry(new CommandCatalog());
    const pages = new WindowPageRule(modules);
    const listener = vi.fn();
    const stop = pages.subscribe(listener);

    // Act.
    stop();
    pages.setSave({ party: [ 1 ] });
    modules.activate([ TIME ], [ J_TIME ]);

    // Assert.
    expect(listener.mock.calls.length)
      .toBe(0);
  });
});
