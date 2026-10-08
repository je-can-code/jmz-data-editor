import { Container, type Particle, type ParticleContainer, type WebGLRenderer } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import type { ImageFolder } from '../../../../src/mapEditor/core/api/MapEditorApi.ts';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { TextureImage, TextureSource, WorldRect } from '../../../../src/mapEditor/core/renderer/MapRenderer.ts';
import type { SkyWeather, WeatherFrame, WeatherStage } from '../../../../src/mapEditor/core/renderer/weatherLayer.ts';
import { MapWeather, pictureName, weatherRectFor } from '../../../../src/mapEditor/modules/weather/mapWeather.ts';
import type { WeatherConfigFile } from '../../../../src/mapEditor/modules/weather/weatherConfig.ts';
import type { CanvasMaker } from '../../../../src/mapEditor/modules/weather/weatherPictures.ts';
import { buildMapJson } from '../../support/fixtures.ts';

/*
 * A map's own weather is drawn as J-Weather draws it: the look the map's note names, each of its layers a batch of
 * particles blended as the layer says, moved exactly as the plugin moves them, settled on arrival, and drawn with the
 * project's own pictures once they arrive, one sprite per particle, centred, tinted as the layer is. An opt-out, a map
 * naming no look, and a look the config does not know draw nothing; a layer whose picture the project lacks draws
 * nothing and says so, and a layer whose stage names no picture draws that stage as nothing, as the game draws its empty
 * picture. A raindrop and its ripple are laid side by side on one canvas, so a layer draws in one batch.
 *
 * The weather falls over the part of the map the view shows, sitting where that part begins and thick as the game's for
 * its size; a view panning or zooming moves and resizes it. It falls a step every engine frame while the view animates,
 * catching up at most three in one tick, and holds still where it is while the view does not animate, picking up again
 * from there without the frames it was held for. Drawn again for a change that leaves the map's weather as it was, it
 * keeps falling from where it was; a note naming another look, or another map, starts it over.
 */
