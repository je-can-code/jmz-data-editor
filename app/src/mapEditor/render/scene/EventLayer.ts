import { Container, Rectangle, Sprite, Texture, type TextureSource } from 'pixi.js';
import type { MapDocument } from '../../core/model/MapDocument.ts';
import type { RmmzEventPage, RmmzMapEvent } from '../../core/model/rmmzTypes.ts';
import type { GhostEvent, TextureSource as ImageSource } from '../../core/renderer/MapRenderer.ts';
import { GHOST_ALPHA } from './GhostTiles.ts';
import {
  compareDrawOrder,
  eventFrame,
  eventPlacement,
  isBushCell,
  type SpriteFrame,
  type SpritePlacement,
} from '../engine/characterFrames.ts';
import { readSourceAlpha, textureSourceFor } from '../textureImages.ts';

/**
 * One event's sprite: the tile the event stands on, the container placed at its feet, and what it draws with: the
 * frame cut from the sheet, or null while there is nothing to draw, and the sheet itself.
 */
type EventSprite = {
  readonly id: number;
  readonly cell: { readonly x: number; readonly y: number };
  readonly root: Container;
  readonly placement: SpritePlacement;
  readonly frame: SpriteFrame | null;
  readonly source: TextureSource | null;
};

/**
 * Reads how opaque one pixel of a sheet is: its alpha from 0 for clear to 255 for solid, or null when the pixels cannot
 * be read, which counts the whole frame as solid.
 */
type AlphaReader = (source: TextureSource, x: number, y: number) => number | null;

/**
 * What the layer draws from.
 */
type EventLayerContext = {
  readonly document: MapDocument;
  readonly flags: ArrayLike<number>;
  readonly sheets: readonly (TextureSource | null)[];
  readonly images: ImageSource | null;
  readonly tileSize: number;
};

/**
 * How opaque the part of a character sunk in a bush draws, as Sprite_Character's lower body: 128 of 255.
 */
const BUSH_ALPHA = 128 / 255;

/**
 * How big a character must be drawn on screen, on its longer side, in CSS pixels, before a click is aimed at the
 * pixels it draws rather than at the tile it stands on. Zoomed out, a character is a few screen pixels across and its
 * tile is all the pointer can aim at; a tree from a big sheet, nearly two tiles by four, stays big down to about a
 * sixth of the game's scale, and its clear surround keeps passing clicks through to the events beside it.
 */
const SMALL_ON_SCREEN = 32;

/**
 * The page an event shows in the editor: its first, as MZ's own editor shows it. The game shows whichever page's
 * conditions hold, which the editor cannot know.
 * @param {RmmzMapEvent} event The event.
 * @returns {RmmzEventPage | null} The page, or null for an event with no pages.
 */
const shownPage = (event: RmmzMapEvent): RmmzEventPage | null =>
{
  return event.pages[0] ?? null;
};

/**
 * Draws a map's events as the engine draws its character sprites: each page image cut from its sheet, standing where
 * the engine stands it, sunk into bushes where the engine sinks it, and split into three groups by priority so the
 * tiles above characters draw between them. Within a group, sprites draw in the engine's order: lower on screen on
 * top, then by id.
 */
class EventLayer
{
  /**
   * Events below characters, drawn over the lower tiles.
   */
  readonly below = new Container();

  /**
   * Events with characters, drawn under the star tiles.
   */
  readonly same = new Container();

  /**
   * Events above characters, drawn over the star tiles.
   */
  readonly above = new Container();

  /**
   * Events a ghost preview shows, see-through, over everything.
   */
  readonly ghosts = new Container();

  #ghostEvents: readonly GhostEvent[] = [];

  /**
   * The container drawing each ghost, by its place in the ghost list; null for a ghost with nothing to draw yet.
   */
  #ghostRoots: (Container | null)[] = [];

  #context: EventLayerContext | null = null;

  #sprites = new Map<number, EventSprite>();

  /**
   * The events changed since the last flush, or 'all' when the list itself changed.
   */
  #changed: Set<number> | 'all' = new Set();

  #characterSources = new Map<string, Promise<TextureSource | null>>();

  #loadedSources = new Map<string, TextureSource | null>();

  #pending = 0;

