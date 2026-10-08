import { Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { CommandCatalog } from '../../../../src/mapEditor/core/commands/CommandCatalog.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { PluginModuleRegistry } from '../../../../src/mapEditor/core/modules/PluginModuleRegistry.ts';
import { MapWeather } from '../../../../src/mapEditor/modules/weather/mapWeather.ts';
import { MAP_WEATHER_ID, WEATHER_CONFIG_NOTICE_ID, weatherConfigNotice, weatherModule } from '../../../../src/mapEditor/modules/weather/weatherModule.ts';
import type { PluginsJsEntry } from '../../../../src/services/plugins/PluginsJsReader.ts';

/*
 * J-Weather's module switches on only while J-Weather is enabled in js/plugins.js, which is what offers every map view
 * its Weather switch: it then draws each map's own weather into the weather layer, from the project's
 * config.weather.json, which it reads before it switches on. A config the module cannot draw from (unread, in the
 * server's words where it gave any, or without its motions and its presets) is said over every map view, so a map shown
 * without its weather is never taken for one that has none; a config that serves says nothing.
 */
describe('weatherModule', () =>
{
  /**
   * A plugin as js/plugins.js lists it.
   * @param {string} name Its path.
   * @param {boolean} status Whether it is enabled.
   * @returns {PluginsJsEntry} The entry.
   */
  const plugin = (name: string, status = true): PluginsJsEntry => ({ name, status, description: '', parameters: {} });

  /**
   * A config the module can draw from.
   */
  const CONFIG = { motions: { fall: { edge: 'top' } }, presets: { snow: { stops: { moderate: [] } } } } as unknown as JsonValue;

  /**
   * Switches the module on, or not, over some plugins and configs.
   * @param {PluginsJsEntry[]} plugins The project's plugins.
   * @param {Map<string, JsonValue | null>} configs The configs read.
   * @param {Map<string, string>} problems Why any could not be read.
   * @returns {PluginModuleRegistry} The registry.
   */
  const activated = (plugins: PluginsJsEntry[], configs = new Map<string, JsonValue | null>([ [ 'weather', CONFIG ] ]), problems = new Map<string, string>()) =>
  {
    const registry = new PluginModuleRegistry(new CommandCatalog());
    registry.activate([ weatherModule ], plugins, configs, problems);
    return registry;
  };

  it('draws each map\'s weather into the weather layer while J-Weather is enabled, saying nothing of a config that serves', () =>
  {
    // Arrange.
    const plugins = [ plugin('j/weather/J-Weather') ];

    // Act.
    const registry = activated(plugins);

    // Assert.
    expect([ registry.isActive('weather'), registry.weatherLayers().map(layer => [ layer.id, layer.title ]), registry.notices() ])
      .toStrictEqual([ true, [ [ MAP_WEATHER_ID, 'Weather' ] ], [] ]);
  });

  it('stays off, drawing no weather, while J-Weather is listed but switched off, or not listed at all', () =>
  {
    // Arrange.
    const off = [ plugin('j/weather/J-Weather', false), plugin('j/lighting/J-Lighting') ];
    const absent = [ plugin('j/lighting/J-Lighting') ];

    // Act.
    const registries = [ activated(off), activated(absent) ];

    // Assert.
    expect(registries.map(registry => [ registry.isActive('weather'), registry.weatherLayers().length ]))
      .toStrictEqual([ [ false, 0 ], [ false, 0 ] ]);
  });

  it('makes a map\'s weather for each view, from the config it read', () =>
  {
    // Arrange.
    const [ layer ] = activated([ plugin('j/weather/J-Weather') ]).weatherLayers();

    // Act.
    const drawing = layer.create({ layer: new Container(), tileSize: 48 });

    // Assert.
    expect(drawing)
      .toBeInstanceOf(MapWeather);
  });

  it('says over every map view why the config could not be read, in the server\'s words, and draws no weather', () =>
  {
    // Arrange: the server refused the file.
    const configs = new Map<string, JsonValue | null>([ [ 'weather', null ] ]);
    const problems = new Map([ [ 'weather', 'decoding config.weather.json: json: unknown field "forecastFonts"' ] ]);

    // Act.
    const registry = activated([ plugin('j/weather/J-Weather') ], configs, problems);

    // Assert.
    expect([ registry.notices(), registry.weatherLayers().length ])
      .toStrictEqual([
        [ {
          id: WEATHER_CONFIG_NOTICE_ID,
          title: 'No weather is drawn until data/config.weather.json is fixed.',
          detail: 'It could not be read: decoding config.weather.json: json: unknown field "forecastFonts". This clears as soon as the file is fixed.',
        } ],
        1,
      ]);
  });

  describe('weatherConfigNotice', () =>
  {
    it('says a config was not read when nothing said why, and one without its motions or its presets needs them', () =>
    {
      // Arrange: an unread config, and one holding looks but no motions.
      const missing = { presets: {} } as unknown as JsonValue;

      // Act.
      const notices = [ weatherConfigNotice(null, undefined), weatherConfigNotice(missing, undefined), weatherConfigNotice(CONFIG, undefined) ];

      // Assert.
      expect(notices)
        .toStrictEqual([
          { id: WEATHER_CONFIG_NOTICE_ID, title: 'No weather is drawn until data/config.weather.json is fixed.', detail: 'It was not read. This clears as soon as the file is fixed.' },
          {
            id: WEATHER_CONFIG_NOTICE_ID,
            title: 'No weather is drawn until data/config.weather.json is fixed.',
            detail: 'It needs its motions and its presets, each a table by name. This clears as soon as the file is fixed.',
          },
          null,
        ]);
    });
  });
});
