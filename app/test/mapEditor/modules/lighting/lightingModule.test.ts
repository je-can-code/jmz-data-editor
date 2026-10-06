import type { Container, Renderer } from 'pixi.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandCatalog } from '../../../../src/mapEditor/core/commands/CommandCatalog.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import { PluginModuleRegistry } from '../../../../src/mapEditor/core/modules/PluginModuleRegistry.ts';
import { isLight, lightingModule } from '../../../../src/mapEditor/modules/lighting/lightingModule.ts';
import { registerCoreEventKinds } from '../../../../src/mapEditor/services/coreEventKinds.ts';
import type { PluginsJsEntry } from '../../../../src/services/plugins/PluginsJsReader.ts';
import { command, event, page, text, transferPage } from '../../support/eventKindFixtures.ts';
import { buildMapJson } from '../../support/fixtures.ts';

/**
 * The colour of every solid fill the stand-in drawings were given, in order: one dot at each light.
 */
const stand = vi.hoisted(() => ({
  dots: [] as number[],
}));

// the rings draw through pixi's Graphics; a stand-in writes down the colour of each solid fill, which is the dot drawn
// at each light in the light's own colour, and leaves the rest of pixi as it is.
vi.mock('pixi.js', async importOriginal =>
{
  /**
   * Stands in for pixi's Graphics, keeping only the colour each light's dot is drawn in.
   */
  class Graphics
  {
    clear(): this
    {
      return this;
    }

    circle(): this
    {
      return this;
    }

    fill(style: { color: number; alpha: number }): this
    {
      if (style.alpha === 1)
      {
        stand.dots.push(style.color);
      }

      return this;
    }

    stroke(): this
    {
      return this;
    }

    destroy(): void
    {
      // nothing to let go of.
    }
  }

  return { ...await importOriginal<typeof import('pixi.js')>(), Graphics };
});

/*
 * A light is an event with a page whose comments give light, read by the same parser J-Lighting's tags are read with
 * everywhere in the editor (its own tests hold the rules): a reach in tiles, fractions allowed, then any of a colour,
 * an intensity and an effect, on any page (a torch that can be lit carries the tag on its lit page alone), any case.
 * The same words anywhere but a comment, a reach left out, or a map's ambient darkness make no light. The kind switches
 * on only while J-Lighting is enabled, ranks below the transfer a glowing door still is, and shows the light's symbol.
 *
 * While J-Lighting is enabled the module also draws each light's ring into the lighting layer, and reads the project's
 * config.lighting.json first, so a light naming no colour is drawn in the colour the project configures, or white for a
 * project without the file.
 */
describe('lightingModule', () =>
{
  beforeEach(() =>
  {
    stand.dots.splice(0);
  });

  /**
   * J-Lighting as js/plugins.js lists it.
   * @param {boolean} status Whether it is enabled.
   * @returns {PluginsJsEntry} The entry.
   */
  const lighting = (status: boolean): PluginsJsEntry => ({ name: 'j/lighting/J-Lighting', status, description: '', parameters: {} });

  /**
   * A window's registry with the core's kinds, and J-Lighting's module activated over the given plugin.
   * @param {PluginsJsEntry} plugin J-Lighting.
   * @param {ReadonlyMap<string, JsonValue | null>} configs The configs read before activating.
   * @returns {PluginModuleRegistry} The registry.
   */
  const registryWith = (plugin: PluginsJsEntry, configs: ReadonlyMap<string, JsonValue | null> = new Map()): PluginModuleRegistry =>
  {
    const registry = new PluginModuleRegistry(new CommandCatalog());
    registerCoreEventKinds(registry);
    registry.activate([ lightingModule ], [ plugin ], configs);
    return registry;
  };

  /**
   * Draws a map holding one light that names no colour, with the registry's light rings, and reads the colour its ring
   * is drawn in.
   * @param {PluginModuleRegistry} registry The registry.
   * @returns {number[]} The colour of the dot drawn at every light.
   */
  const ringColoursFrom = (registry: PluginModuleRegistry): number[] =>
  {
    const json = buildMapJson();
    json.events = [ null, { ...event(1, [ page([ command(108, [ '<light:[2]>' ]) ]) ]), x: 0, y: 0 } ];
    const [ rings ] = registry.lightingLayers();
    const drawing = rings.create({ layer: { addChild: () => undefined } as unknown as Container, tileSize: 48 });
    drawing.draw({ document: MapDocument.fromJson('map:1', json), renderer: {} as Renderer });
    return stand.dots;
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

    it('draws light rings into the lighting layer while J-Lighting is enabled, and nothing there while it is not', () =>
    {
      // Arrange: the module over J-Lighting on, and over J-Lighting off.

      // Act.
      const layers = [ registryWith(lighting(true)), registryWith(lighting(false)) ].map(registry => registry.lightingLayers().map(layer => layer.id));

      // Assert.
      expect(layers)
        .toStrictEqual([ [ 'lighting.rings' ], [] ]);
    });

    it('names the project\'s lighting config as the one config it reads', () =>
    {
      // Arrange: the module as the editor ships it.

      // Act.
      const { configs } = lightingModule;

      // Assert.
      expect(configs)
        .toStrictEqual([ 'lighting' ]);
    });

    it('draws a light naming no colour in the colour the project configures', () =>
    {
      // Arrange: a project whose lights are red unless their tags say otherwise.
      const config = { light: { radius: 5, color: '#ff0000', intensity: 0, effects: {} }, ambient: { color: '#000000' } } as unknown as JsonValue;
      const registry = registryWith(lighting(true), new Map([ [ 'lighting', config ] ]));

      // Act.
      const colours = ringColoursFrom(registry);

      // Assert.
      expect(colours)
        .toStrictEqual([ 0xff0000 ]);
    });

    it('draws a light naming no colour in white for a project without the config', () =>
    {
      // Arrange: the config could not be read.
      const registry = registryWith(lighting(true), new Map([ [ 'lighting', null ] ]));

      // Act.
      const colours = ringColoursFrom(registry);

      // Assert.
      expect(colours)
        .toStrictEqual([ 0xffffff ]);
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
      // Arrange: no brackets; no reach; a reach of nothing; a tag sharing its start; words after the tag; ambient
      // darkness; spoken in a message.
      const nearMisses = [
        event(1, [ page([ command(108, [ '<light:5>' ]) ]) ]),
        event(2, [ page([ command(108, [ '<light:[]>' ]) ]) ]),
        event(3, [ page([ command(108, [ '<light:[0]>' ]) ]) ]),
        event(4, [ page([ command(108, [ '<lights:[5]>' ]) ]) ]),
        event(5, [ page([ command(108, [ '<light:[5]> on the wall' ]) ]) ]),
        event(6, [ page([ command(108, [ '<ambient:[60]>' ]) ]) ]),
        event(7, [ page(text([ '<light:[5]>' ])) ]),
      ];

      // Act.
      const read = nearMisses.map(isLight);

      // Assert.
      expect(read)
        .toStrictEqual([ false, false, false, false, false, false, false ]);
    });
  });
});
