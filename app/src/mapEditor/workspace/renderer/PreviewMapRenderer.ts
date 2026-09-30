import { cellAtPoint, TILE_SIZE, type Camera, type MapCell, type ScreenPoint } from '../../core/renderer/camera.ts';
import { FrameTimeRecorder, type FrameTimings } from '../../core/renderer/FrameTimeRecorder.ts';
import {
  GAME_LOOK,
  type LayerVisibility,
  type MapRenderer,
  type OverlaySet,
  type TextureSource,
  type TilesetTextures,
} from '../../core/renderer/MapRenderer.ts';
import type { MapDocument } from '../../core/model/MapDocument.ts';
import { fitCamera, groundColour, isUpperTile } from './previewPalette.ts';

/**
 * The layers a preview reads: the four tile layers.
 */
const TILE_LAYERS = 4;

/**
 * A simplified, honest stand-in for the real map renderer, keeping the renderer contract so a map panel is built
 * against the real interface: the whole map fitted to the view, each cell coloured by its ground, decorations as a
 * darker inset, and events as markers. It draws on a plain canvas, never through React, and only when something
 * changed, scheduling its frames on the window its host lives in, since a torn-out panel's window keeps drawing
 * when the main one is hidden.
 */
class PreviewMapRenderer implements MapRenderer
{
  #host: HTMLElement | null = null;

  #canvas: HTMLCanvasElement | null = null;

  #document: MapDocument | null = null;

  #unsubscribe: (() => void) | null = null;

  #resize: ResizeObserver | null = null;

  #frame = 0;

  #camera: Camera | null = null;

  #visibility: LayerVisibility = GAME_LOOK;

  #overlays: OverlaySet = { enabled: new Set(), definitions: [] };

  #highlight: number | null = null;

  #frames = new FrameTimeRecorder();

  mount(host: HTMLElement): void
  {
    const { ownerDocument } = host;
    const view = ownerDocument.defaultView as Window & typeof globalThis;
    const canvas = ownerDocument.createElement('canvas');
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    host.appendChild(canvas);

    this.#host = host;
    this.#canvas = canvas;

    // the host's own window watches its size, which is the only one that sees it once torn out.
    this.#resize = new view.ResizeObserver(() => this.#schedule());
    this.#resize.observe(host);
    this.#schedule();
  }

  setDocument(document: MapDocument): void
  {
    this.#unsubscribe?.();
    this.#document = document;
    this.#unsubscribe = document.subscribe(() => this.#schedule());
    this.#schedule();
  }

  /**
   * Takes a tileset's sheets. The preview colours cells by their tile ids and never draws a sheet, so it keeps
   * nothing.
   * @param {TilesetTextures} _textures The tileset and its sheets.
   */
  setTileset(_textures: TilesetTextures): void
  {
    // nothing to keep: the preview draws no sheets.
  }

  /**
   * Takes the source of event images. The preview marks events rather than drawing their images, so it keeps
   * nothing.
   * @param {TextureSource} _source The source.
   */
  setTextureSource(_source: TextureSource): void
  {
    // nothing to keep: the preview draws no images.
  }

  setCamera(camera: Camera): void
  {
    this.#camera = camera;
    this.#schedule();
  }

  setLayerVisibility(visibility: LayerVisibility): void
  {
    this.#visibility = visibility;
    this.#schedule();
  }

  setOverlays(overlays: OverlaySet): void
  {
    this.#overlays = overlays;
    this.#schedule();
  }

  /**
   * Rings one event, such as the one the data editor asked to see.
   * @param {number | null} eventId The event, or null for none.
   */
  highlightEvent(eventId: number | null): void
  {
    this.#highlight = eventId;
    this.#schedule();
  }

  frameTimings(): FrameTimings
  {
    return this.#frames.summary();
  }

  resetFrameTimings(): void
  {
    this.#frames.reset();
  }

