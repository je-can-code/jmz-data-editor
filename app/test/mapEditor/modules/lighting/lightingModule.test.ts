import { describe, expect, it } from 'vitest';
import { CommandCatalog } from '../../../../src/mapEditor/core/commands/CommandCatalog.ts';
import { PluginModuleRegistry } from '../../../../src/mapEditor/core/modules/PluginModuleRegistry.ts';
import { isLight, lightingModule } from '../../../../src/mapEditor/modules/lighting/lightingModule.ts';
import { registerCoreEventKinds } from '../../../../src/mapEditor/services/coreEventKinds.ts';
import type { PluginsJsEntry } from '../../../../src/services/plugins/PluginsJsReader.ts';
import { command, event, page, text, transferPage } from '../../support/eventKindFixtures.ts';

/*
 * A light is an event with a page whose comments carry J-Lighting's light tag, read as J-Lighting reads it: a reach in
 * tiles, fractions allowed, then any of a colour, an intensity and an effect, on any page (a torch that can be lit
 * carries the tag on its lit page alone), any case, with one space allowed after the colon and after each comma. The
 * same words anywhere but a comment, a reach left out, or a map's ambient darkness make no light. The kind switches on
 * only while J-Lighting is enabled, ranks below the transfer a glowing door still is, and shows the light's symbol.
 */
describe('lightingModule', () =>
{
  /**
   * J-Lighting as js/plugins.js lists it.
   * @param {boolean} status Whether it is enabled.
   * @returns {PluginsJsEntry} The entry.
   */
  const lighting = (status: boolean): PluginsJsEntry => ({ name: 'j/lighting/J-Lighting', status, description: '', parameters: {} });

  /**
   * A window's registry with the core's kinds, and J-Lighting's module activated over the given plugin.
   * @param {PluginsJsEntry} plugin J-Lighting.
   * @returns {PluginModuleRegistry} The registry.
   */
  const registryWith = (plugin: PluginsJsEntry): PluginModuleRegistry =>
  {
    const registry = new PluginModuleRegistry(new CommandCatalog());
    registerCoreEventKinds(registry);
    registry.activate([ lightingModule ], [ plugin ]);
    return registry;
  };

  describe('lightingModule', () =>
  {
    it('claims a light with the light\'s symbol while J-Lighting is enabled, and nothing while it is not', () =>
    {
      // Arrange: a lamp, a comment and nothing more.
      const lamp = event(4, [ page([ command(108, [ '<light:[5]>' ]) ]) ]);

      // Act.
      const enabled = registryWith(lighting(true));
      const disabled = registryWith(lighting(false));

      // Assert.
      expect([ enabled.isActive('lighting'), enabled.kindOf(lamp, 3)?.id, enabled.kindOf(lamp, 3)?.marker, disabled.kindOf(lamp, 3) ])
        .toStrictEqual([ true, 'lighting.light', 'light', null ]);
    });

    it('leaves a glowing door the transfer it is', () =>
    {
      // Arrange: a door whose transfer page also gives light, which a transfer page allows.
      const door = event(7, [ transferPage([ 0, 5, 3, 4, 2, 0 ], [ command(108, [ '<light:[2, #ffbb73]>' ]) ]) ]);

      // Act.
      const kind = registryWith(lighting(true)).kindOf(door, 3);

      // Assert.
      expect(kind?.id)
        .toBe('core.transfer');
    });
  });

  describe('isLight', () =>
  {
    it('reads the light tag in a comment on any page, with its options in any order and one space where allowed', () =>
    {
      // Arrange: a reach alone; colour and effect; spaced, with a fractional reach; on a lit second page alone; in
      // capitals on a comment's second line.
      const lights = [
        event(1, [ page([ command(108, [ '<light:[5]>' ]) ]) ]),
        event(2, [ page([ command(108, [ '<light:[6, #ffbb73, flicker]>' ]) ]) ]),
        event(3, [ page([ command(108, [ '<light: [4.5, #ffdca8, 90, flicker]>' ]) ]) ]),
        event(4, [ page([]), page([ command(108, [ '<light:[3,pulse]>' ]) ]) ]),
        event(5, [ page([ command(108, [ '<hourRangePage:[18, 6]>' ]), command(408, [ '<LIGHT:[2]>' ]) ]) ]),
      ];

      // Act.
      const read = lights.map(isLight);

      // Assert.
      expect(read)
        .toStrictEqual([ true, true, true, true, true ]);
    });

    it('makes no light of a tag J-Lighting would not read, a map\'s darkness, or the tag anywhere but a comment', () =>
    {
      // Arrange: no brackets; no reach; a tag sharing its start; ambient darkness; spoken in a message.
      const nearMisses = [
        event(1, [ page([ command(108, [ '<light:5>' ]) ]) ]),
        event(2, [ page([ command(108, [ '<light:[]>' ]) ]) ]),
        event(3, [ page([ command(108, [ '<lights:[5]>' ]) ]) ]),
        event(4, [ page([ command(108, [ '<ambient:[60]>' ]) ]) ]),
        event(5, [ page(text([ '<light:[5]>' ])) ]),
      ];

      // Act.
      const read = nearMisses.map(isLight);

      // Assert.
      expect(read)
        .toStrictEqual([ false, false, false, false, false ]);
    });
  });
});
