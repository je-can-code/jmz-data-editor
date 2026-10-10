import { Particle, ParticleContainer, type BLEND_MODES } from 'pixi.js';
import type { JsonValue } from '../../core/model/json.ts';
import type { TextureImage, TextureSource, WorldRect } from '../../core/renderer/MapRenderer.ts';
import type { WeatherDrawing, WeatherFrame, WeatherStage } from '../../core/renderer/weatherLayer.ts';
import { climatesFrom, type ClimateTables } from './climateCurves.ts';
import { ensureParticlePipe } from './particlePipe.ts';
import type { WeatherConfigFile } from './weatherConfig.ts';
import { WeatherField } from './weatherField.ts';
import { glowFor, type WeatherParticle } from './weatherMotion.ts';
import { layerPicturesFor, pageCanvas, releasePictures, type CanvasMaker, type LayerPictures } from './weatherPictures.ts';
import { layersFor, type WeatherLayer } from './weatherPresets.ts';
import { seededRoller, weatherSeed } from './weatherRandom.ts';
import { isSameWeather, resolveWeather, type ResolvedWeather } from './weatherResolver.ts';
import { layerStatsOf } from './weatherStats.ts';
import { weatherDeclarationOf } from './weatherTags.ts';

/**
 * How an authored blend names the renderer's own (Sprite_WeatherLayer.Blends): normal, additive and multiply, which the
 * engine's 0, 1 and 2 are, blending as pixi's normal, add and multiply do.
 */
const BLENDS: Readonly<Record<string, BLEND_MODES>> = {
  normal: 'normal',
  additive: 'add',
  multiply: 'multiply',
};

/**
 * The most engine frames the weather catches up on in one tick: the game smooths its own frame count, so a view that was
 * held up, or behind another tab, moves its weather on a little rather than all at once.
 */
const MOST_STEPS_A_TICK = 3;

/**
 * One layer of the weather on show: its population, its batch of pictures on the map, the particles drawing it, and its
 * pictures once they have loaded.
 */
type ShownLayer = {
  readonly field: WeatherField;
  readonly container: ParticleContainer;
  readonly sprites: Particle[];
  pictures: LayerPictures | null;

  /**
   * Why the layer draws nothing, such as a picture the project lacks; empty while it draws.
   */
  problem: string;
};

/**
 * Names the picture a layer or its stage draws with, as ImageManager#loadBitmap takes a name: an empty name, or none at
 * all, is the empty picture, which draws nothing.
 * @param {string | undefined} asset The picture's name in img/weather, as the config gives it.
 * @returns {string | null} The name, or null for the empty picture.
 */
const pictureName = (asset: string | undefined): string | null =>
{
  return asset === undefined || asset === ''
    ? null
    : asset;
};

/**
 * Where a frame's weather falls: the part of the map the view shows, in world pixels, or null when the view shows none
 * of the map.
 * @param {WorldRect} view The part of the world the view shows.
 * @param {number} mapWidth The map's width, in world pixels.
 * @param {number} mapHeight The map's height, in world pixels.
 * @returns {WorldRect | null} Where the weather falls.
 */
const weatherRectFor = (view: WorldRect, mapWidth: number, mapHeight: number): WorldRect | null =>
{
  const left = Math.max(view.x, 0);
  const top = Math.max(view.y, 0);
  const right = Math.min(view.x + view.width, mapWidth);
  const bottom = Math.min(view.y + view.height, mapHeight);
  if (right <= left || bottom <= top)
  {
    return null;
  }

  return { x: left, y: top, width: right - left, height: bottom - top };
};

/**
 * A map's weather in one map view, as J-Weather draws it in the game: the look the map's note names, at the strength the
 * sky gives it, bent through the map's climate, or its middle one, or on an outdoor map naming none, the sky's own look
 * at the sky's strength; each of the look's layers a population of particles moved exactly as the plugin moves them and
 * drawn with its pictures, sizes, colours, strengths and blends, settled on arrival so it opens as weather that has been
 * going. An opt-out, a map naming no look under no sky, and a look the config does not know draw nothing, as they do in
 * the game.
 *
 * The game draws its weather over its screen; here the screen is the part of the map the view shows, so the weather is
 * as thick, as big and as fast as the game's at every zoom, and stays put on the view as it pans, as the game's stays put
 * on its screen while the map scrolls beneath. It falls a step every engine frame while the view animates, and holds
 * still where it is while it does not. A map shows the same shower each time it opens: its rolls are seeded by the map,
 * the look and the layer, where the game's are random.
 */
