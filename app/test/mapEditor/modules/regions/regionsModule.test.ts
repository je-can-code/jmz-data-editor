import { describe, expect, it } from 'vitest';
import { CommandCatalog } from '../../../../src/mapEditor/core/commands/CommandCatalog.ts';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { RmmzTileset } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { PluginModuleRegistry } from '../../../../src/mapEditor/core/modules/PluginModuleRegistry.ts';
import { regionsModule } from '../../../../src/mapEditor/modules/regions/regionsModule.ts';
import { SHIPPED_MODULES } from '../../../../src/mapEditor/services/pluginModules.ts';
import type { PluginsJsEntry } from '../../../../src/services/plugins/PluginsJsReader.ts';
import { buildMapJson } from '../../support/fixtures.ts';

/*
 * J-RegionEffects' module switches on with the plugin and adds one passability rule, read from the plugin's parameters
 * as js/plugins.js holds them, so the Passability overlay, route previews and landings all forbid what the game forbids
 * while the plugin is on, and nothing once it is off. It ships with the editor.
 */
describe('regionsModule', () =>
{
  /**
   * J-RegionEffects as Chef Adventure lists it, enabled or not.
   * @param {boolean} status Whether it is enabled.
   * @returns {PluginsJsEntry} The entry.
   */
  const plugin = (status: boolean): PluginsJsEntry => ({
    name: 'j/regions/J-RegionEffects',
    status,
    description: '',
    parameters: { globalAllowRegions: '[]', globalDenyRegions: '["10"]', globalDenyTerrainTags: '["1"]' },
  });

  it('adds its rule while the plugin is enabled, read from the plugin\'s parameters', () =>
  {
    // Arrange: region 10 at 2, 1 of the fixture's 3 by 2 map.
    const registry = new PluginModuleRegistry(new CommandCatalog());
    const json = buildMapJson();
    json.data = json.data.map((tile, index) => (index === 5 * 6 + 1 * 3 + 2 ? 10 : tile));
    const map = MapDocument.fromJson('map:1', json);
    const tileset: RmmzTileset = { id: 4, flags: new Array(40).fill(0), mode: 1, name: 'Open', note: '', tilesetNames: [] };

    // Act.
    registry.activate([ regionsModule ], [ plugin(true) ]);

    // Assert: one rule, refusing the step from 1, 1 onto region 10.
    const rules = registry.passabilityRules();
    expect([ registry.isActive('regions'), rules.map(rule => rule.id), rules[0].deny({ document: map, tileset, x: 1, y: 1, direction: 6, tiles: [ 1 ] }) ])
      .toStrictEqual([ true, [ 'regions.passage' ], 'Region 10 keeps everyone out.' ]);
  });

  it('adds nothing while the plugin is disabled', () =>
  {
    // Arrange.
    const registry = new PluginModuleRegistry(new CommandCatalog());

    // Act.
    registry.activate([ regionsModule ], [ plugin(false) ]);

    // Assert.
    expect([ registry.isActive('regions'), registry.passabilityRules() ])
      .toStrictEqual([ false, [] ]);
  });

  it('ships with the editor', () =>
  {
    // Arrange: nothing beyond the modules the editor ships.

    // Act.
    const shipped = SHIPPED_MODULES.includes(regionsModule);

    // Assert.
    expect(shipped)
      .toBe(true);
  });
});
