/**
 * The probe the parity check injects into the real game: it walks the game to each fixture map, holds everything
 * still, and draws the map's base layer (parallax, tiles and characters, with no screen tone, lighting, weather or
 * interface above it) into a picture per view, animation step and pass. A dark map is drawn once more with J-Lighting's
 * light mask multiplied over its tiles, as the game composites it over the map. A map given a time of day is walked to
 * with the game's clock set to that time and stopped, so every event arrives on the page that hour gives it and
 * J-Lighting-Time's sky is already there when the player does. Its events are drawn as the game shows them then, and
 * its tiles under the sky: with the screen's tone over them, as the base layer's colour filter casts it, and the light
 * mask multiplied over that whenever the hour or the map darkens it.
 *
 * A map asked for its weather is read instead of drawn pass by pass: what J-Weather resolved for it, where its plane
 * sits in the sprite tree against the tone and the dark, and every layer on the plane, its pictures, blend, tint, the
 * layer as resolved and its population summed up; then the whole spriteset is drawn as the player sees it, weather and
 * all. Before the first such map the probe holds J-Weather-Time's sky off, noting what it was doing on the fresh save,
 * so every map's weather resolves as J-Weather alone resolves it: a tagged map at its middle strength. A map asked for
 * its weather under a sky is arrived at on the date and at the hour asked, the clock stopped, with J-Weather-Time made
 * to hold that sky before the player arrives: its forecast set to the condition and strength for that phase, then
 * pushed to J-Weather as the plugin pushes it, so the plugin itself picks the face, and the map is built under it.
 *
 * A map asked about at moments, such as a season's date at a few hours, is judged instead of drawn: the game's clock is
 * set straight to each moment, date and all, every page of every event there is judged as the game judges it then, and
 * the clock goes back as it was before anything ticks it on.
 *
 * It is serialized with toString() and run inside NW.js ahead of the game's own scripts, so it must stay one
 * self-contained function in plain JavaScript: nothing from this module's scope survives the trip, and the engine's
 * globals (SceneManager, $gameMap and the rest) are reached through the window. Its whole body runs inside try blocks,
 * because a probe that throws stops ticking and writes nothing, which from outside looks like a game that never booted.
 */
import type { ProbeConfig, ProbeMap, ProbeReport, WeatherLayerProbe } from './probeTypes.ts';

/**
 * The probe itself. Kept free of anything but plain JavaScript, see the module's comment.
 * @param {ProbeConfig} config What to draw, and where to write it.
 */
