import type { MapDocument } from '../model/MapDocument.ts';
import { cellAtPoint, TILE_SIZE, type Camera, type MapCell, type ScreenPoint } from './camera.ts';
import { FrameTimeRecorder, type FrameTimings } from './FrameTimeRecorder.ts';
import {
  GAME_LOOK,
  type LayerVisibility,
  type MapRenderer,
  type OverlaySet,
  type TextureSource,
  type TilesetTextures,
} from './MapRenderer.ts';

/**
 * A renderer that keeps the contract without drawing anything, for testing whatever talks to a renderer (tools,
 * panes, the event layer) without a GPU. It answers the cell under a point from the camera, and the event under a
 * point from the cell each event stands on, the newest event winning where several share a cell.
 */
class HeadlessMapRenderer implements MapRenderer
{
  #host: HTMLElement | null = null;

  #document: MapDocument | null = null;

  #tileset: TilesetTextures | null = null;

  #textures: TextureSource | null = null;

  #camera: Camera = { x: 0, y: 0, zoom: 1 };

  #visibility: LayerVisibility = GAME_LOOK;

  #overlays: OverlaySet = { enabled: new Set(), definitions: [] };

  #frames = new FrameTimeRecorder();

  #destroyed = false;

  /**
   * Everything the renderer was last given, for tests to read back.
   * @returns {object} The state.
   */
  get state()
  {
    return {
      host: this.#host,
      document: this.#document,
      tileset: this.#tileset,
      textures: this.#textures,
      camera: this.#camera,
      visibility: this.#visibility,
      overlays: this.#overlays,
      destroyed: this.#destroyed,
    };
  }

  mount(host: HTMLElement): void
  {
    this.#host = host;
  }

  setDocument(document: MapDocument): void
  {
    this.#document = document;
  }

  setTileset(textures: TilesetTextures): void
  {
    this.#tileset = textures;
  }

  setTextureSource(source: TextureSource): void
  {
    this.#textures = source;
  }

  setCamera(camera: Camera): void
  {
    this.#camera = camera;
  }

  setLayerVisibility(visibility: LayerVisibility): void
  {
    this.#visibility = visibility;
  }

  setOverlays(overlays: OverlaySet): void
  {
    this.#overlays = overlays;
  }

  /**
   * Notes a frame's duration, as a drawing renderer would at the end of each frame.
   * @param {number} milliseconds How long the frame took.
   */
  recordFrame(milliseconds: number): void
  {
    this.#frames.record(milliseconds);
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
    if (this.#document === null)
    {
      return null;
    }

    return cellAtPoint(this.#camera, point, this.#document, TILE_SIZE);
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
    const ids = document.eventIds().filter(id =>
    {
      const event = document.event(id);
      return event !== null && event.x === cell.x && event.y === cell.y;
    });

    return ids.length > 0
      ? ids[ids.length - 1]
      : null;
  }

  destroy(): void
  {
    this.#destroyed = true;
    this.#host = null;
    this.#document = null;
  }
}

export { HeadlessMapRenderer };
