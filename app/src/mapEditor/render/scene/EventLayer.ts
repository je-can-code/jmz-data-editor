import { Container, Graphics, Rectangle, Sprite, Texture, type TextureSource } from 'pixi.js';
import { markerSymbolFor, type EventMarkerSymbol } from '../../core/eventKinds/eventMarkers.ts';
import { areaCovers, areaOnMap, type AreaOnMap } from '../../core/events/eventAreas.ts';
import { createEventPage } from '../../core/model/eventModel.ts';
import type { MapDocument } from '../../core/model/MapDocument.ts';
import type { RmmzEventImage, RmmzEventPage, RmmzMapEvent } from '../../core/model/rmmzTypes.ts';
import type { PageShown, ShownPageReader } from '../../core/pageRule/ShownPages.ts';
import type {
  CellRect,
  FootprintReader,
  GhostEvent,
  MarkerClassifier,
  TextureSource as ImageSource,
} from '../../core/renderer/MapRenderer.ts';
import { drawFootprint } from './footprintDrawing.ts';
import { GHOST_ALPHA } from './GhostTiles.ts';
import { MARKER_WORLD_SIZE, markerFrame, markerScale, markerSpriteScale } from './markerAtlas.ts';
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
 * One event's footprint: its drawing, and where the area it shows lies on the map, which a click inside picks it by.
 */
type FootprintDrawing = {
  readonly graphics: Graphics;
  readonly onMap: AreaOnMap;
};

/**
 * One event's sprite: the tile the event stands on, the container placed at its feet, and what it draws with: the
 * frame cut from the sheet, or null while there is nothing to draw, and the sheet itself; for an event that draws no
 * picture, the marker that shows it instead; for an event whose page covers more tiles than its own, the footprint
 * showing them; and whether it shows faded, because no page holds for it at the clock's time.
 */
type EventSprite = {
  readonly id: number;
  readonly cell: { readonly x: number; readonly y: number };
  readonly root: Container;
  readonly placement: SpritePlacement;
  readonly frame: SpriteFrame | null;
  readonly source: TextureSource | null;
  readonly marker: Sprite | null;
  readonly footprint: FootprintDrawing | null;
  readonly faded: boolean;
};

/**
 * How a ghost draws: the picture, the priority it stands by, and, for a ghost of an event on the map, the page that
 * event shows, which names its marker's symbol; nothing for any other ghost, which shows no marker.
 */
type GhostLook = {
  readonly image: RmmzEventImage;
  readonly priorityType: number;
  readonly page: RmmzEventPage | undefined;
};

/**
 * One ghost's drawing: what draws it, and whether that is a marker, which stands on its tile's middle rather than at a
 * character's feet.
 */
type GhostDrawing = {
  readonly root: Container;
  readonly marker: boolean;
};

/**
 * Reads how opaque one pixel of a sheet is: its alpha from 0 for clear to 255 for solid, or null when the pixels cannot
 * be read, which counts the whole frame as solid.
 */
type AlphaReader = (source: TextureSource, x: number, y: number) => number | null;

/**
 * What the layer draws from. The marker atlas is handed over by whoever draws it, the first time a marker needs it;
 * left out, events that draw no picture show nothing. The pages are the window's page rule at the clock's time; left
 * out, every event draws its first page, as MZ's own editor draws it.
 */
