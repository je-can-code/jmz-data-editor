import { describe, expect, it } from 'vitest';
import { CommandCatalog } from '../../../src/mapEditor/core/commands/CommandCatalog.ts';
import { PluginModuleRegistry } from '../../../src/mapEditor/core/modules/PluginModuleRegistry.ts';
import { registerCoreEventKinds } from '../../../src/mapEditor/services/coreEventKinds.ts';
import { event, oreChest, page, transferPage } from '../support/eventKindFixtures.ts';

/*
 * Every window starts with the core's kinds registered, each with its own quick panel, so the quick panel works in
 * any MZ project whatever its plugins. The registry then answers the kind of any event from them: the most specific
 * kind that recognises it, or none.
 */
describe('registerCoreEventKinds', () =>
{
  it('registers the chest, transfer, dialogue and decor kinds, each with a panel of its own', () =>
  {
    // Arrange.
    const registry = new PluginModuleRegistry(new CommandCatalog());

    // Act.
    registerCoreEventKinds(registry);

    // Assert.
    expect(registry.eventKinds().map(kind => [ kind.id, kind.quickPanel?.displayName ]))
      .toStrictEqual([
        [ 'core.chest', 'QuickPanel(core.chest)' ],
        [ 'core.transfer', 'QuickPanel(core.transfer)' ],
        [ 'core.dialogue', 'QuickPanel(core.dialogue)' ],
        [ 'core.decor', 'QuickPanel(core.decor)' ],
      ]);
  });

  it('lets the registry name the kind of a chest, a transfer and a marker, and none for a battler', () =>
  {
    // Arrange.
    const registry = new PluginModuleRegistry(new CommandCatalog());
    registerCoreEventKinds(registry);
    const battler = event(4, [ page([ { code: 108, indent: 0, parameters: [ '<enemyId:3>' ] } ]) ]);

    // Act.
    const kinds = [ oreChest(1), event(2, [ transferPage() ]), event(3, [ page([]) ]), battler ].map(each => registry.kindOf(each, 1)?.id ?? null);

    // Assert.
    expect(kinds)
      .toStrictEqual([ 'core.chest', 'core.transfer', 'core.decor', null ]);
  });
});
