import { describe, expect, it } from 'vitest';
import { CommandCatalog } from '../../../src/mapEditor/core/commands/CommandCatalog.ts';
import type { TransferLandings } from '../../../src/mapEditor/core/locations/TransferLandings.ts';
import { PluginModuleRegistry } from '../../../src/mapEditor/core/modules/PluginModuleRegistry.ts';
import { registerCoreEventKinds } from '../../../src/mapEditor/services/coreEventKinds.ts';
import { TransferQuickPanel } from '../../../src/mapEditor/views/quickPanel/TransferQuickPanel.tsx';
import { event, oreChest, page, transferPage } from '../support/eventKindFixtures.ts';

/*
 * Every window starts with the core's kinds registered, each with its own quick panel, so the quick panel works in
 * any MZ project whatever its plugins. The registry then answers the kind of any event from them: the most specific
 * kind that recognises it, or none. Given the window's landings, transfers alone also mark the map where their landing
 * fails, and their panel says why; without them, as in a window with no project to read other maps from, no kind marks
 * anything.
 */
describe('registerCoreEventKinds', () =>
{
  it('registers the chest, transfer, dialogue and decor kinds, each with a panel of its own and no marks', () =>
  {
    // Arrange.
    const registry = new PluginModuleRegistry(new CommandCatalog());

    // Act.
    registerCoreEventKinds(registry);

    // Assert.
    expect(registry.eventKinds().map(kind => [ kind.id, kind.quickPanel?.displayName, kind.overlays ]))
      .toStrictEqual([
        [ 'core.chest', 'QuickPanel(core.chest)', undefined ],
        [ 'core.transfer', 'QuickPanel(core.transfer)', undefined ],
        [ 'core.dialogue', 'QuickPanel(core.dialogue)', undefined ],
        [ 'core.decor', 'QuickPanel(core.decor)', undefined ],
      ]);
  });

  it('gives transfers alone the marks of failing landings, on from the start, and a panel saying why, given the landings', () =>
  {
    // Arrange: the window's landings, which registering never asks anything of.
    const registry = new PluginModuleRegistry(new CommandCatalog());
    const landings = {} as TransferLandings;

    // Act.
    registerCoreEventKinds(registry, landings);

    // Assert.
    expect(registry.eventKinds().map(kind => [ kind.id, kind.quickPanel === TransferQuickPanel, (kind.overlays ?? []).map(overlay => [ overlay.id, overlay.defaultOn ]) ]))
      .toStrictEqual([
        [ 'core.chest', false, [] ],
        [ 'core.transfer', true, [ [ 'core.landings', true ] ] ],
        [ 'core.dialogue', false, [] ],
        [ 'core.decor', false, [] ],
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