class MapWeather implements WeatherDrawing
{
  #stage: WeatherStage;

  #config: WeatherConfigFile | null;

  /**
   * The climates the config holds, which bend the sky's strength for a map naming a look and a climate.
   */
  #climates: ClimateTables;

  #makeCanvas: CanvasMaker;

  #mapId = 0;

  #weather: ResolvedWeather | null = null;

  #problem = '';

  #layers: ShownLayer[] = [];

  #rect: WorldRect | null = null;

  #lastFrames: number | null = null;

  #picturesArrived = false;

  #generation = 0;

  /**
   * @param {WeatherStage} stage Where it draws.
   * @param {WeatherConfigFile | null} config J-Weather's config, or null when the project's could not be read, which
   * leaves every map without weather.
   * @param {CanvasMaker} makeCanvas Makes the canvas a raindrop and its ripple are laid on together; by default, one on
   * the page.
   */
  constructor(stage: WeatherStage, config: WeatherConfigFile | null, makeCanvas: CanvasMaker = pageCanvas)
  {
    this.#stage = stage;
    this.#config = config;
    this.#climates = climatesFrom(config?.climates);
    this.#makeCanvas = makeCanvas;
  }

  draw(frame: WeatherFrame): void
  {
    const { document } = frame;
    const weather = resolveWeather(weatherDeclarationOf(document.property('note')), frame.sky, this.#climates);

    // the same weather on the same map is kept as it is, falling on from where it was; anything else arrives afresh.
    if (document.mapId !== this.#mapId || isSameWeather(weather, this.#weather) === false)
    {
      this.#mapId = document.mapId;
      this.#weather = weather;
      this.#build(frame);
      this.#lastFrames = frame.clock.frames;
    }

    this.#follow(frame);
    this.#advance(frame);
    this.#show();
  }

  tick(frame: WeatherFrame): boolean
  {
    if (this.#layers.length === 0)
    {
      return false;
    }

    const moved = this.#follow(frame);
    const stepped = this.#advance(frame);
    const arrived = this.#picturesArrived;
    this.#picturesArrived = false;
    if (moved === false && stepped === false && arrived === false)
    {
      return false;
    }

    this.#show();
    return true;
  }

  describe(): JsonValue
  {
    const rect = this.#rect;
    return {
      mapId: this.#mapId,
      weather: this.#weather === null ? null : { preset: this.#weather.preset, intensity: this.#weather.intensity },
      problem: this.#problem,
      screen: rect === null ? null : { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      layers: this.#layers.map(shown => this.#describeLayer(shown)),
    };
  }

  destroy(): void
  {
    this.#clear();
  }

  /**
   * Builds the weather afresh for the map: a population for each of its look's layers, settled for the part of the map
   * the view shows, each loading its pictures.
   * @param {WeatherFrame} frame The frame.
   */
  #build(frame: WeatherFrame): void
  {
    this.#clear();
    const weather = this.#weather;
    const config = this.#config;
    if (weather === null || config === null)
    {
      this.#problem = config === null && weather !== null ? 'the weather config could not be read' : '';
      return;
    }

    const { layers, problem } = layersFor(config, weather.preset, weather.intensity);
    this.#problem = problem ?? '';

    // the layers are particle containers, which a view made before the weather's code first loaded cannot yet draw.
    ensureParticlePipe(frame.renderer);
    const rect = this.#rectOf(frame);
    this.#rect = rect;
    const bounds = rect === null ? { width: 0, height: 0 } : { width: rect.width, height: rect.height };
    this.#layers = layers.map((layer, index) =>
    {
      const roll = seededRoller(weatherSeed(frame.document.mapId, weather.preset, weather.intensity, index));
      const container = new ParticleContainer({
        dynamicProperties: { position: true, rotation: true, vertex: true, uvs: true, color: true },
      });
      container.blendMode = BLENDS[layer.blend] ?? 'normal';
      container.position.set(rect?.x ?? 0, rect?.y ?? 0);
      this.#stage.layer.addChild(container);
      return { field: new WeatherField(layer, bounds, roll, true), container, sprites: [], pictures: null, problem: '' };
    });
    this.#loadPictures(frame.images);
  }

  /**
   * Asks for every layer's pictures, and fits each layer with them once they arrive, unless the weather was built
   * afresh meanwhile. A layer naming no picture draws nothing, as the game draws its empty picture; one whose stage
   * names none draws its stage as nothing, the particles living on unseen.
   * @param {TextureSource | null} images Where the project's pictures come from.
   */
  #loadPictures(images: TextureSource | null): void
  {
    const generation = this.#generation;
    this.#layers.forEach(shown =>
    {
      const { layer } = shown.field;
      const own = pictureName(layer.asset);
      if (images === null || own === null)
      {
        shown.problem = images === null ? 'no pictures to draw with' : 'it names no picture, so it draws nothing, as in the game';
        return;
      }

      const stage = layer.becomes === null ? null : pictureName(layer.becomes.asset);
      const separate = stage !== null && stage !== own;
      Promise.all([ images.image('weather', own), separate ? images.image('weather', stage) : Promise.resolve(null) ])
        .then(([ first, second ]) => this.#fit(shown, generation, { own, stage }, first, separate ? second : first))
        .catch((error: unknown) =>
        {
          shown.problem = `its pictures could not be loaded: ${String(error)}`;
        });
    });
  }

  /**
   * Fits one layer with its pictures, once they have arrived, so its particles draw from the next tick. A stage whose
   * picture the project lacks draws as nothing, and says so.
   * @param {ShownLayer} shown The layer.
   * @param {number} generation The build the pictures were asked for by.
   * @param {{ own: string, stage: string | null }} names The layer's picture and its stage's, null for none.
   * @param {TextureImage | null} first The layer's own picture, or null when the project lacks it.
   * @param {TextureImage | null} second Its stage's picture, the layer's own when they share one, or null.
   */
  #fit(shown: ShownLayer, generation: number, names: { own: string; stage: string | null }, first: TextureImage | null, second: TextureImage | null): void
  {
    // a weather built afresh since has let this layer go.
    if (generation !== this.#generation)
    {
      return;
    }

    if (first === null)
    {
      shown.problem = `img/weather/${names.own}.png is missing`;
      return;
    }

    if (names.stage !== null && second === null)
    {
      shown.problem = `img/weather/${names.stage}.png is missing`;
    }

    shown.pictures = layerPicturesFor(first, names.stage === null ? null : second, this.#makeCanvas);
    shown.container.texture = shown.pictures.first;
    this.#picturesArrived = true;
  }

  /**
   * Keeps the weather on the part of the map the view shows: each layer sits where that part begins, and a part of
   * another size stretches every population over it, grown or thinned to the count the game would draw there.
   * @param {WeatherFrame} frame The frame.
   * @returns {boolean} True when the weather moved or resized.
   */
  #follow(frame: WeatherFrame): boolean
  {
    const rect = this.#rectOf(frame);
    const previous = this.#rect;
    if (rect === null || (previous !== null && rect.x === previous.x && rect.y === previous.y
      && rect.width === previous.width && rect.height === previous.height))
    {
      return false;
    }

    this.#rect = rect;
    this.#layers.forEach(shown =>
    {
      shown.field.resize({ width: rect.width, height: rect.height });
      shown.container.position.set(rect.x, rect.y);
    });
    return true;
  }

  /**
   * Moves every population on by the engine frames since the last frame, while the view animates; holding still, the
   * clock is noted and nothing moves.
   * @param {WeatherFrame} frame The frame.
   * @returns {boolean} True when anything moved.
   */
  #advance(frame: WeatherFrame): boolean
  {
    const { frames, animating } = frame.clock;
    const elapsed = this.#lastFrames === null ? 0 : frames - this.#lastFrames;
    this.#lastFrames = frames;
    if (animating === false || elapsed <= 0)
    {
      return false;
    }

    const steps = Math.min(elapsed, MOST_STEPS_A_TICK);
    this.#layers.forEach(shown =>
    {
      for (let step = 0; step < steps; step++)
      {
        shown.field.step();
      }
    });
    return true;
  }

  /**
   * Puts every particle's look on the particle drawing it, as Sprite_WeatherLayer#drawParticle does, once a layer has its
   * pictures: where it is, how far turned, how wide and tall, which picture by its life, and how strongly, out of 255
   * and held to that range, as the engine's sprites hold an opacity.
   */
  #show(): void
  {
    this.#layers.forEach(shown =>
    {
      const { pictures } = shown;
      if (pictures === null)
      {
        return;
      }

      this.#matchCount(shown, pictures);
      const { layer, particles } = shown.field;
      const { sprites } = shown;
      for (let index = 0; index < particles.length; index++)
      {
        const particle = particles[index];
        if (particle.done)
        {
          continue;
        }

        this.#place(sprites[index], particle, particle.stage === 0 ? layer : (layer.becomes as WeatherLayer), pictures);
      }
    });
  }

  /**
   * Puts one particle's look on its sprite; a particle in a stage with no picture of its own draws as nothing.
   * @param {Particle} sprite The sprite.
   * @param {WeatherParticle} particle The particle.
   * @param {WeatherLayer} params The motion it lives by now.
   * @param {LayerPictures} pictures The layer's pictures.
   */
  #place(sprite: Particle, particle: WeatherParticle, params: WeatherLayer, pictures: LayerPictures): void
  {
    sprite.x = particle.x;
    sprite.y = particle.y;
    sprite.rotation = particle.rotation;
    sprite.scaleX = particle.scaleX * Math.cos(particle.flipPhase);
    sprite.scaleY = particle.scaleY;
    const unseenStage = particle.stage > 0 && pictures.second === null;
    sprite.texture = particle.stage === 0 || pictures.second === null ? pictures.first : pictures.second;
    const opacity = particle.stagger > 0 || unseenStage ? 0 : glowFor(particle, params);
    sprite.alpha = Math.min(Math.max(opacity, 0), 255) / 255;
  }

  /**
   * Gives a layer exactly one sprite per particle, tinted as the layer is, adding or letting go of sprites as its
   * population grew or thinned.
   * @param {ShownLayer} shown The layer.
   * @param {LayerPictures} pictures Its pictures.
   */
  #matchCount(shown: ShownLayer, pictures: LayerPictures): void
  {
    const wanted = shown.field.particles.length;
    const { sprites, container } = shown;
    if (sprites.length > wanted)
    {
      container.removeParticles(wanted, sprites.length);
      sprites.length = wanted;
      return;
    }

    const tint = shown.field.layer.tint ?? 0xffffff;
    while (sprites.length < wanted)
    {
      const sprite = new Particle({ texture: pictures.first, anchorX: 0.5, anchorY: 0.5, tint });
      sprites.push(sprite);
      container.addParticle(sprite);
    }
  }

  /**
   * Works out where a frame's weather falls.
   * @param {WeatherFrame} frame The frame.
   * @returns {WorldRect | null} The part of the map the view shows, or null for none.
   */
  #rectOf(frame: WeatherFrame): WorldRect | null
  {
    const { document, view } = frame;
    const { tileSize } = this.#stage;
    return weatherRectFor(view, document.width * tileSize, document.height * tileSize);
  }

  /**
   * Says what one layer shows: its pictures, blend, colour, density and motion, how many particles it has, and how they
   * spread.
   * @param {ShownLayer} shown The layer.
   * @returns {JsonValue} What it shows.
   */
  #describeLayer(shown: ShownLayer): JsonValue
  {
    const { layer } = shown.field;
    const { pictures } = shown;
    const sizeOf = (texture: { readonly frame: { readonly width: number; readonly height: number } } | null) =>
      (texture === null ? null : [ texture.frame.width, texture.frame.height ]);
    return {
      asset: layer.asset ?? null,
      becomesAsset: layer.becomes === null ? null : layer.becomes.asset ?? null,
      blend: shown.container.blendMode,
      tint: layer.tint ?? null,
      pictureSize: pictures === null ? null : sizeOf(pictures.first),
      becomesPictureSize: pictures === null ? null : sizeOf(pictures.second),
      problem: shown.problem,
      layer: JSON.parse(JSON.stringify(layer)) as JsonValue,
      stats: JSON.parse(JSON.stringify(layerStatsOf(shown.field))) as JsonValue,
    };
  }

  /**
   * Lets every layer go, with its pictures, so a weather built afresh starts from nothing.
   */
  #clear(): void
  {
    this.#generation += 1;
    this.#layers.forEach(shown =>
    {
      shown.container.destroy();
      if (shown.pictures !== null)
      {
        releasePictures(shown.pictures);
      }
    });
    this.#layers = [];
    this.#rect = null;
    this.#picturesArrived = false;
  }
}

export { BLENDS, MapWeather, MOST_STEPS_A_TICK, pictureName, weatherRectFor };
