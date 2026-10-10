import { describe, expect, it } from 'vitest';
import { CommandCatalog } from '../../../../src/mapEditor/core/commands/CommandCatalog.ts';
import { PluginModuleRegistry } from '../../../../src/mapEditor/core/modules/PluginModuleRegistry.ts';
import { pixelModule } from '../../../../src/mapEditor/modules/pixel/pixelModule.ts';
import { SHIPPED_MODULES } from '../../../../src/mapEditor/services/pluginModules.ts';
import type { PluginsJsEntry } from '../../../../src/services/plugins/PluginsJsReader.ts';
import { command, page } from '../../support/eventKindFixtures.ts';

/*
 * J-Pixelistics' module switches on with the plugin and gives event pages their areas, read as the plugin reads them,
 * so every map view draws each event's area and a click inside one picks its event, while the plugin is on, and no page
 * covers more than its own tile once it is off. A near namesake, such as its J-ABS extension, switches nothing on alone.
 * It ships with the editor.
 */
describe('pixelModule', () =>
{
  /**
   * A plugin as Chef Adventure's js/plugins.js lists it, enabled or not.
   * @param {string} name The path-like name.
   * @param {boolean} status Whether it is enabled.
   * @returns {PluginsJsEntry} The entry.
   */
  const plugin = (name: string, status: boolean): PluginsJsEntry => ({ name, status, description: '', parameters: {} });

  /**
   * A page covering five tiles by one.
   */
  const WIDE = page([ command(108, [ '<areaEvent:[5, 1]>' ]) ]);

  it('reads pages\' areas while the plugin is enabled', () =>
  {
    // Arrange.
    const registry = new PluginModuleRegistry(new CommandCatalog());

    // Act.
    registry.activate([ pixelModule ], [ plugin('j/pixel/J-Pixelistics', true) ]);

    // Assert.
    expect([ registry.isActive('pixel'), registry.eventAreas().map(reader => reader.id), registry.areaOf(WIDE) ])
      .toStrictEqual([ true, [ 'pixel.area' ], { width: 5, height: 1 } ]);
  });

  it('reads no area while the plugin is disabled, even with its J-ABS extension enabled', () =>
  {
    // Arrange.
    const registry = new PluginModuleRegistry(new CommandCatalog());

    // Act.
    registry.activate([ pixelModule ], [ plugin('j/pixel/J-Pixelistics', false), plugin('j/pixel/ext/J-Pixel-ABS', true) ]);

    // Assert.
    expect([ registry.isActive('pixel'), registry.eventAreas(), registry.areaOf(WIDE) ])
      .toStrictEqual([ false, [], null ]);
  });

  it('ships with the editor', () =>
  {
    // Arrange: nothing beyond the modules the editor ships.

    // Act.
    const shipped = SHIPPED_MODULES.includes(pixelModule);

    // Assert.
    expect(shipped)
      .toBe(true);
  });
});