  cellAt(point: ScreenPoint): MapCell | null
  {
    const document = this.#document;
    return document === null
      ? null
      : cellAtPoint(this.#currentCamera(document), point, document, TILE_SIZE);
  }

  eventAt(point: ScreenPoint): number | null
  {
    const cell = this.cellAt(point);
    const document = this.#document;
    if (cell === null || document === null)
    {
      return null;
    }

    // the newest event on the cell is the one on top.
    const ids = document.eventIds().filter(id => document.event(id)?.x === cell.x && document.event(id)?.y === cell.y);
    return ids[ids.length - 1] ?? null;
  }

  destroy(): void
  {
    if (this.#frame !== 0)
    {
      this.#host?.ownerDocument.defaultView?.cancelAnimationFrame(this.#frame);
      this.#frame = 0;
    }

    this.#resize?.disconnect();
    this.#unsubscribe?.();
    this.#canvas?.remove();
    this.#resize = null;
    this.#unsubscribe = null;
    this.#canvas = null;
    this.#host = null;
    this.#document = null;
  }

  /**
   * The camera in use: one set from outside, or the one fitting the whole map in the view.
   * @param {MapDocument} document The map.
   * @returns {Camera} The camera.
   */
  #currentCamera(document: MapDocument): Camera
  {
    const host = this.#host;
    return this.#camera ?? fitCamera(host?.clientWidth ?? 0, host?.clientHeight ?? 0, document, TILE_SIZE);
  }

  /**
   * Asks the host's window for one frame, however many changes arrive before it.
   */
  #schedule(): void
  {
    const view = this.#host?.ownerDocument.defaultView;
    if (this.#frame !== 0 || view === null || view === undefined)
    {
      return;
    }

    this.#frame = view.requestAnimationFrame(() =>
    {
      this.#frame = 0;
      this.#draw();
    });
  }

  /**
   * Draws the whole preview once, noting how long it took.
   */
  #draw(): void
  {
    const canvas = this.#canvas;
    const host = this.#host;
    const document = this.#document;
    const context = canvas?.getContext('2d') ?? null;
    if (canvas === null || host === null || context === null)
    {
      return;
    }

    const started = performance.now();
    const scale = host.ownerDocument.defaultView?.devicePixelRatio ?? 1;
    canvas.width = Math.max(1, Math.round(host.clientWidth * scale));
    canvas.height = Math.max(1, Math.round(host.clientHeight * scale));
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.fillStyle = '#101418';
    context.fillRect(0, 0, host.clientWidth, host.clientHeight);

    if (document !== null)
    {
      const camera = this.#currentCamera(document);
      this.#drawCells(context, document, camera);
      if (this.#overlays.enabled.has('grid'))
      {
        this.#drawGrid(context, document, camera);
      }

      if (this.#visibility.layers.events)
      {
        this.#drawEvents(context, document, camera);
      }
    }

    this.#frames.record(performance.now() - started);
  }

  /**
   * Lines every tile boundary, for the grid overlay.
   * @param {CanvasRenderingContext2D} context The canvas.
   * @param {MapDocument} document The map.
   * @param {Camera} camera The camera.
   */
  #drawGrid(context: CanvasRenderingContext2D, document: MapDocument, camera: Camera): void
  {
    const left = -camera.x * camera.zoom;
    const top = -camera.y * camera.zoom;
    const size = TILE_SIZE * camera.zoom;
    context.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    context.lineWidth = 1;
    context.beginPath();
    for (let x = 0; x <= document.width; x++)
    {
      context.moveTo(left + x * size, top);
      context.lineTo(left + x * size, top + document.height * size);
    }

    for (let y = 0; y <= document.height; y++)
    {
      context.moveTo(left, top + y * size);
      context.lineTo(left + document.width * size, top + y * size);
    }

    context.stroke();
  }

  /**
   * Colours every cell by its ground, with a darker inset where a decoration sits on it.
   * @param {CanvasRenderingContext2D} context The canvas.
   * @param {MapDocument} document The map.
   * @param {Camera} camera The camera.
   */
  #drawCells(context: CanvasRenderingContext2D, document: MapDocument, camera: Camera): void
  {
    const size = TILE_SIZE * camera.zoom;
    const inset = size * 0.3;
    const { layers } = this.#visibility;
    const shown = [ layers.tiles1, layers.tiles2, layers.tiles3, layers.tiles4 ];
    for (let y = 0; y < document.height; y++)
    {
      for (let x = 0; x < document.width; x++)
      {
        const left = (x * TILE_SIZE - camera.x) * camera.zoom;
        const top = (y * TILE_SIZE - camera.y) * camera.zoom;
        let ground: string | null = null;
        let upper = false;
        for (let z = 0; z < TILE_LAYERS; z++)
        {
          // a hidden layer contributes nothing, as it would in the real view.
          const tileId = shown[z] ? document.cellAt(x, y, z) : 0;
          ground = groundColour(tileId) ?? ground;
          upper = upper || isUpperTile(tileId);
        }

        context.fillStyle = ground ?? '#1b2026';
        context.fillRect(left, top, Math.ceil(size), Math.ceil(size));
        if (upper)
        {
          context.fillStyle = 'rgba(20, 12, 28, 0.55)';
          context.fillRect(left + inset, top + inset, size - inset * 2, size - inset * 2);
        }
      }
    }
  }

  /**
   * Marks every event, ringing the highlighted one.
   * @param {CanvasRenderingContext2D} context The canvas.
   * @param {MapDocument} document The map.
   * @param {Camera} camera The camera.
   */
  #drawEvents(context: CanvasRenderingContext2D, document: MapDocument, camera: Camera): void
  {
    const size = TILE_SIZE * camera.zoom;
    document.eventIds().forEach(id =>
    {
      const event = document.event(id);
      if (event === null)
      {
        return;
      }

      const left = (event.x * TILE_SIZE - camera.x) * camera.zoom;
      const top = (event.y * TILE_SIZE - camera.y) * camera.zoom;
      const highlighted = id === this.#highlight;
      context.strokeStyle = highlighted ? '#ffca28' : 'rgba(255, 255, 255, 0.8)';
      context.lineWidth = highlighted ? Math.max(2, size * 0.12) : Math.max(1, size * 0.06);
      context.strokeRect(left + size * 0.2, top + size * 0.2, size * 0.6, size * 0.6);
      if (highlighted)
      {
        context.beginPath();
        context.arc(left + size / 2, top + size / 2, size * 0.9, 0, Math.PI * 2);
        context.stroke();
      }
    });
  }
}

export { PreviewMapRenderer };