describe('MapWeather', () =>
{
  /**
   * A config with snow falling straight down, embers rising and glowing, rain that lands as a ripple, a storm whose
   * drops land on no picture, and clouds that darken.
   */
  const CONFIG: WeatherConfigFile = {
    motions: {
      fall: { edge: 'top', speedX: 0, speedY: 4, jitterX: 0, jitterY: 3, roll: 0, growth: 0, fadeIn: 25, staggerFrames: 120 },
      rise: { edge: 'bottom', speedX: 0.15, speedY: -1.2, jitterX: 0.5, jitterY: 0.5, sway: 30, swayRate: 0.04, roll: 0.006, growth: 0, fadeIn: 10, staggerFrames: 150 },
      raindrop: { edge: 'top', speedX: 0, speedY: 4, jitterX: 0, jitterY: 3, becomes: 'ripple', life: 30, lifeJitter: 132, fadeIn: 25, fadeOut: 40, roll: 0, growth: 0, staggerFrames: 120 },
      ripple: { edge: 'anywhere', speedX: 0, speedY: 0, jitterX: 0, jitterY: 0, life: 26, fadeIn: 60, fadeOut: 12, roll: 0, growth: 0.011, staggerFrames: 0 },
      overcast: { edge: 'leading', speedX: 1.1, speedY: 0, jitterX: 0.9, jitterY: 0.1, tilt: 1, stretch: 0.4, roll: 0, growth: 0, fadeIn: 3, staggerFrames: 60, margin: 320, entryDepth: 620 },
    },
    presets: {
      snow: { stops: { moderate: [ { motion: 'fall', asset: 'Snow_01', density: 20, speed: 100, scale: 100, blend: 'normal' } ] } },
      embers: {
        stops: {
          moderate: [
            { motion: 'rise', asset: 'Light_01C', density: 10, speed: 140, scale: 30, blend: 'additive', tint: '#ffd070' },
            { motion: 'fall', asset: 'Snow_01', density: 5, speed: 30, scale: 30, blend: 'normal' },
          ],
          heavy: [ { motion: 'rise', asset: 'Light_01C', density: 40, speed: 140, scale: 40, blend: 'additive' } ],
        },
      },
      rain: { stops: { moderate: [ { motion: 'raindrop', asset: 'Rain_01A', density: 30, speed: 170, scale: 100, blend: 'normal', becomesAsset: 'Particles', becomesScale: 9 } ] } },
      storm: { stops: { moderate: [ { motion: 'raindrop', asset: 'Rain_01A', density: 30, speed: 200, scale: 100, blend: 'normal' } ] } },
      clouds: { stops: { moderate: [ { motion: 'overcast', asset: 'Cloud_04C', density: 5, speed: 60, scale: 460, blend: 'multiply', opacity: 21 } ] } },
      lost: { stops: { moderate: [ { motion: 'fall', asset: 'Nowhere', density: 5, speed: 100, scale: 100, blend: 'normal' } ] } },
    },
  };

  /**
   * The default window in world pixels: a 17 by 13 map.
   */
  const WINDOW: WorldRect = { x: 0, y: 0, width: 816, height: 624 };

  /**
   * The pictures the project holds, by name, with their sizes.
   */
  const PICTURES: Readonly<Record<string, readonly [ number, number ]>> = {
    Snow_01: [ 32, 32 ],
    Light_01C: [ 36, 36 ],
    Rain_01A: [ 18, 36 ],
    Particles: [ 64, 64 ],
    Cloud_04C: [ 300, 200 ],
  };

  /**
   * A project's pictures, answering by name with a stand-in of the picture's size, null for one it lacks, and writing
   * down every one asked for.
   * @returns {{ images: TextureSource, asked: string[] }} The source, and what it was asked for.
   */
  const projectPictures = () =>
  {
    const asked: string[] = [];
    const images: TextureSource = {
      image: (folder: ImageFolder, name: string) =>
      {
        asked.push(`${folder}/${name}`);
        const size = PICTURES[name];
        return Promise.resolve(size === undefined ? null : { width: size[0], height: size[1] } as unknown as TextureImage);
      },
    };
    return { images, asked };
  };

  /**
   * A canvas whose drawing is written down, for a layer laid with its stage's picture.
   * @returns {{ makeCanvas: CanvasMaker, drawn: string[] }} The maker, and what was drawn on its canvases.
   */
  const recordingCanvases = () =>
  {
    const drawn: string[] = [];
    const makeCanvas: CanvasMaker = () =>
    {
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => ({
          drawImage: (image: { width: number }, x: number, y: number) => drawn.push(`${image.width} wide at ${x},${y} on ${canvas.width}x${canvas.height}`),
        }),
      };
      return canvas as unknown as HTMLCanvasElement;
    };
    return { makeCanvas, drawn };
  };

  /**
   * Builds a 17 by 13 map with a note.
   * @param {string} note The note.
   * @param {number} mapId The map's id.
   * @returns {MapDocument} The map.
   */
  const mapWith = (note: string, mapId = 7): MapDocument =>
  {
    return MapDocument.fromJson(`map:${mapId}`, { ...buildMapJson(), width: 17, height: 13, data: new Array(17 * 13 * 6).fill(0), note });
  };

  /**
   * A renderer that can already draw particle containers, as one made after the weather's code loaded can; nothing here
   * draws with it.
   */
  const PIPED_RENDERER = { renderPipes: { particle: {} } } as unknown as WebGLRenderer;

  /**
   * Builds what a frame hands the weather.
   * @param {MapDocument} document The map.
   * @param {{ frames?: number, animating?: boolean, view?: WorldRect, images?: TextureSource | null, sky?: SkyWeather | null }} options The rest.
   * @returns {WeatherFrame} The frame.
   */
  const frame = (
    document: MapDocument,
    options: { frames?: number; animating?: boolean; view?: WorldRect; images?: TextureSource | null; sky?: SkyWeather | null } = {}): WeatherFrame => ({
    document,
    renderer: PIPED_RENDERER,
    context: 1,
    clock: { frames: options.frames ?? 0, animating: options.animating ?? true },
    view: options.view ?? WINDOW,
    images: options.images === undefined ? projectPictures().images : options.images,
    sky: options.sky ?? null,
  });

  /**
   * Builds a weather drawing on a stage of its own.
   * @param {CanvasMaker | undefined} makeCanvas Makes the canvases a layer and its stage are laid on.
   * @param {WeatherConfigFile | null} config The config.
   * @returns {{ weather: MapWeather, stage: WeatherStage }} The drawing and its stage.
   */
  const weatherOn = (makeCanvas?: CanvasMaker, config: WeatherConfigFile | null = CONFIG) =>
  {
    const stage: WeatherStage = { layer: new Container(), tileSize: 48 };
    return { weather: new MapWeather(stage, config, makeCanvas), stage };
  };

  /**
   * Lets the pictures asked for arrive.
   * @returns {Promise<void>} Settles once they have.
   */
  const pictures = (): Promise<void> => new Promise(resolve =>
  {
    setTimeout(resolve, 0);
  });

  /**
   * The batches a stage holds, one per layer.
   * @param {WeatherStage} stage The stage.
   * @returns {ParticleContainer<Particle>[]} The batches.
   */
  const batchesOf = (stage: WeatherStage): ParticleContainer<Particle>[] => stage.layer.children as ParticleContainer<Particle>[];

  /**
   * Where every particle of a stage's batches is drawn.
   * @param {WeatherStage} stage The stage.
   * @returns {number[][]} Each particle's place.
   */
  const placesOf = (stage: WeatherStage): number[][] => batchesOf(stage).flatMap(batch => batch.particleChildren.map(each => [ each.x, each.y ]));

  describe('draw', () =>
  {
    it('draws nothing on a map naming no look, nor on one opting out', () =>
    {
      // Arrange.
      const plain = weatherOn();
      const opted = weatherOn();

      // Act.
      plain.weather.draw(frame(mapWith('')));
      opted.weather.draw(frame(mapWith('<weather:snow>\n<noWeather>')));

      // Assert.
      expect([ plain.stage.layer.children.length, opted.stage.layer.children.length, (opted.weather.describe() as { weather: unknown }).weather ])
        .toStrictEqual([ 0, 0, null ]);
    });

    it('builds a batch for each of the look\'s layers, blended as each says, where the shown part of the map begins', () =>
    {
      // Arrange: the view showing the map from 96 in and 48 down, past its bottom-right corner.
      const { weather, stage } = weatherOn();
      const view = { x: 96, y: 48, width: 816, height: 624 };

      // Act.
      weather.draw(frame(mapWith('<weather:embers>'), { view }));

      // Assert: an additive batch then a normal one, both at the shown part's corner; the part is 720 by 576.
      const batches = batchesOf(stage);
      expect([ batches.map(batch => batch.blendMode), batches.map(batch => [ batch.x, batch.y ]), (weather.describe() as { screen: unknown }).screen ])
        .toStrictEqual([ [ 'add', 'normal' ], [ [ 96, 48 ], [ 96, 48 ] ], { x: 96, y: 48, width: 720, height: 576 } ]);
    });

    it('draws a darkening layer multiplied, and a look at the sky\'s strength under open sky', () =>
    {
      // Arrange: clouds, and embers named on an outdoor map under a heavy sky.
      const clouds = weatherOn();
      const embers = weatherOn();

      // Act.
      clouds.weather.draw(frame(mapWith('<weather:clouds>')));
      embers.weather.draw(frame(mapWith('<weather:embers>'), { sky: { preset: 'clear', intensity: 'heavy' } }));

      // Assert: the heavy rung has one layer, of 40 to the default window.
      const heavy = embers.weather.describe() as { weather: unknown; layers: { stats: { count: number } }[] };
      expect([ batchesOf(clouds.stage)[0].blendMode, heavy.weather, heavy.layers.map(layer => layer.stats.count) ])
        .toStrictEqual([ 'multiply', { preset: 'embers', intensity: 'heavy' }, [ 40 ] ]);
    });

    it('fits each layer with its pictures once they arrive: a particle each, centred, tinted as the layer is', async () =>
    {
      // Arrange.
      const { images, asked } = projectPictures();
      const { weather, stage } = weatherOn();
      const map = mapWith('<weather:embers>');
      weather.draw(frame(map, { images }));
      const before = batchesOf(stage).map(batch => batch.particleChildren.length);

      // Act.
      await pictures();
      const shown = weather.tick(frame(map, { images }));

      // Assert: ten and five particles for the default window; the embers tinted, the snow not.
      const [ glow, snow ] = batchesOf(stage);
      expect([ before, asked, shown, [ glow.particleChildren.length, snow.particleChildren.length ], glow.particleChildren[0].anchorX, glow.particleChildren[0].tint, snow.particleChildren[0].tint ])
        .toStrictEqual([ [ 0, 0 ], [ 'weather/Light_01C', 'weather/Snow_01' ], true, [ 10, 5 ], 0.5, 0xffd070, 0xffffff ]);
    });

    it('keeps the weather it shows when drawn again for a change that leaves the weather as it was', async () =>
    {
      // Arrange: snow, its pictures in, then moved on a frame.
      const { weather, stage } = weatherOn();
      const map = mapWith('<weather:snow>');
      weather.draw(frame(map));
      await pictures();
      weather.tick(frame(map, { frames: 1 }));
      const [ batch ] = batchesOf(stage);
      const places = placesOf(stage);

      // Act: drawn again at the same frame, as after an event was edited.
      weather.draw(frame(map, { frames: 1 }));

      // Assert: the same batch, every particle where it was.
      expect([ batchesOf(stage)[0], placesOf(stage) ])
        .toStrictEqual([ batch, places ]);
    });

    it('starts over when the note names another look, and on another map', () =>
    {
      // Arrange.
      const { weather, stage } = weatherOn();
      weather.draw(frame(mapWith('<weather:snow>')));
      const [ first ] = batchesOf(stage);

      // Act: another look, then the same look on another map.
      weather.draw(frame(mapWith('<weather:embers>')));
      const looks = batchesOf(stage).length;
      weather.draw(frame(mapWith('<weather:snow>', 8)));

      // Assert: the first batch let go, two for the embers, then one for the snow afresh.
      expect([ first.destroyed, looks, batchesOf(stage).length, batchesOf(stage)[0] === first ])
        .toStrictEqual([ true, 2, 1, false ]);
    });

    it('draws nothing for a look the config does not know, nor with no config, and says why', () =>
    {
      // Arrange.
      const unknown = weatherOn();
      const unread = weatherOn(undefined, null);

      // Act.
      unknown.weather.draw(frame(mapWith('<weather:Snow>')));
      unread.weather.draw(frame(mapWith('<weather:snow>')));

      // Assert.
      const said = [ unknown.weather.describe(), unread.weather.describe() ] as { problem: string; layers: unknown[] }[];
      expect(said.map(each => [ each.problem, each.layers.length ]))
        .toStrictEqual([ [ 'no weather preset named Snow', 0 ], [ 'the weather config could not be read', 0 ] ]);
    });
  });

  describe('pictures', () =>
  {
    it('lays a drop and its ripple side by side on one canvas, a gap between, and cuts each out at its own size', async () =>
    {
      // Arrange.
      const { makeCanvas, drawn } = recordingCanvases();
      const { weather } = weatherOn(makeCanvas);
      weather.draw(frame(mapWith('<weather:rain>')));

      // Act.
      await pictures();

      // Assert: an 18 by 36 drop and a 64 by 64 ripple on an 84 by 64 canvas.
      const [ layer ] = (weather.describe() as { layers: { pictureSize: unknown; becomesPictureSize: unknown }[] }).layers;
      expect([ drawn, layer.pictureSize, layer.becomesPictureSize ])
        .toStrictEqual([ [ '18 wide at 0,0 on 84x64', '64 wide at 20,0 on 84x64' ], [ 18, 36 ], [ 64, 64 ] ]);
    });

    it('draws a stage that names no picture as nothing, as the game draws its empty picture, its drops still falling', async () =>
    {
      // Arrange: a storm whose drops become ripples with no picture, run until some have landed.
      const { weather, stage } = weatherOn();
      const map = mapWith('<weather:storm>');
      weather.draw(frame(map));
      await pictures();

      // Act.
      for (let frames = 1; frames <= 40; frames++)
      {
        weather.tick(frame(map, { frames }));
      }

      // Assert: some particles are ripples, every ripple draws at nothing, and some drops draw.
      const [ batch ] = batchesOf(stage);
      const [ described ] = (weather.describe() as { layers: { stats: { secondLife: number }; becomesPictureSize: unknown }[] }).layers;
      const ripples = batch.particleChildren.filter(each => each.scaleX !== 1);
      expect([ described.stats.secondLife > 0, ripples.length > 0, described.becomesPictureSize, ripples.every(each => each.alpha === 0), batch.particleChildren.some(each => each.alpha > 0) ])
        .toStrictEqual([ true, true, null, true, true ]);
    });

    it('says when the project lacks a layer\'s picture, and draws that layer as nothing', async () =>
    {
      // Arrange.
      const { weather, stage } = weatherOn();
      const map = mapWith('<weather:lost>');
      weather.draw(frame(map));

      // Act.
      await pictures();
      weather.tick(frame(map, { frames: 1 }));

      // Assert.
      const [ layer ] = (weather.describe() as { layers: { problem: string }[] }).layers;
      expect([ layer.problem, batchesOf(stage)[0].particleChildren.length ])
        .toStrictEqual([ 'img/weather/Nowhere.png is missing', 0 ]);
    });

    it('names the empty picture for a layer naming none, and the picture by its name otherwise', () =>
    {
      // Arrange.
      const names = [ undefined, '', 'Rain_01A' ];

      // Act.
      const named = names.map(pictureName);

      // Assert.
      expect(named)
        .toStrictEqual([ null, null, 'Rain_01A' ]);
    });
  });

  describe('tick', () =>
  {
    it('moves the weather on a step for every engine frame since the last, while the view animates', async () =>
    {
      // Arrange: the same snow twice, one moved on a frame at a time and one asked for two frames at once.
      const one = weatherOn();
      const two = weatherOn();
      const map = mapWith('<weather:snow>');
      one.weather.draw(frame(map));
      two.weather.draw(frame(map));
      await pictures();
      const before = placesOf(one.stage);

      // Act.
      const moved = [ one.weather.tick(frame(map, { frames: 1 })), one.weather.tick(frame(map, { frames: 2 })) ];
      two.weather.tick(frame(map, { frames: 2 }));

      // Assert: both moved, and both landed in the same places.
      expect([ moved, placesOf(one.stage).length > 0, placesOf(one.stage) === before, placesOf(two.stage) ])
        .toStrictEqual([ [ true, true ], true, false, placesOf(one.stage) ]);
    });

    it('catches up on no more than three frames in one tick', async () =>
    {
      // Arrange: the same snow twice.
      const held = weatherOn();
      const three = weatherOn();
      const map = mapWith('<weather:snow>');
      held.weather.draw(frame(map));
      three.weather.draw(frame(map));
      await pictures();

      // Act: one ten frames on at once, the other three.
      held.weather.tick(frame(map, { frames: 10 }));
      three.weather.tick(frame(map, { frames: 3 }));

      // Assert.
      expect(placesOf(held.stage))
        .toStrictEqual(placesOf(three.stage));
    });

    it('holds the weather still while the view does not animate, and picks up from there without the frames held', async () =>
    {
      // Arrange: snow with its pictures in and drawn once, beside a twin that is never held.
      const held = weatherOn();
      const free = weatherOn();
      const map = mapWith('<weather:snow>');
      held.weather.draw(frame(map));
      free.weather.draw(frame(map));
      await pictures();
      held.weather.tick(frame(map, { frames: 0 }));
      const still = placesOf(held.stage);

      // Act: twenty frames go by with the Animate switch off, then one with it on again.
      const whileHeld = held.weather.tick(frame(map, { frames: 20, animating: false }));
      const heldPlaces = placesOf(held.stage);
      const afterwards = held.weather.tick(frame(map, { frames: 21 }));
      free.weather.tick(frame(map, { frames: 1 }));

      // Assert: nothing moved while held, and the next frame moved it one step, as the twin's first.
      expect([ whileHeld, heldPlaces, afterwards, placesOf(held.stage) ])
        .toStrictEqual([ false, still, true, placesOf(free.stage) ]);
    });

    it('follows the view: moves where the shown part of the map begins, and fits its population to a smaller part', () =>
    {
      // Arrange: snow over the whole map.
      const { weather, stage } = weatherOn();
      const map = mapWith('<weather:snow>');
      weather.draw(frame(map));
      const count = () => (weather.describe() as { layers: { stats: { count: number } }[] }).layers[0].stats.count;
      const before = count();

      // Act: the view zoomed in on the map's middle, showing a quarter of it.
      const moved = weather.tick(frame(map, { view: { x: 204, y: 156, width: 408, height: 312 } }));

      // Assert: twenty for the whole map, five for a quarter of it, at the quarter's corner.
      expect([ moved, before, count(), batchesOf(stage).map(batch => [ batch.x, batch.y ]) ])
        .toStrictEqual([ true, 20, 5, [ [ 204, 156 ] ] ]);
    });

    it('has nothing to move while the map shows no weather', () =>
    {
      // Arrange.
      const { weather } = weatherOn();
      const map = mapWith('');
      weather.draw(frame(map));

      // Act.
      const moved = weather.tick(frame(map, { frames: 1 }));

      // Assert.
      expect(moved)
        .toBe(false);
    });
  });

  describe('weatherRectFor', () =>
  {
    it('is the part of the map a view shows, or none for a view beside the map', () =>
    {
      // Arrange: a view over the middle, one hanging off the top-left corner, and one wholly to the right.
      const views: WorldRect[] = [ { x: 10, y: 20, width: 100, height: 50 }, { x: -50, y: -30, width: 100, height: 100 }, { x: 900, y: 0, width: 100, height: 100 } ];

      // Act.
      const parts = views.map(view => weatherRectFor(view, 816, 624));

      // Assert.
      expect(parts)
        .toStrictEqual([ { x: 10, y: 20, width: 100, height: 50 }, { x: 0, y: 0, width: 50, height: 70 }, null ]);
    });
  });

  it('lets every batch go', () =>
  {
    // Arrange.
    const { weather, stage } = weatherOn();
    weather.draw(frame(mapWith('<weather:embers>')));
    const batches = batchesOf(stage);

    // Act.
    weather.destroy();

    // Assert.
    expect([ batches.every(batch => batch.destroyed), stage.layer.children.length ])
      .toStrictEqual([ true, 0 ]);
  });
});