  #onChange: () => void;

  #readAlpha: AlphaReader;

  #destroyed = false;

  /**
   * @param {() => void} onChange Called whenever what the layer draws changed, so the renderer draws a frame.
   * @param {AlphaReader} readAlpha Reads one pixel's opacity from a sheet, for finding the sprite a point is really
   * over; the page's own canvas reads them unless told otherwise.
   */
  constructor(onChange: () => void, readAlpha: AlphaReader = readSourceAlpha)
  {
    this.#onChange = onChange;
    this.#readAlpha = readAlpha;
  }

  /**
   * How many character sheets are still loading.
   * @returns {number} The count.
   */
  get pendingLoads(): number
  {
    return this.#pending;
  }

  /**
   * How many events draw a sprite.
   * @returns {number} The count.
   */
  get spriteCount(): number
  {
    return [ ...this.#sprites.values() ].filter(sprite => sprite.frame !== null).length;
  }

  /**
   * Draws a map's events, replacing whatever was drawn before.
   * @param {EventLayerContext} context What to draw from.
   */
  setContext(context: EventLayerContext): void
  {
    this.#context = context;
    this.rebuild();
  }

  /**
   * Rebuilds every event's sprite.
   */
  rebuild(): void
  {
    this.#clear();
    const context = this.#context;
    if (context === null)
    {
      return;
    }

    context.document.eventIds().forEach(id => this.#build(id));
    this.#sort();
    this.#onChange();
  }

  /**
   * Rebuilds one event's sprite, or removes it when the event is gone.
   * @param {number} id The event id.
   */
  refreshEvent(id: number): void
  {
    this.#remove(id);
    this.#build(id);
    this.#sort();
    this.#onChange();
  }

  /**
   * Notes that an event changed, to be rebuilt by the next {@link flushChanges}. A drop moving hundreds of events
   * changes each one twice, and rebuilding and sorting once per change would cost the frame hundreds of sorts.
   * @param {number | null} id The event, or null when the list itself changed.
   */
  markChanged(id: number | null): void
  {
    if (id === null)
    {
      this.#changed = 'all';
    }
    else if (this.#changed !== 'all')
    {
      this.#changed.add(id);
    }

    this.#onChange();
  }

  /**
   * Rebuilds every event changed since the last flush, then sorts once: what a frame does before it draws.
   * @returns {boolean} True when anything was rebuilt.
   */
  flushChanges(): boolean
  {
    const changed = this.#changed;
    this.#changed = new Set();
    if (changed === 'all')
    {
      this.rebuild();
      return true;
    }

    if (changed.size === 0)
    {
      return false;
    }

    changed.forEach(id =>
    {
      this.#remove(id);
      this.#build(id);
    });
    this.#sort();
    return true;
  }

  /**
   * Shows events a click or a drag would place, see-through. A drag hands over the same events tile after tile, only
   * standing elsewhere, and then the sprites already built are moved rather than built again.
   * @param {readonly GhostEvent[]} ghosts The events.
   */
  setGhosts(ghosts: readonly GhostEvent[]): void
  {
    const previous = this.#ghostEvents;
    this.#ghostEvents = ghosts;
    if (this.#sameLooks(previous, ghosts))
    {
      this.#moveGhosts();
    }
    else
    {
      this.#buildGhosts();
    }

    this.#onChange();
  }

  /**
   * Finds the event a click at a world point picks, as the pointer can aim at the map at the zoom it is drawn at. Each
   * step takes the event drawn on top:
   *
   * - first, an event found by its tile, standing on the tile clicked: a tile image, which is its tile; a character
   *   drawn small on screen, too few pixels to aim within; or an event drawing nothing at all. Zoomed out, clicking an
   *   event's tile always picks it, whatever a big sprite draws over it;
   * - then, the sprite drawing the pixel clicked. A frame is mostly clear around its figure (a tree on a big sheet is
   *   94 pixels by 190), so a click on the clear part belongs to whatever shows through it, never to the frame;
   * - then, whatever stands on the tile clicked, such as a big character clicked on a clear pixel of its own tile.
   * @param {number} x The point, across, in world pixels.
   * @param {number} y The point, down, in world pixels.
   * @param {number} zoom The zoom the map is drawn at, which decides what is drawn small on screen.
   * @returns {number | null} The event id, or null when the click picks none.
   */
  eventAt(x: number, y: number, zoom: number): number | null
  {
    const context = this.#context;
    if (context === null)
    {
      return null;
    }

    const column = Math.floor(x / context.tileSize);
    const row = Math.floor(y / context.tileSize);
    const sprites = this.#topFirst();
    const onTile = (sprite: EventSprite) => sprite.cell.x === column && sprite.cell.y === row;
    const picked = sprites.find(sprite => onTile(sprite) && this.#foundByTile(sprite, zoom))
      ?? sprites.find(sprite => sprite.frame !== null && this.#covers(sprite, x, y) && this.#drawsAt(sprite, x, y))
      ?? sprites.find(onTile);
    return picked === undefined
      ? null
      : picked.id;
  }

  /**
   * Lets go of every sprite and texture.
   */
  destroy(): void
  {
    this.#destroyed = true;
    this.#clear();
    this.#loadedSources.forEach(source => source?.destroy());
    this.#loadedSources.clear();
    this.#characterSources.clear();
    this.below.destroy();
    this.same.destroy();
    this.above.destroy();
    this.ghosts.destroy({ children: true });
  }

  /**
   * Reports whether two ghost lists show the same events looking the same way, one for one, wherever they stand.
   * @param {readonly GhostEvent[]} previous The ghosts on show.
   * @param {readonly GhostEvent[]} next The ghosts asked for.
   * @returns {boolean} True when the sprites on show can simply be moved.
   */
  #sameLooks(previous: readonly GhostEvent[], next: readonly GhostEvent[]): boolean
  {
    return next.length > 0
      && previous.length === next.length
      && this.#ghostRoots.length === next.length
      && next.every((ghost, index) => ghost.image === previous[index].image && ghost.priorityType === previous[index].priorityType);
  }

  /**
   * Stands every ghost sprite on show where its ghost now stands.
   */
  #moveGhosts(): void
  {
    const tileSize = this.#context?.tileSize ?? 0;
    this.#ghostEvents.forEach((ghost, index) =>
    {
      const root = this.#ghostRoots[index];
      if (root !== null)
      {
        const placement = eventPlacement(ghost.x, ghost.y, ghost.image, ghost.priorityType, false, tileSize);
        root.position.set(placement.x, placement.y);
      }
    });
  }

  /**
   * Rebuilds the ghost sprites from the ghosts asked for, with whatever sheets have loaded.
   */
  #buildGhosts(): void
  {
    this.ghosts.removeChildren().forEach(child => child.destroy({ children: true }));
    this.#ghostRoots = [];
    const context = this.#context;
    if (context === null)
    {
      return;
    }

    this.#ghostRoots = this.#ghostEvents.map(ghost =>
    {
      const page = { image: ghost.image } as RmmzEventPage;
      const texture = this.#sourceFor(page);
      const size = texture === null ? null : { width: texture.width, height: texture.height };
      const frame = eventFrame(ghost.image, size, context.tileSize);
      if (frame === null || texture === null)
      {
        return null;
      }

      const placement = eventPlacement(ghost.x, ghost.y, ghost.image, ghost.priorityType, false, context.tileSize);
      const root = new Container();
      root.position.set(placement.x, placement.y);
      root.alpha = GHOST_ALPHA;
      this.#addBodies(root, texture, frame, 0);
      this.ghosts.addChild(root);
      return root;
    });
  }

  /**
   * Reports whether a sprite's drawn rectangle covers a point.
   * @param {EventSprite} sprite The sprite.
   * @param {number} x The point, across.
   * @param {number} y The point, down.
   * @returns {boolean} True inside it.
   */
  #covers(sprite: EventSprite, x: number, y: number): boolean
  {
    const frame = sprite.frame as SpriteFrame;
    const left = sprite.placement.x - frame.width / 2;
    const top = sprite.placement.y - frame.height;
    return x >= left && x < left + frame.width && y >= top && y < sprite.placement.y;
  }

  /**
   * Lists every event's sprite in the order a click meets them, the top of the draw order first: above characters, then
   * with them, then below them, and within each group the sprite drawn last first.
   * @returns {EventSprite[]} The sprites.
   */
  #topFirst(): EventSprite[]
  {
    const sprites: EventSprite[] = [];
    [ this.above, this.same, this.below ].forEach(group =>
    {
      for (let index = group.children.length - 1; index >= 0; index--)
      {
        const sprite = this.#sprites.get((group.children[index] as Container & { eventId?: number }).eventId ?? -1);
        if (sprite !== undefined)
        {
          sprites.push(sprite);
        }
      }
    });

    return sprites;
  }

  /**
   * Reports whether a click finds an event by its tile rather than by the pixels it draws: a tile image is its tile, a
   * character drawn small on screen is too few pixels to aim within, and an event drawing nothing has only its tile.
   * @param {EventSprite} sprite The event's sprite.
   * @param {number} zoom The zoom the map is drawn at.
   * @returns {boolean} True when its tile finds it.
   */
  #foundByTile(sprite: EventSprite, zoom: number): boolean
  {
    const { frame } = sprite;
    return frame === null
      || frame.source === 'tileset'
      || Math.max(frame.width, frame.height) * zoom < SMALL_ON_SCREEN;
  }

  /**
   * Reports whether a sprite draws a pixel at a point inside its rectangle: the frame's pixel there is not clear. A
   * character sunk in a bush draws its two halves over the same rectangle, so the same pixel answers for it.
   * @param {EventSprite} sprite The sprite, with a frame covering the point.
   * @param {number} x The point, across.
   * @param {number} y The point, down.
   * @returns {boolean} True on a pixel it draws, or wherever its sheet's pixels cannot be read.
   */
  #drawsAt(sprite: EventSprite, x: number, y: number): boolean
  {
    const frame = sprite.frame as SpriteFrame;
    const left = sprite.placement.x - frame.width / 2;
    const top = sprite.placement.y - frame.height;
    const alpha = this.#readAlpha(sprite.source as TextureSource, frame.sx + Math.floor(x - left), frame.sy + Math.floor(y - top));
    return alpha === null || alpha > 0;
  }

  /**
   * Builds one event's sprite, loading its sheet first when it is a character not seen yet.
   * @param {number} id The event id.
   */
  #build(id: number): void
  {
    const context = this.#context;
    const event = context?.document.event(id) ?? null;
    const page = event === null ? null : shownPage(event);
    if (context === null || event === null || page === null)
    {
      return;
    }

    const { image } = page;
    const { document, flags, tileSize } = context;
    const onBush = isBushCell(document.cells, document.width, document.height, flags, event.x, event.y);
    const placement = eventPlacement(event.x, event.y, image, page.priorityType, onBush, tileSize);
    const texture = this.#sourceFor(page);
    const size = texture === null ? null : { width: texture.width, height: texture.height };
    const frame = eventFrame(image, size, tileSize);
    const root = new Container() as Container & { eventId?: number };
    root.eventId = id;
    root.position.set(placement.x, placement.y);
    if (frame !== null && texture !== null)
    {
      this.#addBodies(root, texture, frame, placement.bushDepth);
    }

    this.#groupFor(placement.z).addChild(root);
    this.#sprites.set(id, { id, cell: { x: event.x, y: event.y }, root, placement, frame: texture === null ? null : frame, source: texture });
  }

  /**
   * Adds the sprites that draw an event's frame: one, or for a character sunk in a bush, its upper body and its lower
   * body at half opacity, as Sprite_Character#updateHalfBodySprites does.
   * @param {Container} root The event's container, at its feet.
   * @param {TextureSource} source The sheet.
   * @param {SpriteFrame} frame The frame.
   * @param {number} bushDepth How deep it sinks.
   */
  #addBodies(root: Container, source: TextureSource, frame: SpriteFrame, bushDepth: number): void
  {
    const { sx, sy, width, height } = frame;
    const body = (y: number, h: number, offset: number, alpha: number) =>
    {
      const sprite = new Sprite(new Texture({ source, frame: new Rectangle(sx, sy + y, width, h) }));
      sprite.anchor.set(0.5, 1);
      sprite.y = offset;
      sprite.alpha = alpha;
      root.addChild(sprite);
    };

    if (bushDepth <= 0)
    {
      body(0, height, 0, 1);
      return;
    }

    body(0, height - bushDepth, -bushDepth, 1);
    body(height - bushDepth, bushDepth, 0, BUSH_ALPHA);
  }

  /**
   * Finds the texture source a page draws from, starting a load when its character sheet is not loaded yet.
   * @param {RmmzEventPage} page The page.
   * @returns {TextureSource | null} The source, or null while loading or when there is none.
   */
  #sourceFor(page: RmmzEventPage): TextureSource | null
  {
    const context = this.#context as EventLayerContext;
    const { image } = page;
    if (image.tileId > 0)
    {
      return context.sheets[5 + Math.floor(image.tileId / 256)] ?? null;
    }

    const name = image.characterName;
    if (name === '')
    {
      return null;
    }

    if (this.#loadedSources.has(name))
    {
      return this.#loadedSources.get(name) ?? null;
    }

    this.#load(name);
    return null;
  }

  /**
   * Loads a character sheet once, then rebuilds every event drawn with it.
   * @param {string} name The sheet's name.
   */
  #load(name: string): void
  {
    const images = this.#context?.images ?? null;
    if (images === null || this.#characterSources.has(name))
    {
      return;
    }

    // the engine smooths character sheets (a Bitmap is smooth unless told otherwise), which only shows on a sheet
    // whose width does not divide into whole frames; tiles, which its tilemap samples nearest, stay crisp.
    this.#pending += 1;
    const loading = images.image('characters', name)
      .then(image => (image === null ? null : textureSourceFor(image, 'linear')))
      .catch(() => null);
    this.#characterSources.set(name, loading);
    loading.then(source =>
    {
      this.#pending -= 1;
      if (this.#destroyed)
      {
        source?.destroy();
        return;
      }

      this.#loadedSources.set(name, source);
      this.#refreshSheetUsers(name);
    });
  }

  /**
   * Rebuilds the events that draw with a sheet that just loaded.
   * @param {string} name The sheet's name.
   */
  #refreshSheetUsers(name: string): void
  {
    const context = this.#context;
    if (context === null)
    {
      return;
    }

    const users = context.document.eventIds().filter(id =>
    {
      const page = shownPage(context.document.event(id) as RmmzMapEvent);
      return page !== null && page.image.tileId === 0 && page.image.characterName === name;
    });
    users.forEach(id =>
    {
      this.#remove(id);
      this.#build(id);
    });
    this.#sort();

    // a ghost waiting on the same sheet can draw now too.
    if (this.#ghostEvents.some(ghost => ghost.image.tileId === 0 && ghost.image.characterName === name))
    {
      this.#buildGhosts();
    }

    this.#onChange();
  }

  /**
   * Picks the group a z draws in.
   * @param {number} z The engine's z: 1, 3 or 5.
   * @returns {Container} The group.
   */
  #groupFor(z: number): Container
  {
    if (z <= 1)
    {
      return this.below;
    }

    return z >= 5
      ? this.above
      : this.same;
  }

  /**
   * Puts each group in the engine's draw order.
   */
  #sort(): void
  {
    [ this.below, this.same, this.above ].forEach(group =>
    {
      const keyed = group.children.map(child =>
      {
        const id = (child as Container & { eventId?: number }).eventId ?? 0;
        const placement = this.#sprites.get(id)?.placement;
        return { child, id, z: placement?.z ?? 0, y: placement?.y ?? 0 };
      });
      keyed.sort(compareDrawOrder);

      // put the children back in order in one pass, since moving them one at a time costs a search each.
      group.removeChildren();
      keyed.forEach(entry => group.addChild(entry.child));
    });
  }

  /**
   * Removes one event's sprite.
   * @param {number} id The event id.
   */
  #remove(id: number): void
  {
    const sprite = this.#sprites.get(id);
    if (sprite !== undefined)
    {
      sprite.root.destroy({ children: true });
      this.#sprites.delete(id);
    }
  }

  /**
   * Removes every sprite.
   */
  #clear(): void
  {
    this.#sprites.forEach(sprite => sprite.root.destroy({ children: true }));
    this.#sprites.clear();
  }
}

export { EventLayer, shownPage };
export type { AlphaReader, EventLayerContext };