type EventLayerContext = {
  readonly document: MapDocument;
  readonly flags: ArrayLike<number>;
  readonly sheets: readonly (TextureSource | null)[];
  readonly images: ImageSource | null;
  readonly tileSize: number;
  readonly markerAtlas?: () => TextureSource;
  readonly pages?: ShownPageReader;
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
 * The page an event with no pages at all stands in with: a fresh one, which shows no picture and starts on the action
 * button, so such an event still shows its marker rather than nothing.
 */
const FRESH_PAGE = createEventPage();

/**
 * How opaque an event draws while no page holds for it at the clock's time, its picture or its marker alike: the game
 * shows nothing there, and the editor keeps it in sight, plainly not as the game shows it, so it can still be found,
 * selected and edited. Fainter than a ghost, which is something about to be placed.
 */
const FADED_ALPHA = 0.4;

/**
 * The page every event draws without a page rule: its first, never faded, as MZ's own editor draws it.
 */
const FIRST_PAGE: PageShown = { index: 0, faded: false };

/**
 * Picks a marker's symbol from the trigger of the page an event shows alone, until the window's kinds are handed over.
 * @param {RmmzMapEvent} event The event.
 * @param {number} _mapId The map it is on, which only kinds read.
 * @param {RmmzEventPage | undefined} page The page it shows.
 * @returns {EventMarkerSymbol} The symbol.
 */
const triggerOnly: MarkerClassifier = (event: RmmzMapEvent, _mapId: number, page?: RmmzEventPage): EventMarkerSymbol =>
{
  return markerSymbolFor(event, null, page);
};

/**
 * Draws a map's events as the engine draws its character sprites: each page image cut from its sheet, standing where
 * the engine stands it, sunk into bushes where the engine sinks it, and split into three groups by priority so the
 * tiles above characters draw between them. Within a group, sprites draw in the engine's order: lower on screen on
 * top, then by id.
 *
 * Each event draws the page the window's page rule picks at the clock's time, the page a fresh save would show then; an
 * event no page holds for, which the game shows as nothing at all, draws its first page faded instead, so it is never
 * lost, until faded events are hidden, as a map showing only what the game draws hides them. Without a page rule,
 * every event draws its first page, as MZ's own editor draws it.
 *
 * An event whose page draws no picture, such as a story sequence on autorun, a parallel process or a spawner, would be
 * invisible, so it draws a marker instead: a square a little smaller than its tile, in a group of its own over every
 * sprite, holding the symbol its kind or its page's trigger shows. Zoomed far out, markers keep a size that can be read
 * and spill past their tiles; a click on the part that spills over picks the marker's event wherever no event stands on
 * the tile clicked. An event whose sheet is still loading shows nothing until it loads, and one whose sheet is missing
 * shows its marker. A ghost of an event on the map, such as one being dragged, draws as that event draws.
 *
 * An event whose page covers more tiles than its own, as a J-Pixelistics area does, shows them as its footprint, read
 * from the page it is shown with: a faint band in its marker's colour beneath the markers, its marker sitting in the
 * band's corner, cut at the map's edge and marked there in red. Larger footprints draw first, so a smaller one over a
 * larger stays in sight; it shows faded, and hides, with the event. A click anywhere inside one picks its event, after
 * every event standing on the tile clicked, the one drawn on top where several overlap.
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
   * The markers of events that draw no picture, over every sprite: lower on screen on top, then by id.
   */
  readonly markers = new Container();

  /**
   * The footprints of events whose page covers more tiles than their own, meant to sit beneath the markers they join:
   * larger first, then by id.
   */
  readonly footprints = new Container();

  /**
   * Events a ghost preview shows, see-through, over everything.
   */
  readonly ghosts = new Container();

  #ghostEvents: readonly GhostEvent[] = [];

  /**
   * What draws each ghost, by its place in the ghost list; null for a ghost with nothing to draw yet.
   */
  #ghostRoots: (GhostDrawing | null)[] = [];

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

  #classify: MarkerClassifier = triggerOnly;

  /**
   * Finds the footprint an event shows; null until one is handed over, when no event shows any.
   */
  #readFootprint: FootprintReader | null = null;

  /**
   * How much bigger than its own size every marker draws at the zoom last handed over (see {@link markerScale}).
   */
  #markerScale = 1;

  /**
   * The atlas the marker textures below are cut from.
   */
  #markerSource: TextureSource | null = null;

  #markerTextures = new Map<EventMarkerSymbol, Texture>();

  /**
   * Whether the events no page holds for show, faded, or are hidden, as the game hides them.
   */
  #fadedShown = true;

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
   * How many events draw a marker.
   * @returns {number} The count.
   */
  get markerCount(): number
  {
    return this.markers.children.length;
  }

  /**
   * How many events show faded, because no page holds for them at the clock's time, whether or not faded events show.
   * @returns {number} The count.
   */
  get fadedCount(): number
  {
    return [ ...this.#sprites.values() ].filter(sprite => sprite.faded).length;
  }

  /**
   * How many events show a footprint.
   * @returns {number} The count.
   */
  get footprintCount(): number
  {
    return this.footprints.children.length;
  }

  /**
   * Shows the events no page holds for, faded, or hides them as the game does, so a map shows only what the game draws.
   * A hidden one draws nothing and no click finds it.
   * @param {boolean} shown True to show them.
   */
  setFadedShown(shown: boolean): void
  {
    if (shown === this.#fadedShown)
    {
      return;
    }

    this.#fadedShown = shown;
    this.#sprites.forEach(sprite =>
    {
      if (sprite.faded)
      {
        this.#showFaded(sprite);
      }
    });
    this.#onChange();
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
   * Chooses how markers pick their symbol, and marks every event to be rebuilt with it by the next
   * {@link flushChanges}: the window's kinds may read events differently now, such as once its plugin modules have
   * switched on.
   * @param {MarkerClassifier} classify Picks an event's symbol.
   */
  setMarkerClassifier(classify: MarkerClassifier): void
  {
    this.#classify = classify;
    this.markChanged(null);
  }

  /**
   * Chooses how events find the footprints they show, and marks every event to be rebuilt with it by the next
   * {@link flushChanges}: the window's plugin modules read the areas, and read them differently once they switch on.
   * @param {FootprintReader} read Finds an event's footprint.
   */
  setFootprintReader(read: FootprintReader): void
  {
    this.#readFootprint = read;
    this.markChanged(null);
  }

  /**
   * Finds where an event's footprint lies on the map, as it was last built.
   * @param {number} id The event.
   * @returns {CellRect | null} The tiles it covers on the map, or null for an event showing none.
   */
  footprintOf(id: number): CellRect | null
  {
    const footprint = this.#sprites.get(id)?.footprint ?? null;
    if (footprint === null)
    {
      return null;
    }

    const { x, y, width, height } = footprint.onMap;
    return { x, y, width, height };
  }

  /**
   * Follows the zoom the map is drawn at, so markers keep a size that can be read however far out it is: past 50%, they
   * stop shrinking with the map.
   * @param {number} zoom The zoom.
   */
  setZoom(zoom: number): void
  {
    const scale = markerScale(zoom);
    if (scale === this.#markerScale)
    {
      return;
    }

    this.#markerScale = scale;
    const spriteScale = markerSpriteScale(scale);
    this.markers.children.forEach(marker => marker.scale.set(spriteScale));
    this.#ghostRoots.forEach(drawing =>
    {
      if (drawing !== null && drawing.marker)
      {
        drawing.root.scale.set(spriteScale);
      }
    });
  }

  /**
   * Rebuilds every event's sprite, which settles every change noted since the last flush.
   */
  rebuild(): void
  {
    this.#changed = new Set();
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
   * step takes the event drawn on top, markers first, since they draw over every sprite:
   *
   * - first, an event found by its tile, standing on the tile clicked: a tile image, which is its tile; a character
   *   drawn small on screen, too few pixels to aim within; or an event drawing nothing but its marker. Zoomed out,
   *   clicking an event's tile always picks it, whatever a big sprite or a neighbour's marker draws over it;
   * - then, the sprite drawing the pixel clicked. A frame is mostly clear around its figure (a tree on a big sheet is
   *   94 pixels by 190), so a click on the clear part belongs to whatever shows through it, never to the frame;
   * - then, a marker spilling past its own tile onto the one clicked, as markers do zoomed far out, while they show;
   * - then, whatever stands on the tile clicked, such as a big character clicked on a clear pixel of its own tile;
   * - then, a footprint covering the tile clicked, while footprints show, so a click anywhere along an exit strip picks
   *   the exit, wherever no event stands.
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
      ?? sprites.find(sprite => this.#markerCovers(sprite, x, y))
      ?? sprites.find(onTile)
      ?? this.#footprintAt(column, row);
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
    this.markers.destroy();
    this.footprints.destroy();
    this.ghosts.destroy({ children: true });
    this.#forgetMarkerTextures();
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
      && next.every((ghost, index) =>
      {
        const before = previous[index];
        return ghost.image === before.image && ghost.priorityType === before.priorityType && ghost.eventId === before.eventId;
      });
  }

  /**
   * Stands every ghost on show where its ghost now stands: a sprite at its character's feet, a marker on its tile's
   * middle.
   */
  #moveGhosts(): void
  {
    // ghosts on show were built from a context, and a layer once handed one always has one.
    const context = this.#context as EventLayerContext;
    const { tileSize } = context;
    this.#ghostEvents.forEach((ghost, index) =>
    {
      const drawing = this.#ghostRoots[index];
      if (drawing === null)
      {
        return;
      }

      if (drawing.marker)
      {
        drawing.root.position.set((ghost.x + 0.5) * tileSize, (ghost.y + 0.5) * tileSize);
        return;
      }

      const look = this.#ghostLook(ghost, context);
      const placement = eventPlacement(ghost.x, ghost.y, look.image, look.priorityType, false, tileSize);
      drawing.root.position.set(placement.x, placement.y);
    });
  }

  /**
   * Rebuilds the ghosts from the ghosts asked for, with whatever sheets have loaded.
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

    this.#ghostRoots = this.#ghostEvents.map(ghost => this.#buildGhost(ghost, context));
  }

  /**
   * Builds one ghost: its picture, see-through, or, for an event on the map that draws no picture, its marker.
   * @param {GhostEvent} ghost The ghost.
   * @param {EventLayerContext} context What the layer draws from.
   * @returns {GhostDrawing | null} What draws it, or null while there is nothing to draw.
   */
  #buildGhost(ghost: GhostEvent, context: EventLayerContext): GhostDrawing | null
  {
    const look = this.#ghostLook(ghost, context);
    const texture = this.#sourceFor({ image: look.image } as RmmzEventPage);
    const size = texture === null ? null : { width: texture.width, height: texture.height };
    const frame = eventFrame(look.image, size, context.tileSize);
    if (frame !== null && texture !== null)
    {
      const placement = eventPlacement(ghost.x, ghost.y, look.image, look.priorityType, false, context.tileSize);
      const root = new Container();
      root.position.set(placement.x, placement.y);
      root.alpha = GHOST_ALPHA;
      this.#addBodies(root, texture, frame, 0);
      this.ghosts.addChild(root);
      return { root, marker: false };
    }

    // a ghost of an event that draws no picture shows that event's marker, once a sheet still loading is known missing.
    const event = ghost.eventId === undefined ? null : context.document.event(ghost.eventId);
    const marker = event === null || this.#awaitsSheet(look.image)
      ? null
      : this.#markerSprite(event, ghost.x, ghost.y, context, look.page);
    if (marker === null)
    {
      return null;
    }

    marker.alpha = GHOST_ALPHA;
    this.ghosts.addChild(marker);
    return { root: marker, marker: true };
  }

  /**
   * Works out how a ghost draws: a ghost of an event on the map as that event draws, the page it shows giving the
   * picture and the priority, so a lamp dragged at night drags its lit page; any other ghost as it was handed over.
   * @param {GhostEvent} ghost The ghost.
   * @param {EventLayerContext} context What the layer draws from.
   * @returns {GhostLook} How it draws.
   */
  #ghostLook(ghost: GhostEvent, context: EventLayerContext): GhostLook
  {
    const event = ghost.eventId === undefined ? null : context.document.event(ghost.eventId);
    if (event === null)
    {
      return { image: ghost.image, priorityType: ghost.priorityType, page: undefined };
    }

    const { page } = this.#shownPageOf(event, context);
    return { image: page.image, priorityType: page.priorityType, page };
  }

  /**
   * Finds the page an event draws, and whether faded: the page the window's page rule picks, its first while none
   * holds, or its first without a rule; a fresh page for an event with no pages at all.
   * @param {RmmzMapEvent} event The event.
   * @param {EventLayerContext} context What the layer draws from.
   * @returns {{ page: RmmzEventPage, faded: boolean }} The page, and whether it draws faded.
   */
  #shownPageOf(event: RmmzMapEvent, context: EventLayerContext): { page: RmmzEventPage; faded: boolean }
  {
    const shown = context.pages === undefined ? FIRST_PAGE : context.pages.shownPage(event);
    return { page: event.pages[shown.index] ?? FRESH_PAGE, faded: shown.faded };
  }

  /**
   * Reports whether a click can find an event: anything showing, and an event no page holds for only while faded events
   * show.
   * @param {EventSprite} sprite The event's sprite.
   * @returns {boolean} True when it can be found.
   */
  #findable(sprite: EventSprite): boolean
  {
    return sprite.faded === false || this.#fadedShown;
  }

  /**
   * Draws an event no page holds for faded, its picture, its marker and its footprint alike, or hides all of them while
   * faded events are hidden.
   * @param {EventSprite} sprite The event's sprite.
   */
  #showFaded(sprite: EventSprite): void
  {
    sprite.root.alpha = FADED_ALPHA;
    sprite.root.visible = this.#fadedShown;
    if (sprite.marker !== null)
    {
      sprite.marker.alpha = FADED_ALPHA;
      sprite.marker.visible = this.#fadedShown;
    }

    if (sprite.footprint !== null)
    {
      sprite.footprint.graphics.alpha = FADED_ALPHA;
      sprite.footprint.graphics.visible = this.#fadedShown;
    }
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
   * Reports whether an event's marker covers a point, at the size markers draw at the zoom last handed over, while they
   * show.
   * @param {EventSprite} sprite The event's sprite.
   * @param {number} x The point, across.
   * @param {number} y The point, down.
   * @returns {boolean} True when it has a marker on show over the point.
   */
  #markerCovers(sprite: EventSprite, x: number, y: number): boolean
  {
    const { marker } = sprite;
    if (marker === null || this.markers.visible === false)
    {
      return false;
    }

    const half = (MARKER_WORLD_SIZE / 2) * this.#markerScale;
    return Math.abs(x - marker.x) <= half && Math.abs(y - marker.y) <= half;
  }

  /**
   * Finds the event whose footprint covers a tile, while footprints show: the one drawn on top where several do, which is
   * the smaller, so every footprint keeps some tiles a click reaches it by. An event no page holds for is left out while
   * faded events are hidden.
   * @param {number} column The tile's column.
   * @param {number} row The tile's row.
   * @returns {EventSprite | undefined} The event's sprite, or undefined when no footprint shown covers the tile.
   */
  #footprintAt(column: number, row: number): EventSprite | undefined
  {
    if (this.footprints.visible === false)
    {
      return undefined;
    }

    const { children } = this.footprints;
    for (let index = children.length - 1; index >= 0; index--)
    {
      const sprite = this.#sprites.get((children[index] as Container & { eventId?: number }).eventId ?? -1);
      if (sprite !== undefined && sprite.footprint !== null && this.#findable(sprite) && areaCovers(sprite.footprint.onMap, column, row))
      {
        return sprite;
      }
    }

    return undefined;
  }

  /**
   * Lists every event's sprite a click can find, in the order a click meets them, the top of the draw order first: the
   * markers, then the sprites above characters, with them, then below them, and within each group the one drawn last
   * first. An event no page holds for is left out while faded events are hidden.
   * @returns {EventSprite[]} The sprites.
   */
  #topFirst(): EventSprite[]
  {
    const sprites: EventSprite[] = [];
    const recordOf = (child: Container) => this.#sprites.get((child as Container & { eventId?: number }).eventId ?? -1);
    for (let index = this.markers.children.length - 1; index >= 0; index--)
    {
      const marked = recordOf(this.markers.children[index]);
      if (marked !== undefined && this.#findable(marked))
      {
        sprites.push(marked);
      }
    }

    // an event showing its marker is met there already; its container in its group draws nothing.
    [ this.above, this.same, this.below ].forEach(group =>
    {
      for (let index = group.children.length - 1; index >= 0; index--)
      {
        const sprite = recordOf(group.children[index]);
        if (sprite !== undefined && sprite.marker === null && this.#findable(sprite))
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
   * Builds one event's sprite from the page it shows, loading its sheet first when it is a character not seen yet, or
   * its marker when it draws no picture; faded, or hidden, when no page holds for it.
   * @param {number} id The event id.
   */
  #build(id: number): void
  {
    const context = this.#context;
    const event = context?.document.event(id) ?? null;
    if (context === null || event === null)
    {
      return;
    }

    const { page, faded } = this.#shownPageOf(event, context);
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
    const pictured = frame !== null && texture !== null;
    if (pictured)
    {
      this.#addBodies(root, texture, frame, placement.bushDepth);
    }

    // an event with no picture to draw shows its marker, unless its sheet is still on its way.
    const marker = pictured || this.#awaitsSheet(image)
      ? null
      : this.#markerSprite(event, event.x, event.y, context, page);
    if (marker !== null)
    {
      this.markers.addChild(marker);
    }

    // an event whose page covers more tiles than its own shows them, joined to its marker.
    const footprint = this.#footprintFor(event, context, page);
    if (footprint !== null)
    {
      this.footprints.addChild(footprint.graphics);
    }

    this.#groupFor(placement.z).addChild(root);
    const frameShown = texture === null ? null : frame;
    const sprite: EventSprite = { id, cell: { x: event.x, y: event.y }, root, placement, frame: frameShown, source: texture, marker, footprint, faded };
    this.#sprites.set(id, sprite);
    if (faded)
    {
      this.#showFaded(sprite);
    }
  }

  /**
   * Builds the footprint an event shows with a page: the part of the page's area on the map, drawn joined to its marker.
   * @param {RmmzMapEvent} event The event.
   * @param {EventLayerContext} context What the layer draws from.
   * @param {RmmzEventPage} page The page it is shown with.
   * @returns {FootprintDrawing | null} The footprint, not yet added anywhere, or null for a page covering no tile beyond
   * the event's own, an area lying wholly off the map, or a layer handed no way to read footprints.
   */
  #footprintFor(event: RmmzMapEvent, context: EventLayerContext, page: RmmzEventPage): FootprintDrawing | null
  {
    const { document, tileSize } = context;
    const footprint = this.#readFootprint === null ? null : this.#readFootprint(event, document.mapId, page);
    if (footprint === null)
    {
      return null;
    }

    // an event left off the map when it was made smaller has nothing of its area on it to draw.
    const onMap = areaOnMap(event.x, event.y, footprint.area, document.width, document.height);
    if (onMap.width === 0 || onMap.height === 0)
    {
      return null;
    }

    const graphics = new Graphics() as Graphics & { eventId?: number };
    graphics.eventId = event.id;
    drawFootprint(graphics, onMap, footprint, tileSize);
    return { graphics, onMap };
  }

  /**
   * Builds the marker of an event that draws no picture, standing on a tile's middle at the size markers draw at the
   * zoom last handed over.
   * @param {RmmzMapEvent} event The event, which names the marker's symbol.
   * @param {number} x The tile's column.
   * @param {number} y The tile's row.
   * @param {EventLayerContext} context What the layer draws from.
   * @param {RmmzEventPage | undefined} page The page it shows, whose trigger names the symbol when no kind does.
   * @returns {Sprite | null} The marker, not yet added anywhere, or null when no marker atlas was handed over.
   */
  #markerSprite(event: RmmzMapEvent, x: number, y: number, context: EventLayerContext, page: RmmzEventPage | undefined): Sprite | null
  {
    const texture = this.#markerTexture(this.#classify(event, context.document.mapId, page), context);
    if (texture === null)
    {
      return null;
    }

    const sprite = new Sprite(texture) as Sprite & { eventId?: number };
    sprite.eventId = event.id;
    sprite.anchor.set(0.5);
    sprite.position.set((x + 0.5) * context.tileSize, (y + 0.5) * context.tileSize);
    sprite.scale.set(markerSpriteScale(this.#markerScale));
    return sprite;
  }

  /**
   * Finds the texture a symbol's marker draws with, cut from the atlas once and shared by every marker showing it, so
   * however many markers a map holds they draw together in one go.
   * @param {EventMarkerSymbol} symbol The symbol.
   * @param {EventLayerContext} context What the layer draws from.
   * @returns {Texture | null} The texture, or null when no marker atlas was handed over.
   */
  #markerTexture(symbol: EventMarkerSymbol, context: EventLayerContext): Texture | null
  {
    if (context.markerAtlas === undefined)
    {
      return null;
    }

    // a new atlas, as a new renderer's, makes the textures cut from the old one useless.
    const source = context.markerAtlas();
    if (source !== this.#markerSource)
    {
      this.#forgetMarkerTextures();
      this.#markerSource = source;
    }

    let texture = this.#markerTextures.get(symbol);
    if (texture === undefined)
    {
      const { x, y, width, height } = markerFrame(symbol);
      texture = new Texture({ source, frame: new Rectangle(x, y, width, height) });
      this.#markerTextures.set(symbol, texture);
    }

    return texture;
  }

  /**
   * Lets go of the textures cut from the marker atlas, leaving the atlas itself to whoever drew it.
   */
  #forgetMarkerTextures(): void
  {
    this.#markerTextures.forEach(texture => texture.destroy(false));
    this.#markerTextures.clear();
    this.#markerSource = null;
  }

  /**
   * Reports whether an image's character sheet is still loading, so the event's picture is on its way and it shows no
   * marker meanwhile.
   * @param {RmmzEventImage} image The image.
   * @returns {boolean} True while its sheet loads.
   */
  #awaitsSheet(image: RmmzEventImage): boolean
  {
    const name = image.characterName;
    return image.tileId === 0
      && name !== ''
      && this.#characterSources.has(name)
      && this.#loadedSources.has(name) === false;
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
   * Rebuilds the events that draw with a sheet that just loaded, or that turned out to be missing, which then show
   * their markers.
   * @param {string} name The sheet's name.
   */
  #refreshSheetUsers(name: string): void
  {
    const context = this.#context;
    if (context === null)
    {
      return;
    }

    const drawsWith = (image: RmmzEventImage) => image.tileId === 0 && image.characterName === name;
    const users = context.document.eventIds().filter(id =>
    {
      const { page } = this.#shownPageOf(context.document.event(id) as RmmzMapEvent, context);
      return drawsWith(page.image);
    });
    users.forEach(id =>
    {
      this.#remove(id);
      this.#build(id);
    });
    this.#sort();

    // a ghost waiting on the same sheet can draw now too.
    if (this.#ghostEvents.some(ghost => drawsWith(this.#ghostLook(ghost, context).image)))
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
   * Puts each group in the engine's draw order, the markers lower on screen over higher, then later id over earlier, and
   * the footprints smaller over larger, then later id over earlier.
   */
  #sort(): void
  {
    this.#sortFootprints();
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

    const markers = this.markers.children.map(child => ({ child, id: (child as Container & { eventId?: number }).eventId ?? 0 }));
    markers.sort((left, right) => left.child.y - right.child.y || left.id - right.id);
    this.markers.removeChildren();
    markers.forEach(entry => this.markers.addChild(entry.child));
  }

  /**
   * Puts the footprints in their draw order: the more tiles one covers on the map, the earlier it draws, so a smaller
   * one over a larger stays in sight and in reach of a click; then by id.
   */
  #sortFootprints(): void
  {
    // most maps have no footprints at all, and a map with one has nothing to order.
    if (this.footprints.children.length < 2)
    {
      return;
    }

    const keyed = this.footprints.children.map(child =>
    {
      const id = (child as Container & { eventId?: number }).eventId ?? 0;
      const onMap = this.#sprites.get(id)?.footprint?.onMap;
      return { child, id, tiles: onMap === undefined ? 0 : onMap.width * onMap.height };
    });
    keyed.sort((left, right) => right.tiles - left.tiles || left.id - right.id);
    this.footprints.removeChildren();
    keyed.forEach(entry => this.footprints.addChild(entry.child));
  }

  /**
   * Removes one event's sprite, its marker and its footprint.
   * @param {number} id The event id.
   */
  #remove(id: number): void
  {
    const sprite = this.#sprites.get(id);
    if (sprite !== undefined)
    {
      sprite.root.destroy({ children: true });
      sprite.marker?.destroy();
      sprite.footprint?.graphics.destroy();
      this.#sprites.delete(id);
    }
  }

  /**
   * Removes every sprite, marker and footprint.
   */
  #clear(): void
  {
    this.#sprites.forEach(sprite =>
    {
      sprite.root.destroy({ children: true });
      sprite.marker?.destroy();
      sprite.footprint?.graphics.destroy();
    });
    this.#sprites.clear();
  }
}

export { EventLayer, FADED_ALPHA };
export type { AlphaReader, EventLayerContext };
