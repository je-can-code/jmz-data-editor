import { useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { cellInspector } from '../core/palette/cellInspector.ts';
import { WheelStepper, type PaintSelection } from '../core/palette/paintSelection.ts';
import type { PaletteModeStore } from '../core/palette/paletteMode.ts';
import type { MapCell, ScreenPoint } from '../core/renderer/camera.ts';
import type { OverlayId } from '../core/renderer/MapRenderer.ts';
import type { LayerChoice } from '../core/tiles/layering.ts';
import { TILE_LAYERS, type MapViewSettings } from './mapViewSettings.ts';

/**
 * Highlights the layer the strip paints on, dimming the rest, or stops highlighting for automatic layering: manual
 * layering shows exactly what it paints over.
 * @param {MapViewSettings} settings The view's settings.
 * @param {LayerChoice} choice The strip's choice.
 * @returns {MapViewSettings} The settings with the highlight to match.
 */
const highlightForChoice = (settings: MapViewSettings, choice: LayerChoice): MapViewSettings =>
{
  const highlighted = choice === 'auto'
    ? null
    : TILE_LAYERS[choice];
  if (settings.visibility.highlighted === highlighted)
  {
    return settings;
  }

  const overlays = new Set(settings.overlays);
  if (highlighted === null)
  {
    overlays.delete('layer-highlight');
  }
  else
  {
    overlays.add('layer-highlight');
  }

  return { visibility: { ...settings.visibility, highlighted }, overlays };
};

/**
 * Switches one overlay on or off, leaving the settings as they are when it already is.
 * @param {MapViewSettings} settings The view's settings.
 * @param {OverlayId} id The overlay.
 * @param {boolean} on Whether it shows.
 * @returns {MapViewSettings} The settings.
 */
const withOverlay = (settings: MapViewSettings, id: OverlayId, on: boolean): MapViewSettings =>
{
  if (settings.overlays.has(id) === on)
  {
    return settings;
  }

  const overlays = new Set(settings.overlays);
  if (on)
  {
    overlays.add(id);
  }
  else
  {
    overlays.delete(id);
  }

  return { ...settings, overlays };
};

/**
 * What finds the cell under a point in a map view: the view's renderer.
 */
type CellFinder = {
  cellAt(point: ScreenPoint): MapCell | null;
};

/**
 * What a map view hands its links to the palette.
 */
type PaletteLinkOptions = {
  /**
   * The element the map is drawn in.
   */
  readonly host: RefObject<HTMLElement | null>;

  /**
   * The view's renderer, which finds the cell under a point, or null before it mounts.
   */
  readonly renderer: RefObject<CellFinder | null>;

  /**
   * The map on show.
   */
  readonly mapId: number;

  /**
   * The view's settings as they stand, and how to change them.
   */
  readonly settings: MapViewSettings;
  readonly setSettings: Dispatch<SetStateAction<MapViewSettings>>;

  /**
   * The view's window's palette and layer strip choices, and its palette's mode.
   */
  readonly selection: PaintSelection;
  readonly mode: PaletteModeStore;
};

/**
 * Links a map view to its window's palette and layer strip, and to the stack view, so painting never needs a trip to
 * the strip:
 *
 * - Shift and the wheel step along the layer strip instead of zooming;
 * - the cell under the pointer feeds the stack view, and a middle click holds a cell there, or lets it go;
 * - while the strip paints one layer, the view highlights that layer and dims the rest, and automatic layering stops
 *   highlighting;
 * - while the passability editor is open, the view shows the passability overlay beside it, and takes it away again
 *   afterwards unless it was already showing.
 * @param {PaletteLinkOptions} options The view's element, how it finds cells, its map, its settings, and its window's
 * choices and palette mode.
 */
const usePaletteLinks = (options: PaletteLinkOptions): void =>
{
  const { host, renderer, mapId, settings, setSettings, selection, mode } = options;

  // the settings as they stand, for deciding what to change outside a render.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() =>
  {
    const element = host.current;
    if (element === null)
    {
      return undefined;
    }

    /**
     * Finds the cell under a pointer event.
     * @param {MouseEvent} event The event.
     * @returns {MapCell | null} The cell, or null off the map.
     */
    const cellOf = (event: MouseEvent): MapCell | null =>
    {
      const bounds = element.getBoundingClientRect();
      return renderer.current?.cellAt({ x: event.clientX - bounds.left, y: event.clientY - bounds.top }) ?? null;
    };

    // caught on the way down, before the canvas zooms, so Shift and the wheel never zoom as well.
    const stepper = new WheelStepper();
    const onWheel = (event: WheelEvent) =>
    {
      if (event.shiftKey === false)
      {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      const step = stepper.step(event.deltaY, event.deltaX, event.deltaMode);
      if (step !== 0)
      {
        selection.stepLayer(step);
      }
    };

    const onPointerMove = (event: PointerEvent) =>
    {
      const cell = cellOf(event);
      if (cell !== null)
      {
        cellInspector.hover({ mapId, x: cell.x, y: cell.y });
      }
    };

    const onPointerDown = (event: PointerEvent) =>
    {
      if (event.button !== 1)
      {
        return;
      }

      // a middle click never scrolls or pastes here; it holds the cell.
      event.preventDefault();
      const cell = cellOf(event);
      if (cell !== null)
      {
        cellInspector.toggleHold({ mapId, x: cell.x, y: cell.y });
      }
    };

    const onAuxClick = (event: MouseEvent) =>
    {
      if (event.button === 1)
      {
        event.preventDefault();
      }
    };

    element.addEventListener('wheel', onWheel, { capture: true, passive: false });
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('auxclick', onAuxClick);
    return () =>
    {
      element.removeEventListener('wheel', onWheel, { capture: true });
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('auxclick', onAuxClick);
    };
  }, [ host, renderer, mapId, selection ]);

  // the strip's layer, highlighted from the start and on every change of layer; a new brush changes nothing here.
  useEffect(() =>
  {
    let { layer: shown } = selection.getState();
    setSettings(current => highlightForChoice(current, shown));
    return selection.subscribe(({ layer }) =>
    {
      if (layer !== shown)
      {
        shown = layer;
        setSettings(current => highlightForChoice(current, layer));
      }
    });
  }, [ setSettings, selection ]);

  // the passability overlay shows for as long as its editor is open; one shown already stays after it closes.
  useEffect(() =>
  {
    let added = false;
    const follow = (open: boolean) =>
    {
      if (open && settingsRef.current.overlays.has('passability') === false)
      {
        added = true;
        setSettings(current => withOverlay(current, 'passability', true));
      }
      else if (open === false && added)
      {
        added = false;
        setSettings(current => withOverlay(current, 'passability', false));
      }
    };

    let { editing: followed } = mode.getState();
    follow(followed === 'passability');
    return mode.subscribe(({ editing }) =>
    {
      if (editing !== followed)
      {
        followed = editing;
        follow(editing === 'passability');
      }
    });
  }, [ setSettings, mode ]);
};

export { highlightForChoice, usePaletteLinks, withOverlay };
export type { CellFinder, PaletteLinkOptions };
