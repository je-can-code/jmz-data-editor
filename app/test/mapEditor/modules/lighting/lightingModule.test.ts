import { Container, type Renderer, type Sprite } from 'pixi.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandCatalog } from '../../../../src/mapEditor/core/commands/CommandCatalog.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import { PluginModuleRegistry } from '../../../../src/mapEditor/core/modules/PluginModuleRegistry.ts';
import type { LightingLayerDefinition } from '../../../../src/mapEditor/core/renderer/lightingLayer.ts';
import { isLight, LIGHT_MASK_ID, LIGHT_RINGS_ID, lightingModule } from '../../../../src/mapEditor/modules/lighting/lightingModule.ts';
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
 * on only while J-Lighting is enabled, ranks below the transfer a glowing door still is, shows the light's symbol, and
 * gives a light the quick panel a single click shows (its own tests, and the quick panel host's, hold what it does).
 *
 * While J-Lighting is enabled the module also draws into the lighting layer a dark map's darkness, first, as what the
 * game itself shows (its own tests hold how), and each light's ring over it, as an aid. It reads the project's
 * config.lighting.json first, so a light naming no colour is drawn in the colour the project configures, or white for a
 * project without the file, which it then says over the map rather than leave the white to pass for the game's look; and
 * a map naming a colour of the dark it cannot use takes the project's.
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
    const rings = registry.lightingLayers().find(layer => layer.id === LIGHT_RINGS_ID) as LightingLayerDefinition;
    const drawing = rings.create({ layer: { addChild: () => undefined } as unknown as Container, tileSize: 48 });
    drawing.draw({ document: MapDocument.fromJson('map:1', json), renderer: {} as Renderer, context: 1 });
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

    it('gives a light the quick panel a single click shows, named after the kind', () =>
    {
      // Arrange: a lamp.
      const lamp = event(4, [ page([ command(108, [ '<light:[5]>' ]) ]) ]);

      // Act.
      const panel = registryWith(lighting(true)).kindOf(lamp, 3)?.quickPanel;

      // Assert.
      expect(panel?.displayName)
        .toBe('QuickPanel(lighting.light)');
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

    it('draws the dark and the light rings into the lighting layer while J-Lighting is enabled, and nothing there while it is not', () =>
    {
      // Arrange: the module over J-Lighting on, and over J-Lighting off.

      // Act.
      const layers = [ registryWith(lighting(true)), registryWith(lighting(false)) ].map(registry => registry.lightingLayers().map(layer => layer.id));

      // Assert.
      expect(layers)
        .toStrictEqual([ [ 'lighting.dark', 'lighting.rings' ], [] ]);
    });

    it('draws the dark first, as what the game itself shows, and the rings over it as an aid', () =>
    {
      // Arrange.
      const registry = registryWith(lighting(true));

      // Act.
      const layers = registry.lightingLayers().map(layer => [ layer.id, layer.shownInGame === true ]);

      // Assert.
      expect(layers)
        .toStrictEqual([ [ 'lighting.dark', true ], [ 'lighting.rings', false ] ]);
    });

    it('fills a dark map from its note, in the project\'s colour of the dark where the note names one it cannot use', () =>
    {
      // Arrange: a project whose dark falls back to slate, and a cave at 85% naming a colour with a typo.
      const config = { light: { radius: 5, color: '#ffffff', intensity: 0, effects: {} }, ambient: { color: '#102030' } } as unknown as JsonValue;
      const registry = registryWith(lighting(true), new Map([ [ 'lighting', config ] ]));
      const dark = registry.lightingLayers().find(layer => layer.id === LIGHT_MASK_ID) as LightingLayerDefinition;
      const layer = new Container();
      const drawing = dark.create({ layer, tileSize: 48 });
      const json = { ...buildMapJson(), note: '<ambient:[85, #10203g]>' };

      // Act.
      drawing.draw({ document: MapDocument.fromJson('map:1', json), renderer: {} as Renderer, context: 1 });

      // Assert: one piece, a plain fill of 85% slate.
      const [ root ] = layer.children;
      expect(root.children.map(piece => (piece as Sprite).tint))
        .toStrictEqual([ 0x34414f ]);
      drawing.destroy();
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

    it('says over the map why its lights draw in white when the config could not be read', () =>
    {
      // Arrange: the file is missing.
      const registry = new PluginModuleRegistry(new CommandCatalog());
      const problems = new Map([ [ 'lighting', 'open /game/data/config.lighting.json: no such file or directory' ] ]);

      // Act.
      registry.activate([ lightingModule ], [ lighting(true) ], new Map([ [ 'lighting', null ] ]), problems);

      // Assert.
      expect(registry.notices().map(notice => [ notice.id, notice.detail ]))
        .toStrictEqual([ [
          'lighting.config',
          'It could not be read: open /game/data/config.lighting.json: no such file or directory. This clears as soon as the file is fixed.',
        ] ]);
    });

    it('says nothing over the map when the config serves', () =>
    {
      // Arrange.
      const config = { light: { radius: 5, color: '#ff0000', intensity: 0, effects: {} }, ambient: { color: '#000000' } } as unknown as JsonValue;

      // Act.
      const registry = registryWith(lighting(true), new Map([ [ 'lighting', config ] ]));

      // Assert.
      expect(registry.notices())
        .toStrictEqual([]);
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