const parityProbe = (config: ProbeConfig): void =>
{
  // NW.js hands its own pages Node's require, which is how the pictures reach the disk.
  const nodeRequire = (window as unknown as { require: (name: string) => any }).require;
  const fs = nodeRequire('fs');
  const { Buffer: NodeBuffer } = nodeRequire('buffer');
  const engine = window as unknown as Record<string, any>;
  const report: ProbeReport = { phase: 'boot', screen: { width: 0, height: 0 }, captures: [], events: {}, clocks: {}, moments: {}, weather: {}, errors: [], log: [] };

  // the game must never make a sound: every audio context it makes stays suspended, and media elements stay muted.
  // The launch also carries --mute-audio; this holds even if a launch ever forgets it.
  const OriginalAudioContext = (window as unknown as { AudioContext: new (...args: unknown[]) => AudioContext }).AudioContext;
  (window as unknown as { AudioContext: unknown }).AudioContext = function SilentAudioContext(...args: unknown[])
  {
    const context = new OriginalAudioContext(...args);
    context.suspend();
    Object.defineProperty(context, 'resume', { value: () => Promise.resolve() });
    return context;
  };
  HTMLMediaElement.prototype.play = function(this: HTMLMediaElement)
  {
    this.muted = true;
    return Promise.resolve();
  };

  // software WebGL is refused when PIXI asks for no performance caveat, and a real gamepad would walk the menus.
  const originalGetContext = HTMLCanvasElement.prototype.getContext as (this: HTMLCanvasElement, type: string, attributes?: unknown) => unknown;
  HTMLCanvasElement.prototype.getContext = function(this: HTMLCanvasElement, type: string, attributes?: unknown)
  {
    if (attributes !== null && typeof attributes === 'object')
    {
      (attributes as Record<string, unknown>).failIfMajorPerformanceCaveat = false;
    }

    return originalGetContext.call(this, type, attributes);
  } as typeof HTMLCanvasElement.prototype.getContext;
  Object.defineProperty(navigator, 'getGamepads', { value: () => [] });

  window.addEventListener('error', event => report.errors.push(String(event.message)));
  const originalError = console.error;
  console.error = (...args: unknown[]) =>
  {
    report.errors.push(args.map(String).join(' '));
    originalError.apply(console, args);
  };

  const finish = (phase: string): void =>
  {
    report.phase = phase;
    fs.writeFileSync(`${config.outDir}/PROBE_REPORT.json`, JSON.stringify(report, null, 2));
    fs.writeFileSync(`${config.outDir}/PROBE_READY`, phase);
  };

  // hold every fixture map still from the moment it is set up: no event moves, animates or runs (so no autorun can
  // keep the scene busy and block the next transfer), the parallax does not drift, the player never scrolls the
  // display, and the tilemap's animation stays wherever the probe puts it.
  const frozenMaps = new Set(config.maps.map(map => map.mapId));
  const isFrozen = (): boolean => engine.$gameMap !== undefined && engine.$gameMap !== null && frozenMaps.has(engine.$gameMap.mapId());
  const freeze = (owner: any, method: string): void =>
  {
    const original = owner.prototype[method];
    owner.prototype[method] = function(this: unknown, ...args: unknown[])
    {
      return isFrozen() ? undefined : original.apply(this, args);
    };
  };

  let mapIndex = 0;
  let ticks = 0;
  let settle = 0;
  let phase = 'boot';
  let hooksInstalled = false;

  // whether the first map has yet to be arrived at with the clock set for it, which a new game starting on it cannot do.
  let clockUnset = true;

  const installFreeze = (): void =>
  {
    freeze(engine.Game_Map, 'update');
    freeze(engine.Game_Player, 'update');
    freeze(engine.Game_CharacterBase, 'update');

    // the tilemap updates its children, the character sprites among them, so only its animation clock stops.
    const tilemapUpdate = engine.Tilemap.prototype.update;
    engine.Tilemap.prototype.update = function(this: any)
    {
      if (isFrozen() === false)
      {
        tilemapUpdate.call(this);
        return;
      }

      this.children.forEach((child: any) => child.update?.());
    };
    hooksInstalled = true;
  };

  const capture = (map: ProbeMap, view: { x: number; y: number }, step: number, pass: 'events' | 'tiles' | 'dark' | 'sky'): void =>
  {
    const scene = engine.SceneManager._scene;
    const spriteset = scene._spriteset;
    const tilemap = spriteset._tilemap;
    engine.$gameMap.setDisplayPos(view.x, view.y);
    const display = { x: engine.$gameMap.displayX(), y: engine.$gameMap.displayY() };

    // J-Base puts the sprites of characters far from the screen to sleep, undrawn, and wakes them once a frame; the
    // view moved within this tick, so they are woken for it now, as the game's next frame would.
    spriteset.updateCharacterSleep?.();

    // the player, followers and vehicles never draw; events draw only in the events pass.
    spriteset._characterSprites.forEach((sprite: any) =>
    {
      const isEvent = sprite._character instanceof engine.Game_Event;
      if (isEvent === false || pass !== 'events')
      {
        sprite.hide();
      }

      sprite.update();
    });
    spriteset.updateTilemap();
    spriteset.updateParallax();
    tilemap.animationFrame = step;

    // draw the base layer alone: without the screen tone its colour filter carries, except under the sky, which is that
    // tone; and without anything a plugin put beside the map there (J-Weather's particles live in it, so the lighting
    // darkens them).
    const base = spriteset._baseSprite;
    const { filters } = base;
    if (pass !== 'sky')
    {
      base.filters = null;
    }
    const kept = new Set([ spriteset._blackScreen, spriteset._parallax, tilemap ]);
    const setAside = base.children.filter((child: any) => kept.has(child) === false && child.visible);
    setAside.forEach((child: any) =>
    {
      child.visible = false;
    });
    const { renderer } = engine.Graphics.app;
    const texture = engine.PIXI.RenderTexture.create({ width: engine.Graphics.width, height: engine.Graphics.height });
    renderer.render(base, texture);

    // the dark and sky passes multiply J-Lighting's light mask over the base, as the game does above the weather, its
    // lights placed afresh for this view first: the mask's own update composes the lights and draws them into its
    // texture, and hides the mask while nothing darkens the map, as at noon under a clear sky. The mask's texture is kept
    // too, a tile wider than the screen on every side, so a difference can be traced to the mask itself or to its
    // multiplying.
    const at = map.time === undefined ? '' : `-t${map.time}`;
    if (pass === 'dark' || pass === 'sky')
    {
      const mask = spriteset.lightMask();
      mask.update();
      renderer.render(mask, texture, false);
      const maskUrl: string = renderer.extract.base64(mask.renderTexture());
      const maskFile = `${config.outDir}/mask-${map.mapId}-${display.x}-${display.y}-s${step}${at}.png`;
      fs.writeFileSync(maskFile, NodeBuffer.from(maskUrl.split(',')[1], 'base64'));
    }

    const url: string = renderer.extract.base64(texture);
    setAside.forEach((child: any) =>
    {
      child.visible = true;
    });
    base.filters = filters;
    texture.destroy(true);

    const file = `game-${map.mapId}-${display.x}-${display.y}-s${step}${at}-${pass}.png`;
    fs.writeFileSync(`${config.outDir}/${file}`, NodeBuffer.from(url.split(',')[1], 'base64'));
    report.captures.push(map.time === undefined
      ? { mapId: map.mapId, file, display, step, pass }
      : { mapId: map.mapId, file, display, step, pass, time: map.time });
  };

  // names what the base layer and the tilemap hold, so anything a plugin added beside the map can be told apart.
  const describeScene = (): void =>
  {
    const spriteset = engine.SceneManager._scene._spriteset;
    const describe = (child: any) => `${child.constructor.name}${child.visible ? '' : ' (hidden)'}${child._character ? ` ${child._character.constructor.name}` : ''}`;
    const counts = (children: any[]) =>
    {
      const tally: Record<string, number> = {};
      children.forEach(child =>
      {
        const name = describe(child);
        tally[name] = (tally[name] ?? 0) + 1;
      });
      return JSON.stringify(tally);
    };
    report.log.push(`base: ${counts(spriteset._baseSprite.children)}`);
    report.log.push(`tilemap: ${counts(spriteset._tilemap.children)}`);

    // a few events in full, and anything plain beside the map, with where it sits.
    const events = spriteset._characterSprites.filter((sprite: any) => sprite._character instanceof engine.Game_Event).slice(0, 4);
    events.forEach((sprite: any) =>
    {
      const character = sprite._character;
      report.log.push(`event ${character.eventId()}: page ${character._pageIndex} name "${character.characterName()}" index ${character.characterIndex()}`
        + ` tile ${character.tileId()} at ${character.x},${character.y} sprite ${sprite.x},${sprite.y} visible ${sprite.visible}`
        + ` opacity ${sprite.opacity} transparent ${character.isTransparent()} erased ${character._erased}`
        + ` frame ${JSON.stringify(sprite._frame)} bitmap ${sprite.bitmap ? `${sprite.bitmap.width}x${sprite.bitmap.height}` : 'none'}`);
    });
    [ ...spriteset._baseSprite.children, ...spriteset._tilemap.children ]
      .filter((child: any) => child.constructor.name === 'Sprite')
      .forEach((child: any) =>
      {
        const inner = child.children.map((grandchild: any) => `${grandchild.constructor.name} ${grandchild.children.length} kids at ${grandchild.x},${grandchild.y}`).join('; ');
        report.log.push(`plain sprite at ${child.x},${child.y} ${child.width}x${child.height} visible ${child.visible} opacity ${child.opacity}`
          + ` z ${child.z} children ${child.children.length} [${inner}] bitmap ${child.bitmap?._url ?? (child.bitmap ? 'canvas' : 'none')}`);
      });
  };

  // lists how the game's sprite for an event departs from a plain drawing of the page it shows; an event showing no page
  // draws nothing, and has nothing to depart from.
  const departuresOf = (sprite: any): string[] =>
  {
    const character = sprite._character;
    const data = engine.$dataMap.events[character.eventId()];
    if (data === undefined || data === null)
    {
      return [ 'is not in the map file' ];
    }

    const shown = data.pages[character._pageIndex];
    if (shown === undefined)
    {
      return [];
    }

    const { image } = shown;
    const departures: string[] = [];
    const tone = sprite.getColorTone();
    const blend = sprite.getBlendColor();
    const checks: [ boolean, string ][] = [
      [ character.characterName() !== image.characterName || character.characterIndex() !== image.characterIndex || character.tileId() !== image.tileId,
        `draws "${character.characterName()}" ${character.characterIndex()} instead of its page image` ],
      [ character.direction() !== image.direction, `faces ${character.direction()} instead of ${image.direction}` ],
      [ character.pattern() !== image.pattern, `shows pattern ${character.pattern()} instead of ${image.pattern}` ],
      [ tone.some((value: number) => value !== 0), `tinted ${JSON.stringify(tone)}` ],
      [ blend[3] !== 0, `blended ${JSON.stringify(blend)}` ],
      [ sprite.opacity !== 255, `opacity ${sprite.opacity}` ],
      [ sprite.scale.x !== 1 || sprite.scale.y !== 1, `scaled ${sprite.scale.x}x${sprite.scale.y}` ],
      [ sprite.children.some((child: any) => child.visible), `carries ${sprite.children.filter((child: any) => child.visible).length} plugin sprites` ],
    ];
    checks.forEach(([ departs, words ]) =>
    {
      if (departs)
      {
        departures.push(words);
      }
    });
    return departures;
  };

  // judges each of an event's pages as the game does when it picks one, every plugin's condition included; a page whose
  // judging throws, as one waiting on a quest the game does not track does, is noted as neither held nor not.
  const meetsOf = (character: any): (boolean | null)[] =>
  {
    const pages: any[] = character.event()?.pages ?? [];
    return pages.map(page =>
    {
      try
      {
        return character.meetsConditions(page) === true;
      }
      catch
      {
        return null;
      }
    });
  };

  // picks the page an event would show now, as the game picks it, plugins' guards and all: -1 for none, and null where
  // picking threw, as it can with no plugin there to catch a page whose judging throws.
  const pageOf = (character: any): number | null =>
  {
    try
    {
      return character.findProperPageIndex();
    }
    catch
    {
      return null;
    }
  };

  // judges every page of every event on the map at each of its moments, the game's clock set straight into its fields
  // for each, so no hour is announced on the way, and put back as it was found once all are judged. All of it happens
  // within this one call, so no frame ticks the clock on between setting it and judging, and nothing after this map
  // reads a clock it moved.
  const judgeMoments = (map: ProbeMap): void =>
  {
    const time = engine.$gameTime;
    const found = [ time.years(), time.months(), time.days(), time.hours(), time.minutes(), time.seconds() ];
    const setClock = ([ years, months, days, hours, minutes, seconds ]: number[]): void =>
    {
      time.setYears(years);
      time.setMonths(months);
      time.setDays(days);
      time.setHours(hours);
      time.setMinutes(minutes);
      time.setSeconds(seconds);
    };
    const events: any[] = engine.$gameMap.events();
    (map.moments ?? []).forEach(moment =>
    {
      setClock([ moment.years, moment.months, moment.days, moment.hours, moment.minutes, moment.seconds ]);
      (report.moments as Record<string, unknown>)[`${map.mapId}@${moment.key}`] = events.map(character => ({
        id: character.eventId(),
        page: pageOf(character),
        meets: meetsOf(character),
      }));
    });
    setClock(found);
  };

  // records each event's active page, whether the game draws it and how, and how the game judges each of its pages,
  // before any pass hides anything, with the hour the game's clock reads; under its own key for a map drawn at a time of
  // day, since an event's page can depend on the hour.
  const recordEvents = (map: ProbeMap): void =>
  {
    const spriteset = engine.SceneManager._scene._spriteset;
    const key = map.time === undefined ? String(map.mapId) : `${map.mapId}@${map.time}`;
    const time = engine.$gameTime;
    report.clocks[key] = time === undefined || time === null ? -1 : (time.hours() * 60) + time.minutes();
    report.events[key] = spriteset._characterSprites
      .filter((sprite: any) => sprite._character instanceof engine.Game_Event)
      .map((sprite: any) =>
      {
        const character = sprite._character;
        return {
          id: character.eventId(),
          page: character._pageIndex,
          visible: sprite.visible,
          characterName: character.characterName(),
          tileId: character.tileId(),
          x: character.x,
          y: character.y,
          width: Math.abs(sprite._frame.width * sprite.scale.x),
          height: Math.abs(sprite._frame.height * sprite.scale.y),
          departures: departuresOf(sprite),
          meets: meetsOf(character),
        };
      });
  };

  // names what J-Lighting composed for a dark map or a sky: how dark, in what colour, the screen's tone, the hour on the
  // game's clock, the filters on the base layer, and the lights cut through it.
  const describeDark = (map: ProbeMap): void =>
  {
    const composition = engine.ScreenLightingComposer.compose();
    const lights = composition.lights().map((light: any) => `${light.sourceKey()} r${light.radius()} ${light.color()} i${light.intensity()} ${light.effect()}`);
    const filters = (engine.SceneManager._scene._spriteset._baseSprite.filters ?? []).map((filter: any) => filter.constructor.name).join(',');
    const clock = engine.$gameTime === undefined ? 'no clock' : `${engine.$gameTime.hours()}:${engine.$gameTime.minutes()}`;
    report.log.push(`map ${map.mapId} ${map.time === undefined ? 'dark' : 'sky'}: darkness ${composition.darkness()}`
      + ` colour ${JSON.stringify(composition.ambientColor())} tone ${JSON.stringify(composition.tone())} clock ${clock}`
      + ` base filters [${filters}], ${lights.length} lights: ${lights.join('; ')}`);
  };

  // sums up one number across a population: its least, its greatest, its mean and a sample's standard deviation, all
  // four 0 for no one, the last 0 for one alone, as the editor sums up its own.
  const spreadOf = (values: number[]): { min: number; max: number; mean: number; sd: number } =>
  {
    if (values.length === 0)
    {
      return { min: 0, max: 0, mean: 0, sd: 0 };
    }

    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    let sum = 0;
    values.forEach(value =>
    {
      min = Math.min(min, value);
      max = Math.max(max, value);
      sum += value;
    });
    const mean = sum / values.length;
    const squares = values.reduce((total, value) => total + ((value - mean) ** 2), 0);
    return { min, max, mean, sd: values.length < 2 ? 0 : Math.sqrt(squares / (values.length - 1)) };
  };

  // reads one layer of J-Weather's plane: its pictures and their sizes (the engine's empty picture is none), its blend
  // and tint as its sprites carry them, the layer as resolved, and its population summed up the way the editor sums its
  // own: first-life particles for speed, size, turn and lifetime, and every particle for how strongly it draws, as its
  // sprite is drawn with it (nothing while it waits, its glow otherwise).
  const describeWeatherLayer = (layer: any): WeatherLayerProbe =>
  {
    const params = layer.layer();
    const particles: any[] = layer.particles();
    const sprites: any[] = layer.children;
    const { width, height } = engine.Graphics;
    const strengths = particles.map((particle, index) => (particle.stagger > 0 ? 0 : engine.WeatherMotion.glowFor(particle, layer.paramsFor(index))));
    const first = particles.filter(particle => particle.stage === 0);
    const firstIndex = particles.findIndex(particle => particle.stage === 0);
    const stageIndex = particles.findIndex(particle => particle.stage > 0);
    const sizeOf = (bitmap: any): number[] | null =>
    {
      return bitmap === undefined || bitmap === null || bitmap === engine.ImageManager._emptyBitmap || bitmap.isReady() === false
        ? null
        : [ bitmap.width, bitmap.height ];
    };
    const firstSprite = sprites[firstIndex >= 0 ? firstIndex : 0];
    const onScreen = particles.filter(particle => particle.x >= 0 && particle.x <= width && particle.y >= 0 && particle.y <= height);

    // a population just settled holds no particle in its second life yet, so the stage's picture is read from where the
    // layer's sprites take it, the engine's own cache of what has loaded.
    const stage = params.becomes === null || params.becomes === undefined ? null : params.becomes;
    let stageBitmap = stage === null ? null : engine.ImageManager.loadWeather(stage.asset);
    if (stageIndex >= 0)
    {
      stageBitmap = sprites[stageIndex].bitmap;
    }

    return {
      asset: params.asset ?? null,
      becomesAsset: stage === null ? null : stage.asset ?? null,
      pictureSize: sizeOf(firstSprite?.bitmap),
      becomesPictureSize: sizeOf(stageBitmap),
      blend: firstSprite === undefined ? null : firstSprite.blendMode,
      tint: firstSprite === undefined ? null : firstSprite.tint,
      layer: JSON.parse(JSON.stringify(params)),
      stats: {
        count: particles.length,
        firstLife: first.length,
        secondLife: particles.length - first.length,
        waiting: particles.filter(particle => particle.stagger > 0).length,
        onScreen: particles.length === 0 ? 0 : onScreen.length / particles.length,
        velocityX: spreadOf(first.map(particle => particle.velocityX)),
        velocityY: spreadOf(first.map(particle => particle.velocityY)),
        scaleX: spreadOf(first.map(particle => particle.scaleX * Math.cos(particle.flipPhase))),
        scaleY: spreadOf(first.map(particle => particle.scaleY)),
        rotation: spreadOf(first.map(particle => particle.rotation)),
        life: spreadOf(first.map(particle => particle.life)),
        opacity: spreadOf(strengths),
      },
    };
  };

  // J-Weather-Time's own way of telling J-Weather what the sky is doing, kept aside when the probe holds the sky off, so
  // a map read under a sky can still be pushed one exactly as the plugin pushes it; and whether one was pushed, so a map
  // read without a sky afterwards has it held off again.
  let pushSky: ((clock: unknown) => void) | null = null;
  let skyPushed = false;

  // what the sky does on the fresh save, read once, for the record: the sky held off never wound its forecast on.
  const noteFreshSky = (): void =>
  {
    if (report.freshSky !== undefined || engine.ForecastDirector === undefined)
    {
      return;
    }

    try
    {
      engine.ForecastDirector.advance(engine.$gameTime);
      report.freshSky = { ...engine.ForecastDirector.skyFor(engine.$gameTime), at: (engine.$gameTime.hours() * 60) + engine.$gameTime.minutes() };
    }
    catch (error)
    {
      report.freshSky = `unread: ${String(error)}`;
    }
  };

  // makes J-Weather-Time hold a sky: its forecast set to the condition and strength for the phase the clock reads, that
  // phase marked as the one applied so nothing rolls it again, then pushed to J-Weather as the plugin pushes it, so
  // J-Weather-Time picks the face the condition wears at that season and hour.
  const holdSky = (sky: { type: string; intensity: string }): void =>
  {
    const director = engine.ForecastDirector;
    const skyPhase = director.phaseOf(engine.$gameTime);
    engine.$gameSystem.setSkyForecast({ startPhase: skyPhase, types: [ sky.type ], intensities: [ sky.intensity ] });
    engine.$gameSystem.setLastAppliedSkyPhase(skyPhase);
    pushSky?.call(director, engine.$gameTime);
    skyPushed = true;
  };

  // before arriving at a map read for its weather, the sky it is read under is held, or the sky held off again after
  // one was held, so the map arrives under it as a player would: its weather resolved and its pictures loaded on the way.
  const holdSkyFor = (next: ProbeMap): void =>
  {
    if (next.sky !== undefined)
    {
      holdSky(next.sky);
      return;
    }

    if (next.weather !== undefined && skyPushed)
    {
      engine.WeatherDirector.setSky(null);
      skyPushed = false;
    }
  };

  // reads a map's weather and draws the whole spriteset at the asked display: where the plane sits against the tone
  // (the base sprite's colour filter) and the dark (J-Lighting's mask beside the base sprite), every layer on it, and
  // the picture the player would see there, characters but the events set aside. The weather is settled afresh first,
  // exactly as on arriving, and read and drawn before a frame moves it, which is the moment the editor reads its own:
  // a population a few frames on from settling has more of its queued particles in view and faded in. A map read under
  // a sky notes what J-Weather-Time hands J-Weather.
  const captureWeather = (map: ProbeMap): void =>
  {
    const view = map.weather as { x: number; y: number };
    const spriteset = engine.SceneManager._scene._spriteset;
    noteFreshSky();
    const sky = map.sky === undefined ? null : engine.ForecastDirector.skyFor(engine.$gameTime);
    spriteset.refreshWeatherLayers();
    spriteset.weatherPlane().children.forEach((layer: any) => layer.particles().forEach((_: unknown, index: number) => layer.drawParticle(index)));
    engine.$gameMap.setDisplayPos(view.x, view.y);
    const display = { x: engine.$gameMap.displayX(), y: engine.$gameMap.displayY() };
    spriteset.updateCharacterSleep?.();
    spriteset._characterSprites.forEach((sprite: any) =>
    {
      if ((sprite._character instanceof engine.Game_Event) === false)
      {
        sprite.hide();
      }

      sprite.update();
    });
    spriteset.updateTilemap();
    spriteset.updateParallax();
    const mask = typeof spriteset.lightMask === 'function' ? spriteset.lightMask() : null;
    mask?.update();

    const plane = spriteset.weatherPlane();
    const base = spriteset._baseSprite;
    const nameOf = (child: any): string =>
    {
      if (child === plane)
      {
        return 'WeatherPlane';
      }

      if (child === base)
      {
        return 'BaseSprite';
      }

      return child === mask ? 'LightMask' : child.constructor.name;
    };
    const depth = {
      spriteset: spriteset.children.map(nameOf),
      baseIndex: spriteset.children.indexOf(base),
      baseFilters: (base.filters ?? []).map((filter: any) => filter.constructor.name),
      base: base.children.map(nameOf),
      planeIndex: base.children.indexOf(plane),
      maskIndex: mask === null ? -1 : spriteset.children.indexOf(mask),
      tone: [ ...engine.$gameScreen.tone() ],
    };

    const { renderer } = engine.Graphics.app;
    const texture = engine.PIXI.RenderTexture.create({ width: engine.Graphics.width, height: engine.Graphics.height });
    renderer.render(spriteset, texture);
    const url: string = renderer.extract.base64(texture);
    texture.destroy(true);
    // a map read under several skies keeps a picture for each.
    const under = map.sky === undefined ? '' : `-${map.sky.key.replace(/[^a-zA-Z0-9]+/gu, '-')}`;
    const file = `game-weather-${map.mapId}-${display.x}-${display.y}${under}.png`;
    fs.writeFileSync(`${config.outDir}/${file}`, NodeBuffer.from(url.split(',')[1], 'base64'));

    const time = engine.$gameTime;
    const key = map.sky === undefined ? String(map.mapId) : map.sky.key;
    (report.weather as Record<string, unknown>)[key] = {
      current: engine.WeatherDirector.current(),
      depth,
      layers: plane.children.map(describeWeatherLayer),
      display,
      clock: time === undefined || time === null ? -1 : (time.hours() * 60) + time.minutes(),
      file,
      sky,
    };
  };

  // holds J-Weather-Time's sky off, once, so every map's weather resolves as J-Weather alone resolves it, noting first
  // what the sky was doing on the fresh save. Pushing a sky is J-Weather-Time's only way in, so stilling it and handing
  // J-Weather none is the whole of it; with no game started yet, there is no sky to hand back and no map to read. The
  // plugin's own push is kept aside for a map read under a sky.
  let skyHeld = false;
  const holdSkyOff = (gameStarted: boolean): void =>
  {
    if (skyHeld || engine.ForecastDirector === undefined)
    {
      return;
    }

    skyHeld = true;
    if (gameStarted)
    {
      report.freshSky = { ...engine.ForecastDirector.skyFor(engine.$gameTime), at: (engine.$gameTime.hours() * 60) + engine.$gameTime.minutes() };
      engine.WeatherDirector.setSky(null);
    }

    pushSky = engine.ForecastDirector.push;
    engine.ForecastDirector.push = () => undefined;
  };

  // which pictures a map gets: events as the game shows them, then the tiles alone, with every event hidden, then, for
  // a dark map, the tiles alone again under the light mask; or, for a map drawn at a time of day, its events as the game
  // shows them at that hour, then the tiles alone under its sky. A map read for its weather gets none of them.
  const passesFor = (map: ProbeMap): ('events' | 'tiles' | 'dark' | 'sky')[] =>
  {
    if (map.weather !== undefined)
    {
      return [];
    }

    if (map.time !== undefined)
    {
      return [ 'events', 'sky' ];
    }

    return map.dark ? [ 'events', 'tiles', 'dark' ] : [ 'events', 'tiles' ];
  };

  const captureMap = (map: ProbeMap): void =>
  {
    // a map read for its weather is read for nothing else, so a map drawn earlier keeps the events recorded for it.
    if (map.weather !== undefined)
    {
      captureWeather(map);
      report.log.push(`map ${map.mapId}: weather read at ${map.weather.x},${map.weather.y}`);
      return;
    }

    // a map judged at moments is judged and nothing else, so a map drawn earlier keeps the events recorded for it.
    if (map.moments !== undefined)
    {
      judgeMoments(map);
      report.log.push(`map ${map.mapId}: judged at ${map.moments.map(moment => moment.key).join(', ')}`);
      return;
    }

    describeScene();
    recordEvents(map);
    if (map.dark || map.time !== undefined)
    {
      describeDark(map);
    }

    const passes = passesFor(map);
    passes.forEach(pass =>
    {
      map.views.forEach(view =>
      {
        map.steps.forEach(step => capture(map, view, step, pass));
      });
    });
    report.log.push(`map ${map.mapId}: ${map.views.length} views, steps ${map.steps.join(',')}`);
  };

  // a map drawn at a time of day is arrived at with the game's clock already there, set straight into its fields so no
  // hour is announced on the way, and stopped, so no minute ticks by and turns the hour while it is drawn: arriving is
  // what makes J-Lighting-Time cast the sky at once, rather than spend five seconds travelling toward it. Every map is
  // set up afresh on arrival, even the one the player is already on, as for a map drawn at a second hour: a transfer
  // within a map keeps its events, each on the page the last hour gave it, where setting the map up again has each
  // judge its page at the clock as it reads now.
  const transferNext = (): void =>
  {
    const next = config.maps[mapIndex];
    if (next.weather !== undefined)
    {
      holdSkyOff(true);
      noteFreshSky();
    }

    if (next.time !== undefined)
    {
      engine.$gameTime.deactivate();
      engine.$gameTime.setHours(Math.floor(next.time / 60));
      engine.$gameTime.setMinutes(next.time % 60);

      // the second too, back to the one a new game starts on, as the editor reads a fresh save at that minute: a clock
      // that ticked on the way here sits half a minute past it, and a page opening on the minute, as 18-5 does at 18:00,
      // would show in the game and not in the editor.
      engine.$gameTime.setSeconds(engine.J.TIME.Metadata.StartingSecond);
    }

    // a map read under a sky is read on the date the editor's clock moves the game's start to, so the sky's season is
    // the one the editor's sky wears, set straight into the clock's fields like the hour.
    if (next.date !== undefined)
    {
      engine.$gameTime.setYears(next.date.years);
      engine.$gameTime.setMonths(next.date.months);
      engine.$gameTime.setDays(next.date.days);
      engine.$gameTime.setSeconds(next.date.seconds);
    }

    // the sky is held once the clock reads the moment it is held at.
    holdSkyFor(next);

    engine.$gamePlayer.requestMapReload();
    engine.$gamePlayer.reserveTransfer(next.mapId, 0, 0, 2, 2);
    phase = 'transferring';
    settle = 0;
  };

  // a progress note every two seconds, so a run that stalls says where.
  const noteProgress = (scene: any, sceneName: string): void =>
  {
    if (ticks % 20 === 0)
    {
      const where = { phase, sceneName, active: scene?.isActive?.() ?? false, mapId: engine.$gameMap?.mapId?.() ?? 0, ticks, errors: report.errors };
      fs.writeFileSync(`${config.outDir}/PROBE_PROGRESS.json`, JSON.stringify(where));
    }
  };

  // the new game starts straight on the first fixture map, so the opening map's autorun story never runs.
  const startGame = (scene: any): void =>
  {
    installFreeze();
    if (config.maps[0].weather !== undefined)
    {
      holdSkyOff(false);
    }

    report.screen = { width: engine.Graphics.width, height: engine.Graphics.height };
    engine.$dataSystem.startMapId = config.maps[0].mapId;
    engine.$dataSystem.startX = 0;
    engine.$dataSystem.startY = 0;
    scene.commandNewGame();
    phase = 'transferring';
  };

  // the map the probe is waiting for is up, still, and done arriving.
  const hasArrived = (scene: any, sceneName: string, map: ProbeMap): boolean =>
  {
    return phase === 'transferring' && sceneName === 'Scene_Map' && scene.isActive()
      && engine.$gameMap.mapId() === map.mapId && engine.$gamePlayer.isTransferring() === false;
  };

  // one step of the walk: start the game, wait for each map, draw it, move on.
  const advance = (stop: () => void): void =>
  {
    const scene = engine.SceneManager?._scene;
    const sceneName = scene === undefined || scene === null ? 'none' : scene.constructor.name;
    noteProgress(scene, sceneName);
    if (scene === undefined || scene === null)
    {
      return;
    }

    if (phase === 'boot')
    {
      if (sceneName === 'Scene_Title' && scene.isActive())
      {
        startGame(scene);
      }

      return;
    }

    const map = config.maps[mapIndex];
    if (hasArrived(scene, sceneName, map) === false)
    {
      return;
    }

    // give the sprites a few frames to settle on the arrived map before drawing it.
    settle += 1;
    if (settle < 5 || hooksInstalled === false)
    {
      return;
    }

    // the new game started straight on the first map, before its clock could be set for it; a first map asking for an
    // hour or a date is arrived at again with the clock set, as every later map is.
    if (mapIndex === 0 && clockUnset && (map.time !== undefined || map.date !== undefined))
    {
      clockUnset = false;
      transferNext();
      return;
    }

    captureMap(map);
    mapIndex += 1;
    if (mapIndex >= config.maps.length)
    {
      stop();
      finish('done');
      return;
    }

    transferNext();
  };

  const tick = setInterval(() =>
  {
    try
    {
      ticks += 1;
      if (ticks > config.tickLimit)
      {
        clearInterval(tick);
        finish(`timeout in ${phase}`);
        return;
      }

      advance(() => clearInterval(tick));
    }
    catch (error)
    {
      clearInterval(tick);
      report.errors.push(String(error instanceof Error ? error.stack : error));
      finish('threw');
    }
  }, 100);
};

export { parityProbe };
