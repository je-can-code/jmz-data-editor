/**
 * The probe the parity check injects into the real game: it walks the game to each fixture map, holds everything
 * still, and draws the map's base layer (parallax, tiles and characters, with no screen tone, lighting, weather or
 * interface above it) into a picture per view, animation step and pass.
 *
 * It is serialized with toString() and run inside NW.js ahead of the game's own scripts, so it must stay one
 * self-contained function in plain JavaScript: nothing from this module's scope survives the trip, and the engine's
 * globals (SceneManager, $gameMap and the rest) are reached through the window. Its whole body runs inside try blocks,
 * because a probe that throws stops ticking and writes nothing, which from outside looks like a game that never booted.
 */
import type { ProbeConfig, ProbeMap, ProbeReport } from './probeTypes.ts';

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
  const report: ProbeReport = { phase: 'boot', screen: { width: 0, height: 0 }, captures: [], events: {}, errors: [], log: [] };

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

  const capture = (map: ProbeMap, view: { x: number; y: number }, step: number, pass: 'events' | 'tiles'): void =>
  {
    const scene = engine.SceneManager._scene;
    const spriteset = scene._spriteset;
    const tilemap = spriteset._tilemap;
    engine.$gameMap.setDisplayPos(view.x, view.y);
    const display = { x: engine.$gameMap.displayX(), y: engine.$gameMap.displayY() };

    // the player, followers and vehicles never draw; events draw only in the events pass.
    spriteset._characterSprites.forEach((sprite: any) =>
    {
      const isEvent = sprite._character instanceof engine.Game_Event;
      if (isEvent === false || pass === 'tiles')
      {
        sprite.hide();
      }

      sprite.update();
    });
    spriteset.updateTilemap();
    spriteset.updateParallax();
    tilemap.animationFrame = step;

    // draw the base layer alone: without the screen tone its colour filter carries, and without anything a plugin put
    // beside the map there (J-Weather's particles live in it, so the lighting darkens them).
    const base = spriteset._baseSprite;
    const { filters } = base;
    base.filters = null;
    const kept = new Set([ spriteset._blackScreen, spriteset._parallax, tilemap ]);
    const setAside = base.children.filter((child: any) => kept.has(child) === false && child.visible);
    setAside.forEach((child: any) =>
    {
      child.visible = false;
    });
    const { renderer } = engine.Graphics.app;
    const texture = engine.PIXI.RenderTexture.create({ width: engine.Graphics.width, height: engine.Graphics.height });
    renderer.render(base, texture);
    const url: string = renderer.extract.base64(texture);
    setAside.forEach((child: any) =>
    {
      child.visible = true;
    });
    base.filters = filters;
    texture.destroy(true);

    const file = `game-${map.mapId}-${display.x}-${display.y}-s${step}-${pass}.png`;
    fs.writeFileSync(`${config.outDir}/${file}`, NodeBuffer.from(url.split(',')[1], 'base64'));
    report.captures.push({ mapId: map.mapId, file, display, step, pass });
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

  // lists how the game's sprite for an event departs from a plain drawing of its first page.
  const departuresOf = (sprite: any): string[] =>
  {
    const character = sprite._character;
    const data = engine.$dataMap.events[character.eventId()];
    if (data === undefined || data === null)
    {
      return [ 'is not in the map file' ];
    }

    const first = data.pages[0].image;
    const departures: string[] = [];
    const tone = sprite.getColorTone();
    const blend = sprite.getBlendColor();
    const checks: [ boolean, string ][] = [
      [ character._pageIndex !== 0, `shows page ${character._pageIndex + 1}` ],
      [ character.characterName() !== first.characterName || character.characterIndex() !== first.characterIndex || character.tileId() !== first.tileId,
        `draws "${character.characterName()}" ${character.characterIndex()} instead of its page image` ],
      [ character.direction() !== first.direction, `faces ${character.direction()} instead of ${first.direction}` ],
      [ character.pattern() !== first.pattern, `shows pattern ${character.pattern()} instead of ${first.pattern}` ],
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

  // records each event's active page, whether the game draws it and how, before any pass hides anything.
  const recordEvents = (map: ProbeMap): void =>
  {
    const spriteset = engine.SceneManager._scene._spriteset;
    report.events[map.mapId] = spriteset._characterSprites
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
        };
      });
  };

  const captureMap = (map: ProbeMap): void =>
  {
    describeScene();
    recordEvents(map);
    // events first, as the game shows them; then the tiles alone, with every event hidden.
    [ 'events', 'tiles' ].forEach(pass =>
    {
      map.views.forEach(view =>
      {
        map.steps.forEach(step => capture(map, view, step, pass as 'events' | 'tiles'));
      });
    });
    report.log.push(`map ${map.mapId}: ${map.views.length} views, steps ${map.steps.join(',')}`);
  };

  const transferNext = (): void =>
  {
    engine.$gamePlayer.reserveTransfer(config.maps[mapIndex].mapId, 0, 0, 2, 2);
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
